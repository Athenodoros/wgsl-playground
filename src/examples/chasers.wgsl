/// Chasers: thousands of points that each follow the trails the others leave behind.
///
/// Every chaser senses the trail ahead of it and a little to either side, turns towards whichever is
/// strongest, moves on, and leaves a trail of its own. The trail fades a little every frame, so the
/// paths many chasers share are the ones that last - and they gather into networks of their own.
///
/// Three passes run every frame, in the order below: the trail fades, the chasers move and draw into
/// it, and the trail is painted onto the canvas.
///
/// The chasers start in the middle of the canvas, and turn away from its edges when they get there.
///
/// The settings can be edited while it runs - try a larger sensor, or a trail that lasts longer.

/// playground-compute-run-order: fade, steer, draw

const CHASERS = 50000u;
const THREADS = 64u;
const CHASER_GROUPS = (CHASERS + THREADS - 1u) / THREADS;

const WIDTH = 640u;
const HEIGHT = 360u;
const COLUMNS = WIDTH / 8u;
const ROWS = HEIGHT / 8u;

/// The most time a frame moves the simulation on by, in seconds. A frame that comes late - after a
/// stall, or on coming back to the tab - is shortened to this rather than sending every chaser flying.
const MAX_STEP = 0.1;

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
@group(0) @binding(1) var<storage, read_write> chasers: array<Chaser, CHASERS>; /// ((rand(160, 480), rand(90, 270)), rand(0, 6.2832))
@group(0) @binding(2) var<storage, read_write> trail: array<f32, WIDTH * HEIGHT>; /// 0
@group(0) @binding(3) var canvas: texture_storage_2d<rgba8unorm, write>; /// WIDTH, HEIGHT
/// Last, so that it sits just above the canvas in the bindings panel, for tuning while watching.
@group(0) @binding(4) var<uniform> settings: Settings; /// 5, 50, 6, 1, 0.1

const background = vec3<f32>(10.0 / 255, 9.0 / 255, 26.0 / 255);
const foreground = vec3<f32>(224.0 / 255, 231.0 / 255, 255.0 / 255);

@compute /// COLUMNS, ROWS
@workgroup_size(8, 8)
fn fade(@builtin(global_invocation_id) id: vec3<u32>) {
    let index = id.y * WIDTH + id.x;
    let faded = trail[index] * pow(settings.persistence, step_time());
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
    let random = random_unit(id.x, chaser.position);
    var turn = random * 0.4 - 0.2;
    if (left > ahead && left >= right) {
        turn = -(random * 0.4 + 0.8);
    } else if (right > ahead && right > left) {
        turn = random * 0.4 + 0.8;
    }
    chaser.heading += turn * settings.turning * step_time();

    let moved = chaser.position + direction(chaser.heading) * settings.speed * step_time();
    chaser.position = clamp(moved, vec2(0.0), vec2<f32>(f32(WIDTH), f32(HEIGHT)) - 1.0);

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

fn step_time() -> f32 {
    return min(delta_time, MAX_STEP);
}

/// Where a point on the canvas is kept in the trail.
fn index(point: vec2<f32>) -> u32 {
    return u32(point.y) * WIDTH + u32(point.x);
}

/// The average trail around a point ahead of a chaser, at an angle to its heading. Anywhere off the
/// canvas counts heavily against a direction, which is what turns chasers back from the edges.
fn sense(chaser: Chaser, angle: f32) -> f32 {
    let centre = chaser.position + direction(chaser.heading + angle) * settings.sensor_distance;
    let size = settings.sensor_size;

    var total = 0.0;
    for (var dx = -size; dx <= size; dx++) {
        for (var dy = -size; dy <= size; dy++) {
            let point = centre + vec2<f32>(f32(dx), f32(dy));
            if (point.x < 0.0 || point.y < 0.0 || point.x >= f32(WIDTH) || point.y >= f32(HEIGHT)) {
                total -= 10.0;
            } else {
                total += trail[index(point)];
            }
        }
    }

    let width = f32(2 * size + 1);
    return total / (width * width);
}

/// A random number between 0 and 1, different for every chaser and every frame. Where a chaser is
/// changes every frame it moves, so it seeds a new number each time without a counter to keep. The
/// time since the last frame would not: frames keep to the display's refresh, so it barely changes.
fn random_unit(id: u32, position: vec2<f32>) -> f32 {
    let seed = hash(id) ^ hash(bitcast<u32>(position.x)) ^ hash(hash(bitcast<u32>(position.y)));
    return f32(hash(seed)) / 4294967296.0;
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
