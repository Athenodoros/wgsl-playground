import { afterEach, describe, expect, it, vi } from "vitest";
import { RunSession } from "../utilities/runWGSLFunction";
import { LoopClock, RunnerResults } from "../utilities/types";
import { LOOP_READ_INTERVAL_MS, startLoop } from "./loop";

afterEach(() => vi.unstubAllGlobals());

const OUTPUTS: RunnerResults = { type: "outputs", bindings: [], returned: null };
const ERRORS: RunnerResults = { type: "errors", errors: [{ text: "broken", intent: "danger", icon: "error" }] };

/** Animation frames that fire only when the test says, at the timestamp it gives. */
const animationFrames = () => {
    let pending: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        pending = callback;
        return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
        pending = null;
    });

    return {
        fire: (now: number) => {
            const callback = pending;
            pending = null;
            callback?.(now);
        },
        scheduled: () => pending !== null,
    };
};

/** A session that writes down what it is asked to do, and reads back whatever it is told to. */
const recordingSession = (read: (withTexture: boolean) => Promise<RunnerResults> = () => Promise.resolve(OUTPUTS)) => {
    const deltas: number[] = [];
    const reads: boolean[] = [];
    let destroyed = false;
    let error: GPUError | null = null;

    const session: RunSession = {
        frame: (deltaTime) => {
            deltas.push(deltaTime);
            return Promise.resolve(error);
        },
        read: (withTexture) => {
            reads.push(withTexture);
            return read(withTexture);
        },
        destroy: () => {
            destroyed = true;
        },
    };

    return {
        session,
        deltas,
        reads,
        destroyed: () => destroyed,
        failFrames: () => {
            error = { message: "broken" } as GPUError;
        },
    };
};

const callbacks = () => {
    const shown: [RunnerResults, LoopClock][] = [];
    const halted = vi.fn();
    return { shown, halted, show: (results: RunnerResults, clock: LoopClock) => shown.push([results, clock]) };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("startLoop", () => {
    it("gives the first frame no time, and each one after it the seconds since the frame before", async () => {
        const frames = animationFrames();
        const { session, deltas } = recordingSession();
        startLoop(session, true, callbacks());

        frames.fire(1000);
        await settle();
        frames.fire(1016);
        await settle();
        frames.fire(1050);

        expect(deltas).toHaveLength(3);
        expect(deltas[0]).toBe(0);
        expect(deltas[1]).toBeCloseTo(0.016);
        expect(deltas[2]).toBeCloseTo(0.034);
    });

    // Resuming used to be a candidate for handing the next frame the whole pause at once, which would
    // have a simulation jump forward by however long it sat still.
    it("does not count time spent paused", async () => {
        const frames = animationFrames();
        const { session, deltas } = recordingSession();
        const loop = startLoop(session, true, callbacks());

        frames.fire(1000);
        await settle();
        frames.fire(1100);
        await settle();
        loop.pause();
        expect(frames.scheduled()).toBe(false);

        loop.play();
        frames.fire(5000);
        await settle();
        frames.fire(5100);

        expect(deltas.map((delta) => delta.toFixed(3))).toEqual(["0.000", "0.100", "0.000", "0.100"]);
    });

    // Queueing a frame behind one the GPU is still running has a slow shader fall further behind on
    // every frame, so the loop waits it out instead, and counts only the frames it actually ran.
    it("skips frames while the last is still on the GPU, and gives their time to the next", async () => {
        const frames = animationFrames();
        const deltas: number[] = [];
        const finish: (() => void)[] = [];
        const session: RunSession = {
            frame: (deltaTime) => {
                deltas.push(deltaTime);
                return new Promise((resolve) => finish.push(() => resolve(null)));
            },
            read: () => Promise.resolve(OUTPUTS),
            destroy: () => {},
        };
        const shown = callbacks();
        const loop = startLoop(session, true, shown);

        frames.fire(1000);
        frames.fire(1016);
        frames.fire(1033);
        expect(deltas).toEqual([0]);
        expect(frames.scheduled()).toBe(true);

        finish[0]();
        await settle();
        frames.fire(1050);
        finish[1]();
        loop.pause();
        await settle();

        expect(deltas.map((delta) => delta.toFixed(3))).toEqual(["0.000", "0.050"]);
        expect(shown.shown[shown.shown.length - 1][1]).toEqual({ frames: 2, elapsed: 0.05 });
    });

    it("reads buffers back every so often while playing, and everything on pause", async () => {
        const frames = animationFrames();
        const { session, reads } = recordingSession();
        const shown = callbacks();
        const loop = startLoop(session, true, shown);

        frames.fire(0);
        await settle();
        frames.fire(16);
        await settle();
        frames.fire(LOOP_READ_INTERVAL_MS);
        await settle();
        loop.pause();
        await settle();

        expect(reads).toEqual([false, false, true]);
        expect(shown.shown.map(([, clock]) => clock.frames)).toEqual([1, 3, 3]);
    });

    it("drops a read that lands after a newer one was asked for", async () => {
        const frames = animationFrames();
        const resolvers: ((results: RunnerResults) => void)[] = [];
        const { session } = recordingSession(() => new Promise((resolve) => resolvers.push(resolve)));
        const shown = callbacks();
        const loop = startLoop(session, true, shown);

        frames.fire(0);
        loop.pause();

        const full: RunnerResults = { ...OUTPUTS, getTextureValue: () => null };
        resolvers[1](full);
        await settle();
        resolvers[0](OUTPUTS);
        await settle();

        expect(shown.shown.map(([results]) => results)).toEqual([full]);
    });

    it("pauses itself when a frame raises an error, and shows it", async () => {
        const frames = animationFrames();
        const recording = recordingSession(() => Promise.resolve(ERRORS));
        recording.failFrames();
        const shown = callbacks();
        startLoop(recording.session, true, shown);

        frames.fire(0);
        await settle();

        expect(shown.shown[0][0]).toBe(ERRORS);
        expect(shown.halted).toHaveBeenCalledOnce();
        expect(frames.scheduled()).toBe(false);
    });

    it("starts paused on a single frame in which no time passes, read in full", async () => {
        const frames = animationFrames();
        const { session, deltas, reads } = recordingSession();
        const shown = callbacks();
        startLoop(session, false, shown);
        await settle();

        expect(deltas).toEqual([0]);
        expect(reads).toEqual([true]);
        expect(shown.shown[0][1]).toEqual({ frames: 1, elapsed: 0 });
        expect(frames.scheduled()).toBe(false);
    });

    it("frees the session on stop, and shows nothing that was still being read", async () => {
        const frames = animationFrames();
        const recording = recordingSession();
        const shown = callbacks();
        const loop = startLoop(recording.session, true, shown);

        frames.fire(0);
        loop.stop();
        await settle();

        expect(recording.destroyed()).toBe(true);
        expect(shown.shown).toEqual([]);
        expect(frames.scheduled()).toBe(false);
    });
});
