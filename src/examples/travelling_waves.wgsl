/// Waves travelling out from four point sources, run in a loop.
///
/// The comment after `delta_time` has the playground fill it with the seconds since the frame before.
/// Buffers last from one frame to the next while the loop runs, so the shader keeps its own running
/// total in `elapsed`: the first pass moves that clock on, and the second draws the waves wherever the
/// clock says they have got to. Reset starts the clock again from the zero it is given below.

/// playground-compute-run-order: tick, draw

struct Source {
    position: vec2<f32>,
    frequency: f32,
    speed: f32,
}

@group(0) @binding(0) var<uniform> delta_time: f32; /// playground-time
@group(0) @binding(1) var<storage, read_write> elapsed: f32; /// 0
@group(0) @binding(2) var<uniform> sources: array<Source, 4>; /// ((rand(0, 640), rand(0, 360)), rand(0.05, 0.2), rand(2, 6))
@group(0) @binding(3) var field: texture_storage_2d<rgba8unorm, write>;

const trough = vec3<f32>(12.0 / 255, 18.0 / 255, 48.0 / 255);
const crest = vec3<f32>(224.0 / 255, 231.0 / 255, 255.0 / 255);

@compute /// 1
@workgroup_size(1, 1, 1)
fn tick() {
    elapsed += delta_time;
}

/// Four waves of height one can add up to four either way, which is what maps them onto the colours.
@compute /// 80, 45, 1
@workgroup_size(8, 8, 1)
fn draw(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let point = vec2<f32>(f32(global_id.x), f32(global_id.y));

    var height = 0.0;
    for (var i = 0; i < 4; i++) {
        let source = sources[i];
        height += sin(length(point - source.position) * source.frequency - elapsed * source.speed);
    }

    textureStore(field, global_id.xy, vec4<f32>(mix(trough, crest, height / 8.0 + 0.5), 1.0));
}
