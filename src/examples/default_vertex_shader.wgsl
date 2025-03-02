struct VertexOutput {
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
