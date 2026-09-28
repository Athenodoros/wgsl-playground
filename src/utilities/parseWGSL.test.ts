import { describe, expect, it } from "vitest";
import interferencePattern from "../examples/interference_pattern.wgsl";
import chasers from "../examples/chasers.wgsl";
import { OUTPUT_CANVAS_HEIGHT, OUTPUT_CANVAS_WIDTH } from "./canvas";
import { parseWGSL } from "./parseWGSL";
import { WgslBinding } from "./types";

// Example files use `///` throughout, because the Vite GLSL plugin strips `//`, and the app puts
// them back on load. Tests read them the same way, so they see what the playground sees.
const EXAMPLE = interferencePattern.replace(/\/\/\//g, "//");

const parse = (wgsl: string) => {
    const result = parseWGSL(wgsl);
    if (result.type === "failed-parse") throw new Error(`Failed to parse: ${result.error}`);
    return result;
};

const parseError = (wgsl: string) => {
    const result = parseWGSL(wgsl);
    return result.type === "failed-parse" ? result.error : null;
};

const texture = (bindings: WgslBinding[], name: string) => {
    const binding = bindings.find((b) => b.name === name);
    if (binding?.kind !== "texture") throw new Error(`${name} is not a texture binding`);
    return binding;
};

const shaderWithTexture = (declaration: string) => `
${declaration}

@compute @workgroup_size(1, 1, 1)
fn paint(@builtin(global_invocation_id) id: vec3<u32>) {
    textureStore(field, id.xy, vec4<f32>(1.0, 1.0, 1.0, 1.0));
}
`;

describe("what a shader runs before anything is picked", () => {
    // Written first in each shader below, so picking it would be picking whatever came first.
    const HELPER = `
fn doubled(a: f32) -> f32 { return a * 2.0; }
`;
    const COMPUTE = `
@compute @workgroup_size(1, 1, 1)
fn accumulate() { }
`;
    const RENDER = `
@vertex
fn vertex_main() -> @builtin(position) vec4<f32> { return vec4<f32>(0.0); }

@fragment
fn fragment_main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }
`;

    it("prefers a render pass, then a compute pass, then a plain function", () => {
        expect(parse(HELPER + COMPUTE + RENDER).target.type).toBe("render");
        expect(parse(HELPER + COMPUTE).target.type).toBe("compute");
        expect(parse(HELPER).target.type).toBe("function");
    });

    const TWO_PASSES = `
@compute @workgroup_size(1, 1, 1)
fn first() { }

@compute @workgroup_size(1, 1, 1)
fn second() { }
`;

    it("runs the chain a shader declares, in the order it declares it", () => {
        const { target } = parse(`// playground-compute-run-order: second, first\n${TWO_PASSES}`);

        expect(target.type === "compute" && target.passes.map((pass) => pass.name)).toEqual(["second", "first"]);
    });

    it("passes over a run order naming something that is not there, rather than running part of it", () => {
        const { target } = parse(`// playground-compute-run-order: second, typo\n${TWO_PASSES}`);

        expect(target.type === "compute" && target.passes.map((pass) => pass.name)).toEqual(["first"]);
    });
});

describe("the interference pattern example", () => {
    it("parses into a uniform buffer, a storage buffer and a storage texture", () => {
        const { bindings } = parse(EXAMPLE);

        expect(bindings.map((binding) => [binding.name, binding.kind])).toEqual([
            ["scene", "buffer"],
            ["peak", "buffer"],
            ["field", "texture"],
        ]);
    });

    it("measures before it draws, since the drawing divides by what the measuring finds", () => {
        const { target } = parse(EXAMPLE);

        expect(target.type === "compute" && target.passes.map((pass) => pass.name)).toEqual(["measure", "draw"]);
    });

    it("says nothing about the texture's size, and so gets the canvas'", () => {
        const field = texture(parse(EXAMPLE).bindings, "field");

        expect([field.width, field.height]).toEqual([OUTPUT_CANVAS_WIDTH, OUTPUT_CANVAS_HEIGHT]);
        expect(field.format).toBe("rgba8unorm");
        expect(field.directive).toBeNull();
        expect(field.warning).toBeNull();
    });

    it("dispatches 8x8 work groups that cover the texture exactly", () => {
        const { target } = parse(EXAMPLE);
        const draw = target.type === "compute" ? target.passes.find((pass) => pass.name === "draw") : undefined;
        const [x, y] = draw?.threads ?? [0, 0];

        expect(draw?.threads).toEqual([80, 45, 1]);
        expect([x * 8, y * 8]).toEqual([OUTPUT_CANVAS_WIDTH, OUTPUT_CANVAS_HEIGHT]);
    });

    it("gives each of the four sources its own random values, rather than one set for all", () => {
        const scene = parse(EXAMPLE).bindings.find((binding) => binding.name === "scene");
        if (scene?.kind !== "buffer") throw new Error("scene is not a buffer binding");

        const values = scene.type.getValuesFromString(scene.input) ?? [];
        expect(values).toHaveLength(16);
        expect(new Set(values).size).toBe(16);

        // Positions land on the canvas, frequencies stay resolvable, amplitudes sit around one.
        const sources = [0, 4, 8, 12].map((at) => values.slice(at, at + 4) as number[]);
        for (const [x, y, frequency, amplitude] of sources) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(OUTPUT_CANVAS_WIDTH);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(OUTPUT_CANVAS_HEIGHT);
            expect(frequency).toBeGreaterThanOrEqual(0);
            expect(frequency).toBeLessThanOrEqual(1);
            expect(amplitude).toBeGreaterThanOrEqual(0.5);
            expect(amplitude).toBeLessThanOrEqual(1.5);
        }
    });
});

describe("the time uniform", () => {
    const shaderWith = (declaration: string) => `
${declaration}

@compute @workgroup_size(1, 1, 1)
fn step() { }
`;

    const binding = (bindings: WgslBinding[]) => {
        const found = bindings[0];
        if (found?.kind !== "buffer") throw new Error("expected a buffer binding");
        return found;
    };

    it("is an f32 uniform marked with the comment, starting at zero, and makes the shader loop", () => {
        const parsed = parse(shaderWith("@group(0) @binding(0) var<uniform> delta_time: f32; // playground-time"));
        const time = binding(parsed.bindings);

        expect(time.time).toBe(true);
        expect(time.input).toBe("0.0");
        expect(new Float32Array(time.buffer)).toEqual(new Float32Array([0]));
        expect(time.warning).toBeNull();
        expect(parsed.loop).toBe(true);
    });

    it("leaves a shader without one to run once", () => {
        const parsed = parse(shaderWith("@group(0) @binding(0) var<uniform> scale: f32; // 2"));

        expect(binding(parsed.bindings).time).toBe(false);
        expect(parsed.loop).toBe(false);
    });

    it.each([
        ["a storage buffer", "@group(0) @binding(0) var<storage, read_write> delta_time: f32; // playground-time"],
        ["a uniform of another type", "@group(0) @binding(0) var<uniform> delta_time: vec2<f32>; // playground-time"],
    ])("warns about the comment on %s, and fills it as usual", (_, declaration) => {
        const parsed = parse(shaderWith(declaration));
        const marked = binding(parsed.bindings);

        expect(marked.time).toBe(false);
        expect(marked.warning).toMatch(/only fills a `var<uniform>` of type `f32`/);
        expect(marked.type.getValuesFromString(marked.input)).not.toContain(0);
        expect(parsed.loop).toBe(false);
    });

    it("warns about the comment on a storage texture", () => {
        const field = texture(
            parse(
                shaderWithTexture(
                    "@group(0) @binding(0) var field: texture_storage_2d<rgba8unorm, write>; // playground-time",
                ),
            ).bindings,
            "field",
        );

        expect(field.warning).toMatch(/only fills a `var<uniform>` of type `f32`/);
    });
});

describe("the chasers example", () => {
    const CHASERS = chasers.replace(/\/\/\//g, "//");

    it("loops through its three passes, in order", () => {
        const { target, loop } = parse(CHASERS);

        expect(loop).toBe(true);
        expect(target.type === "compute" && target.passes.map((pass) => pass.name)).toEqual(["fade", "steer", "draw"]);
    });

    it("reads every binding's directive without a warning", () => {
        const { bindings } = parse(CHASERS);

        expect(bindings.map((b) => [b.name, b.warning])).toEqual([
            ["delta_time", null],
            ["chasers", null],
            ["trail", null],
            ["canvas", null],
            ["settings", null],
        ]);
    });

    it("sizes its dispatches and canvas from its consts, covering every chaser and pixel", () => {
        const { target, bindings } = parse(CHASERS);
        const passes = target.type === "compute" ? target.passes : [];
        const threads = (name: string) => passes.find((pass) => pass.name === name)?.threads;

        expect(threads("steer")).toEqual([782, 1, 1]);
        expect(782 * 64).toBeGreaterThanOrEqual(50000);
        expect(threads("fade")).toEqual([80, 45, 1]);
        expect(threads("draw")).toEqual([80, 45, 1]);

        const canvas = texture(bindings, "canvas");
        expect([canvas.width, canvas.height]).toEqual([OUTPUT_CANVAS_WIDTH, OUTPUT_CANVAS_HEIGHT]);
    });

    it("gathers the chasers around the middle of the canvas, heading every which way", () => {
        const binding = parse(CHASERS).bindings.find((b) => b.name === "chasers");
        if (binding?.kind !== "buffer") throw new Error("chasers is not a buffer binding");

        const values = new Float32Array(binding.buffer);
        expect(values).toHaveLength(50000 * 4);

        const column = (offset: number) => values.filter((_, index) => index % 4 === offset);
        const spread = (samples: Float32Array) => {
            const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
            const deviation = Math.sqrt(samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length);
            return { mean, deviation };
        };

        // Normally distributed around the centre, a twelfth of the canvas' height either way.
        for (const [samples, centre] of [
            [column(0), OUTPUT_CANVAS_WIDTH / 2],
            [column(1), OUTPUT_CANVAS_HEIGHT / 2],
        ] as const) {
            const { mean, deviation } = spread(samples);
            expect(Math.abs(mean - centre)).toBeLessThan(1);
            expect(Math.abs(deviation - OUTPUT_CANVAS_HEIGHT / 12)).toBeLessThan(1);
        }

        expect(column(2).every((heading) => heading >= 0 && heading <= 6.2832)).toBe(true);
    });
});

describe("storage texture bindings", () => {
    const declaration = "@group(0) @binding(0) var field: texture_storage_2d<rgba8unorm, write>;";

    it("falls back to the output canvas' size when the directive says nothing", () => {
        const field = texture(parse(shaderWithTexture(declaration)).bindings, "field");

        expect([field.width, field.height]).toEqual([OUTPUT_CANVAS_WIDTH, OUTPUT_CANVAS_HEIGHT]);
    });

    it("fills in a height the directive leaves off, as a work group count does", () => {
        const field = texture(parse(shaderWithTexture(`${declaration} // 128`)).bindings, "field");

        expect([field.width, field.height]).toEqual([128, OUTPUT_CANVAS_HEIGHT]);
    });

    it("keeps the fallback size and warns when the directive is not a size", () => {
        const field = texture(parse(shaderWithTexture(`${declaration} // 16, rand(1, 4)`)).bindings, "field");

        expect([field.width, field.height]).toEqual([OUTPUT_CANVAS_WIDTH, OUTPUT_CANVAS_HEIGHT]);
        expect(field.warning).toMatch(/is not a valid size: a size has to be fixed/);
    });

    it("passes over a comment that was never a directive", () => {
        const field = texture(parse(shaderWithTexture(`${declaration} // the field of view`)).bindings, "field");

        expect([field.width, field.height]).toEqual([OUTPUT_CANVAS_WIDTH, OUTPUT_CANVAS_HEIGHT]);
        expect(field.warning).toBeNull();
    });

    it("refuses a format it could not display", () => {
        const wgsl = shaderWithTexture("@group(0) @binding(0) var field: texture_storage_2d<rgba8uint, write>;");

        expect(parseError(wgsl)).toMatch(/rgba8uint is not a storage texture format/);
    });

    it("refuses an access mode that needs an optional feature", () => {
        const wgsl = shaderWithTexture("@group(0) @binding(0) var field: texture_storage_2d<rgba8unorm, read_write>;");

        expect(parseError(wgsl)).toMatch(/read_write storage textures are not supported/);
    });

    it("still refuses the texture types it has nowhere to put", () => {
        const wgsl = `
@group(0) @binding(0) var field: texture_2d<f32>;

@compute @workgroup_size(1, 1, 1)
fn paint() {}
`;

        expect(parseError(wgsl)).toMatch(/texture_2d not supported/);
    });
});

describe("values carried over from before an edit", () => {
    const shader = (declaration: string, structs = "struct Point { x: f32, y: f32 }") => `
${structs}
@group(0) @binding(0) ${declaration}

@compute @workgroup_size(1)
fn step() {}
`;

    /** The bindings a first parse gives, with the first one's value set by hand. */
    const edited = (wgsl: string) => {
        const [binding, ...rest] = parse(wgsl).bindings;
        if (binding.kind !== "buffer") throw new Error("expected a buffer binding");
        return [{ ...binding, input: "hand-set", buffer: new ArrayBuffer(binding.buffer.byteLength) }, ...rest];
    };

    const input = (wgsl: string, previous: WgslBinding[]) => {
        const binding = parseWGSL(wgsl, previous);
        if (binding.type === "failed-parse") throw new Error(binding.error);
        const first = binding.bindings[0];
        return first.kind === "buffer" ? first.input : null;
    };

    it("keeps what was set by hand across an edit elsewhere", () => {
        const wgsl = shader("var<storage, read> points: array<Point, 4>; // rand(0, 1)");
        const previous = edited(wgsl);

        expect(input(wgsl + "\n// an edit elsewhere\n", previous)).toBe("hand-set");
    });

    it("keeps a value found by name, when the binding has moved", () => {
        const previous = edited(shader("var<storage, read> points: array<Point, 4>; // 0"));
        const moved = shader("var<storage, read> points: array<Point, 4>; // 0").replace("@binding(0)", "@binding(3)");

        expect(input(moved, previous)).toBe("hand-set");
    });

    it("starts again from an edited directive", () => {
        const previous = edited(shader("var<storage, read> points: array<Point, 4>; // 0"));

        expect(input(shader("var<storage, read> points: array<Point, 4>; // 1"), previous)).not.toBe("hand-set");
    });

    it("starts again when the shape changes, down to a struct's members", () => {
        const previous = edited(shader("var<storage, read> points: array<Point, 4>; // 0"));

        expect(input(shader("var<storage, read> points: array<Point, 5>; // 0"), previous)).not.toBe("hand-set");
        expect(
            input(
                shader("var<storage, read> points: array<Point, 4>; // 0", "struct Point { x: f32, y: u32 }"),
                previous,
            ),
        ).not.toBe("hand-set");
    });
});
