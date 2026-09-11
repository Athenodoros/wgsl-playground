import { Attribute } from "wgsl_reflect";
import { DirectiveNode, parseDirective } from "./grammar";
import { TypeShape } from "./typeShape";

/**
 * A directive comment is a trailing comment on an attribute's line, describing the values a binding
 * starts with:
 *
 *     @group(0) @binding(0) var<storage, read_write> output: array<i32>; // 6 * 0
 *     @group(0) @binding(1) var<storage, read> input: array<f32>;        // 6 * rand(-1, 1)
 *     @group(0) @binding(2) var<uniform> light: Light;                   // (0.5, 0.5, 0.0), 1.0
 *     @group(0) @binding(3) var<uniform> sources: array<Source, 4>;      // ((150, 110), 0.12, 1)
 *
 * A directive has to match the shape of the type it fills, and nothing is guessed: one that does
 * not match is reported rather than stretched to fit. The liberties are both about writing one
 * thing where many would fit: a single value fills everything beneath it, so `// 0` works whatever
 * the type turns out to be, and a single group fills every element of an array of known length, as
 * the sources above do.
 */

/**
 * The text of the directive in force, or null if there is none.
 *
 * A comment with no digits in it was never an attempt at a directive - it is prose about the
 * binding - so it is passed over rather than reported as a broken one.
 */
export const getDirectiveSource = (attributes: Attribute[] | null, wgsl: string): string | null => {
    const codeLines = wgsl.split("\n");

    return (
        attributes
            ?.map((attribute) => codeLines[attribute.line - 1]?.match(/\/\/\/?(.*)/)?.[1]?.trim() || null)
            ?.find((comment) => comment !== null && /\d/.test(comment)) ?? null
    );
};

export type DirectiveMatch =
    | { type: "values"; values: number[]; runtimeLength: number | null }
    | { type: "error"; error: string };

const isSingleValue = (node: DirectiveNode): node is Extract<DirectiveNode, { type: "value" | "rand" }> =>
    node.type === "value" || node.type === "rand";

const evaluate = (node: Extract<DirectiveNode, { type: "value" | "rand" }>) =>
    node.type === "value" ? node.value : Math.random() * (node.max - node.min) + node.min;

/**
 * Reads a directive comment and lays its values out over a type, in the order the buffer expects
 * them, or explains why it does not fit. Padding is not counted here - it is added downstream - so a
 * directive describes a type as written rather than as laid out in memory.
 */
export const matchDirective = (comment: string, shape: TypeShape): DirectiveMatch => {
    const parsed = parseDirective(comment);
    if (parsed.type === "error") return { type: "error", error: parsed.error };

    const values: number[] = [];
    let runtimeLength: number | null = null;
    let error: string | null = null;

    /** One value fills everything below it, however deeply nested. */
    const broadcast = (node: Extract<DirectiveNode, { type: "value" | "rand" }>, target: TypeShape): void => {
        if (target.kind === "scalar") {
            values.push(evaluate(node));
            return;
        }

        if (target.kind === "compound") {
            target.children.forEach((child) => broadcast(node, child));
            return;
        }

        // A single value says nothing about how long a runtime-sized array should be, so it fills
        // one element. `4 * 0` is how you ask for four.
        if (target.count === null) runtimeLength = 1;
        for (let index = 0; index < (target.count ?? 1); index++) broadcast(node, target.element);
    };

    const matchNode = (node: DirectiveNode, target: TypeShape): void => {
        if (error !== null) return;
        if (isSingleValue(node)) return broadcast(node, target);
        if (node.type === "group") return matchItems(node.items, target);

        // `count * item` describes an array and nothing else. It is not shorthand for repeating a
        // value inside a list, so `1, 3 * 2, 4` on an array<i32> is an error rather than five ints.
        if (target.kind !== "array") {
            error = `${target.label} is not an array, so \`${node.count} * ...\` cannot fill it`;
            return;
        }

        if (target.count !== null && node.count !== target.count) {
            error = `${target.label} has ${target.count} elements, but the directive gives ${node.count}`;
            return;
        }

        if (target.count === null) runtimeLength = node.count;
        for (let index = 0; index < node.count; index++) matchNode(node.item, target.element);
    };

    const matchItems = (items: DirectiveNode[], target: TypeShape): void => {
        if (error !== null) return;

        if (items.length === 1) {
            // One value fills everything below it, and one repetition describes the whole array.
            if (isSingleValue(items[0])) return broadcast(items[0], target);
            if (items[0].type === "repeat") return matchNode(items[0], target);

            // One group fills every element of an array that already knows how long it is, so
            // `((0, 0), 1)` describes every element of an array<Source, 4> without counting them
            // out. A runtime-sized array is the exception: nothing but the directive says how long
            // it is, so a group there is one element rather than a pattern for all of them.
            if (target.kind === "array" && target.count !== null) {
                for (let index = 0; index < target.count; index++) matchNode(items[0], target.element);
                return;
            }
        }

        if (target.kind === "scalar") {
            error = `${target.label} is a single value, but the directive gives ${items.length}`;
            return;
        }

        if (target.kind === "compound") {
            if (items.length !== target.children.length) {
                error = `${target.label} has ${target.children.length} components, but the directive gives ${items.length}`;
                return;
            }

            items.forEach((item, index) => matchNode(item, target.children[index]));
            return;
        }

        if (target.count !== null && items.length !== target.count) {
            error = `${target.label} has ${target.count} elements, but the directive gives ${items.length}`;
            return;
        }

        if (target.count === null) runtimeLength = items.length;
        items.forEach((item) => matchNode(item, target.element));
    };

    matchItems(parsed.items, shape);

    return error !== null ? { type: "error", error } : { type: "values", values, runtimeLength };
};
