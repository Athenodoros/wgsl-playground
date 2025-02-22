import { parseWGSL } from "../utilities/parseWGSL";
import { AppState } from "./types";

const DEFAULT_WGSL_CODE: string = `@group(0) @binding(0) var<storage, read> input_array: array<i32>;
@group(0) @binding(1) var<storage, read_write> cumulative_counts: array<i32>;
@group(0) @binding(2) var<storage, read_write> total_sum: i32;

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
        cumulative_counts[i] = running_total;
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

const parsed = parseWGSL(DEFAULT_WGSL_CODE);
if (parsed.type === "failed-parse") {
    throw new Error(parsed.error);
}

export const INITIAL_APP_STATE: AppState = {
    ...parsed,
    type: "loading",
    wgsl: DEFAULT_WGSL_CODE,
};
