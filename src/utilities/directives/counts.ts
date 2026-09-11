import { Attribute } from "wgsl_reflect";
import { parseDirective } from "./grammar";
import { getDirectiveSource } from "./matching";

/**
 * Some directives give dimensions rather than values. A `@compute` or `@vertex` declaration sets the
 * run's initial counts, and a storage texture binding sets its size:
 *
 *     @compute @workgroup_size(64, 1, 1) // 8, 8, 1
 *     @vertex                            // 6
 *     var field: texture_storage_2d<rgba8unorm, write>; // 640, 360
 *
 * The grammar's nesting and repetition have nothing to describe here and are refused - a dimension
 * list is a plain list of whole numbers. Trailing dimensions may be left off, as they can be on
 * `@workgroup_size` itself, so `// 16` is `16, 1, 1`.
 *
 * `noun` is what the dimensions are called in any complaint, so a texture is told its size is wrong
 * rather than its count.
 */
export type DirectiveCounts = { type: "counts"; counts: number[] } | { type: "error"; error: string };

export const matchDirectiveCounts = (comment: string, dimensions: number, noun = "count"): DirectiveCounts => {
    const parsed = parseDirective(comment);
    if (parsed.type === "error") return { type: "error", error: parsed.error };

    if (parsed.items.length > dimensions)
        return {
            type: "error",
            error: `expected at most ${dimensions} ${dimensions === 1 ? "number" : "numbers"}, but the directive gives ${
                parsed.items.length
            }`,
        };

    const counts: number[] = [];
    for (const item of parsed.items) {
        if (item.type === "rand")
            return { type: "error", error: `a ${noun} has to be fixed, so \`rand\` cannot set one` };
        if (item.type !== "value")
            return { type: "error", error: `a ${noun} is a plain list of numbers, without \`(\` or \`*\`` };
        if (!Number.isInteger(item.value) || item.value < 1)
            return { type: "error", error: `a ${noun} has to be a whole number of at least 1, but got ${item.value}` };

        counts.push(item.value);
    }

    return { type: "counts", counts };
};

/** The dimensions a declaration's attributes ask for, alongside the comment they came from. */
export const getRunCounts = (
    attributes: Attribute[] | null,
    wgsl: string,
    dimensions: number,
    noun = "count",
): { directive: string | null; counts: number[] | null; warning: string | null } => {
    const directive = getDirectiveSource(attributes, wgsl);
    if (directive === null) return { directive: null, counts: null, warning: null };

    const match = matchDirectiveCounts(directive, dimensions, noun);
    if (match.type === "error")
        return { directive, counts: null, warning: `\`${directive}\` is not a valid ${noun}: ${match.error}` };

    return { directive, counts: match.counts, warning: null };
};
