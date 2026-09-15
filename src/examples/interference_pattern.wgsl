/// An interference pattern from four point sources, scaled by its own tallest wave.
///
/// Two passes over one set of bindings. The first measures the pattern, the second draws it, and the
/// second needs the number the first works out - so the order they run in is the whole point, and
/// the line below is how the shader says so.

/// playground-run-order: measure, draw

struct Source {
    position: vec2<f32>,
    frequency: f32,
    amplitude: f32,
}

@group(0) @binding(0) var<uniform> scene: array<Source, 4>; /// ((rand(0, 640), rand(0, 360)), rand(0, 1), rand(0.5, 1.5))
@group(0) @binding(1) var<storage, read_write> peak: f32; /// 0
@group(0) @binding(2) var field: texture_storage_2d<rgba8unorm, write>;

const trough = vec3<f32>(12.0 / 255, 18.0 / 255, 48.0 / 255);
const crest = vec3<f32>(224.0 / 255, 231.0 / 255, 255.0 / 255);

const threads = 64u;
var<workgroup> measured: array<f32, threads>;

/// Finds the tallest wave anywhere in the image, which is what the second pass divides by.
///
/// Each thread takes a share of the rows and keeps the highest it sees, and then one thread reduces
/// those answers to one. The barrier is what makes that safe: without it the reducing thread could
/// read a row nothing had measured yet.
@compute /// 1, 1, 1
@workgroup_size(threads, 1, 1)
fn measure(@builtin(local_invocation_id) local_id: vec3<u32>) {
    let size = textureDimensions(field);

    var highest = 0.0;
    for (var y = local_id.x; y < size.y; y += threads) {
        for (var x = 0u; x < size.x; x++) {
            highest = max(highest, abs(height_at(vec2<f32>(f32(x), f32(y)))));
        }
    }
    measured[local_id.x] = highest;

    workgroupBarrier();

    if (local_id.x == 0u) {
        var highest_of_all = 0.0;
        for (var i = 0u; i < threads; i++) {
            highest_of_all = max(highest_of_all, measured[i]);
        }
        peak = highest_of_all;
    }
}

/// Draws the pattern, one invocation per pixel.
///
/// Dividing by the measured peak rather than by a number picked to look right means the darkest and
/// brightest pixels land exactly on the two colours above, whatever the sources happen to be.
@compute /// 80, 45, 1
@workgroup_size(8, 8, 1)
fn draw(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let height = height_at(vec2<f32>(f32(global_id.x), f32(global_id.y)));

    /// Every amplitude can be edited down to zero, which would leave nothing to divide by.
    let normalised = height / max(peak, 0.0001) * 0.5 + 0.5;

    textureStore(field, global_id.xy, vec4<f32>(mix(trough, crest, normalised), 1.0));
}

fn height_at(point: vec2<f32>) -> f32 {
    var height = 0.0;
    for (var i = 0; i < 4; i++) {
        let source = scene[i];
        height += source.amplitude * sin(length(point - source.position) * source.frequency);
    }
    return height;
}
