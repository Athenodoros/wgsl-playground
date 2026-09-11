import { WgslReflect } from "wgsl_reflect";
import { describe, expect, it } from "vitest";
import { matchDirective } from "./matching";
import { getTypeShape } from "./typeShape";

/** Builds the shape of a binding declared in `wgsl`, so tests describe types as WGSL rather than trees. */
const shapeOf = (declaration: string, structs = "") => {
    const reflect = new WgslReflect(`${structs}
${declaration}
@compute @workgroup_size(1,1,1)
fn main() { _ = binding; }`);
    const binding = reflect.getBindGroups()[0][0];
    const shape = getTypeShape(binding.type, reflect.structs);
    if (shape === null) throw new Error("could not build shape");
    return shape;
};

const match = (comment: string, declaration: string, structs = "") => {
    const result = matchDirective(comment, shapeOf(declaration, structs));
    return result.type === "error" ? `ERROR: ${result.error}` : result.values;
};
const lengthOf = (comment: string, declaration: string, structs = "") => {
    const result = matchDirective(comment, shapeOf(declaration, structs));
    return result.type === "error" ? `ERROR: ${result.error}` : result.runtimeLength;
};

const SCALAR = "@group(0) @binding(0) var<storage, read> binding: i32;";
const RUNTIME_ARRAY = "@group(0) @binding(0) var<storage, read> binding: array<i32>;";
const VEC3 = "@group(0) @binding(0) var<uniform> binding: vec3<f32>;";
const ARRAY_OF_VEC3 = "@group(0) @binding(0) var<storage, read> binding: array<vec3<f32>>;";
const SIZED_ARRAY = "@group(0) @binding(0) var<uniform> binding: array<vec2<f32>, 4>;";

const SOURCE_STRUCT = "struct Source { position: vec2<f32>, frequency: f32, amplitude: f32 }";
const SOURCE_ARRAY = "@group(0) @binding(0) var<uniform> binding: array<Source, 4>;";
const MIXED_STRUCT = "struct Mixed { a: f32, b: vec3<f32>, c: f32 }";
const MIXED = "@group(0) @binding(0) var<uniform> binding: Mixed;";

describe("a single value fills whatever is beneath it", () => {
    it("fills a scalar", () => expect(match("0", SCALAR)).toEqual([0]));
    it("fills a vector", () => expect(match("7", VEC3)).toEqual([7, 7, 7]));
    it("fills a struct", () => expect(match("1", MIXED, MIXED_STRUCT)).toEqual([1, 1, 1, 1, 1]));
    it("fills a sized array", () => expect(match("2", SIZED_ARRAY)).toEqual([2, 2, 2, 2, 2, 2, 2, 2]));

    it("gives a runtime-sized array one element, since it says nothing about length", () => {
        expect(match("0", RUNTIME_ARRAY)).toEqual([0]);
        expect(lengthOf("0", RUNTIME_ARRAY)).toBe(1);
    });
});

describe("a list matches the components of the type", () => {
    it("fills a vector", () => expect(match("1, 2, 3", VEC3)).toEqual([1, 2, 3]));

    it("sets the length of a runtime-sized array", () => {
        expect(match("1, 2, 3", RUNTIME_ARRAY)).toEqual([1, 2, 3]);
        expect(lengthOf("1, 2, 3", RUNTIME_ARRAY)).toBe(3);
        expect(lengthOf("1, 2, 3, 4, 5, 6", RUNTIME_ARRAY)).toBe(6);
    });

    it("rejects a list that does not match a fixed-size type", () => {
        expect(match("1, 2", VEC3)).toMatch(/has 3 components, but the directive gives 2/);
        expect(match("1, 2, 3, 4", VEC3)).toMatch(/has 3 components, but the directive gives 4/);
        expect(match("1, 2", SCALAR)).toMatch(/is a single value, but the directive gives 2/);
        expect(match("1, 2, 3", SIZED_ARRAY)).toMatch(/has 4 elements, but the directive gives 3/);
    });
});

describe("nesting must be written with parentheses", () => {
    it("fills an array of vectors", () => {
        expect(match("(1, 2, 3), (4, 5, 6)", ARRAY_OF_VEC3)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(lengthOf("(1, 2, 3), (4, 5, 6)", ARRAY_OF_VEC3)).toBe(2);
    });

    it("fills a struct with a nested vector", () => {
        expect(match("1, (2, 3, 4), 5", MIXED, MIXED_STRUCT)).toEqual([1, 2, 3, 4, 5]);
    });

    it("never reads a flat list as nested - six values is six elements, each broadcast", () => {
        expect(match("1, 2, 3, 4, 5, 6", ARRAY_OF_VEC3)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6]);
        expect(lengthOf("1, 2, 3, 4, 5, 6", ARRAY_OF_VEC3)).toBe(6);
    });

    it("rejects a flat list where the nesting is not optional", () => {
        expect(match("1, 2, 3, 4, 5", MIXED, MIXED_STRUCT)).toMatch(/has 3 components, but the directive gives 5/);
        expect(match("1, 2, 3, 4, 5, 6", "@group(0) @binding(0) var<uniform> binding: array<vec3<f32>, 2>;")).toMatch(
            /has 2 elements, but the directive gives 6/
        );
    });

    it("still allows a single value to fill a nested slot", () => {
        expect(match("1, 0, 5", MIXED, MIXED_STRUCT)).toEqual([1, 0, 0, 0, 5]);
    });
});

describe("repetition", () => {
    it("describes an array, and is not shorthand for repeating inside a list", () => {
        expect(match("1, 3 * 2, 4", RUNTIME_ARRAY)).toMatch(/i32 is not an array, so `3 \* \.\.\.` cannot fill it/);
    });

    it("sets the length of a runtime-sized array", () => {
        expect(match("4 * 0", RUNTIME_ARRAY)).toEqual([0, 0, 0, 0]);
        expect(lengthOf("4 * 0", RUNTIME_ARRAY)).toBe(4);
    });

    it("repeats a group over an array of structs, with the struct's own nesting spelled out", () => {
        expect(match("4 * ((150, 110), 0.12, 1)", SOURCE_ARRAY, SOURCE_STRUCT)).toEqual([
            150, 110, 0.12, 1, 150, 110, 0.12, 1, 150, 110, 0.12, 1, 150, 110, 0.12, 1,
        ]);
    });

    it("rejects a struct's members flattened into one list", () => {
        expect(match("4 * (150, 110, 0.12, 1)", SOURCE_ARRAY, SOURCE_STRUCT)).toMatch(
            /Source has 3 components, but the directive gives 4/
        );
    });

    it("is rejected on anything that is not an array", () => {
        expect(match("3 * 2", VEC3)).toMatch(/is not an array/);
        expect(match("2 * 1", SCALAR)).toMatch(/is not an array/);
        expect(match("1, 3 * 2, 4", MIXED, MIXED_STRUCT)).toMatch(/is not an array/);
    });

    it("fills an array of arrays, where the nesting really is arrays", () => {
        expect(match("2 * (3 * 1)", "@group(0) @binding(0) var<uniform> binding: array<array<i32, 3>, 2>;")).toEqual([
            1, 1, 1, 1, 1, 1,
        ]);
    });

    it("must match a declared length exactly", () => {
        expect(match("5 * (1, 2)", SIZED_ARRAY)).toMatch(/has 4 elements, but the directive gives 5/);
        expect(match("4 * (1, 2)", SIZED_ARRAY)).toEqual([1, 2, 1, 2, 1, 2, 1, 2]);
    });
});

describe("a list on an array is one entry per element", () => {
    it("gives one element per value for an array of scalars", () => {
        expect(match("1, 2, 3", RUNTIME_ARRAY)).toEqual([1, 2, 3]);
        expect(lengthOf("1, 2, 3", RUNTIME_ARRAY)).toBe(3);
    });

    it("gives one element per value for an array of vectors, each broadcast", () => {
        expect(match("1, 2, 3", ARRAY_OF_VEC3)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3]);
        expect(lengthOf("1, 2, 3", ARRAY_OF_VEC3)).toBe(3);

        const vec2s = "@group(0) @binding(0) var<storage, read> binding: array<vec2<i32>>;";
        expect(match("1, 2, 3", vec2s)).toEqual([1, 1, 2, 2, 3, 3]);
        expect(lengthOf("1, 2, 3", vec2s)).toBe(3);
    });

    it("needs parentheses to mean a single element instead", () => {
        expect(match("(1, 2, 3)", ARRAY_OF_VEC3)).toEqual([1, 2, 3]);
        expect(lengthOf("(1, 2, 3)", ARRAY_OF_VEC3)).toBe(1);
    });
});

describe("comments that carry no numbers are not directives at all", () => {
    it("is left to the caller, which passes them over rather than reporting them", () => {
        // getDirectiveSource filters these out; matchDirective never sees them.
        expect(match("the output buffer", RUNTIME_ARRAY)).toMatch(/^ERROR/);
    });
});

describe("rand", () => {
    it("is a single value, so it broadcasts", () => {
        const values = match("rand(5, 5)", VEC3);
        expect(values).toEqual([5, 5, 5]);
    });

    it("draws a separate value for every slot it fills", () => {
        const values = match("5 * rand(0, 1)", RUNTIME_ARRAY) as number[];
        expect(values).toHaveLength(5);
        expect(new Set(values).size).toBe(5);
    });

    it("draws separately when broadcast over a compound element", () => {
        const values = match("2 * rand(0, 1)", ARRAY_OF_VEC3) as number[];
        expect(values).toHaveLength(6);
        expect(new Set(values).size).toBe(6);
    });

    it("mixes with literals, keeping the literals exact", () => {
        const values = match("rand(100, 200), 0, 0", RUNTIME_ARRAY) as number[];
        expect(values.slice(1)).toEqual([0, 0]);
        expect(values[0]).toBeGreaterThanOrEqual(100);
    });
});

describe("comments that are not directives", () => {
    it("reports rather than silently filling with ones", () => {
        expect(match("the output buffer", RUNTIME_ARRAY)).toMatch(/^ERROR/);
        expect(match("rand(1)", RUNTIME_ARRAY)).toMatch(/^ERROR/);
        expect(match("(1, 2", VEC3)).toMatch(/^ERROR/);
    });
});
