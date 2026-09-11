import { describe, expect, it } from "vitest";
import { DirectiveNode, parseDirective } from "./grammar";

/** A compact rendering of a parse tree, so expectations read like the directives they describe. */
const brief = (node: DirectiveNode): string =>
    node.type === "value"
        ? String(node.value)
        : node.type === "rand"
        ? `rand(${node.min},${node.max})`
        : node.type === "repeat"
        ? `${node.count}*${brief(node.item)}`
        : `(${node.items.map(brief).join(" ")})`;

const parse = (comment: string) => {
    const result = parseDirective(comment);
    return result.type === "error" ? `ERROR: ${result.error}` : result.items.map(brief).join(" ");
};


describe("parseDirective", () => {
    it("parses a single value", () => {
        expect(parse("0")).toBe("0");
        expect(parse("-3.5")).toBe("-3.5");
        expect(parse("1e3")).toBe("1000");
        expect(parse(".5")).toBe("0.5");
        expect(parse("+2")).toBe("2");
    });

    it("parses a flat list", () => {
        expect(parse("1, 2, 3")).toBe("1 2 3");
        expect(parse("150, 110, 0.12, 1")).toBe("150 110 0.12 1");
    });

    it("parses rand, with and without spaces", () => {
        expect(parse("rand(0, 100)")).toBe("rand(0,100)");
        expect(parse("rand(-1,1)")).toBe("rand(-1,1)");
        expect(parse("rand( -1 , 1 )")).toBe("rand(-1,1)");
    });

    it("parses groups, which mark nesting explicitly", () => {
        expect(parse("(1, 2, 3)")).toBe("(1 2 3)");
        expect(parse("(1, 2, 3), (4, 5, 6), (7, 8, 9)")).toBe("(1 2 3) (4 5 6) (7 8 9)");
        expect(parse("1, (2, 3, 4), 5")).toBe("1 (2 3 4) 5");
        expect(parse("((1,2),(3,4))")).toBe("((1 2) (3 4))");
    });

    it("parses repetition", () => {
        expect(parse("5 * (1, 2, 3)")).toBe("5*(1 2 3)");
        expect(parse("5 * rand(-1, 1)")).toBe("5*rand(-1,1)");
        expect(parse("1, 3 * 2, 4")).toBe("1 3*2 4");
        expect(parse("3*2")).toBe("3*2");
        expect(parse("2 * (2 * 1)")).toBe("2*(2*1)");
    });

    it("ignores surrounding whitespace", () => {
        expect(parse("  5   *   (  1 , 2 )  ")).toBe("5*(1 2)");
        expect(parse(" 7 ")).toBe("7");
        expect(parse("\t1, 2\t")).toBe("1 2");
    });

    it("rejects malformed rand", () => {
        expect(parse("rand(1)")).toMatch(/^ERROR/);
        expect(parse("rand(1,2,3)")).toMatch(/^ERROR/);
        expect(parse("rand 1, 2")).toMatch(/^ERROR/);
        expect(parse("rand(a,b)")).toMatch(/^ERROR/);
    });

    it("rejects repeat counts that are not whole numbers of at least one", () => {
        expect(parse("0 * 1")).toMatch(/whole number of at least 1/);
        expect(parse("-1 * 2")).toMatch(/whole number of at least 1/);
        expect(parse("1.5 * 2")).toMatch(/whole number of at least 1/);
    });

    it("rejects unbalanced and stray punctuation", () => {
        expect(parse("(1,2")).toMatch(/unclosed/);
        expect(parse("1,2)")).toMatch(/unmatched/);
        expect(parse("()")).toMatch(/^ERROR/);
        expect(parse("*")).toMatch(/^ERROR/);
        expect(parse("1,")).toMatch(/^ERROR/);
        expect(parse(",1")).toMatch(/^ERROR/);
    });

    it("rejects values that are not separated by commas", () => {
        expect(parse("1 2")).toMatch(/separated by commas/);
        expect(parse("(1,2)(3,4)")).toMatch(/separated by commas/);
    });

    it("rejects text that was never a directive", () => {
        expect(parse("banana")).toMatch(/unexpected `banana`/);
        expect(parse("the output buffer")).toMatch(/^ERROR/);
        expect(parse("shuffle(1,2)")).toMatch(/^ERROR/);
        expect(parse("")).toMatch(/^ERROR/);
    });
});

