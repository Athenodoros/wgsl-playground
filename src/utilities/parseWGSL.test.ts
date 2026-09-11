import { describe, expect, it } from "vitest";
import interferencePattern from "../examples/interference_pattern.wgsl";
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

describe("the interference pattern example", () => {
    it("parses into a uniform buffer and a storage texture", () => {
        const { bindings } = parse(EXAMPLE);

        expect(bindings.map((binding) => [binding.name, binding.kind])).toEqual([
            ["scene", "buffer"],
            ["field", "texture"],
        ]);
    });

    it("takes the texture's size from its directive comment", () => {
        const field = texture(parse(EXAMPLE).bindings, "field");

        expect([field.width, field.height]).toEqual([640, 360]);
        expect(field.format).toBe("rgba8unorm");
        expect(field.warning).toBeNull();
    });

    it("dispatches one work group per texel", () => {
        const { selected } = parse(EXAMPLE);

        expect(selected?.type).toBe("compute");
        expect(selected?.type === "compute" && selected.threads).toEqual([640, 360, 1]);
    });

    it("fills the sources from the directive, rather than leaving them all at one", () => {
        const scene = parse(EXAMPLE).bindings.find((binding) => binding.name === "scene");

        expect(scene?.kind === "buffer" && scene.input).toContain("150.0, 110.0, 0.12, 1.0");
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
