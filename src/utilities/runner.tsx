import { ResourceType, StructInfo } from "wgsl_reflect";
import { uniq } from "../frontend-utils/general/data";
import { Runnable, RunnableComputeShader, RunnerResultError, RunnerResults, WgslBinding, WgslOutput } from "./types";
import { parseBufferForType } from "./values";

export const runWGSLFunction = async (
    device: GPUDevice,
    wgsl: string,
    runnable: Runnable,
    bindings: WgslBinding[],
    structs: StructInfo[],
    canvas: HTMLCanvasElement
): Promise<RunnerResults> => {
    if (runnable.type === "render")
        return new Promise((resolve) =>
            setTimeout(() => {
                const binding = bindings[0];
                if (binding === undefined) return;
                const stubOutput: WgslOutput = { binding, value: "[ 1.0, 2.0, 3.0 ]" };
                resolve({ type: "outputs", outputs: [stubOutput] });
            }, 500)
        );

    if (bindings.some((b) => b.resourceType !== ResourceType.Uniform && b.resourceType !== ResourceType.Storage))
        throw new Error("Unsupported resource type");

    device.pushErrorScope("validation");

    return runComputeShader(device, wgsl, runnable, bindings, structs);
};

const runComputeShader = async (
    device: GPUDevice,
    wgsl: string,
    runnable: RunnableComputeShader,
    bindings: WgslBinding[],
    structs: StructInfo[]
): Promise<RunnerResults> => {
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
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: buffer },
                    };
                }),
        })
    );

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

    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts });
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

const maybeReturnResults = async (
    wgsl: string,
    results: WgslOutput[],
    device: GPUDevice,
    module: GPUShaderModule
): Promise<RunnerResults> => {
    const error = await device.popErrorScope();
    const compilation = await module.getCompilationInfo();
    if (compilation.messages.length > 0) return { type: "errors", errors: formatCompilationErrors(compilation, wgsl) };
    if (error) return { type: "errors", errors: [formatRuntimeError(error)] };

    return { type: "outputs", outputs: results };
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
