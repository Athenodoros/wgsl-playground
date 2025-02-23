import { ResourceType, StructInfo } from "wgsl_reflect";
import { assertNever, range, uniq } from "../frontend-utils/general/data";
import {
    Runnable,
    RunnableComputeShader,
    RunnableRender,
    RunnerResultError,
    RunnerResults,
    WgslBinding,
    WgslOutput,
} from "./types";
import { parseBufferForType } from "./values";

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

    assertNever(runnable);
    return { type: "errors", errors: [formatRuntimeError(new Error("Unsupported runnable type"))] }; // Never reaches this point
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
        depthStencil: {
            format: "depth32float",
            depthWriteEnabled: true,
            depthCompare: "less",
            stencilFront: { compare: "always", failOp: "keep", depthFailOp: "keep", passOp: "keep" },
        },
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

    return maybeReturnResults(wgsl, [], device, module, getTextureValue);
};

const runComputeShader = async (
    device: GPUDevice,
    wgsl: string,
    runnable: RunnableComputeShader,
    bindings: WgslBinding[],
    structs: StructInfo[]
): Promise<RunnerResults> => {
    const { buffers, bindGroups, pipelineLayout } = getBindingResources(bindings, device, GPUShaderStage.COMPUTE);

    const module = device.createShaderModule({ code: wgsl });
    const pipeline = device.createComputePipeline({
        label: `Runner for ${runnable.name}`,
        layout: pipelineLayout,
        compute: { module, entryPoint: runnable.name },
    });

    const commandEncoder = device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(pipeline);
    for (const [groupId, bindGroup] of bindGroups) {
        computePass.setBindGroup(groupId, bindGroup);
    }
    computePass.dispatchWorkgroups(...runnable.threads);
    computePass.end();
    device.queue.submit([commandEncoder.finish()]);

    const promises: Promise<WgslOutput>[] = bindings
        .filter((binding) => binding.writable)
        .map(async (binding) => {
            const buffer = buffers[binding.id];

            const commandEncoder = device.createCommandEncoder();
            const destination = device.createBuffer({
                size: buffer.size,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            });
            commandEncoder.copyBufferToBuffer(buffer, 0, destination, 0, buffer.size);
            device.queue.submit([commandEncoder.finish()]);

            await destination.mapAsync(GPUMapMode.READ);
            return { binding, value: parseBufferForType(binding.type, structs, destination.getMappedRange()) };
        });

    const results = await Promise.all(promises);

    return maybeReturnResults(wgsl, results, device, module);
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
    results: WgslOutput[],
    device: GPUDevice,
    module: GPUShaderModule,
    getTextureValue?: (row: number, column: number) => [number, number, number, number] | null
): Promise<RunnerResults> => {
    const error = await device.popErrorScope();
    const compilation = await module.getCompilationInfo();

    if (compilation.messages.length > 0) return { type: "errors", errors: formatCompilationErrors(compilation, wgsl) };
    if (error) return { type: "errors", errors: [formatRuntimeError(error)] };

    return { type: "outputs", getTextureValue, outputs: results };
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
