import React from "react";
import { StructInfo } from "wgsl_reflect";
import { getTypeDisplay } from "./values";

export const StructDisplay: React.FC<{ struct: StructInfo }> = ({ struct }) => {
    const rows = Math.ceil(struct.size / 16);

    const entries = struct.members.flatMap((m, idx) => {
        const startColumn = Math.floor(m.offset % 16) / 4;
        const endColumn = Math.floor((m.offset + m.size - 4) % 16) / 4;
        const startRow = Math.floor(m.offset / 16);
        const endRow = Math.floor((m.offset + m.size - 4) / 16);

        const styles: React.CSSProperties = {
            gridArea: `${startRow + 1} / ${startColumn + 1} / ${endRow + 2} / ${endColumn + 2}`,
            backgroundColor: COLOURS[idx % COLOURS.length],
            zIndex: 10,
        };
        const boxes = [
            {
                name: m.name,
                description: getTypeDisplay(m.type),
                styles,
            },
        ];

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

    return (
        <div key={struct.name}>
            <p className="text-sm font-bold">
                {struct.name}: {struct.size} bytes
            </p>
            <div className="flex justify-between">
                <div className="flex flex-col gap-2">
                    {entries
                        .filter((m) => m.name !== "padding")
                        .map((m) => (
                            <span key={m.name} className="flex gap-1 items-center">
                                <span
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: m.styles.backgroundColor }}
                                />
                                <p key={m.name} className="text-sm leading-none !mb-0">
                                    {m.name}
                                </p>
                                <p className="text-sm italic text-slate-500 leading-none !mb-0">{m.description}</p>
                            </span>
                        ))}
                </div>
                <div
                    className="grid gap-1"
                    style={{
                        gridTemplateRows: `repeat(${rows}, 20px)`,
                        gridTemplateColumns: `repeat(4, 20px)`,
                    }}
                >
                    {entries.map((m) => (
                        <div key={m.name} className="bg-slate-300 rounded-lg" style={m.styles} />
                    ))}
                </div>
            </div>
        </div>
    );
};

// Blueprint qualitative colour palette
const COLOURS = [
    "#147EB3",
    "#29A634",
    "#D1980B",
    "#D33D17",
    "#9D3F9D",
    "#00A396",
    "#DB2C6F",
    "#8EB125",
    "#946638",
    "#7961DB",
];
