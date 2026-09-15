import { describe, expect, it } from "vitest";
import { targetRunnables, toggleRunnable } from "./runTarget";
import { RunTarget, RunnableComputeShader, RunnableRender } from "./types";

const compute = (name: string): RunnableComputeShader => ({
    id: `compute-${name}`,
    type: "compute",
    name,
    threads: [1, 1, 1],
    directive: null,
    warning: null,
});

const RENDER: RunnableRender = {
    id: "render-vertex_main-fragment_main",
    type: "render",
    vertex: "vertex_main",
    fragment: "fragment_main",
    vertices: 3,
    directive: null,
    warning: null,
    useDepthTexture: true,
};

const picked = (target: RunTarget) => targetRunnables(target).map((runnable) => runnable.id);

describe("toggleRunnable", () => {
    it("accumulates compute passes in the order they are picked, and replaces for anything else", () => {
        const [first, second] = [compute("first"), compute("second")];

        const one = toggleRunnable({ type: "none" }, first);
        expect(picked(one)).toEqual(["compute-first"]);

        const both = toggleRunnable(one, second);
        expect(picked(both)).toEqual(["compute-first", "compute-second"]);

        // Picking one that is already in the target takes it out, which is how a chain is shortened.
        const shortened = toggleRunnable(both, first);
        expect(picked(shortened)).toEqual(["compute-second"]);

        // A render pass cannot run alongside anything, so picking one drops the chain entirely.
        const render = toggleRunnable(shortened, RENDER);
        expect(picked(render)).toEqual(["render-vertex_main-fragment_main"]);

        expect(toggleRunnable(render, RENDER).type).toBe("none");
    });
});
