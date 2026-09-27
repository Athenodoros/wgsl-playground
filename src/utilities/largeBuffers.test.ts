import { beforeAll, describe, expect, it, vi } from "vitest";
import { canRenderBuffer, describeBufferLength, getBufferLength, isLargeBuffer } from "./largeBuffers";
import { parseWGSL } from "./parseWGSL";
import { WgslBufferBinding } from "./types";

// parseWGSL hangs the reflection off `window` for poking at in the console, and these tests run in node.
beforeAll(() => vi.stubGlobal("window", {}));

const binding = (declaration: string, structs = ""): WgslBufferBinding => {
    const parsed = parseWGSL(`${structs}
@group(0) @binding(0) ${declaration}

@compute @workgroup_size(1)
fn main() {}
`);
    if (parsed.type === "failed-parse") throw new Error(parsed.error);

    const found = parsed.bindings[0];
    if (found?.kind !== "buffer") throw new Error("expected a buffer binding");
    return found;
};

const CHASER = "struct Chaser { position: vec2<f32>, heading: f32 }";

describe("buffer lengths", () => {
    it("counts a single value as one row", () => {
        expect(getBufferLength(binding("var<uniform> scale: f32;"))).toEqual({ rows: 1, elements: null });
        expect(getBufferLength(binding("var<uniform> m: mat4x4<f32>;"))).toEqual({ rows: 1, elements: null });
    });

    it("counts a struct by its members", () => {
        expect(getBufferLength(binding("var<uniform> chaser: Chaser;", CHASER))).toEqual({ rows: 2, elements: null });
    });

    it("counts an array by its elements, however it is written out", () => {
        expect(getBufferLength(binding("var<storage, read> xs: array<f32, 64>;"))).toEqual({ rows: 64, elements: 64 });
        expect(getBufferLength(binding("var<storage, read> xs: array<Chaser, 10>;", CHASER))).toEqual({
            rows: 20,
            elements: 10,
        });
    });

    it("takes a runtime-sized array's length from its buffer", () => {
        expect(getBufferLength(binding("var<storage, read> xs: array<Chaser>; // 30 * ((1, 2), 3)", CHASER))).toEqual({
            rows: 60,
            elements: 30,
        });
    });

    it("counts the arrays inside a struct, which would otherwise hide on one line", () => {
        const structs = "struct Field { size: vec2<u32>, values: array<f32, 1000> }";
        expect(getBufferLength(binding("var<storage, read> field: Field;", structs))).toEqual({
            rows: 1001,
            elements: null,
        });
    });
});

describe("large buffers", () => {
    it("shows twenty rows as text, and summarises anything longer", () => {
        expect(isLargeBuffer(binding("var<storage, read> xs: array<f32, 20>;"))).toBe(false);
        expect(isLargeBuffer(binding("var<storage, read> xs: array<f32, 21>;"))).toBe(true);
    });

    it("summarises a buffer too big to be short text before writing any of it out", () => {
        // A runtime-sized array inside a struct has no rows to count, so only its size gives it away.
        const bigBlob = { ...binding("var<storage, read> xs: array<f32, 4>;"), buffer: new ArrayBuffer(4 * 5001) };
        expect(getBufferLength(bigBlob).rows).toBe(4);
        expect(isLargeBuffer(bigBlob)).toBe(true);
    });

    it("summarises a few rows whose text is too long to read", () => {
        const transforms = binding("var<storage, read> xs: array<mat4x4<f32>, 20>;");
        expect(isLargeBuffer(transforms)).toBe(false);

        const oneLine = `[ ${Array(320).fill("0.18923820555210114").join(", ")} ]`;
        expect(isLargeBuffer(transforms, oneLine)).toBe(true);
        expect(isLargeBuffer(transforms, oneLine.replace(/, /g, ",\n"))).toBe(false);
        expect(isLargeBuffer(transforms, "0,\n".repeat(3400))).toBe(true);
    });

    it("can still render up to two hundred rows on request", () => {
        expect(canRenderBuffer(binding("var<storage, read> xs: array<f32, 200>;"))).toBe(true);
        expect(canRenderBuffer(binding("var<storage, read> xs: array<Chaser, 101>;", CHASER))).toBe(false);
    });

    it("describes an array by its elements, and anything else by its rows", () => {
        expect(describeBufferLength(binding("var<storage, read> xs: array<f32, 20000>;"))).toBe("20,000 elements");
        expect(describeBufferLength(binding("var<storage, read> xs: array<f32>; // 1 * 0"))).toBe("1 element");
        expect(
            describeBufferLength(
                binding("var<storage, read> field: Field;", "struct Field { values: array<f32, 64> }"),
            ),
        ).toBe("64 rows");
    });
});
