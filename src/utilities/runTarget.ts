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

/** The runnables a target names, in the order they run. */
export const targetRunnables = (target: RunTarget): Runnable[] => {
    if (target.type === "none") return [];
    if (target.type === "compute") return target.passes;
    return [target.runnable];
};
