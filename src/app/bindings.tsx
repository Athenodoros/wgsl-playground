import React from "react";
import { StructInfo, VariableInfo } from "wgsl_reflect";
import { VariableInput } from "./inputs";
import { getTypeDisplay } from "./values";

interface BindGroupDisplayProps {
    bg: VariableInfo[];
    structs: StructInfo[];
    index: number;
}

export const BindGroupDisplay: React.FC<BindGroupDisplayProps> = ({ bg, structs, index }) => {
    return (
        <div className="border-l-1 pl-2 pr-2">
            <p className="text-sm font-bold">Binding Group {index}</p>
            {bg.map((binding, j) => (
                <div key={j} className="pl-2">
                    <div key={j} className="flex justify-between mt-3 mb-1">
                        <p className="text-sm">
                            {j}: {binding.name}
                        </p>
                        <p className="text-sm">{getTypeDisplay(binding.type)}</p>
                    </div>
                    <VariableInput type={binding.type} structs={structs} />
                </div>
            ))}
        </div>
    );
};
