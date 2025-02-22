import { WgslReflect } from "wgsl_reflect";
import { ParseResults, Runnable, WgslBinding } from "./types";
import { getDefaultValue, parseValueForType } from "./values";

const getReflectionOrError = (wgsl: string) => {
    try {
        const reflect = new WgslReflect(wgsl);
        Object.assign(window, { reflect });
        return { type: "reflection" as const, reflect };
    } catch (e) {
        if ("message" in (e as Error) && typeof (e as Error).message === "string") {
            return { type: "error" as const, error: (e as Error).message };
        }
        return { type: "error" as const, error: "Unknown error" };
    }
};

export const parseWGSL = (
    wgsl: string
): ({ type: "running" } & ParseResults) | { type: "failed-parse"; error: string } => {
    const reflect = getReflectionOrError(wgsl);
    if (reflect.type === "error") return { type: "failed-parse", error: reflect.error };

    const bindGroups = reflect.reflect.getBindGroups();
    let error: string | null = null;
    const bindings: (WgslBinding | null)[] = bindGroups.flatMap((bg, groupIdx) =>
        bg.map((binding, bindIdx) => {
            const id = `${groupIdx}:${bindIdx}`;

            const input = getDefaultValue(binding.type, reflect.reflect.structs);
            if (input.type === "error") {
                error = input.value;
                return null;
            }

            const buffer = parseValueForType(binding.type, reflect.reflect.structs, input.value);
            if (buffer === null) {
                error = `Could not parse buffer for binding ${id}`;
                return null;
            }

            return {
                id,
                group: groupIdx,
                index: bindIdx,
                name: binding.name,
                type: binding.type,
                writable: binding.access === "write" || binding.access === "read_write",
                input: input.value,
                buffer,
            };
        })
    );
    if (error) return { type: "failed-parse", error };

    const runnables = getFunctionRunOptions(reflect.reflect);

    return {
        type: "running",
        structs: reflect.reflect.structs,
        bindings: bindings as WgslBinding[],
        runnables,
        selected: runnables[0].id,
    };
};

const getFunctionRunOptions = (reflection: WgslReflect): Runnable[] => {
    const fragments = reflection.functions.filter((f) => f.stage === "fragment");

    return reflection.functions.flatMap((f): Runnable[] => {
        // if (f.stage === null) {
        //     return [{ id: `function-${f.name}`, type: "function", name: f.name }];
        // }

        if (f.stage === "compute") {
            return [{ id: `compute-${f.name}`, type: "compute", name: f.name, threads: [1, 1, 1] }];
        }

        if (f.stage === "vertex") {
            // return [{ id: `render-triangles-${f.name}`, type: "render-triangles", vertex: f.name } as Runnable].concat(
            return fragments.map((frag) => ({
                id: `render-${f.name}-${frag.name}`,
                type: "render",
                vertex: f.name,
                fragment: frag.name,
                vertices: 3,
            }));
        }

        return [];
    });
};
