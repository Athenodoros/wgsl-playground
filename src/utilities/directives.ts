import { Attribute } from "wgsl_reflect";

/**
 * A directive comment is a trailing comment on an attribute's line, used to control how the
 * playground sets a binding up:
 *
 *     @group(0) @binding(0) var<storage, read_write> output: array<i32>; // 0
 *     @group(0) @binding(1) var<storage, read> input: array<f32>;        // rand(-1, 1)
 *     @group(0) @binding(2) var<uniform> light: Light;                   // 0.5, 0.5, 0.0, 1.0
 *     @group(0) @binding(3) var<storage, read> jitter: array<f32>;       // rand(-1, 1), 1, 2
 *
 * It is a list of terms, each either a literal number or a random range, consumed one term per
 * field in source order. A bare `rand(-1, 1)` is just the one-term case of that.
 */
type DirectiveTerm = { type: "value"; value: number } | { type: "rand"; min: number; max: number };

/**
 * Terms are separated by commas, but `rand` has commas of its own, so a call is matched whole
 * before falling back to "everything up to the next comma". The leading `\s*` matters: without it
 * a call anywhere but the start of the list is preceded by a space, the call branch fails there,
 * and the fallback swallows the call up to its own first argument separator.
 */
const TERM_PATTERN = /\s*\w+\([^)]*\)|[^,]+/g;

const splitNumbers = (raw: string): number[] | null => {
    const values = raw
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value)
        .map(Number);

    return values.some(isNaN) ? null : values;
};

const parseTerm = (raw: string): DirectiveTerm | null => {
    const functionCall = raw.match(/^(\w+)\((.*)\)$/);
    if (functionCall !== null) {
        const [, functionName, rawArgs] = functionCall;
        if (functionName !== "rand") return null;

        const args = splitNumbers(rawArgs);
        if (args === null || args.length !== 2) return null;

        const [min, max] = args;
        return { type: "rand", min, max };
    }

    const value = Number(raw);
    return isNaN(value) ? null : { type: "value", value };
};

const parseDirective = (comment: string): DirectiveTerm[] | null => {
    const terms = (comment.match(TERM_PATTERN) ?? [])
        .map((term) => term.trim())
        .filter((term) => term)
        .map(parseTerm);

    if (terms.length === 0 || terms.some((term) => term === null)) return null;

    return terms as DirectiveTerm[];
};

const evaluateTerm = (term: DirectiveTerm) =>
    term.type === "value" ? term.value : Math.random() * (term.max - term.min) + term.min;

const getDirectiveTerms = (attributes: Attribute[] | null, wgsl: string): DirectiveTerm[] | null => {
    const codeLines = wgsl.split("\n");

    return (
        attributes
            ?.map((attribute) => {
                const comment = codeLines[attribute.line - 1].match(/\/\/\/?(.*)/)?.[1]?.trim();
                if (!comment) return null;

                return parseDirective(comment);
            })
            ?.find((terms) => terms !== null) ?? null
    );
};

/**
 * Returns a generator called once per value in the binding, or null if the attributes carry no
 * usable directive - callers decide what to fall back to.
 *
 * Terms are consumed in source order, and the list repeats from the start if the binding has more
 * fields than the list has terms. Each term is evaluated afresh every time it comes round, so a
 * `rand` term gives a different value in each repetition rather than the same one throughout.
 */
export const getDirectiveValueGenerator = (attributes: Attribute[] | null, wgsl: string): (() => number) | null => {
    const terms = getDirectiveTerms(attributes, wgsl);
    if (terms === null) return null;

    let index = 0;
    return () => evaluateTerm(terms[index++ % terms.length]);
};
