import { Attribute } from "wgsl_reflect";

/**
 * A directive comment is a trailing comment on an attribute's line, used to control how the
 * playground sets a binding up:
 *
 *     @group(0) @binding(0) var<storage, read_write> output: array<i32>; // 0
 *     @group(0) @binding(1) var<storage, read> input: array<f32>;        // rand(-1, 1)
 *
 * Returns a generator called once per value in the binding, or null if the attributes carry no
 * usable directive - callers decide what to fall back to.
 */
export const getDirectiveValueGenerator = (attributes: Attribute[] | null, wgsl: string): (() => number) | null => {
    const codeLines = wgsl.split("\n");

    return (
        attributes
            ?.map((attribute) => {
                const comment = codeLines[attribute.line - 1].match(/\/\/\/?(.*)/)?.[1]?.trim();
                if (!comment) return null;
                if (!isNaN(Number(comment))) return () => Number(comment);

                const functionCall = comment.match(/^(\w+)\((.*)\)$/);
                if (functionCall === null) return null;

                const [, functionName, rawArgs] = functionCall;
                const args = rawArgs
                    .split(",")
                    .map((arg) => arg.trim())
                    .filter((arg) => arg);

                if (functionName === "rand") {
                    if (args.length !== 2) return null;
                    const [min, max] = args.map((arg) => Number(arg));
                    if (isNaN(min) || isNaN(max)) return null;

                    return () => Math.random() * (max - min) + min;
                }

                return null;
            })
            ?.find((generator) => generator !== null) ?? null
    );
};
