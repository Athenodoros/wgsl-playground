import { WgslReflect } from "wgsl_reflect";
import { fromPairs } from "./data";
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
