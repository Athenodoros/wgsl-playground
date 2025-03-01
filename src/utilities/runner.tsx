import { ResourceType, StructInfo, TypeInfo } from "wgsl_reflect";
import { assertNever, range, uniq } from "../frontend-utils/general/data";
import { getReflectionOrError } from "./parseWGSL";
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
} from "./types";
import { getDefaultValue, parseBufferForType, parseValueForType } from "./values";

const STUB_FUNCTION_RUNNER_OUTPUT_BINDING_ID = "stub_function_runner_output";
const STUB_FUNCTION_RUNNER_NAME = "_wgsl_playground_function_runner__";

export const runWGSLFunction = async (
    device: GPUDevice,
    wgsl: string,
    runnable: Runnable,
    bindings: WgslBinding[],
    structs: StructInfo[],
    canvas: HTMLCanvasElement
): Promise<RunnerResults> => {
    if (bindings.some((b) => b.resourceType !== ResourceType.Uniform && b.resourceType !== ResourceType.Storage))
        throw new Error("Unsupported resource type");

    device.pushErrorScope("validation");

    if (runnable.type === "render") return runRenderShader(device, wgsl, runnable, bindings, canvas);
    if (runnable.type === "compute") return runComputeShader(device, wgsl, runnable, bindings, structs);
    if (runnable.type === "function") return runSimpleFunction(device, wgsl, runnable, bindings, structs);

    assertNever(runnable);
    return { type: "errors", errors: [formatRuntimeError(new Error("Unsupported runnable type"))] }; // Never reaches this point
};

const runSimpleFunction = async (
    device: GPUDevice,
    wgsl: string,
    runnable: RunnableFunction,
    bindings: WgslBinding[],
    structs: StructInfo[]
): Promise<RunnerResults> => {
    const runner = getCodeRunnerForFunction(runnable, bindings, wgsl);
    if (runner.type === "error") return { type: "errors", errors: [formatRuntimeError(new Error(runner.error))] };

    const module = device.createShaderModule({ code: runner.code });
    const buffers = runComputeModule(device, module, runner.bindings, STUB_FUNCTION_RUNNER_NAME, [1, 1, 1]);
    const buffer = buffers[STUB_FUNCTION_RUNNER_OUTPUT_BINDING_ID];
    const value = await readBufferValue(device, buffer, runner.outputBindingType, structs);

    return maybeReturnResults(wgsl, [], device, module, { name: runnable.name, type: runner.outputBindingType, value });
};

const runRenderShader = async (
    device: GPUDevice,
    wgsl: string,
    runnable: RunnableRender,
    bindings: WgslBinding[],
    canvas: HTMLCanvasElement
): Promise<RunnerResults> => {
    const { bindGroups, pipelineLayout } = getBindingResources(bindings, device, GPUShaderStage.FRAGMENT);
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

    const buffer = device.createBuffer({
        size: texture.width * texture.height * 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    commandEncoder.copyTextureToBuffer(
        { texture },
        { buffer, bytesPerRow: texture.width * 4 },
        { width: texture.width, height: texture.height }
    );
    device.queue.submit([commandEncoder.finish()]);

    await buffer.mapAsync(GPUMapMode.READ);
    const rawValues = new Uint8Array(buffer.getMappedRange());
    const values = range(texture.height).map((row) =>
        range(texture.width).map(
            (column) =>
                range(4).map((rgba) => rawValues[row * texture.width * 4 + column * 4 + rgba]) as [
                    number,
                    number,
                    number,
                    number
                ]
        )
    );
    const getTextureValue = (row: number, column: number) => values[row]?.[column] ?? null;

    if (maybeDepthTexture) maybeDepthTexture.destroy();

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
    structs: StructInfo[]
): Promise<RunnerResults> => {
    const module = device.createShaderModule({ code: wgsl });
    const buffers = runComputeModule(device, module, bindings, runnable.name, runnable.threads);

    const promises = bindings
        .filter((binding) => binding.writable)
        .map((binding) =>
            readBufferValue(device, buffers[binding.id], binding.type, structs).then((value) => ({ binding, value }))
        );

    return maybeReturnResults(wgsl, await Promise.all(promises), device, module, null);
};

const getBindingResources = (bindings: WgslBinding[], device: GPUDevice, visibility: number) => {
    const groupIds = uniq(bindings.map(({ group }) => group));

    const bindGroupLayouts = groupIds.map((groupId) =>
        device.createBindGroupLayout({
            entries: bindings
                .filter(({ group }) => group === groupId)
                .map((binding) => {
                    const buffer =
                        binding.resourceType === ResourceType.Uniform
                            ? "uniform"
                            : binding.resourceType === ResourceType.Storage
                            ? binding.writable
                                ? "storage"
                                : "read-only-storage"
                            : null;

                    if (buffer === null) throw new Error("Unsupported resource type");

                    return {
                        binding: binding.index,
                        visibility,
                        buffer: { type: buffer },
                    };
                }),
        })
    );
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts });

    const buffers: Record<string, GPUBuffer> = {};
    const bindGroups = groupIds.map((groupId, groupdIdx) => {
        const entries: GPUBindGroupEntry[] = bindings
            .filter(({ group }) => group === groupId)
            .map((binding) => {
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

    return { buffers, bindGroups, pipelineLayout };
};

const maybeReturnResults = async (
    wgsl: string,
    results: BindingOutput[],
    device: GPUDevice,
    module: GPUShaderModule,
    returned: FunctionOutput | null,
    getTextureValue?: (row: number, column: number) => [number, number, number, number] | null
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
    wgsl: string
):
    | { type: "code"; code: string; bindings: WgslBinding[]; outputBindingType: TypeInfo }
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
    const inputBindingType = reflect.reflect.structs.find((s) => s.name === "WGSLPlaygroundFunctionInputsStruct");
    if (inputBindingType === undefined) return { type: "error", error: "Could not find input binding type" };

    const inputBindingValue = getDefaultValue(inputBindingType, reflect.reflect.structs);
    if (inputBindingValue.type === "error") return inputBindingValue;
    const inputBindingBuffer = parseValueForType(inputBindingType, reflect.reflect.structs, inputBindingValue.value);
    if (inputBindingBuffer === null) return { type: "error", error: "Could not parse default value for input binding" };

    const outputBindingType = runnable.output ?? new TypeInfo("i32", null);
    const outputBindingValue = getDefaultValue(outputBindingType, reflect.reflect.structs);
    if (outputBindingValue.type === "error") return outputBindingValue;
    const outputBindingBuffer = parseValueForType(outputBindingType, reflect.reflect.structs, outputBindingValue.value);
    if (outputBindingBuffer === null)
        return { type: "error", error: "Could not parse default value for output binding" };

    const newBindings: WgslBinding[] = [
        {
            id: "stub_function_runner_input",
            resourceType: ResourceType.Storage,
            writable: false,
            group: newGroupId,
            index: 0,
            name: "inputs",
            type: inputBindingType,
            input: inputBindingValue.value,
            buffer: inputBindingBuffer,
        },
        {
            id: STUB_FUNCTION_RUNNER_OUTPUT_BINDING_ID,
            resourceType: ResourceType.Storage,
            writable: true,
            group: newGroupId,
            index: 1,
            name: "output",
            type: outputBindingType,
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
    threads: [number, number, number]
) => {
    const { buffers, bindGroups, pipelineLayout } = getBindingResources(bindings, device, GPUShaderStage.COMPUTE);
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

    return buffers;
};

const readBufferValue = async (
    device: GPUDevice,
    buffer: GPUBuffer,
    type: TypeInfo,
    structs: StructInfo[]
): Promise<string> => {
    const commandEncoder = device.createCommandEncoder();
    const destination = device.createBuffer({
        size: buffer.size,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    commandEncoder.copyBufferToBuffer(buffer, 0, destination, 0, buffer.size);
    device.queue.submit([commandEncoder.finish()]);

    await destination.mapAsync(GPUMapMode.READ);
    return parseBufferForType(type, structs, destination.getMappedRange());
};
