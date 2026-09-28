import { Attribute } from "wgsl_reflect";
import { getShaderConstants } from "./constants";
import { getDirectiveSource } from "./matching";

/**
 * Some directives give dimensions rather than values. A `@compute` or `@vertex` declaration sets the
 * run's initial counts, and a storage texture binding sets its size:
 *
 *     @compute @workgroup_size(64, 1, 1) // 8, 8, 1
 *     @vertex                            // 6
 *     var field: texture_storage_2d<rgba8unorm, write>; // 640, 360
 *
 * A dimension can also name one of the shader's consts, so that a count follows the size of what it
 * covers instead of being worked out by hand and kept in step with it:
 *
 *     const CHASERS = 20000u;
 *     const GROUPS = (CHASERS + 63) / 64;
 *     @compute @workgroup_size(64) // GROUPS
 *
 * That is all a dimension can be: a number, or a const. Any arithmetic belongs in the const, where it
 * is WGSL, rather than in a comment where `*` already means repetition for binding values. `rand`,
 * `randg` and the value grammar's nesting have nothing to describe here and are refused. Trailing
 * dimensions may be left off, as they can be on `@workgroup_size` itself, so `// 16` is `16, 1, 1`.
 *
 * `noun` is what the dimensions are called in any complaint, so a texture is told its size is wrong
 * rather than its count.
 */
export type DirectiveCounts =
    | {
          type: "counts";
          counts: number[];
          /** Whether any dimension names a const, and so can change without the comment changing. */
          named: boolean;
      }
    | { type: "error"; error: string };

const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const NAME = /^[A-Za-z_]\w*$/;

export const matchDirectiveCounts = (
    comment: string,
    dimensions: number,
    noun = "count",
    wgsl = "",
): DirectiveCounts => {
    const input = comment.trim();
    if (input === "") return { type: "error", error: "empty directive" };
    const random = input.match(/\b(randg?)\b/)?.[1];
    if (random) return { type: "error", error: `a ${noun} has to be fixed, so \`${random}\` cannot set one` };
    if (/[^\w\s.,+-]/.test(input))
        return {
            type: "error",
            error: `a ${noun} is a plain list of numbers and consts - anything worked out belongs in a const`,
        };

    const items = input.split(",").map((item) => item.trim());
    if (items.length > dimensions)
        return {
            type: "error",
            error: `expected at most ${dimensions} ${dimensions === 1 ? "number" : "numbers"}, but the directive gives ${
                items.length
            }`,
        };

    const counts: number[] = [];
    for (const item of items) {
        let value: number;
        if (NUMBER.test(item)) value = Number(item);
        else if (NAME.test(item)) {
            const lookup = getShaderConstants(wgsl).read(item);
            if (lookup.type === "error") return lookup;
            value = lookup.value;
        } else
            return {
                type: "error",
                error:
                    item === ""
                        ? "a dimension is missing between commas"
                        : `\`${item}\` is not a number or a const - ${noun === "count" ? "counts" : "dimensions"} are separated by commas`,
            };

        if (!Number.isInteger(value) || value < 1)
            return {
                type: "error",
                error: `a ${noun} has to be a whole number of at least 1, but ${
                    NUMBER.test(item) ? `got ${item}` : `\`${item}\` is ${value}`
                }`,
            };

        counts.push(value);
    }

    return { type: "counts", counts, named: items.some((item) => NAME.test(item)) };
};

/**
 * A comment counts as a directive if it has a number in it, as a value directive does, or if it names
 * one of the shader's consts - `// GROUPS` has no digits, but it is no more prose than `// 313`.
 */
const isCountDirective = (wgsl: string) => (comment: string) =>
    /\d/.test(comment) || (comment.match(/[A-Za-z_]\w*/g) ?? []).some((word) => getShaderConstants(wgsl).isConst(word));

/** The dimensions a declaration's attributes ask for, alongside the comment they came from. */
export const getRunCounts = (
    attributes: Attribute[] | null,
    wgsl: string,
    dimensions: number,
    noun = "count",
): { directive: string | null; counts: number[] | null; warning: string | null } => {
    const directive = getDirectiveSource(attributes, wgsl, isCountDirective(wgsl));
    if (directive === null) return { directive: null, counts: null, warning: null };

    const match = matchDirectiveCounts(directive, dimensions, noun, wgsl);
    if (match.type === "error")
        return { directive, counts: null, warning: `\`${directive}\` is not a valid ${noun}: ${match.error}` };

    // The directive is what an edit to the counts is told apart by, and one naming a const changes
    // when the const does without the comment changing - so what it came to is part of it.
    return {
        directive: match.named ? `${directive} = ${match.counts.join(", ")}` : directive,
        counts: match.counts,
        warning: null,
    };
};
