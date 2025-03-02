import { parseWGSL } from "../utilities/parseWGSL";
import { AppState } from "./types";

export const DEFAULT_VERTEX_SHADER: string = `struct VertexOutput {
    @location(0) colour: vec3<f32>,
    @builtin(position) position: vec4<f32>,
}

@vertex
fn vertex_main(@builtin(vertex_index) vertex_index : u32) -> VertexOutput {
    var out: VertexOutput;

    if (vertex_index == 0u) {
        out.position = vec4f(-0.5, -0.5, 0, 1);
        out.colour = vec3f(1, 0, 0);
    } else if (vertex_index == 1u) {
        out.position = vec4f(0.5, -0.5, 0, 1);
        out.colour = vec3f(0, 1, 0);
    } else {
        out.position = vec4f(0.0, 0.5, 0, 1);
        out.colour = vec3f(0, 0, 1);
    }

    return out;
}

@fragment
fn fragment_main(in: VertexOutput) -> @location(0) vec4<f32> {
    return create_colour(in.colour);
}

fn create_colour(colour: vec3f) -> vec4f {
    return vec4<f32>(colour, 1.0);
}
`;

export const DEFAULT_COMPUTE_SHADER: string = `@group(0) @binding(0) var<storage, read> input_array: array<i32>; // rand(0, 100)
@group(0) @binding(1) var<storage, read_write> cumulative_offsets: array<i32>; // 0
@group(0) @binding(2) var<storage, read_write> total_sum: i32; // 0

const workgroup_length : u32 = 128;
var<workgroup> workgroup_counts: array<i32, workgroup_length>;

@compute @workgroup_size(workgroup_length,1,1)
fn get_counts(@builtin(global_invocation_id) GlobalInvocationID: vec3<u32>) {
    let thread_id = GlobalInvocationID.x;
    let array_length = arrayLength(&input_array);
    let entries_per_thread = array_length / workgroup_length + 1; // Round up

    // Calculate range for this thread
    let start = min(thread_id * entries_per_thread, array_length);
    let end = min(start + entries_per_thread, array_length);

    // Sum this thread's portion
    var local_sum = 0;
    for (var i = start; i < end; i++) {
        local_sum += input_array[i];
    }
    workgroup_counts[thread_id] = local_sum;

    workgroupBarrier();

    // Calculate prefix sum for this thread
    var offset = 0;
    for (var i = 0u; i < thread_id; i++) {
        offset += workgroup_counts[i];
    }

    // Fill cumulative counts for this thread's range
    var running_total = offset;
    for (var i = start; i < end; i++) {
        cumulative_offsets[i] = running_total;
        running_total += input_array[i];
    }

    // Thread 0 writes total
    if (thread_id == 0u) {
        total_sum = 0;
        for (var i = 0u; i < workgroup_length; i++) {
            total_sum += workgroup_counts[i];
        }
    }
}
`;

const parsed = parseWGSL(DEFAULT_VERTEX_SHADER);
if (parsed.type === "failed-parse") {
    throw new Error(parsed.error);
}

export const INITIAL_APP_STATE: AppState = {
    ...parsed,
    type: "loading",
    wgsl: DEFAULT_VERTEX_SHADER,
};
