import { StoreApi } from "zustand";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { parseWGSL } from "../utilities/parseWGSL";
import { getAppActions } from "./actions";
import { AppState } from "./types";

// parseWGSL hangs the reflection off `window` for poking at in the console, and these tests run in
// node. Nothing here reads it back.
beforeAll(() => vi.stubGlobal("window", {}));

const RENDER_SHADER = `
@vertex
fn vertex_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
    return vec4<f32>(f32(index), 0.0, 0.0, 1.0);
}

@fragment
fn fragment_main() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 1.0, 1.0, 1.0);
}
`;

// The plain function comes first, so it is what the new parse selects.
const FUNCTION_SHADER = `
@group(0) @binding(0) var<storage, read_write> output: array<f32>; // 3 * 0

fn scaled_sum(a: f32, b: f32) -> f32 {
    return (a + b) * 2.0;
}

@compute @workgroup_size(1, 1, 1)
fn run() {
    output[0] = scaled_sum(1.0, 2.0);
}
`;

/** A store with no GPU behind it, so the actions run but nothing is dispatched. */
const storeShowing = (wgsl: string) => {
    const parsed = parseWGSL(wgsl);
    if (parsed.type === "failed-parse") throw new Error(parsed.error);

    let state: AppState = {
        ...parsed,
        type: "running",
        device: null,
        canvas: {} as HTMLCanvasElement,
        wgsl,
    };

    const set = ((update: Partial<AppState>, replace?: boolean) => {
        state = (replace ? update : { ...state, ...update }) as AppState;
    }) as StoreApi<AppState>["setState"];

    return { actions: getAppActions(set, () => state), getState: () => state };
};

describe("setWGSL", () => {
    it("selects a function after an edit from a shader that had none", () => {
        const store = storeShowing(RENDER_SHADER);
        expect(store.getState().selected?.type).toBe("render");

        store.actions.setWGSL(FUNCTION_SHADER);

        const selected = store.getState().selected;
        expect(selected?.type).toBe("function");
        expect(selected?.type === "function" && selected.arguments.map((a) => a.name)).toEqual(["a", "b"]);
    });

    it("keeps argument values across an edit that leaves the function alone", () => {
        const store = storeShowing(FUNCTION_SHADER);
        const selected = store.getState().selected;
        if (selected?.type !== "function") throw new Error("expected a function to be selected");

        store.actions.setRunnableInput("a", "7.0", new ArrayBuffer(4));
        store.actions.setWGSL(FUNCTION_SHADER + "\n// an edit elsewhere\n");

        const after = store.getState().selected;
        expect(after?.type === "function" && after.arguments.find((a) => a.name === "a")?.input).toBe("7.0");
    });

    it("does not carry a compute selection's counts onto an unrelated shader", () => {
        const store = storeShowing(FUNCTION_SHADER);
        store.actions.setWGSL(RENDER_SHADER);

        expect(store.getState().selected?.type).toBe("render");
    });
});
