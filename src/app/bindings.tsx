import React from "react";
import { StructInfo, VariableInfo } from "wgsl_reflect";
import { VariableInput } from "./inputs";
import { getTypeDisplay } from "./values";

interface BindGroupDisplayProps {
    binding: VariableInfo;
    structs: StructInfo[];
    group: number;
    index: number;
}

export const BindGroupDisplay: React.FC<BindGroupDisplayProps> = ({ binding, structs, group, index }) => {
    return (
        <div className="mr-4">
            <div className="flex justify-between mb-1 ml-4">
                <div className="flex items-end gap-1">
                    <p className="text-sm font-bold leading-none">{binding.name}</p>
                    <p className="text-xs italic text-gray-500 leading-none">
                        (Group {group}, Binding {index})
                    </p>
                </div>
                <p className="text-sm italic">{getTypeDisplay(binding.type)}</p>
            </div>
            <VariableInput type={binding.type} structs={structs} />
        </div>
    );
};
