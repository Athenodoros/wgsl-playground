/**
 * A shader whose passes are meant to run one after another says so, on a line of its own:
 *
 *     // playground-compute-run-order: measure, draw
 *
 * The other directives hang off a declaration and describe it. This one is about the file as a
 * whole, and there is nothing for it to hang off: the fact that one pass fills in what the next one
 * reads is not written down anywhere in the passes themselves. Order of declaration would be a guess
 * - a file of unrelated kernels is written in some order too - so the shader is asked instead.
 *
 * It names entry points, in the order they run, and nothing else. Anything a pass needs to know about
 * a pass before it goes through the bindings they share, which is what makes them a chain.
 */

const RUN_ORDER = "playground-compute-run-order:";

/**
 * The entry point names a shader declares as its run order, or null if it declares none.
 *
 * The first such comment wins, and one naming nothing counts as absent, so a half-typed directive
 * leaves the shader running what it ran before rather than nothing at all.
 */
export const getRunOrder = (wgsl: string): string[] | null => {
    const declared = wgsl
        .split("\n")
        .map((line) =>
            line
                .trim()
                .match(/^\/\/\/?\s*(.*)$/)?.[1]
                ?.trim(),
        )
        .find((comment) => comment?.startsWith(RUN_ORDER));

    if (declared === undefined) return null;

    const names = declared
        .slice(RUN_ORDER.length)
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== "");

    return names.length > 0 ? names : null;
};
