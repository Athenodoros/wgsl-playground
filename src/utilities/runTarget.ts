import { NonEmpty, nonEmpty } from "./data";
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

/** What a shader's run order comment comes to, against the entry points the shader actually has. */
export type ResolvedRunOrder =
    | { type: "undeclared" }
    | { type: "passes"; passes: NonEmpty<RunnableComputeShader> }
    | { type: "invalid"; unknown: string[] };

/**
 * The compute passes a run order names, in its order, or the names in it that match none.
 *
 * A run order is taken whole or not at all. Dropping a name that matches nothing would run something
 * other than what the file says while looking exactly like it had worked, and a half-applied order is
 * a worse answer than the shader's own first pass.
 */
export const resolveRunOrder = (runnables: Runnable[], runOrder: string[] | null): ResolvedRunOrder => {
    if (runOrder === null) return { type: "undeclared" };

    const computes = runnables.filter((runnable): runnable is RunnableComputeShader => runnable.type === "compute");
    const unknown = runOrder.filter((name) => !computes.some((pass) => pass.name === name));
    if (unknown.length > 0) return { type: "invalid", unknown };

    const passes = nonEmpty(runOrder.flatMap((name) => computes.filter((pass) => pass.name === name)));
    return passes === null ? { type: "undeclared" } : { type: "passes", passes };
};

/**
 * What choosing a kind of runnable runs: the shader's run order for compute when it has one that
 * resolves, and otherwise the first runnable of that kind.
 */
export const defaultTargetOfKind = (
    runnables: Runnable[],
    kind: Runnable["type"],
    runOrder: string[] | null,
): RunTarget => {
    if (kind === "compute") {
        const declared = resolveRunOrder(runnables, runOrder);
        if (declared.type === "passes") return { type: "compute", passes: declared.passes };
    }

    return singleTarget(runnables.find((runnable) => runnable.type === kind));
};

/**
 * What a shader runs before anything has been picked.
 *
 * A shader that declares a run order gets exactly that, which is the only way a chain runs without
 * being assembled by hand. Otherwise it is one runnable, chosen by what it is rather than by where
 * it is written: a render pass if there is one, else a compute pass, else a plain function. Taking
 * whatever came first instead would open a file on the helper function at the top of it rather than
 * on the compute pass below that the file is for.
 */
export const getDefaultTarget = (runnables: Runnable[], runOrder: string[] | null = null): RunTarget => {
    if (resolveRunOrder(runnables, runOrder).type === "passes")
        return defaultTargetOfKind(runnables, "compute", runOrder);

    const kind = (["render", "compute", "function"] as const).find((kind) =>
        runnables.some((runnable) => runnable.type === kind),
    );
    return kind === undefined ? { type: "none" } : defaultTargetOfKind(runnables, kind, runOrder);
};

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
