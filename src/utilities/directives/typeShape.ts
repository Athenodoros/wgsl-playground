import { ArrayInfo, StructInfo, TemplateInfo, TypeInfo } from "wgsl_reflect";
import { range } from "../data";

/**
 * The structure of a type, as a directive has to describe it: which values are single and which are
 * nested, ignoring the padding the buffer layout adds. It walks types in the same order as
 * `getBufferSpec` does in WGSLType, so the values a directive produces land in the same slots.
 */
export type TypeShape =
    | { kind: "scalar"; label: string }
    | { kind: "compound"; label: string; children: TypeShape[] }
    | { kind: "array"; label: string; element: TypeShape; count: number | null };

export const getTypeShape = (type: TypeInfo, structs: StructInfo[], label?: string): TypeShape | null => {
    const display = label ?? getShapeLabel(type);

    const struct = structs.find((s) => s.name === type.name);
    if (struct) {
        const children = struct.members.map((member) => getTypeShape(member.type, structs));
        if (children.some((child) => child === null)) return null;

        return { kind: "compound", label: display, children: children as TypeShape[] };
    }

    if (type.isArray) {
        const arrayType = type as ArrayInfo;
        const element = getTypeShape(arrayType.format, structs);
        if (element === null) return null;

        return { kind: "array", label: display, element, count: arrayType.count || null };
    }

    if (["f32", "u32", "i32"].includes(type.name)) return { kind: "scalar", label: display };
    if (["bool", "f16"].includes(type.name)) return null;

    // Vectors are a row of components; matrices are rows of those, matching getBufferSpec.
    const columns = type.name.startsWith("vec") || type.name.startsWith("mat") ? Number(type.name[3]) : null;
    if (!columns) return null;

    const scalar = (): TypeShape => ({ kind: "scalar", label: display });
    if (type.name.startsWith("vec")) return { kind: "compound", label: display, children: range(columns).map(scalar) };

    const rows = Number(type.name[5]);
    if (!rows) return null;

    return {
        kind: "compound",
        label: display,
        children: range(rows).map(() => ({
            kind: "compound" as const,
            label: `column of ${display}`,
            children: range(columns).map(scalar),
        })),
    };
};

const getShapeLabel = (type: TypeInfo): string => {
    if (type.isArray) {
        const arrayType = type as ArrayInfo;
        return arrayType.count
            ? `array<${getShapeLabel(arrayType.format)}, ${arrayType.count}>`
            : `array<${getShapeLabel(arrayType.format)}>`;
    }

    const template = type as TemplateInfo;
    if ((type.name.startsWith("vec") || type.name.startsWith("mat")) && template.format)
        return `${type.name}<${getShapeLabel(template.format)}>`;

    return type.name;
};

