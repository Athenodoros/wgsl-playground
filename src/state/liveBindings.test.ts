import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { StoreApi } from "zustand";
import { parseWGSL } from "../utilities/parseWGSL";
import { createRunSession, RunSession } from "../utilities/runWGSLFunction";
import { STOPPED_CLOCK } from "../utilities/types";
import { getAppActions } from "./actions";
import { AppState } from "./types";

vi.mock(import("../utilities/runWGSLFunction"), async (original) => ({
    ...(await original()),
    createRunSession: vi.fn(),
}));

// parseWGSL hangs the reflection off `window` for poking at in the console, and these tests run in node.
beforeAll(() => vi.stubGlobal("window", {}));
afterEach(() => vi.unstubAllGlobals());

const SHADER = `
@group(0) @binding(0) var<uniform> delta_time: f32; // playground-time
@group(0) @binding(1) var<uniform> speed: f32; // 2
@group(0) @binding(2) var<storage, read> targets: array<f32>; // 4 * 0
@group(0) @binding(3) var<storage, read_write> positions: array<f32, 4>; // 0

@compute @workgroup_size(1)
fn step() {}
`;

/** A store running SHADER on a session that writes down what it is asked to do. */
const running = ({ loop = true, playing = true } = {}) => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const writes: [string, number][] = [];
    let sessions = 0;
    vi.mocked(createRunSession).mockImplementation(() => {
        sessions++;
        const session: RunSession = {
            frame: () => Promise.resolve(null),
            read: () => new Promise(() => {}),
            readBinding: () => Promise.resolve("0"),
            writeBinding: (id, value) => {
                if (value.byteLength !== (id === "0:2" ? 16 : 4)) return false;
                writes.push([id, new Float32Array(value)[0]]);
                return true;
            },
            destroy: () => {},
        };
        return session;
    });

    const parsed = parseWGSL(SHADER);
    if (parsed.type === "failed-parse") throw new Error(parsed.error);

    let state: AppState = {
        ...parsed,
        type: "loading",
        canvas: {} as HTMLCanvasElement,
        wgsl: SHADER,
        loop: true,
        playing,
        clock: STOPPED_CLOCK,
        renderedOutputs: [],
    };
    const set = ((update: Partial<AppState>, replace?: boolean) => {
        state = (replace ? update : { ...state, ...update }) as AppState;
    }) as StoreApi<AppState>["setState"];

    const actions = getAppActions(set, () => state);
    actions.setDevice({} as GPUDevice);
    // A time uniform turns the loop on whenever the shader is read, so it is turned off afterwards.
    if (!loop) actions.setLoop(false);
    sessions = 1;

    return { actions, getState: () => state, writes, sessions: () => sessions };
};

const f32 = (value: number) => new Float32Array([value]).buffer;

describe("editing a binding while a loop runs", () => {
    it("writes a uniform into the running loop, rather than starting it over", () => {
        const store = running();
        expect(store.sessions()).toBe(1);

        store.actions.setBindingInput("0:1", "5.0", f32(5));

        expect(store.writes).toEqual([["0:1", 5]]);
        expect(store.sessions()).toBe(1);
        expect(store.getState().bindings.find((b) => b.id === "0:1")).toMatchObject({ input: "5.0" });
    });

    it("does the same while the loop is paused, for it to pick up on playing", () => {
        const store = running({ playing: false });

        store.actions.setBindingInput("0:1", "5.0", f32(5));

        expect(store.writes).toEqual([["0:1", 5]]);
        expect(store.sessions()).toBe(1);
    });

    it("writes a read-only storage buffer too, while it keeps its size", () => {
        const store = running();

        store.actions.setBindingInput("0:2", "[ 1, 2, 3, 4 ]", new Float32Array([1, 2, 3, 4]).buffer);
        expect(store.sessions()).toBe(1);

        store.actions.setBindingInput("0:2", "[ 1, 2 ]", new Float32Array([1, 2]).buffer);
        expect(store.sessions()).toBe(2);
    });

    it("starts over for a binding the shader writes, whose state the loop has built up", () => {
        const store = running();

        store.actions.setBindingInput("0:3", "[ 1, 1, 1, 1 ]", new Float32Array([1, 1, 1, 1]).buffer);

        expect(store.writes).toEqual([]);
        expect(store.sessions()).toBe(2);
    });

    it("starts over when not looping, since a single run has to run again to show anything", () => {
        const store = running({ loop: false });

        store.actions.setBindingInput("0:1", "5.0", f32(5));

        expect(store.writes).toEqual([]);
        expect(store.sessions()).toBe(2);
    });

    it("starts from the edited value on reset", () => {
        const store = running();

        store.actions.setBindingInput("0:1", "5.0", f32(5));
        store.actions.reset();

        expect(store.sessions()).toBe(2);
        const bindings = vi.mocked(createRunSession).mock.lastCall?.[3];
        expect(bindings?.find((b) => b.id === "0:1")).toMatchObject({ input: "5.0" });
    });
});
