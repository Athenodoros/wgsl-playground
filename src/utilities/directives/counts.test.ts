import { describe, expect, it } from "vitest";
import { getRunCounts, matchDirectiveCounts } from "./counts";

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

    it("rejects the value grammar's nesting and repetition, which describe nothing here", () => {
        expect(counts("(8, 8), 1")).toMatch(/plain list of numbers and consts/);
        expect(counts("3 * 8")).toMatch(/plain list of numbers and consts/);
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

describe("counts named by the shader's consts", () => {
    const SHADER = `
const CHASERS = 20000u;
const THREADS = 64u;
const GROUPS = (CHASERS + THREADS - 1) / THREADS;
const EMPTY = CHASERS - 20000;
const SPREAD = 2.5;
const CORNER = vec2(1, 2);
override TUNED = 7u;
fn step() { const LOCAL = 4u; }
`;
    const counts = (comment: string, dimensions = 3) => {
        const result = matchDirectiveCounts(comment, dimensions, "count", SHADER);
        return result.type === "error" ? `ERROR: ${result.error}` : result.counts;
    };

    it("reads consts alongside numbers", () => {
        expect(counts("CHASERS")).toEqual([20000]);
        expect(counts("THREADS, 2, 1")).toEqual([64, 2, 1]);
    });

    it("takes a const's value as the shader works it out, dividing as WGSL does", () => {
        expect(counts("GROUPS")).toEqual([313]);
    });

    it("leaves arithmetic to the consts, so that `*` only ever means one thing in a comment", () => {
        expect(counts("CHASERS / THREADS")).toMatch(/anything worked out belongs in a const/);
        expect(counts("GROUPS * 2")).toMatch(/anything worked out belongs in a const/);
    });

    it("says what a const is when it is not a count", () => {
        expect(counts("EMPTY")).toMatch(/but `EMPTY` is 0/);
        expect(counts("SPREAD")).toMatch(/but `SPREAD` is 2.5/);
    });

    it("refuses names that are not module-scope consts", () => {
        expect(counts("CHASER")).toMatch(/`CHASER` is not a const declared in the shader/);
        expect(counts("LOCAL")).toMatch(/`LOCAL` is not a const declared in the shader/);
        expect(counts("TUNED")).toMatch(/`TUNED` is an override/);
        expect(counts("CORNER")).toMatch(/`CORNER` is not a single number/);
    });

    it("refuses dimensions run together or left out", () => {
        expect(counts("CHASERS THREADS")).toMatch(
            /`CHASERS THREADS` is not a number or a const - counts are separated by commas/,
        );
        expect(counts("8,, 1")).toMatch(/a dimension is missing between commas/);
    });
});

describe("finding a count directive", () => {
    const shader = (comment: string, chasers = "20000u") => `
const GROUPS = ${chasers} / 64;
@compute // ${comment}
@workgroup_size(64)
fn step() {}
`;
    const runCounts = (wgsl: string) => getRunCounts([{ line: 3 } as never], wgsl, 3);

    it("takes a comment naming a const as a directive, though it has no digits", () => {
        expect(runCounts(shader("GROUPS")).counts).toEqual([312]);
    });

    it("still passes over prose", () => {
        expect(runCounts(shader("one per chaser"))).toEqual({ directive: null, counts: null, warning: null });
    });

    it("tells a directive apart by what its consts came to, since they can change without it", () => {
        expect(runCounts(shader("GROUPS")).directive).toBe("GROUPS = 312");
        expect(runCounts(shader("GROUPS", "40000u")).directive).toBe("GROUPS = 625");
        expect(runCounts(shader("8, 8")).directive).toBe("8, 8");
    });
});
