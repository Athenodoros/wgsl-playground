import { ArrayInfo, StructInfo, TemplateInfo, TypeInfo } from "wgsl_reflect";
import { range } from "../utilities/data";

export const getTypeDisplay = (type: TypeInfo): string => {
    if (type.name === "array") {
        const arrayType = type as ArrayInfo;
        return arrayType.count
            ? `array<${getTypeDisplay(arrayType.format)}, ${arrayType.count}>`
            : `array<${getTypeDisplay(arrayType.format)}>`;
    }

    if (type.name.startsWith("vec") || type.name.startsWith("mat")) {
        if (["f", "i", "u", "h"].includes(type.name[type.name.length - 1])) {
            return type.name;
        } else {
            const vecType = type as TemplateInfo;
            if (!vecType.format) return type.name;
            return `${type.name}<${getTypeDisplay(vecType.format)}>`;
        }
    }

    return type.name;
};

type DefaultValueReturn = { type: "error"; value: string } | { type: "values"; value: string };
export const getDefaultValue = (type: TypeInfo, structs: StructInfo[], isTopLevel: boolean): DefaultValueReturn => {
    /**
     * Every one is giant list - no nested lists.
     * Includes padding to alignment values
     *
     * If top-level struct, do:
     *      [
     *          defaultValue, // field name
     *          defaultValue, // field name
     *          ...
     *      ]
     *
     * If top-level array/vector of basic types (f32, f16, u32, i32, bool), do (with 6 repetitions, unless specific length is given):
     *      [defaultValue, defaultValue, ...]
     *
     * If top-level array/vector of structs/fixed-length arrays/matrices (or matrix), do (with 6 repetitions, unless specific length is given):
     *      [
     *          defaultValue, // $PADDING_EXPLANATION_IF_RELEVANT
     *          defaultValue,
     *          defaultValue,
     *          ...
     *      ]
     *
     * If basic type, just output the default value:
     *      defaultValue
     *
     * If not top-level, just output the default values, for nesting into top-level arrays/vectors/matrices:
     *      defaultValue, defaultValue, ...
     */

    const struct = structs.find((s) => s.name === type.name);
    if (struct) {
        const results = struct.members.map((member) => [member, getDefaultValue(member.type, structs, false)] as const);

        let offset = 0;
        const values: [string, string][] = [];
        for (const idx of range(results.length)) {
            const [member, result] = results[idx];
            if (result.type === "error") return result;

            const newOffset = results[idx + 1] ? results[idx + 1][0].offset : struct.size;
            const gap = (newOffset - offset - member.size) / 4;
            const padding = range(gap)
                .map(() => "-1")
                .join(", ");
            values.push([
                `${member.name}: ${getTypeDisplay(member.type)}${gap ? ` (+${gap * 4} bytes padding)` : ""}`,
                result.value + (padding ? `, ${padding}` : ""),
            ]);
            offset = newOffset;
        }

        if (isTopLevel) {
            return {
                type: "values",
                value: "[\n" + values.flatMap((v) => ["    // " + v[0], "    " + v[1]]).join("\n") + "\n]",
            };
        } else {
            return { type: "values", value: values.map((v) => v[1]).join(", ") };
        }
    }

    if (type.isArray) {
        const arrayType = type as ArrayInfo;

        const value = getDefaultValue(arrayType.format, structs, false);
        if (value.type === "error") return value;

        const size = arrayType.format.size;
        const stride = arrayType.format.name.startsWith("vec3") ? 16 : arrayType.stride; // Weird bug in wgsl-reflect?
        const count = arrayType.count || 6;

        const padding = range((stride - size) / 4)
            .map(() => "-1")
            .join(", ");

        const values = range(count).map(() => value.value + (padding ? `, ${padding}` : ""));
        if (isTopLevel && value.value.length > 3) {
            return { type: "values", value: "[\n" + values.map((v) => "    " + v).join(",\n") + "\n]" };
        } else if (isTopLevel) {
            return { type: "values", value: "[ " + values.join(", ") + " ]" };
        } else {
            return { type: "values", value: values.join(", ") };
        }
    }

    if (type.name === "bool") {
        return { type: "values", value: "true" };
    }

    if (["f16", "f32"].includes(type.name)) {
        return { type: "values", value: "1.0" };
    }

    if (["u32", "i32"].includes(type.name)) {
        return { type: "values", value: "1" };
    }

    const templateValue = ["i", "u"].includes(type.name[type.name.length - 1])
        ? "1"
        : ["f", "h"].includes(type.name[type.name.length - 1])
        ? "1.0"
        : (type as TemplateInfo).format?.name === "f32"
        ? "1.0"
        : (type as TemplateInfo).format?.name === "f16"
        ? "1.0"
        : (type as TemplateInfo).format?.name === "u32"
        ? "1"
        : (type as TemplateInfo).format?.name === "i32"
        ? "1"
        : (type as TemplateInfo).format?.name === "bool"
        ? "true"
        : null;

    if (!templateValue) return { type: "error", value: `Unknown type: ${JSON.stringify(type)}` };

    if (type.name.startsWith("vec")) {
        const length = Number(type.name[3]);
        return {
            type: "values",
            value: range(length)
                .map(() => templateValue)
                .join(", "),
        };
    }

    if (type.name.startsWith("mat")) {
        const cols = Number(type.name[3]);
        const rows = Number(type.name[5]);

        if (isTopLevel) {
            return {
                type: "values",
                value:
                    "[\n" +
                    range(rows)
                        .map(() =>
                            range(cols)
                                .map(() => templateValue)
                                .join(", ")
                        )
                        .join(",\n") +
                    "\n]",
            };
        } else {
            return {
                type: "values",
                value: range(rows)
                    .flatMap(() => range(cols).map(() => templateValue))
                    .join(", "),
            };
        }
    }

    return { type: "error", value: `Unknown type: ${JSON.stringify(type)}` };
};
