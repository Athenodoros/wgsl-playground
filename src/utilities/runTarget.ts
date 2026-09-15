import { nonEmpty } from "./data";
import { RunTarget, Runnable, RunnableComputeShader } from "./types";

/**
 * The target that runs just this runnable, or nothing when there is none to run.
 *
 * A compute shader becomes a sequence of one, which is what every target was before sequences
 * existed, and is what a chain is shortened back down to.
 */
export const singleTarget = (runnable: Runnable | undefined): RunTarget => {
    if (runnable === undefined) return { type: "none" };
    if (runnable.type === "compute") return { type: "compute", passes: [runnable] };
    if (runnable.type === "render") return { type: "render", runnable };
    return { type: "function", runnable };
};

/**
 * A target running these compute passes in order, or nothing when the list is empty.
 *
 * Every compute target is built here so that an empty list can only become `none`. That is what
 * makes `passes` non-empty everywhere else, and so what lets the runner dispatch without checking.
 */
export const computeTarget = (passes: RunnableComputeShader[]): RunTarget => {
    const found = nonEmpty(passes);
    return found === null ? { type: "none" } : { type: "compute", passes: found };
};

/**
 * What a shader runs before anything has been picked: its first render pass, else its first compute
 * pass, else its first plain function.
 *
 * Taking whatever is written first instead would pick the helper function at the top of a file whose
 * point is the compute pass below it. Preferring a render pass and then a compute pass picks the
 * thing that draws something, and falling through to a function means a file of nothing but helpers
 * still has something to run.
 *
 * It is one runnable either way. A shader whose passes are meant to run as a chain has no way to say
 * so yet, and guessing it from the order they happen to be written in would be wrong for a file of
 * unrelated kernels.
 */
export const getDefaultTarget = (runnables: Runnable[]): RunTarget =>
    singleTarget(
        runnables.find((runnable) => runnable.type === "render") ??
            runnables.find((runnable) => runnable.type === "compute") ??
            runnables.find((runnable) => runnable.type === "function"),
    );

/** The runnables a target names, in the order they run. */
export const targetRunnables = (target: RunTarget): Runnable[] => {
    if (target.type === "none") return [];
    if (target.type === "compute") return target.passes;
    return [target.runnable];
};

/**
 * The target after picking a runnable out of the list of them.
 *
 * Compute passes accumulate, in the order they are picked, since they are the only thing that
 * chains; anything else replaces the target outright. Picking one already in the target takes it
 * back out, which is how a chain is shortened and how the last of anything is cleared.
 */
export const toggleRunnable = (target: RunTarget, runnable: Runnable): RunTarget => {
    if (target.type === "compute" && runnable.type === "compute") {
        const kept = target.passes.filter((pass) => pass.id !== runnable.id);
        return kept.length < target.passes.length ? computeTarget(kept) : computeTarget([...target.passes, runnable]);
    }

    return targetRunnables(target).some((entry) => entry.id === runnable.id)
        ? { type: "none" }
        : singleTarget(runnable);
};

/**
 * The target with one of the runnables it names swapped for an edited copy of itself.
 *
 * Counts live on the runnable, so changing one is replacing it. It is found by ID rather than by
 * identity, because replacing it is exactly what breaks the identity.
 */
export const updateRunnable = (target: RunTarget, updated: Runnable): RunTarget => {
    if (target.type === "compute" && updated.type === "compute")
        return computeTarget(target.passes.map((pass) => (pass.id === updated.id ? updated : pass)));

    return targetRunnables(target).some((entry) => entry.id === updated.id) ? singleTarget(updated) : target;
};
