import { parseWGSL } from "../utilities/parseWGSL";
import { AppState } from "./types";

const DEFAULT_WGSL_CODE: string = `struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) colour: vec3<f32>,
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
    return vec4<f32>(in.colour, 1.0);
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
