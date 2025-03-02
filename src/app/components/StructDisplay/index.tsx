import { SectionCard } from "@blueprintjs/core";
import React from "react";
import { StructInfo } from "wgsl_reflect";
import { useAppState } from "../../../state";
import { RightSection } from "../../shared/RightSection";
import { getFieldDisplays } from "./getFieldDisplays";

export const StructDisplay: React.FC = () => {
    const structs = useAppState((state) => state.structs);

    return (
        <RightSection
            title={`Struct Layouts (${structs.length})`}
            icon="curly-braces"
            disabled={structs.length === 0}
            startClosed={false}
        >
            <SectionCard padded={true}>
                {structs.map((s) => (
                    <SingleStructDisplay key={s.name} struct={s} />
                ))}
            </SectionCard>
        </RightSection>
    );
};

const SingleStructDisplay: React.FC<{ struct: StructInfo }> = ({ struct }) => {
    const rows = Math.ceil(struct.size / 16);

    const entries = getFieldDisplays(struct);

    return (
        <div key={struct.name}>
            <p className="text-sm font-bold">
                {struct.name}: {struct.size} bytes
            </p>
            <div className="flex justify-between">
                <div className="flex flex-col gap-2">
                    {entries
                        .filter((m) => m.name !== "padding")
                        .map((m, idx) => (
                            <span key={idx} className="flex gap-1 items-center">
                                <span
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: m.styles.backgroundColor }}
                                />
                                <p className="text-sm leading-none !mb-0">{m.name}</p>
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
