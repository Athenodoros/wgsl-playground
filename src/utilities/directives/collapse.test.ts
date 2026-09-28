import { describe, expect, it } from "vitest";
import { hasCollapseSections } from "./collapse";

describe("the collapse sections comment", () => {
    it("is read from a line of its own, with two slashes or three", () => {
        expect(hasCollapseSections("// playground-collapse-sections\nfn main() {}")).toBe(true);
        expect(hasCollapseSections("fn main() {}\n    ///   playground-collapse-sections  \n")).toBe(true);
    });

    it("is not read from prose, or from the end of a line of code", () => {
        expect(hasCollapseSections("fn main() {}")).toBe(false);
        expect(hasCollapseSections("// mentions playground-collapse-sections in passing")).toBe(false);
        expect(hasCollapseSections("fn main() {} // playground-collapse-sections")).toBe(false);
    });
});
