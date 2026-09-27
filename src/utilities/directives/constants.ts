import { Const, Node, Override, WgslExec, WgslParser } from "wgsl_reflect";

/**
 * The constants a shader declares at module scope, for directives that would rather name a size than
 * repeat it:
 *
 *     const CHASERS = 20000u;
 *     const THREADS = 64u;
 *     const GROUPS = (CHASERS + THREADS - 1) / THREADS;
 *
 *     @compute // GROUPS
 *     @workgroup_size(THREADS)
 *     fn step() { }
 *
 * Values come from the WGSL interpreter, so a const is what the shader says it is: `u32` division
 * rounds down, which is why `GROUPS` adds `THREADS - 1` before dividing.
 */
export type ConstantLookup = { type: "value"; value: number } | { type: "error"; error: string };

export interface ShaderConstants {
    /** Whether a name is a const declared at module scope. */
    isConst: (name: string) => boolean;
    /** The value of a const, or why it cannot be used as a single number. */
    read: (name: string) => ConstantLookup;
}

const getErrorMessage = (error: unknown) =>
    error instanceof Error && typeof error.message === "string" ? error.message : "unknown error";

const readConstants = (wgsl: string): ShaderConstants => {
    let ast: Node[] = [];
    let exec: WgslExec | null = null;
    let failure = "the shader could not be parsed";
    try {
        ast = new WgslParser().parse(wgsl);
        exec = new WgslExec(ast);
        exec.execute();
    } catch (error) {
        exec = null;
        failure = getErrorMessage(error);
    }

    const kinds = new Map<string, "const" | "override">();
    for (const node of ast) {
        if (node instanceof Const) kinds.set(node.name, "const");
        else if (node instanceof Override) kinds.set(node.name, "override");
    }

    return {
        isConst: (name) => kinds.get(name) === "const",
        read: (name) => {
            // The interpreter reads an override as its default and a name it does not know as nothing,
            // so what a name is declared as is checked first, to say why it cannot be used.
            const kind = kinds.get(name);
            if (kind === "override")
                return {
                    type: "error",
                    error: `\`${name}\` is an override, which is only settled when a pipeline is made`,
                };
            if (kind === undefined)
                return { type: "error", error: `\`${name}\` is not a const declared in the shader` };
            if (exec === null) return { type: "error", error: `the shader's consts could not be read: ${failure}` };

            const value = exec.getVariableValue(name);
            if (typeof value !== "number") return { type: "error", error: `\`${name}\` is not a single number` };

            return { type: "value", value };
        },
    };
};

// Every entry point and texture reads the same shader's constants on each parse, so the last shader's
// are kept rather than parsed and run again for every directive in it.
let cached: { wgsl: string; constants: ShaderConstants } | null = null;

export const getShaderConstants = (wgsl: string): ShaderConstants => {
    if (cached?.wgsl !== wgsl) cached = { wgsl, constants: readConstants(wgsl) };
    return cached.constants;
};
