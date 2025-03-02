import { StructInfo } from "wgsl_reflect";
import { QUALITATIVE_COLOURS } from "../../../utilities/colours";
import { getTypeDisplay } from "../../../utilities/WGSLType";

export const getFieldDisplays = (struct: StructInfo) =>
    struct.members.flatMap((m, idx) => {
        const startColumn = Math.floor(m.offset % 16) / 4;
        const endColumn = Math.floor((m.offset + m.size - 4) % 16) / 4;
        const startRow = Math.floor(m.offset / 16);
        const endRow = Math.floor((m.offset + m.size - 4) / 16);

        const styles: React.CSSProperties = {
            gridArea: `${startRow + 1} / ${startColumn + 1} / ${endRow + 2} / ${endColumn + 2}`,
            backgroundColor: QUALITATIVE_COLOURS[idx % QUALITATIVE_COLOURS.length],
            zIndex: 10,
        };
        const boxes = [{ name: m.name, description: getTypeDisplay(m.type), styles }];

        const nextOffset = idx === struct.members.length - 1 ? struct.size : struct.members[idx + 1].offset;
        const gap = nextOffset - m.offset - m.size;
        if (gap > 0) {
            const paddingStartRow = Math.floor((m.offset + m.size) / 16);
            const paddingStartColumn = Math.floor((m.offset + m.size) % 16) / 4;
            const nextStartRow = Math.floor((nextOffset - 4) / 16);
            const nextStartColumn = Math.floor((nextOffset - 4) % 16) / 4;

            boxes.push({
                name: "padding",
                description: `${gap} bytes`,
                styles: {
                    gridArea: `${paddingStartRow + 1} / ${paddingStartColumn + 1} / ${nextStartRow + 2} / ${
                        nextStartColumn + 2
                    }`,
                    backgroundColor: "oklch(0.704 0.04 256.788)",
                },
            });
        }

        return boxes;
    });
