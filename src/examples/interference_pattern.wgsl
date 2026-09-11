/// An interference pattern from four point sources.
///
/// Each source emits a circular wave with its own position, frequency and
/// amplitude. The compute shader sums the waves at every pixel and writes the
/// result into a storage texture, which is displayed on the right.
///
/// Try editing the source values below, or the colours, and watch the pattern
/// change.

struct Source {
    position: vec2<f32>,
    frequency: f32,
    amplitude: f32,
}

struct Scene {
    sources: array<Source, 4>,
}

@group(0) @binding(0) var<uniform> scene: Scene; /// (((150, 110), 0.12, 1), ((500, 90), 0.09, 1), ((220, 300), 0.15, 0.8), ((470, 260), 0.07, 1.2))
@group(0) @binding(1) var field: texture_storage_2d<rgba8unorm, write>; /// 640, 360

const trough = vec3<f32>(12.0 / 255, 18.0 / 255, 48.0 / 255);
const crest = vec3<f32>(224.0 / 255, 231.0 / 255, 255.0 / 255);

/// Waves are summed, so the total is scaled back down before being displayed.
/// Below the number of sources, to give the pattern a little more contrast.
const scale = 3.0;

@compute /// 640, 360, 1
@workgroup_size(1, 1, 1)
fn interference(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let point = vec2<f32>(f32(global_id.x), f32(global_id.y));

    var height = 0.0;
    for (var i = 0; i < 4; i++) {
        height += wave_height_at_point(scene.sources[i], point);
    }

    let normalised = clamp(height / scale, -1.0, 1.0) * 0.5 + 0.5;
    textureStore(field, global_id.xy, vec4<f32>(mix(trough, crest, normalised), 1.0));
}

fn wave_height_at_point(source: Source, point: vec2<f32>) -> f32 {
    let distance = length(point - source.position);
    return source.amplitude * sin(distance * source.frequency);
}
