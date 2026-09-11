/// An interference pattern from four point sources.

struct Source {
    position: vec2<f32>,
    frequency: f32,
    amplitude: f32,
}

@group(0) @binding(0) var<uniform> scene: array<Source, 4>; /// ((rand(0, 640), rand(0, 360)), rand(0, 1), rand(0.5, 1.5))
@group(0) @binding(1) var field: texture_storage_2d<rgba8unorm, write>;

const trough = vec3<f32>(12.0 / 255, 18.0 / 255, 48.0 / 255);
const crest = vec3<f32>(224.0 / 255, 231.0 / 255, 255.0 / 255);

/// Waves are summed, so the total is scaled back down before being displayed.
/// Below the number of sources, to give the pattern a little more contrast.
const scale = 3.0;

@compute /// 80, 45, 1
@workgroup_size(8, 8, 1)
fn interference(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let point = vec2<f32>(f32(global_id.x), f32(global_id.y));

    var height = 0.0;
    for (var i = 0; i < 4; i++) {
        let source = scene[i];
        let distance = length(point - source.position);
        height += source.amplitude * sin(distance * source.frequency);
    }

    let normalised = clamp(height / scale, -1.0, 1.0) * 0.5 + 0.5;
    textureStore(field, global_id.xy, vec4<f32>(mix(trough, crest, normalised), 1.0));
}
