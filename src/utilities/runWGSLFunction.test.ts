import { describe, expect, it } from "vitest";
import { encodeComputePasses } from "./runWGSLFunction";

/**
 * A stand-in for the handful of things a compute pass asks of a GPUDevice, which writes down what it
 * is told to do instead of doing it.
 *
 * There is no WebGPU in node, and what is worth checking here is the shape of the command stream
 * rather than what a driver makes of it: that each entry point gets a pass, that they are encoded in
 * the order they were given, and that they all see the same bind groups - which is the whole reason
 * one pass can read what the pass before it wrote.
 */
const recordingDevice = () => {
    const calls: string[] = [];

    const device = {
        createComputePipeline: ({ compute }: GPUComputePipelineDescriptor) => {
            calls.push(`createComputePipeline ${compute.entryPoint}`);
            return `pipeline(${compute.entryPoint})`;
        },
        createCommandEncoder: () => ({
            beginComputePass: ({ label }: GPUComputePassDescriptor) => {
                calls.push(`beginComputePass ${label}`);
                return {
                    setPipeline: (pipeline: string) => calls.push(`setPipeline ${pipeline}`),
                    setBindGroup: (group: number, bindGroup: string) =>
                        calls.push(`setBindGroup ${group} ${bindGroup}`),
                    dispatchWorkgroups: (x: number, y: number, z: number) => calls.push(`dispatch ${x} ${y} ${z}`),
                    end: () => calls.push("end"),
                };
            },
            finish: () => "commands",
        }),
        queue: { submit: (buffers: string[]) => calls.push(`submit ${buffers.join(", ")}`) },
    };

    return { device: device as unknown as GPUDevice, calls };
};

describe("encodeComputePasses", () => {
    it("encodes a pass per entry point, in order, over the same bind groups and in one submit", () => {
        const { device, calls } = recordingDevice();
        const bindGroups = [[0, "bindGroup(0)" as unknown as GPUBindGroup]] as const;

        encodeComputePasses(device, {} as GPUShaderModule, {} as GPUPipelineLayout, bindGroups, [
            { name: "measure", threads: [1, 1, 1] },
            { name: "draw", threads: [80, 45, 1] },
        ]);

        expect(calls).toEqual([
            "createComputePipeline measure",
            "beginComputePass measure",
            "setPipeline pipeline(measure)",
            "setBindGroup 0 bindGroup(0)",
            "dispatch 1 1 1",
            "end",
            "createComputePipeline draw",
            "beginComputePass draw",
            "setPipeline pipeline(draw)",
            "setBindGroup 0 bindGroup(0)",
            "dispatch 80 45 1",
            "end",
            "submit commands",
        ]);
    });
});
