import React, { useCallback, useEffect, useState } from "react";
import { StructInfo, VariableInfo } from "wgsl_reflect";
import { getTypeDisplay, parseValueForType } from "../../utilities/values";
import { useAppState } from "../state";
import { VariableInput } from "./VariableInput";

interface BindingsDisplayProps {
    binding: VariableInfo;
    structs: StructInfo[];
    group: number;
    index: number;
}

export const BindingsDisplay: React.FC<BindingsDisplayProps> = ({ binding, structs, group, index }) => {
    const value = useAppState((state) => state.resources[`${group}:${index}`].input);
    const updateResource = useAppState((state) => state.updateResource);

    const [localValue, setLocalValue] = useState(value);
    useEffect(() => setLocalValue(value), [value]);
    const [error, setError] = useState(false);

    const handleChange = useCallback(
        (value: string | undefined) => {
            if (value === undefined) return;

            setLocalValue(value);

            const output = parseValueForType(binding.type, structs, value);
            if (output === null) setError(true);
            else {
                setError(false);
                updateResource(group, index, value, output);
            }
        },
        [group, index, binding.type, structs, updateResource]
    );

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
            <VariableInput value={localValue} onChange={handleChange} isError={error} />
        </div>
    );
};
