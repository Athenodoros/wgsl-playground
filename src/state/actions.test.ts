import { StoreApi } from "zustand";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { parseWGSL } from "../utilities/parseWGSL";
import { getAppActions } from "./actions";
import { RunnerResults, STOPPED_CLOCK } from "../utilities/types";
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

// Nothing in it but a plain function, so a function is what a new parse picks.
const FUNCTION_SHADER = `
fn scaled_sum(a: f32, b: f32) -> f32 {
    return (a + b) * 2.0;
}
`;

/** A store with no GPU behind it, so the actions run but nothing is dispatched. */
const storeShowing = (wgsl: string, results?: RunnerResults) => {
    const parsed = parseWGSL(wgsl);
    if (parsed.type === "failed-parse") throw new Error(parsed.error);

    const common = {
        ...parsed,
        device: null,
        canvas: {} as HTMLCanvasElement,
        wgsl,
        playing: true,
        clock: STOPPED_CLOCK,
    };
    let state: AppState = results ? { ...common, type: "finished", results } : { ...common, type: "running" };

    const set = ((update: Partial<AppState>, replace?: boolean) => {
        state = (replace ? update : { ...state, ...update }) as AppState;
    }) as StoreApi<AppState>["setState"];

    return { actions: getAppActions(set, () => state), getState: () => state };
};

/** A run that finished with nothing to show, which is all these tests need of one. */
const DREW_SOMETHING: RunnerResults = { type: "outputs", bindings: [], returned: null };

describe("setWGSL", () => {
    it("selects a function after an edit from a shader that had none", () => {
        const store = storeShowing(RENDER_SHADER);
        expect(store.getState().target.type).toBe("render");

        store.actions.setWGSL(FUNCTION_SHADER);

        const target = store.getState().target;
        expect(target.type).toBe("function");
        expect(target.type === "function" && target.runnable.arguments.map((a) => a.name)).toEqual(["a", "b"]);
    });

    it("keeps argument values across an edit that leaves the function alone", () => {
        const store = storeShowing(FUNCTION_SHADER);
        if (store.getState().target.type !== "function") throw new Error("expected a function to be selected");

        store.actions.setRunnableInput("a", "7.0", new ArrayBuffer(4));
        store.actions.setWGSL(FUNCTION_SHADER + "\n// an edit elsewhere\n");

        const after = store.getState().target;
        expect(after.type === "function" && after.runnable.arguments.find((a) => a.name === "a")?.input).toBe("7.0");
    });

    // Clearing the target is allowed, and used to last only until the next keystroke: an edit found
    // nothing to carry over and fell back to the default, which looks identical to the target having
    // been emptied out by the edit itself.
    it("leaves a target cleared by hand cleared across an edit elsewhere", () => {
        const store = storeShowing(RENDER_SHADER);
        store.actions.setRunTarget({ type: "none" });

        store.actions.setWGSL(RENDER_SHADER + "\n// an edit elsewhere\n");

        expect(store.getState().target.type).toBe("none");
    });

    it("does not carry a compute selection's counts onto an unrelated shader", () => {
        const store = storeShowing(FUNCTION_SHADER);
        store.actions.setWGSL(RENDER_SHADER);

        expect(store.getState().target.type).toBe("render");
    });
});

describe("looping", () => {
    const STEPPED_SHADER = `
@group(0) @binding(0) var<storage, read_write> position: f32;

@compute @workgroup_size(1, 1, 1)
fn step() { position += 1.0; }
`;
    const TIME_UNIFORM = "@group(0) @binding(1) var<uniform> delta_time: f32; // playground-time\n";
    const TIMED_SHADER = TIME_UNIFORM + STEPPED_SHADER.replace("1.0", "delta_time");

    it("keeps the loop turned off by hand across an edit elsewhere", () => {
        const store = storeShowing(TIMED_SHADER);
        expect(store.getState().loop).toBe(true);

        store.actions.setLoop(false);
        store.actions.setWGSL(TIMED_SHADER + "\n// an edit elsewhere\n");

        expect(store.getState().loop).toBe(false);
    });

    it("keeps the loop turned on by hand across an edit elsewhere", () => {
        const store = storeShowing(STEPPED_SHADER);
        expect(store.getState().loop).toBe(false);

        store.actions.setLoop(true);
        store.actions.setWGSL(STEPPED_SHADER + "\n// an edit elsewhere\n");

        expect(store.getState().loop).toBe(true);
    });

    it("goes back to looping when an edit adds a time uniform, and stops when one takes it away", () => {
        const store = storeShowing(STEPPED_SHADER);

        store.actions.setWGSL(TIMED_SHADER);
        expect(store.getState().loop).toBe(true);

        store.actions.setWGSL(STEPPED_SHADER);
        expect(store.getState().loop).toBe(false);
    });

    it("opens an example on its own default, playing", () => {
        const store = storeShowing(STEPPED_SHADER);
        store.actions.setLoop(true);
        store.actions.pause();

        store.actions.loadExample(STEPPED_SHADER + "\n// another example\n");

        expect(store.getState().loop).toBe(false);
        expect(store.getState().playing).toBe(true);
    });

    it("starts playing when the loop is turned on", () => {
        const store = storeShowing(STEPPED_SHADER);
        store.actions.pause();

        store.actions.setLoop(true);

        expect(store.getState().playing).toBe(true);
    });

    it("keeps the time binding out of what an edit carries over", () => {
        const store = storeShowing(STEPPED_SHADER.replace("storage, read_write> position", "uniform> delta_time"));
        const edited = TIME_UNIFORM.replace("binding(1)", "binding(0)") + "@compute @workgroup_size(1) fn step() { }";

        store.actions.setWGSL(edited);

        const time = store.getState().bindings[0];
        expect(time.kind === "buffer" && [time.time, time.input]).toEqual([true, "0.0"]);
    });
});

describe("setCanvas", () => {
    // Collapsing the section the canvas lives in unmounts it, and opening the section again mounts
    // a fresh one. Coming back to a finished run is the case that used to leave it blank.
    it("runs again when a finished run is handed a new canvas", () => {
        const store = storeShowing(RENDER_SHADER, DREW_SOMETHING);
        const remounted = {} as HTMLCanvasElement;

        store.actions.setCanvas(remounted);

        expect(store.getState().canvas).toBe(remounted);
        expect(store.getState().type).toBe("running");
    });

    it("runs again when a run still in flight is handed a new canvas", () => {
        const store = storeShowing(RENDER_SHADER);
        const remounted = {} as HTMLCanvasElement;

        store.actions.setCanvas(remounted);

        expect(store.getState().canvas).toBe(remounted);
        expect(store.getState().type).toBe("running");
    });

    it("leaves a finished run alone when handed the canvas it already has", () => {
        const store = storeShowing(RENDER_SHADER, DREW_SOMETHING);

        store.actions.setCanvas(store.getState().canvas ?? null);

        expect(store.getState().type).toBe("finished");
    });

    it("ignores the null React passes on unmount, keeping the canvas it had", () => {
        const store = storeShowing(RENDER_SHADER, DREW_SOMETHING);
        const original = store.getState().canvas;

        store.actions.setCanvas(null);

        expect(store.getState().canvas).toBe(original);
        expect(store.getState().type).toBe("finished");
    });
});
