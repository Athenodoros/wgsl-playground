import { RunSession } from "../utilities/runWGSLFunction";
import { LoopClock, RunnerResults, STOPPED_CLOCK } from "../utilities/types";

/**
 * How often a running loop reads its buffers back.
 *
 * Reading back costs a copy and a wait on the GPU, and nobody reads numbers that change sixty times a
 * second, so the outputs panel follows along a few times a second and catches up in full on pause.
 */
export const LOOP_READ_INTERVAL_MS = 250;

export interface LoopCallbacks {
    /** Results read back from the session, with the clock as it stood at the frame they were read after. */
    show: (results: RunnerResults, clock: LoopClock) => void;
    /** The loop has paused itself, because a frame raised an error. */
    halted: () => void;
}

export interface Loop {
    play: () => void;
    pause: () => void;
    /** Stops for good, and frees what the session built. */
    stop: () => void;
}

/**
 * Runs a session once per animation frame, with the seconds since the frame before.
 *
 * The first frame after starting or resuming is given no time at all, rather than however long the
 * loop sat paused - which would have a simulation lurch forward by it on every resume.
 *
 * A frame the GPU has not finished by the next animation frame is not queued behind: that frame is
 * skipped, and its time goes to the next one that runs. Otherwise a shader slower than the display
 * would fall further behind on every frame, and take as long again to stop once paused.
 */
export const startLoop = (session: RunSession, playing: boolean, { show, halted }: LoopCallbacks): Loop => {
    let stopped = false;
    let handle: number | null = null;
    let previous: number | null = null;
    let clock = STOPPED_CLOCK;
    let rendering = false;

    let lastReadAt = -Infinity;
    let reading = false;
    let latestRead = 0;

    const halt = () => {
        if (handle !== null) cancelAnimationFrame(handle);
        handle = null;
        previous = null;
    };

    // Only the most recent read is shown, so a slow one started while playing cannot land after the
    // full read taken on pause and replace it with something older and less complete.
    const read = (withTexture: boolean) => {
        const id = ++latestRead;
        const at = clock;

        return session.read(withTexture).then((results) => {
            if (stopped || id !== latestRead) return;

            show(results, at);
            if (results.type === "errors" && handle !== null) {
                halt();
                halted();
            }
        });
    };

    const runFrame = (deltaTime: number) => {
        rendering = true;
        clock = { frames: clock.frames + 1, elapsed: clock.elapsed + deltaTime };

        session.frame(deltaTime).then((error) => {
            rendering = false;
            if (error !== null && !stopped) read(false);
        });
    };

    const tick = (now: DOMHighResTimeStamp) => {
        handle = requestAnimationFrame(tick);
        if (rendering) return;

        runFrame(previous === null ? 0 : (now - previous) / 1000);
        previous = now;

        // The first frame is read straight away, which is what surfaces a shader that does not compile.
        if (!reading && now - lastReadAt >= LOOP_READ_INTERVAL_MS) {
            lastReadAt = now;
            reading = true;
            read(false).finally(() => {
                reading = false;
            });
        }
    };

    const play = () => {
        if (stopped || handle !== null) return;
        handle = requestAnimationFrame(tick);
    };

    if (playing) play();
    else {
        // Starting paused still shows where the loop starts from: one frame, in which no time passes.
        runFrame(0);
        read(true);
    }

    return {
        play,
        pause: () => {
            if (stopped || handle === null) return;
            halt();
            read(true);
        },
        stop: () => {
            stopped = true;
            halt();
            session.destroy();
        },
    };
};
