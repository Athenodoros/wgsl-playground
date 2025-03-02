import { ArrayInfo, StructInfo, TemplateInfo, TypeInfo } from "wgsl_reflect";
import { range, repeat } from "../frontend-utils/general/data";

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

type BufferComponent = "f32" | "u32" | "i32" | "padding";
interface BufferSpec {
    lines: BufferComponent[][];
    repeat: boolean;
}

const getBufferSpec = (type: TypeInfo, structs: StructInfo[]): BufferSpec | null => {
    const struct = structs.find((s) => s.name === type.name);
    if (struct) {
        const lists = struct.members.map((m) => [m, getBufferSpec(m.type, structs)] as const);

        let offset = 0;
        const values: BufferComponent[][] = [];
        for (const idx of range(lists.length)) {
            const [member, list] = lists[idx];
            if (list === null) {
                // console.log(`Could not get struct spec for ${member.name}: ${JSON.stringify(member.type)}`);
                return null;
            }
            const line = list.lines.flat();

            const newOffset = lists[idx + 1] ? lists[idx + 1][0].offset : struct.size;
            const gap = newOffset - offset - member.size;
            const padding = range(gap / 4).map(() => "padding" as const);

            values.push(line.concat(padding));
            offset = newOffset;
        }

        return { lines: values, repeat: false };
    }

    if (type.isArray) {
        const arrayType = type as ArrayInfo;

        const spec = getBufferSpec(arrayType.format, structs);
        if (spec === null) {
            // console.log(`Could not get array spec for ${JSON.stringify(arrayType)}`);
            return null;
        }
        const values = spec.lines.flat();

        const size = arrayType.format.size;
        const stride = arrayType.format.name.startsWith("vec3") ? 16 : arrayType.stride; // Weird bug in wgsl-reflect?
        values.push(...range((stride - size) / 4).map(() => "padding" as const));

        const count = arrayType.count;
        if (!count) return { lines: [values], repeat: true };
        return { lines: range(count).map(() => values), repeat: false };
    }

    switch (type.name) {
        case "bool":
            // console.log("bool not supported due to wgsl-reflect not supporting it for IO");
            return null;
        case "f16":
            // console.log("f16 not supported due to most browsers not handling Float16Arrays yet");
            return null;
        case "f32":
            return { lines: [["f32"]], repeat: false };
        case "u32":
            return { lines: [["u32"]], repeat: false };
        case "i32":
            return { lines: [["i32"]], repeat: false };
    }

    const columns = type.name.startsWith("vec")
        ? Number(type.name[3])
        : type.name.startsWith("mat")
        ? Number(type.name[3])
        : null;
    if (!columns) {
        // console.log(`Unrecognised type: ${type.name}`);
        return null;
    }

    const rows = type.name.startsWith("mat") ? Number(type.name[5]) : 1;
    if (!rows) {
        // console.log(`Could not get rows for ${type.name}`);
        return null;
    }

    const rawType =
        {
            i: "i32",
            u: "u32",
            f: "f32",
        }[type.name[type.name.length - 1]] ??
        (type as TemplateInfo).format?.name ??
        null;
    if (!rows || !columns || !rawType) {
        // console.log(`Could not get dimensions or type for ${type.name}: ${rows} ${columns} ${rawType}`);
        return null;
    }

    return { lines: range(rows).map(() => repeat([rawType as BufferComponent], columns)), repeat: false };
};

const getArrayLine = (line: BufferComponent[], addComma: boolean) =>
    line.map((c) => ({ f32: "1.0", u32: "1", i32: "1", padding: "null" }[c])).join(", ") + (addComma ? "," : "");

type DefaultValueReturn = { type: "error"; error: string } | { type: "values"; value: string };
export const getDefaultValue = (type: TypeInfo, structs: StructInfo[]): DefaultValueReturn => {
    if (["f16", "bool"].includes(type.name))
        return { type: "error", error: `${type.name} not supported due to limited browser support` };
    if (
        [
            "texture_1d",
            "texture_2d",
            "texture_2d_array",
            "texture_3d",
            "texture_cube",
            "texture_cube_array",
            "texture_multisampled_2d",
            "texture_depth_multisampled_2d",
            "texture_external",
            "texture_storage_1d",
            "texture_storage_2d",
            "texture_storage_2d_array",
            "texture_storage_3d",
            "texture_depth_2d",
            "texture_depth_2d_array",
            "texture_depth_cube",
            "texture_depth_cube_array",
            "sampler",
            "sampler_comparison",
        ].includes(type.name)
    )
        return { type: "error", error: `${type.name} not supported` };

    const spec = getBufferSpec(type, structs);
    if (spec === null) return { type: "error", error: `Unknown type: ${type.name}` };

    const struct = structs.find((s) => s.name === type.name);
    if (struct) {
        const lines = struct.members.flatMap((member, idx) => {
            const line = spec.lines[idx];
            const padding = line.filter((c) => c === "padding").length * 4;

            return [
                `// ${member.name}: ${getTypeDisplay(member.type)}${padding ? ` (+${padding} bytes padding)` : ""}`,
                getArrayLine(line, idx !== struct.members.length - 1),
            ];
        });

        const value = "[\n" + lines.map((v) => "    " + v).join("\n") + "\n]";
        return { type: "values", value: value };
    }

    if (type.isArray) {
        const lines = spec.repeat ? repeat(spec.lines, 6) : spec.lines;

        const value =
            lines[0].length === 1
                ? "[ " + lines.map((v) => getArrayLine(v, false)).join(", ") + " ]"
                : "[\n" + lines.map((v) => "    " + getArrayLine(v, false)).join(",\n") + "\n]";

        return { type: "values", value: value };
    }

    if (spec.lines.length === 1) {
        const line = getArrayLine(spec.lines[0], false);
        return { type: "values", value: spec.lines[0].length === 1 ? line : `[ ${line} ]` };
    }

    return {
        type: "values",
        value: `[${spec.lines.map((c) => "    " + getArrayLine(c, false)).join(",\n")}]`,
    };
};

export const parseValueForType = (type: TypeInfo, structs: StructInfo[], value: string): ArrayBuffer | null => {
    const spec = getBufferSpec(type, structs);
    if (spec === null) return null;

    const rawValues = JSON.parse(value.replace(/\/\/[^\n]*\n/g, "\n"));
    const values: (number | null)[] =
        !spec.repeat && spec.lines.length === 1 && spec.lines[0].length === 1 ? [rawValues] : rawValues;

    if (!Array.isArray(values) || values.some((v) => typeof v !== "number" && v !== null)) return null;

    const components = spec.repeat ? repeat(spec.lines[0], values.length / spec.lines[0].length) : spec.lines.flat();
    if (components.length !== values.length) return null;

    const buffer = new ArrayBuffer(components.length * 4);
    const view = new DataView(buffer);

    for (const idx of range(components.length)) {
        const component = components[idx];
        const value = values[idx];
        if (value === null) {
            if (component === "padding") continue;

            // console.log(`Could not parse value for ${JSON.stringify(type)}: unexpected null at index ${idx}`);
            return null;
        }

        if (component === "f32") view.setFloat32(idx * 4, value, true);
        if (component === "u32") view.setUint32(idx * 4, value, true);
        if (component === "i32") view.setInt32(idx * 4, value, true);
    }

    return buffer;
};

export const parseBufferForType = (type: TypeInfo, structs: StructInfo[], buffer: ArrayBuffer): string => {
    const spec = getBufferSpec(type, structs);
    if (spec === null) return "Could not get buffer spec";

    const components = spec.repeat
        ? repeat(spec.lines[0], buffer.byteLength / 4 / spec.lines[0].length)
        : spec.lines.flat();

    const view = new DataView(buffer);
    const values: number[] = Array(components.length).fill(null);
    for (const idx of range(components.length)) {
        switch (components[idx]) {
            case "f32":
                values[idx] = view.getFloat32(idx * 4, true);
                break;
            case "u32":
                values[idx] = view.getUint32(idx * 4, true);
                break;
            case "i32":
                values[idx] = view.getInt32(idx * 4, true);
                break;
        }
    }

    return JSON.stringify(values.length === 1 ? values[0] : values);
};
