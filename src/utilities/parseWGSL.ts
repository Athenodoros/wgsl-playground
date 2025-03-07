import { WgslReflect } from "wgsl_reflect";
import { ParseResults, Runnable, RunnableFunction, WgslBinding } from "./types";
import { WGSLType } from "./WGSLType";

export const getReflectionOrError = (wgsl: string, addToWindow: boolean = false) => {
    try {
        const reflect = new WgslReflect(wgsl);
        if (addToWindow) Object.assign(window, { reflect });
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
    const reflect = getReflectionOrError(wgsl, true);
    if (reflect.type === "error") return { type: "failed-parse", error: reflect.error };

    const bindGroups = reflect.reflect.getBindGroups();
    let error: string | null = null;
    const bindings: (WgslBinding | null)[] = bindGroups.flatMap((bg, groupIdx) =>
        bg.map((binding, bindIdx) => {
            const id = `${groupIdx}:${bindIdx}`;
            const type = new WGSLType(binding.type, reflect.reflect.structs);

            const input = type.getDefaultValueForAttributes(binding.attributes, wgsl);
            if (input.type === "error") {
                error = input.error;
                return null;
            }

            const buffer = type.getBufferFromString(input.value);
            if (buffer === null) {
                error = `Could not parse buffer for binding ${id}`;
                return null;
            }

            return {
                id,
                group: groupIdx,
                index: bindIdx,
                name: binding.name,
                type: new WGSLType(binding.type, reflect.reflect.structs),
                attributes: binding.attributes,
                resourceType: binding.resourceType,
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
        selected: runnables[0] ?? null,
    };
};

const getFunctionRunOptions = (reflection: WgslReflect): Runnable[] => {
    const fragments = reflection.functions.filter((f) => f.stage === "fragment");

    return reflection.functions.flatMap((f): Runnable[] => {
        if (f.stage === null) {
            const args = f.arguments.map((arg) => {
                const type = new WGSLType(arg.type, reflection.structs);

                const value = type.getDefaultValue();
                if (value.type === "error") return null;

                const buffer = type.getBufferFromString(value.value);
                if (buffer === null) return null;

                return { name: arg.name, type, input: value.value, buffer };
            });

            if (args.some((a) => a === null)) return [];

            return [
                {
                    id: `function-${f.name}`,
                    type: "function",
                    name: f.name,
                    arguments: args as RunnableFunction["arguments"],
                    output: f.returnType && new WGSLType(f.returnType, reflection.structs),
                    startLine: f.startLine,
                    endLine: f.endLine,
                },
            ];
        }

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
                useDepthTexture: true,
            }));
        }

        return [];
    });
};
