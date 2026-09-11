import { Attribute } from "wgsl_reflect";

/**
 * A directive comment is a trailing comment on an attribute's line, used to control how the
 * playground sets a binding up:
 *
 *     @group(0) @binding(0) var<storage, read_write> output: array<i32>; // 0
 *     @group(0) @binding(1) var<storage, read> input: array<f32>;        // rand(-1, 1)
 *     @group(0) @binding(2) var<uniform> light: Light;                   // 0.5, 0.5, 0.0, 1.0
 */
type Directive = { type: "values"; values: number[] } | { type: "rand"; min: number; max: number };

const splitNumbers = (raw: string): number[] | null => {
    const values = raw
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value)
        .map(Number);

    return values.some(isNaN) ? null : values;
};

const parseDirective = (comment: string): Directive | null => {
    const functionCall = comment.match(/^(\w+)\((.*)\)$/);
    if (functionCall !== null) {
        const [, functionName, rawArgs] = functionCall;
        if (functionName !== "rand") return null;

        const args = splitNumbers(rawArgs);
        if (args === null || args.length !== 2) return null;

        const [min, max] = args;
        return { type: "rand", min, max };
    }

    const values = splitNumbers(comment);
    if (values === null || values.length === 0) return null;

    return { type: "values", values };
};

/**
 * Returns a generator called once per value in the binding, or null if the attributes carry no
 * usable directive - callers decide what to fall back to.
 *
 * A list is consumed one value per field, in source order, and cycles if the binding has more
 * fields than the list has values - so a single number still fills every field, as it always has.
 */
export const getDirectiveValueGenerator = (attributes: Attribute[] | null, wgsl: string): (() => number) | null => {
    const codeLines = wgsl.split("\n");

    const directive =
        attributes
            ?.map((attribute) => {
                const comment = codeLines[attribute.line - 1].match(/\/\/\/?(.*)/)?.[1]?.trim();
                if (!comment) return null;

                return parseDirective(comment);
            })
            ?.find((parsed) => parsed !== null) ?? null;

    if (directive === null) return null;

    if (directive.type === "rand") {
        const { min, max } = directive;
        return () => Math.random() * (max - min) + min;
    }

    const { values } = directive;
    let index = 0;
    return () => values[index++ % values.length];
};
