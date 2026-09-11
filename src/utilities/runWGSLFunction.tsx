import { ResourceType } from "wgsl_reflect";
import { assertNever, range, uniq } from "./data";
import { getReflectionOrError } from "./parseWGSL";
import { STORAGE_TEXTURE_FORMATS, StorageTextureFormat } from "./storageTextures";
import {
    BindingOutput,
    FunctionOutput,
    Runnable,
    RunnableComputeShader,
    RunnableFunction,
    RunnableRender,
    RunnerResultError,
    RunnerResults,
    WgslBinding,
    WgslBufferBinding,
    WgslTextureBinding,
} from "./types";
import { WGSLType } from "./WGSLType";

const STUB_FUNCTION_RUNNER_OUTPUT_BINDING_ID = "stub_function_runner_output";
const STUB_FUNCTION_RUNNER_NAME = "_wgsl_playground_function_runner__";

export const runWGSLFunction = async (
    device: GPUDevice,
    wgsl: string,
    runnable: Runnable,
    bindings: WgslBinding[],
    canvas: HTMLCanvasElement,
): Promise<RunnerResults> => {
    if (
        bindings.some(
            (b) =>
                b.kind === "buffer" &&
                b.resourceType !== ResourceType.Uniform &&
                b.resourceType !== ResourceType.Storage,
        )
    )
        throw new Error("Unsupported resource type");

    device.pushErrorScope("validation");

    if (runnable.type === "render") return runRenderShader(device, wgsl, runnable, bindings, canvas);
    if (runnable.type === "compute") return runComputeShader(device, wgsl, runnable, bindings, canvas);
    if (runnable.type === "function") return runSimpleFunction(device, wgsl, runnable, bindings);

    assertNever(runnable);
    return { type: "errors", errors: [formatRuntimeError(new Error("Unsupported runnable type"))] }; // Never reaches this point
};

const runSimpleFunction = async (
    device: GPUDevice,
    wgsl: string,
    runnable: RunnableFunction,
    bindings: WgslBinding[],
): Promise<RunnerResults> => {
    const runner = getCodeRunnerForFunction(runnable, bindings, wgsl);
    if (runner.type === "error") return { type: "errors", errors: [formatRuntimeError(new Error(runner.error))] };

    const module = device.createShaderModule({ code: runner.code });
    const { buffers } = runComputeModule(device, module, runner.bindings, STUB_FUNCTION_RUNNER_NAME, [1, 1, 1]);
    const buffer = buffers[STUB_FUNCTION_RUNNER_OUTPUT_BINDING_ID];
    const value = await readBufferValue(device, buffer, runner.outputBindingType);

    return maybeReturnResults(wgsl, [], device, module, { name: runnable.name, type: runner.outputBindingType, value });
};

const runRenderShader = async (
    device: GPUDevice,
    wgsl: string,
    runnable: RunnableRender,
    bindings: WgslBinding[],
    canvas: HTMLCanvasElement,
): Promise<RunnerResults> => {
    const { bindGroups, pipelineLayout, textures } = getBindingResources(bindings, device, GPUShaderStage.FRAGMENT);
    const module = device.createShaderModule({ code: wgsl });

    const pipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        depthStencil: runnable.useDepthTexture
            ? {
                  format: "depth32float",
                  depthWriteEnabled: true,
                  depthCompare: "less",
                  stencilFront: { compare: "always", failOp: "keep", depthFailOp: "keep", passOp: "keep" },
              }
            : undefined,
        vertex: { module, entryPoint: runnable.vertex },
        fragment: { module, entryPoint: runnable.fragment, targets: [{ format: "rgba8unorm" }] },
        primitive: { topology: "triangle-list" },
    });

    const maybeDepthTexture = runnable.useDepthTexture
        ? device.createTexture({
              size: {
                  width: canvas.width,
                  height: canvas.height,
              },
              format: "depth32float",
              usage: GPUTextureUsage.RENDER_ATTACHMENT,
          })
        : undefined;

    const context = canvas.getContext("webgpu");
    if (context === null) return { type: "errors", errors: [formatRuntimeError(new Error("No WebGPU context found"))] };
    context.configure({
        device,
        format: "rgba8unorm",
        alphaMode: "opaque",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    const commandEncoder = device.createCommandEncoder();
    const texture = context.getCurrentTexture();
    const renderpass: GPURenderPassEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{ view: texture.createView(), loadOp: "clear", storeOp: "store" }],
        depthStencilAttachment: maybeDepthTexture && {
            view: maybeDepthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: "clear",
            depthStoreOp: "discard",
        },
    });
    renderpass.setPipeline(pipeline);
    for (const [groupId, bindGroup] of bindGroups) {
        renderpass.setBindGroup(groupId, bindGroup);
    }
    renderpass.draw(runnable.vertices, 1, 0, 0);
    renderpass.end();
    device.queue.submit([commandEncoder.finish()]);

    const getTextureValue = await readTextureValues(device, texture, canvas);

    if (maybeDepthTexture) maybeDepthTexture.destroy();
    for (const bound of Object.values(textures)) bound.destroy();

    // console.log("Waiting for 100ms: ", canvas.id);
    // await new Promise((resolve) => setTimeout(resolve, 100));
    // console.log("Finished calculating", canvas.id);

    return maybeReturnResults(wgsl, [], device, module, null, getTextureValue);
};

const runComputeShader = async (
    device: GPUDevice,
    wgsl: string,
    runnable: RunnableComputeShader,
    bindings: WgslBinding[],
    canvas: HTMLCanvasElement,
): Promise<RunnerResults> => {
    const module = device.createShaderModule({ code: wgsl });
    const { buffers, textures } = runComputeModule(device, module, bindings, runnable.name, runnable.threads);

    // A storage texture has no CPU-side value to stringify, and stringifying one would be the slowest
    // thing the playground does, so it goes to the canvas instead of into the outputs panel.
    const promises = bindings
        .filter((binding): binding is WgslBufferBinding => binding.kind === "buffer" && binding.writable)
        .map((binding) =>
            readBufferValue(device, buffers[binding.id], binding.type).then((value) => ({ binding, value })),
        );

    // There is one canvas, so the first storage texture is the one drawn on it. Nothing in the
    // playground says which of several to show yet, and no example has more than one.
    const displayed = bindings.find((binding): binding is WgslTextureBinding => binding.kind === "texture");

    let getTextureValue: RunnerResultsTextureReader | undefined;
    if (displayed) {
        const context = canvas.getContext("webgpu");
        if (context === null)
            return { type: "errors", errors: [formatRuntimeError(new Error("No WebGPU context found"))] };

        const texture = textures[displayed.id];
        blitTextureToCanvas(device, context, texture, displayed.format);

        if (STORAGE_TEXTURE_FORMATS[displayed.format].inspectable)
            getTextureValue = await readTextureValues(device, texture, canvas);
    }

    const results = await Promise.all(promises);
    for (const bound of Object.values(textures)) bound.destroy();

    return maybeReturnResults(wgsl, results, device, module, null, getTextureValue);
};

type RunnerResultsTextureReader = NonNullable<Extract<RunnerResults, { type: "outputs" }>["getTextureValue"]>;

const BLIT_SHADER = `
@group(0) @binding(0) var source: texture_2d<f32>;

struct BlitVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn blit_vertex(@builtin(vertex_index) index: u32) -> BlitVertexOutput {
    // One oversized triangle rather than two, so there is no seam down the diagonal to worry about.
    // It gives uv (0, 0) at the top left, which is where a compute shader's (0, 0) invocation wrote.
    let uv = vec2<f32>(f32((index << 1u) & 2u), f32(index & 2u));

    var output: BlitVertexOutput;
    output.position = vec4<f32>(uv * vec2<f32>(2.0, -2.0) + vec2<f32>(-1.0, 1.0), 0.0, 1.0);
    output.uv = uv;
    return output;
}

@fragment
fn blit_fragment(input: BlitVertexOutput) -> @location(0) vec4<f32> {
    let size = vec2<f32>(textureDimensions(source));
    return textureLoad(source, vec2<u32>(clamp(input.uv * size, vec2<f32>(0.0), size - 1.0)), 0);
}
`;

/**
 * Draws a storage texture onto the output canvas.
 *
 * A straight texture-to-texture copy will not do, because the canvas' backing store is scaled by
 * `devicePixelRatio` while a storage texture has a size of its own, so the two rarely match. This
 * fetches texels rather than sampling them, which keeps what lands on the canvas exactly what the
 * shader wrote, and needs no sampler - so the formats that cannot be filtered need no special case.
 */
const blitTextureToCanvas = (
    device: GPUDevice,
    context: GPUCanvasContext,
    texture: GPUTexture,
    format: StorageTextureFormat,
) => {
    context.configure({
        device,
        format: "rgba8unorm",
        alphaMode: "opaque",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    const module = device.createShaderModule({ label: "Storage texture blit", code: BLIT_SHADER });
    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: STORAGE_TEXTURE_FORMATS[format].sampleType, viewDimension: "2d" },
            },
        ],
    });
    const pipeline = device.createRenderPipeline({
        label: "Storage texture blit",
        layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
        vertex: { module, entryPoint: "blit_vertex" },
        fragment: { module, entryPoint: "blit_fragment", targets: [{ format: "rgba8unorm" }] },
        primitive: { topology: "triangle-list" },
    });

    const commandEncoder = device.createCommandEncoder();
    const renderpass = commandEncoder.beginRenderPass({
        colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store" }],
    });
    renderpass.setPipeline(pipeline);
    renderpass.setBindGroup(
        0,
        device.createBindGroup({ layout: bindGroupLayout, entries: [{ binding: 0, resource: texture.createView() }] }),
    );
    renderpass.draw(3, 1, 0, 0);
    renderpass.end();
    device.queue.submit([commandEncoder.finish()]);
};

/**
 * Copies a texture back to the CPU, so the canvas can name the colour under the pointer.
 *
 * Rows are read at whatever alignment `copyTextureToBuffer` demands rather than at the texture's own
 * width, which is not the same thing for a texture narrower than 64 texels. Lookups arrive in the
 * canvas' backing store coordinates, which the blit above stretched the texture across, so they are
 * scaled back into the texture on the way in.
 */
const readTextureValues = async (
    device: GPUDevice,
    texture: GPUTexture,
    canvas: HTMLCanvasElement,
): Promise<RunnerResultsTextureReader> => {
    const bytesPerRow = Math.ceil((texture.width * 4) / 256) * 256;
    const buffer = device.createBuffer({
        size: bytesPerRow * texture.height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
        { texture },
        { buffer, bytesPerRow },
        { width: texture.width, height: texture.height },
    );
    device.queue.submit([commandEncoder.finish()]);

    await buffer.mapAsync(GPUMapMode.READ);
    const rawValues = new Uint8Array(buffer.getMappedRange());
    const values = range(texture.height).map((row) =>
        range(texture.width).map(
            (column) =>
                range(4).map((rgba) => rawValues[row * bytesPerRow + column * 4 + rgba]) as [
                    number,
                    number,
                    number,
                    number,
                ],
        ),
    );

    buffer.unmap();
    buffer.destroy();

    const rowScale = texture.height / canvas.height;
    const columnScale = texture.width / canvas.width;
    return (row, column) => values[Math.floor(row * rowScale)]?.[Math.floor(column * columnScale)] ?? null;
};

const getBindingResources = (bindings: WgslBinding[], device: GPUDevice, visibility: number) => {
    const groupIds = uniq(bindings.map(({ group }) => group));

    const bindGroupLayouts = groupIds.map((groupId) =>
        device.createBindGroupLayout({
            entries: bindings
                .filter(({ group }) => group === groupId)
                .map((binding): GPUBindGroupLayoutEntry => {
                    if (binding.kind === "texture")
                        return {
                            binding: binding.index,
                            visibility,
                            storageTexture: { access: "write-only", format: binding.format, viewDimension: "2d" },
                        };

                    const buffer =
                        binding.resourceType === ResourceType.Uniform
                            ? "uniform"
                            : binding.writable
                              ? "storage"
                              : "read-only-storage";

                    return {
                        binding: binding.index,
                        visibility,
                        buffer: { type: buffer },
                    };
                }),
        }),
    );
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts });

    const buffers: Record<string, GPUBuffer> = {};
    const textures: Record<string, GPUTexture> = {};
    const bindGroups = groupIds.map((groupId, groupdIdx) => {
        const entries: GPUBindGroupEntry[] = bindings
            .filter(({ group }) => group === groupId)
            .map((binding) => {
                // A storage texture has nothing to upload: it starts blank and the shader fills it.
                // COPY_SRC is for the hover readout, and TEXTURE_BINDING for the blit onto the canvas.
                if (binding.kind === "texture") {
                    const texture = device.createTexture({
                        label: binding.name,
                        size: { width: binding.width, height: binding.height },
                        format: binding.format,
                        usage:
                            GPUTextureUsage.STORAGE_BINDING |
                            GPUTextureUsage.TEXTURE_BINDING |
                            GPUTextureUsage.COPY_SRC,
                    });
                    textures[binding.id] = texture;
                    return { binding: binding.index, resource: texture.createView() };
                }

                let usage = GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
                if (binding.resourceType === ResourceType.Uniform) usage |= GPUBufferUsage.UNIFORM;
                else usage |= GPUBufferUsage.STORAGE;

                const buffer = device.createBuffer({ size: binding.buffer.byteLength, usage });
                device.queue.writeBuffer(buffer, 0, binding.buffer);
                buffers[binding.id] = buffer;
                return { binding: binding.index, resource: { buffer } };
            });

        return [groupId, device.createBindGroup({ layout: bindGroupLayouts[groupdIdx], entries })] as const;
    });

    return { buffers, textures, bindGroups, pipelineLayout };
};

const maybeReturnResults = async (
    wgsl: string,
    results: BindingOutput[],
    device: GPUDevice,
    module: GPUShaderModule,
    returned: FunctionOutput | null,
    getTextureValue?: (row: number, column: number) => [number, number, number, number] | null,
): Promise<RunnerResults> => {
    const error = await device.popErrorScope();
    const compilation = await module.getCompilationInfo();

    if (compilation.messages.length > 0) return { type: "errors", errors: formatCompilationErrors(compilation, wgsl) };
    if (error) return { type: "errors", errors: [formatRuntimeError(error)] };

    return { type: "outputs", getTextureValue, bindings: results, returned };
};

const formatCompilationErrors = ({ messages }: GPUCompilationInfo, wgsl: string): RunnerResultError[] =>
    messages.map((message) => ({
        title: "Compilation Error",
        text: (
            <div className="flex flex-col overflow-x-scroll">
                <p className="mb-4 italic">Error: {message.message}</p>
                <pre>
                    Line {message.lineNum}, Column {message.linePos}:
                </pre>
                <pre className="">{wgsl.split("\n")[message.lineNum - 2]}</pre>
                <pre className="">{wgsl.split("\n")[message.lineNum - 1]}</pre>
                <pre className="">
                    {" ".repeat(message.linePos - 1)}
                    {"^".repeat(message.length)}
                </pre>
                <pre className="">{wgsl.split("\n")[message.lineNum]}</pre>
            </div>
        ),
        intent: "warning",
        icon: "warning-sign",
    }));

const formatRuntimeError = (error: GPUError): RunnerResultError => ({
    title: "Runtime Error",
    text: error.message,
    intent: "danger",
    icon: "warning-sign",
});

const getCodeRunnerForFunction = (
    runnable: RunnableFunction,
    originalBindings: WgslBinding[],
    wgsl: string,
):
    | { type: "code"; code: string; bindings: WgslBinding[]; outputBindingType: WGSLType }
    | { type: "error"; error: string } => {
    // Find first unused bind group
    const usedGroups = new Set(originalBindings.map((b) => b.group));
    const newGroupId = Array.from({ length: 8 }).findIndex((_, i) => !usedGroups.has(i));
    if (newGroupId === -1) return { type: "error", error: "No available bind group slots" };

    // Get function signature
    const functionCode = wgsl
        .split("\n")
        .slice(runnable.startLine - 1, runnable.endLine)
        .join("\n");
    const signatureMatch = functionCode.match(/fn\s+\w+\s*\(([^)]*)\)\s*(?:->\s*([^{]+))?/);
    if (!signatureMatch) return { type: "error", error: "Could not parse function signature" };

    const [, argsString, rawReturnType] = signatureMatch;
    const returnTypeString = rawReturnType?.trim() ?? null;

    // Create input/output struct definitions
    const structInputs = argsString
        .split(",")
        .map((arg) => {
            const [name, type] = arg
                .trim()
                .split(":")
                .map((s) => s.trim());
            return `    ${name}: ${type},`;
        })
        .join("\n");

    // Create compute shader that calls the function
    const functionCall = `${runnable.name}(${runnable.arguments
        .map((input) => `_wgsl_playground_inputs.${input.name}`)
        .join(", ")})`;

    // Combine everything with the original WGSL code
    const code = `${wgsl}

struct WGSLPlaygroundFunctionInputsStruct {
${structInputs}
}

@group(${newGroupId}) @binding(0) var<storage, read> _wgsl_playground_inputs: WGSLPlaygroundFunctionInputsStruct;
@group(${newGroupId}) @binding(1) var<storage, read_write> _wgsl_playground_output: ${returnTypeString ?? "int"};

@compute @workgroup_size(1,1,1)
fn ${STUB_FUNCTION_RUNNER_NAME}() {
    ${returnTypeString ? `_wgsl_playground_output = ${functionCall}` : functionCall};
}
`;

    const reflect = getReflectionOrError(code);
    if (reflect.type === "error") return { type: "error", error: reflect.error };

    // Get bindings
    const inputBindingType = new WGSLType(reflect.reflect.getBindGroups()[newGroupId][0].type, reflect.reflect.structs);
    const rawResults = runnable.arguments.map((arg) => arg.type.getValuesFromString(arg.input));
    if (rawResults.some((r) => r === null))
        return { type: "error", error: "Could not map default values for input bindings" };
    const results = rawResults.flatMap((r) => r).filter((r) => r !== null);
    let resultIndex = 0;
    const inputBindingValue = inputBindingType.getDefaultValue(() => results[resultIndex++] ?? -1);
    if (inputBindingValue.type === "error") return inputBindingValue;
    const inputBindingBuffer = inputBindingType.getBufferFromString(inputBindingValue.value);
    if (inputBindingBuffer === null) return { type: "error", error: "Could not parse default value for input binding" };

    const outputBindingType = new WGSLType(
        reflect.reflect.getBindGroups()[newGroupId][1].type,
        reflect.reflect.structs,
    );
    const outputBindingValue = outputBindingType.getDefaultValue();
    if (outputBindingValue.type === "error") return outputBindingValue;
    const outputBindingBuffer = outputBindingType.getBufferFromString(outputBindingValue.value);
    if (outputBindingBuffer === null)
        return { type: "error", error: "Could not parse default value for output binding" };

    const newBindings: WgslBinding[] = [
        {
            id: "stub_function_runner_input",
            kind: "buffer",
            resourceType: ResourceType.Storage,
            writable: false,
            group: newGroupId,
            index: 0,
            name: "inputs",
            type: inputBindingType,
            attributes: null,
            directive: null,
            warning: null,
            input: inputBindingValue.value,
            buffer: inputBindingBuffer,
        },
        {
            id: STUB_FUNCTION_RUNNER_OUTPUT_BINDING_ID,
            kind: "buffer",
            resourceType: ResourceType.Storage,
            writable: true,
            group: newGroupId,
            index: 1,
            name: "output",
            type: outputBindingType,
            attributes: null,
            directive: null,
            warning: null,
            input: outputBindingValue.value,
            buffer: outputBindingBuffer,
        },
    ];

    return { type: "code", code, bindings: originalBindings.concat(newBindings), outputBindingType };
};

const runComputeModule = (
    device: GPUDevice,
    module: GPUShaderModule,
    bindings: WgslBinding[],
    name: string,
    threads: [number, number, number],
) => {
    const { buffers, textures, bindGroups, pipelineLayout } = getBindingResources(
        bindings,
        device,
        GPUShaderStage.COMPUTE,
    );
    const pipeline = device.createComputePipeline({
        label: `Runner for ${name}`,
        layout: pipelineLayout,
        compute: { module, entryPoint: name },
    });

    const commandEncoder = device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(pipeline);
    for (const [groupId, bindGroup] of bindGroups) {
        computePass.setBindGroup(groupId, bindGroup);
    }
    computePass.dispatchWorkgroups(...threads);
    computePass.end();
    device.queue.submit([commandEncoder.finish()]);

    return { buffers, textures };
};

const readBufferValue = async (device: GPUDevice, buffer: GPUBuffer, type: WGSLType): Promise<string> => {
    const commandEncoder = device.createCommandEncoder();
    const destination = device.createBuffer({
        size: buffer.size,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    commandEncoder.copyBufferToBuffer(buffer, 0, destination, 0, buffer.size);
    device.queue.submit([commandEncoder.finish()]);

    await destination.mapAsync(GPUMapMode.READ);
    return type.getStringFromBuffer(destination.getMappedRange());
};
