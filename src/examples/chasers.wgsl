/// Chasers: thousands of points that each follow the trails the others leave behind.
///
/// Every chaser senses the trail ahead of it and a little to either side, turns towards whichever is
/// strongest, moves on, and leaves a trail of its own. The trail fades a little every frame, so the
/// paths many chasers share are the ones that last - and they gather into networks of their own.
///
/// Four passes run every frame, in the order below: the frame counter moves on, the trail fades, the
/// chasers move and draw into it, and the trail is painted onto the canvas.
///
/// The canvas wraps around at its edges, so a chaser that leaves one side comes back on the other.
///
/// The settings can be edited while it runs - try a larger sensor, or a trail that lasts longer.

/// playground-compute-run-order: tick, fade, steer, draw

const CHASERS = 50000u;
const THREADS = 64u;
const CHASER_GROUPS = (CHASERS + THREADS - 1u) / THREADS;

const WIDTH = 640u;
const HEIGHT = 360u;
const COLUMNS = WIDTH / 8u;
const ROWS = HEIGHT / 8u;

struct Settings {
    /// How sharply a chaser turns, in radians per second.
    turning: f32,
    /// How fast a chaser moves, in pixels per second.
    speed: f32,
    /// How far ahead a chaser senses the trail, in pixels.
    sensor_distance: f32,
    /// How many pixels either side of that point it senses over.
    sensor_size: i32,
    /// How much of the trail is left after a second.
    persistence: f32,
}

struct Chaser {
    position: vec2<f32>,
    heading: f32,
}

@group(0) @binding(0) var<uniform> delta_time: f32; /// playground-time
@group(0) @binding(1) var<storage, read_write> chasers: array<Chaser, CHASERS>; /// ((rand(0, 640), rand(0, 360)), rand(0, 6.2832))
@group(0) @binding(2) var<storage, read_write> trail: array<f32, WIDTH * HEIGHT>; /// 0
@group(0) @binding(3) var<storage, read_write> frame: u32; /// 0
@group(0) @binding(4) var canvas: texture_storage_2d<rgba8unorm, write>; /// WIDTH, HEIGHT
/// Last, so that it sits just above the canvas in the bindings panel, for tuning while watching.
@group(0) @binding(5) var<uniform> settings: Settings; /// 5, 30, 6, 1, 0.1

const background = vec3<f32>(10.0 / 255, 9.0 / 255, 26.0 / 255);
const foreground = vec3<f32>(224.0 / 255, 231.0 / 255, 255.0 / 255);

/// Counts frames, so that each one gets random numbers of its own.
@compute /// 1
@workgroup_size(1)
fn tick() {
    frame += 1u;
}

@compute /// COLUMNS, ROWS
@workgroup_size(8, 8)
fn fade(@builtin(global_invocation_id) id: vec3<u32>) {
    let index = id.y * WIDTH + id.x;
    let faded = trail[index] * pow(settings.persistence, delta_time);
    trail[index] = select(faded, 0.0, faded < 0.001);
}

/// Steers one chaser along the trail, and moves it on. Chasers write their trails without waiting
/// for one another, so two landing on the same pixel in the same frame can overwrite each other -
/// which, as both write the same value, is fine.
@compute /// CHASER_GROUPS
@workgroup_size(THREADS)
fn steer(@builtin(global_invocation_id) id: vec3<u32>) {
    if (id.x >= CHASERS) {
        return;
    }
    var chaser = chasers[id.x];

    let left = sense(chaser, -radians(60.0));
    let ahead = sense(chaser, 0.0);
    let right = sense(chaser, radians(60.0));

    // Carrying on means a little wander, and turning means a turn of somewhere around 60 degrees.
    let random = random_unit(id.x);
    var turn = random * 0.4 - 0.2;
    if (left > ahead && left >= right) {
        turn = -(random * 0.4 + 0.8);
    } else if (right > ahead && right > left) {
        turn = random * 0.4 + 0.8;
    }
    chaser.heading += turn * settings.turning * delta_time;

    chaser.position = wrap(chaser.position + direction(chaser.heading) * settings.speed * delta_time);

    chasers[id.x] = chaser;
    trail[index(chaser.position)] = 1.0;
}

@compute /// COLUMNS, ROWS
@workgroup_size(8, 8)
fn draw(@builtin(global_invocation_id) id: vec3<u32>) {
    let value = trail[id.y * WIDTH + id.x];
    textureStore(canvas, id.xy, vec4<f32>(mix(background, foreground, value), 1.0));
}

fn direction(heading: f32) -> vec2<f32> {
    return vec2<f32>(sin(heading), cos(heading));
}

/// A point brought back onto the canvas from wherever it has wandered off it.
fn wrap(point: vec2<f32>) -> vec2<f32> {
    let size = vec2<f32>(f32(WIDTH), f32(HEIGHT));
    return point - floor(point / size) * size;
}

/// Where a point on the canvas is kept in the trail.
fn index(point: vec2<f32>) -> u32 {
    return min(u32(point.y), HEIGHT - 1u) * WIDTH + min(u32(point.x), WIDTH - 1u);
}

/// The average trail around a point ahead of a chaser, at an angle to its heading.
fn sense(chaser: Chaser, angle: f32) -> f32 {
    let centre = chaser.position + direction(chaser.heading + angle) * settings.sensor_distance;
    let size = settings.sensor_size;

    var total = 0.0;
    for (var dx = -size; dx <= size; dx++) {
        for (var dy = -size; dy <= size; dy++) {
            total += trail[index(wrap(centre + vec2<f32>(f32(dx), f32(dy))))];
        }
    }

    let width = f32(2 * size + 1);
    return total / (width * width);
}

/// A random number between 0 and 1, different for every chaser and every frame.
fn random_unit(seed: u32) -> f32 {
    return f32(hash(hash(seed) ^ frame)) / 4294967296.0;
}

/// A hash from www.cs.ubc.ca/~rbridson/docs/schechter-sca08-turbulence.pdf
fn hash(state: u32) -> u32 {
    var result = state;
    result ^= 2747636419u;
    result *= 2654435769u;
    result ^= result >> 16u;
    result *= 2654435769u;
    result ^= result >> 16u;
    result *= 2654435769u;
    return result;
}
