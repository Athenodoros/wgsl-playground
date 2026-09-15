import { ResourceType } from "wgsl_reflect";
import { NonEmpty, range, uniq } from "./data";
import { getReflectionOrError } from "./parseWGSL";
import { STORAGE_TEXTURE_FORMATS, StorageTextureFormat } from "./storageTextures";
import {
    ActiveRunTarget,
    BindingOutput,
    FunctionOutput,
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

/** Runs a target once, and reads back everything it left behind. */
export const runWGSLFunction = async (
    device: GPUDevice,
    wgsl: string,
    target: ActiveRunTarget,
    bindings: WgslBinding[],
    canvas: HTMLCanvasElement,
): Promise<RunnerResults> => {
    if (target.type === "function") {
        assertSupportedBindings(bindings);
        return runSimpleFunction(device, wgsl, target.runnable, bindings);
    }

    const session = createRunSession(device, wgsl, target, bindings, canvas);
    session.frame(0);
    const results = await session.read(true);
    session.destroy();

    return results;
};

/** A target that can be run more than once, which is every kind but a plain function. */
export type LoopableRunTarget = Exclude<ActiveRunTarget, { type: "function" }>;

/**
 * A compute or render target with its GPU resources built, ready to be run any number of times.
 *
 * Resources are built once rather than per run, which is what lets a loop carry state from one frame
 * to the next: the buffers and textures a frame writes are the ones the next frame reads. Running
 * once is a session that runs one frame and is thrown away.
 */
export interface RunSession {
    /**
     * Runs the target, with this many seconds in any time uniform, and resolves to any error raised
     * once the GPU has finished the frame.
     */
    frame: (deltaTime: number) => Promise<GPUError | null>;
    /**
     * Reads back the state the last frame left behind, along with any error raised since the session
     * was built. `withTexture` also reads the pixels behind the canvas' hover readout, which is by far
     * the slowest part, and so is left off while a loop is running.
     */
    read: (withTexture: boolean) => Promise<RunnerResults>;
    destroy: () => void;
}

export const createRunSession = (
    device: GPUDevice,
    wgsl: string,
    target: LoopableRunTarget,
    bindings: WgslBinding[],
    canvas: HTMLCanvasElement,
): RunSession => {
    assertSupportedBindings(bindings);

    return target.type === "render"
        ? createRenderSession(device, wgsl, target.runnable, bindings, canvas)
        : createComputeSession(device, wgsl, target.passes, bindings, canvas);
};

const assertSupportedBindings = (bindings: WgslBinding[]) => {
    if (
        bindings.some(
            (b) =>
                b.kind === "buffer" &&
                b.resourceType !== ResourceType.Uniform &&
                b.resourceType !== ResourceType.Storage,
        )
    )
        throw new Error("Unsupported resource type");
};

/**
 * Validation errors, caught a piece of work at a time.
 *
 * Every scope is pushed and popped around synchronous work, and never held open across an await, so
 * that runs overlapping in time - a loop's frames, or a new run started while the last one is still
 * reading back - cannot pop each other's scopes. What is caught is also kept, so a read reports an
 * error a frame raised even when nothing was waiting on that frame.
 */
const createErrorScopes = (device: GPUDevice) => {
    let caught: Promise<GPUError | null> = Promise.resolve(null);

    const pop = () => {
        const popped = device.popErrorScope();
        const previous = caught;
        caught = Promise.all([previous, popped]).then(([first, next]) => first ?? next);
        return popped;
    };

    return {
        run: <T,>(work: () => T): [T, Promise<GPUError | null>] => {
            device.pushErrorScope("validation");
            try {
                const result = work();
                return [result, pop()];
            } catch (error) {
                pop();
                throw error;
            }
        },
        caught: () => caught,
    };
};

/**
 * Waits for a frame's error, and for the GPU to finish everything submitted so far.
 *
 * An error scope settles once the work in it has been validated, which is well before a slow shader
 * has actually run, so it is no sign by itself that the GPU is ready for another frame.
 */
const finished = (device: GPUDevice, error: Promise<GPUError | null>) =>
    Promise.all([error, device.queue.onSubmittedWorkDone()]).then(([caught]) => caught);

/** Writes the seconds since the last frame into every binding the playground keeps the time in. */
const writeDeltaTime = (
    device: GPUDevice,
    bindings: WgslBinding[],
    buffers: Record<string, GPUBuffer>,
    deltaTime: number,
) => {
    for (const binding of bindings)
        if (binding.kind === "buffer" && binding.time)
            device.queue.writeBuffer(buffers[binding.id], 0, new Float32Array([deltaTime]));
};

const destroyResources = ({ buffers, textures }: Pick<BindingResources, "buffers" | "textures">) => {
    for (const buffer of Object.values(buffers)) buffer.destroy();
    for (const texture of Object.values(textures)) texture.destroy();
};

const NO_CONTEXT_RESULTS: RunnerResults = {
    type: "errors",
    errors: [formatRuntimeError(new Error("No WebGPU context found"))],
};

const runSimpleFunction = async (
    device: GPUDevice,
    wgsl: string,
    runnable: RunnableFunction,
    bindings: WgslBinding[],
): Promise<RunnerResults> => {
    const runner = getCodeRunnerForFunction(runnable, bindings, wgsl);
    if (runner.type === "error") return { type: "errors", errors: [formatRuntimeError(new Error(runner.error))] };

    const scopes = createErrorScopes(device);
    const [{ module, resources, value }] = scopes.run(() => {
        const module = device.createShaderModule({ code: runner.code });
        const resources = runComputeModule(device, module, runner.bindings, [
            { name: STUB_FUNCTION_RUNNER_NAME, threads: [1, 1, 1] },
        ]);
        const buffer = resources.buffers[STUB_FUNCTION_RUNNER_OUTPUT_BINDING_ID];
        return { module, resources, value: readBufferValue(device, buffer, runner.outputBindingType) };
    });

    const returned = { name: runnable.name, type: runner.outputBindingType, value: await value };
    destroyResources(resources);

    return collectResults(wgsl, module, scopes.caught(), [], returned);
};

const createRenderSession = (
    device: GPUDevice,
    wgsl: string,
    runnable: RunnableRender,
    bindings: WgslBinding[],
    canvas: HTMLCanvasElement,
): RunSession => {
    const scopes = createErrorScopes(device);

    const [{ module, resources, pipeline, depthTexture, context }] = scopes.run(() => {
        // Uniforms are visible to the vertex stage too, so a time uniform can move vertices. Storage
        // buffers are not: some devices allow none in a vertex shader, and would reject the pipeline.
        const resources = getBindingResources(bindings, device, (binding) =>
            binding.kind === "buffer" && binding.resourceType === ResourceType.Uniform
                ? GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT
                : GPUShaderStage.FRAGMENT,
        );
        const module = device.createShaderModule({ code: wgsl });

        const pipeline = device.createRenderPipeline({
            layout: resources.pipelineLayout,
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

        const depthTexture = runnable.useDepthTexture
            ? device.createTexture({
                  size: { width: canvas.width, height: canvas.height },
                  format: "depth32float",
                  usage: GPUTextureUsage.RENDER_ATTACHMENT,
              })
            : undefined;

        const context = canvas.getContext("webgpu");
        context?.configure({
            device,
            format: "rgba8unorm",
            alphaMode: "opaque",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });

        return { module, resources, pipeline, depthTexture, context };
    });

    /** Draws a frame onto the canvas, and returns the texture it was drawn into. */
    const draw = (deltaTime: number, context: GPUCanvasContext) => {
        writeDeltaTime(device, bindings, resources.buffers, deltaTime);

        const commandEncoder = device.createCommandEncoder();
        const texture = context.getCurrentTexture();
        const renderpass = commandEncoder.beginRenderPass({
            colorAttachments: [{ view: texture.createView(), loadOp: "clear", storeOp: "store" }],
            depthStencilAttachment: depthTexture && {
                view: depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "discard",
            },
        });
        renderpass.setPipeline(pipeline);
        for (const [groupId, bindGroup] of resources.bindGroups) {
            renderpass.setBindGroup(groupId, bindGroup);
        }
        renderpass.draw(runnable.vertices, 1, 0, 0);
        renderpass.end();
        device.queue.submit([commandEncoder.finish()]);

        return texture;
    };

    let lastDeltaTime = 0;

    return {
        frame: (deltaTime) => {
            lastDeltaTime = deltaTime;
            if (context === null) return Promise.resolve(null);

            return finished(device, scopes.run(() => draw(deltaTime, context))[1]);
        },
        read: async (withTexture) => {
            if (context === null) return NO_CONTEXT_RESULTS;

            // A canvas texture only lasts until it is presented, and a read that waited on anything
            // has missed it. A render pass keeps no state of its own, so drawing the last frame again,
            // with the time it was drawn with, gives back exactly the pixels it drew.
            let texture: Promise<RunnerResultsTextureReader> | undefined;
            if (withTexture)
                scopes.run(() => {
                    texture = readTextureValues(device, draw(lastDeltaTime, context), canvas);
                });

            return collectResults(wgsl, module, scopes.caught(), [], null, await texture);
        },
        destroy: () => {
            depthTexture?.destroy();
            destroyResources(resources);
        },
    };
};

/**
 * Runs compute entry points in order, over one set of bindings.
 *
 * The resources are built once and every pass is handed the same bind groups, which is what makes
 * one pass read what the pass before it wrote. Only the state left at the end is read back: the
 * passes in between are working steps, and reading each one would cost more than the run itself.
 */
const createComputeSession = (
    device: GPUDevice,
    wgsl: string,
    passes: NonEmpty<RunnableComputeShader>,
    bindings: WgslBinding[],
    canvas: HTMLCanvasElement,
): RunSession => {
    const scopes = createErrorScopes(device);

    // There is one canvas, so the first storage texture is the one drawn on it. Nothing in the
    // playground says which of several to show yet, and no example has more than one.
    const displayed = bindings.find((binding): binding is WgslTextureBinding => binding.kind === "texture");

    const [{ module, resources, pipelines, blit, context }] = scopes.run(() => {
        const module = device.createShaderModule({ code: wgsl });
        const resources = getBindingResources(bindings, device, () => GPUShaderStage.COMPUTE);
        const pipelines = createComputePipelines(device, module, resources.pipelineLayout, passes);

        const context = displayed ? canvas.getContext("webgpu") : null;
        const blit =
            displayed && context
                ? createCanvasBlit(device, context, resources.textures[displayed.id], displayed.format)
                : null;

        return { module, resources, pipelines, blit, context };
    });

    return {
        frame: (deltaTime) =>
            finished(
                device,
                scopes.run(() => {
                    writeDeltaTime(device, bindings, resources.buffers, deltaTime);
                    encodeComputePasses(device, resources.bindGroups, pipelines);
                    blit?.();
                })[1],
            ),
        read: async (withTexture) => {
            if (displayed && context === null) return NO_CONTEXT_RESULTS;

            const [{ values, texture }] = scopes.run(() => ({
                // A storage texture has no CPU-side value to stringify, and stringifying one would be
                // the slowest thing the playground does, so it goes to the canvas instead of into the
                // outputs panel.
                values: Promise.all(
                    bindings
                        .filter((binding): binding is WgslBufferBinding => binding.kind === "buffer" && binding.writable)
                        .map((binding) =>
                            readBufferValue(device, resources.buffers[binding.id], binding.type).then((value) => ({
                                binding,
                                value,
                            })),
                        ),
                ),
                texture:
                    withTexture && displayed && STORAGE_TEXTURE_FORMATS[displayed.format].inspectable
                        ? readTextureValues(device, resources.textures[displayed.id], canvas)
                        : undefined,
            }));

            return collectResults(wgsl, module, scopes.caught(), await values, null, await texture);
        },
        destroy: () => destroyResources(resources),
    };
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
 * Sets up drawing a storage texture onto the output canvas, and returns the function that draws it.
 *
 * A straight texture-to-texture copy will not do, because the canvas' backing store is scaled by
 * `devicePixelRatio` while a storage texture has a size of its own, so the two rarely match. This
 * fetches texels rather than sampling them, which keeps what lands on the canvas exactly what the
 * shader wrote, and needs no sampler - so the formats that cannot be filtered need no special case.
 */
const createCanvasBlit = (
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
    const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [{ binding: 0, resource: texture.createView() }],
    });

    return () => {
        const commandEncoder = device.createCommandEncoder();
        const renderpass = commandEncoder.beginRenderPass({
            colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store" }],
        });
        renderpass.setPipeline(pipeline);
        renderpass.setBindGroup(0, bindGroup);
        renderpass.draw(3, 1, 0, 0);
        renderpass.end();
        device.queue.submit([commandEncoder.finish()]);
    };
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

type BindingResources = ReturnType<typeof getBindingResources>;

const getBindingResources = (
    bindings: WgslBinding[],
    device: GPUDevice,
    getVisibility: (binding: WgslBinding) => GPUShaderStageFlags,
) => {
    const groupIds = uniq(bindings.map(({ group }) => group));

    const bindGroupLayouts = groupIds.map((groupId) =>
        device.createBindGroupLayout({
            entries: bindings
                .filter(({ group }) => group === groupId)
                .map((binding): GPUBindGroupLayoutEntry => {
                    const visibility = getVisibility(binding);

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

const collectResults = async (
    wgsl: string,
    module: GPUShaderModule,
    caught: Promise<GPUError | null>,
    results: BindingOutput[],
    returned: FunctionOutput | null,
    getTextureValue?: (row: number, column: number) => [number, number, number, number] | null,
): Promise<RunnerResults> => {
    const error = await caught;
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

function formatRuntimeError(error: GPUError): RunnerResultError {
    return {
        title: "Runtime Error",
        text: error.message,
        intent: "danger",
        icon: "warning-sign",
    };
}

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
            time: false,
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
            time: false,
        },
    ];

    return { type: "code", code, bindings: originalBindings.concat(newBindings), outputBindingType };
};

/** An entry point to dispatch, and how many work groups to dispatch it over. */
export interface ComputePass {
    name: string;
    threads: [number, number, number];
}

/** A compute pass with its pipeline built, so it can be dispatched any number of times. */
export interface ComputePipeline extends ComputePass {
    pipeline: GPUComputePipeline;
}

/** Builds the resources the passes share, then encodes and submits them. */
const runComputeModule = (
    device: GPUDevice,
    module: GPUShaderModule,
    bindings: WgslBinding[],
    passes: NonEmpty<ComputePass>,
) => {
    const { buffers, textures, bindGroups, pipelineLayout } = getBindingResources(
        bindings,
        device,
        () => GPUShaderStage.COMPUTE,
    );

    encodeComputePasses(device, bindGroups, createComputePipelines(device, module, pipelineLayout, passes));

    return { buffers, textures };
};

/** Builds a pipeline per entry point, all of them over the same layout. */
export const createComputePipelines = (
    device: GPUDevice,
    module: GPUShaderModule,
    pipelineLayout: GPUPipelineLayout,
    passes: NonEmpty<ComputePass>,
): NonEmpty<ComputePipeline> =>
    passes.map(({ name, threads }) => ({
        name,
        threads,
        pipeline: device.createComputePipeline({
            label: `Runner for ${name}`,
            layout: pipelineLayout,
            compute: { module, entryPoint: name },
        }),
    })) as NonEmpty<ComputePipeline>;

/**
 * Encodes a pass per entry point into one submit, all of them sharing the bind groups they are given.
 *
 * Each entry point gets a pass of its own rather than all of them sharing one, because a pass is the
 * boundary WebGPU synchronises across: a later pass is guaranteed to see what an earlier one wrote,
 * where whether one dispatch in a pass sees the one before it is still argued over in the spec.
 * Passes are cheap and the guarantee is not, so this takes the one that holds.
 */
export const encodeComputePasses = (
    device: GPUDevice,
    bindGroups: readonly (readonly [number, GPUBindGroup])[],
    pipelines: NonEmpty<ComputePipeline>,
) => {
    const commandEncoder = device.createCommandEncoder();

    for (const { name, threads, pipeline } of pipelines) {
        const computePass = commandEncoder.beginComputePass({ label: name });
        computePass.setPipeline(pipeline);
        for (const [groupId, bindGroup] of bindGroups) {
            computePass.setBindGroup(groupId, bindGroup);
        }
        computePass.dispatchWorkgroups(...threads);
        computePass.end();
    }

    device.queue.submit([commandEncoder.finish()]);
};

/**
 * Copies a buffer back to the CPU and reads it as its type.
 *
 * The copy is encoded and submitted before this first waits on anything, so it captures the buffer as
 * it stands when this is called - which is what lets a loop read one frame while the next is queued.
 */
const readBufferValue = async (device: GPUDevice, buffer: GPUBuffer, type: WGSLType): Promise<string> => {
    const commandEncoder = device.createCommandEncoder();
    const destination = device.createBuffer({
        size: buffer.size,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    commandEncoder.copyBufferToBuffer(buffer, 0, destination, 0, buffer.size);
    device.queue.submit([commandEncoder.finish()]);

    await destination.mapAsync(GPUMapMode.READ);
    const value = type.getStringFromBuffer(destination.getMappedRange());

    destination.unmap();
    destination.destroy();

    return value;
};
