import { WgslReflect } from "wgsl_reflect";
import { fromPairs } from "../frontend-utils/general/data";
import { getDefaultValue, parseValueForType } from "./values";

export type ParseResult = { type: "reflection"; reflection: WgslReflect } | { type: "error"; error: string };
export type Resource = { input: string; output: ArrayBuffer };

const getReflection = (wgsl: string): ParseResult => {
    try {
        const reflection = new WgslReflect(wgsl);
        Object.assign(window, { reflection });
        return { type: "reflection", reflection };
    } catch (e) {
        if ("message" in (e as Error) && typeof (e as Error).message === "string") {
            return { type: "error", error: (e as Error).message };
        }
        return { type: "error", error: "Unknown error" };
    }
};

export const parseWGSL = (wgsl: string): { parsed: ParseResult; resources: Record<string, Resource> } => {
    const parsed = getReflection(wgsl);
    const resources =
        parsed.type === "reflection"
            ? fromPairs(
                  parsed.reflection.getBindGroups().flatMap((bg, bgIndex) =>
                      bg.map((b, bIndex) => {
                          const input = getDefaultValue(b.type, parsed.reflection.structs);
                          if (input.type === "error") throw new Error(input.value);

                          const output = parseValueForType(b.type, parsed.reflection.structs, input.value);
                          return [`${bgIndex}:${bIndex}`, { input: input.value, output }] as [string, Resource];
                      })
                  )
              )
            : {};
    return { parsed, resources };
};

export type RunnerFunctionOption =
    | { id: string; type: "compute"; name: string; threads: [number, number, number] }
    | { id: string; type: "function"; name: string }
    | { id: string; type: "render-triangles"; vertex: string }
    | { id: string; type: "render"; vertex: string; fragment: string; vertices: number };

export const getFunctionRunOptions = (reflection: WgslReflect) => {
    const fragments = reflection.functions.filter((f) => f.stage === "fragment");

    return reflection.functions.flatMap((f): RunnerFunctionOption[] => {
        if (f.stage === null) {
            return [{ id: `function-${f.name}`, type: "function", name: f.name }];
        }

        if (f.stage === "compute") {
            return [{ id: `compute-${f.name}`, type: "compute", name: f.name, threads: [1, 1, 1] }];
        }

        if (f.stage === "vertex") {
            return [
                { id: `render-triangles-${f.name}`, type: "render-triangles", vertex: f.name } as RunnerFunctionOption,
            ].concat(
                fragments.map((frag) => ({
                    id: `render-${f.name}-${frag.name}`,
                    type: "render",
                    vertex: f.name,
                    fragment: frag.name,
                    vertices: 3,
                }))
            );
        }

        return [];
    });
};
