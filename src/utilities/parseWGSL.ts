import { ResourceType, VariableInfo, WgslReflect } from "wgsl_reflect";
import { OUTPUT_CANVAS_HEIGHT, OUTPUT_CANVAS_WIDTH } from "./canvas";
import { getDirectiveSource, getRunCounts } from "./directives";
import { singleTarget } from "./runTarget";
import { getStorageTextureSupport } from "./storageTextures";
import { ParseResults, Runnable, RunnableFunction, WgslBinding, WgslTextureBinding } from "./types";
import { WGSLType } from "./WGSLType";

export const getReflectionOrError = (wgsl: string, addToWindow: boolean = false) => {
    try {
        const reflect = new WgslReflect(wgsl);
        if (addToWindow && typeof window !== "undefined") Object.assign(window, { reflect });
        return { type: "reflection" as const, reflect };
    } catch (e) {
        if ("message" in (e as Error) && typeof (e as Error).message === "string") {
            return { type: "error" as const, error: (e as Error).message };
        }
        return { type: "error" as const, error: "Unknown error" };
    }
};

export const parseWGSL = (
    wgsl: string,
): ({ type: "running" } & ParseResults) | { type: "failed-parse"; error: string } => {
    const reflect = getReflectionOrError(wgsl, true);
    if (reflect.type === "error") return { type: "failed-parse", error: reflect.error };

    const bindGroups = reflect.reflect.getBindGroups();
    let error: string | null = null;
    const bindings: (WgslBinding | null)[] = bindGroups.flatMap((bg, groupIdx) =>
        bg.map((binding, bindIdx) => {
            const id = `${groupIdx}:${bindIdx}`;
            const type = new WGSLType(binding.type, reflect.reflect.structs);
            const common = {
                id,
                group: groupIdx,
                index: bindIdx,
                name: binding.name,
                type,
                attributes: binding.attributes,
                directive: getDirectiveSource(binding.attributes, wgsl),
                resourceType: binding.resourceType,
                writable: binding.access === "write" || binding.access === "read_write",
            };

            if (binding.resourceType === ResourceType.StorageTexture) {
                const texture = getTextureBinding(binding, wgsl);
                if (texture.type === "error") {
                    error = texture.error;
                    return null;
                }

                return { ...common, kind: "texture", ...texture.fields };
            }

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

            return { ...common, kind: "buffer", warning: input.warning ?? null, input: input.value, buffer };
        }),
    );
    if (error) return { type: "failed-parse", error };

    const runnables = getFunctionRunOptions(reflect.reflect, wgsl);

    return {
        type: "running",
        structs: reflect.reflect.structs,
        bindings: bindings as WgslBinding[],
        runnables,
        target: singleTarget(runnables[0]),
    };
};

const DEFAULT_THREADS: [number, number, number] = [1, 1, 1];
const DEFAULT_VERTICES = 3;

const getFunctionRunOptions = (reflection: WgslReflect, wgsl: string): Runnable[] => {
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
            const { directive, counts, warning } = getRunCounts(f.attributes, wgsl, 3);
            const threads = DEFAULT_THREADS.map((fallback, idx) => counts?.[idx] ?? fallback) as [
                number,
                number,
                number,
            ];

            return [{ id: `compute-${f.name}`, type: "compute", name: f.name, threads, directive, warning }];
        }

        if (f.stage === "vertex") {
            const { directive, counts, warning } = getRunCounts(f.attributes, wgsl, 1);

            // return [{ id: `render-triangles-${f.name}`, type: "render-triangles", vertex: f.name } as Runnable].concat(
            return fragments.map((frag) => ({
                id: `render-${f.name}-${frag.name}`,
                type: "render",
                vertex: f.name,
                fragment: frag.name,
                vertices: counts?.[0] ?? DEFAULT_VERTICES,
                directive,
                warning,
                useDepthTexture: true,
            }));
        }

        return [];
    });
};

/**
 * A storage texture's size, from the directive comment on its declaration. A texture that does not
 * say how big it is gets the output canvas' size, so that what the shader writes lands one texel to
 * one pixel on the canvas it will be displayed on.
 */
type TextureBindingFields = Pick<WgslTextureBinding, "warning" | "format" | "width" | "height">;

const getTextureBinding = (
    binding: VariableInfo,
    wgsl: string,
): { type: "binding"; fields: TextureBindingFields } | { type: "error"; error: string } => {
    const support = getStorageTextureSupport(binding.type);
    if (support.type === "error") return support;

    const { counts, warning } = getRunCounts(binding.attributes, wgsl, 2, "size");

    return {
        type: "binding",
        fields: {
            warning,
            format: support.format,
            width: counts?.[0] ?? OUTPUT_CANVAS_WIDTH,
            height: counts?.[1] ?? OUTPUT_CANVAS_HEIGHT,
        },
    };
};
