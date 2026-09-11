import { describe, expect, it } from "vitest";
import { matchDirectiveCounts } from "./counts";

const counts = (comment: string, dimensions = 3) => {
    const result = matchDirectiveCounts(comment, dimensions);
    return result.type === "error" ? `ERROR: ${result.error}` : result.counts;
};

describe("work group counts", () => {
    it("reads a full set of dimensions", () => expect(counts("8, 8, 1")).toEqual([8, 8, 1]));

    it("allows trailing dimensions to be left off, as @workgroup_size does", () => {
        expect(counts("8, 8")).toEqual([8, 8]);
        expect(counts("16")).toEqual([16]);
    });

    it("reads the interference example's dispatch", () => expect(counts("640, 360, 1")).toEqual([640, 360, 1]));

    it("rejects more dimensions than exist", () => {
        expect(counts("8, 8, 1, 1")).toMatch(/expected at most 3 numbers, but the directive gives 4/);
    });

    it("rejects counts that are not whole numbers of at least one", () => {
        expect(counts("8, 0, 1")).toMatch(/whole number of at least 1, but got 0/);
        expect(counts("8, -2, 1")).toMatch(/whole number of at least 1, but got -2/);
        expect(counts("8.5, 2, 1")).toMatch(/whole number of at least 1, but got 8.5/);
    });

    it("rejects rand, since a count has to be fixed", () => {
        expect(counts("rand(1, 4)")).toMatch(/`rand` cannot set one/);
        expect(counts("8, rand(1, 4), 1")).toMatch(/`rand` cannot set one/);
    });

    it("rejects the grammar's nesting and repetition, which describe nothing here", () => {
        expect(counts("(8, 8), 1")).toMatch(/plain list of numbers/);
        expect(counts("3 * 8")).toMatch(/plain list of numbers/);
    });

    it("rejects text that is not a directive", () => {
        expect(counts("dispatch a lot")).toMatch(/^ERROR/);
        expect(counts("8 8 1")).toMatch(/^ERROR/);
    });
});

describe("vertex counts", () => {
    it("reads a single number", () => expect(counts("6", 1)).toEqual([6]));

    it("rejects more than one", () => {
        expect(counts("6, 6", 1)).toMatch(/expected at most 1 number, but the directive gives 2/);
    });

    it("rejects the same malformed counts as work groups", () => {
        expect(counts("6.5", 1)).toMatch(/whole number of at least 1/);
        expect(counts("rand(3, 9)", 1)).toMatch(/`rand` cannot set one/);
    });
});

describe("texture sizes", () => {
    it("reads a width and a height", () => expect(counts("640, 360", 2)).toEqual([640, 360]));

    it("calls the dimensions whatever the caller calls them", () => {
        expect(matchDirectiveCounts("640, 0", 2, "size")).toEqual({
            type: "error",
            error: "a size has to be a whole number of at least 1, but got 0",
        });
        expect(matchDirectiveCounts("640, 0", 2)).toEqual({
            type: "error",
            error: "a count has to be a whole number of at least 1, but got 0",
        });
    });
});
