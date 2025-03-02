import { Editor } from "@monaco-editor/react";
import React, { useCallback, useEffect, useState } from "react";
import { StructInfo, TypeInfo } from "wgsl_reflect";
import { WgslBinding } from "../../utilities/types";
import { getTypeDisplay, parseValueForType } from "../../utilities/values";

export const BindingDisplay: React.FC<{
    binding: WgslBinding;
    value: string;
    isError: boolean;
    onChange: (value?: string) => void;
    readOnly: boolean;
}> = ({ binding, value, isError, onChange, readOnly }) => (
    <VariableDisplay
        title={binding.name}
        subtitle={`(Group ${binding.group}, Binding ${binding.index})`}
        type={binding.type}
        value={value}
        isError={isError}
        onChange={onChange}
        readOnly={readOnly}
    />
);

export const VariableDisplay: React.FC<{
    title: string;
    subtitle: string;
    type: TypeInfo;
    value: string;
    isError: boolean;
    onChange: (value?: string) => void;
    readOnly: boolean;
}> = ({ title, subtitle, type, value, isError, onChange, readOnly }) => (
    <div className="mr-4">
        <div className="flex justify-between mb-2 ml-4">
            <div className="flex items-center gap-1">
                <pre className="text-sm leading-none bg-slate-100 py-1 px-2 rounded-md">{title}</pre>
                <p className="text-xs italic text-gray-500 leading-none !mb-0">{subtitle}</p>
            </div>
            <p className="text-sm italic !mb-0">{getTypeDisplay(type)}</p>
        </div>
        <Editor
            className={isError ? "border-red-500 border-1" : ""}
            height={value.split("\n").length * 18 + 12}
            defaultLanguage="json"
            value={value}
            options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                scrollbar: { alwaysConsumeMouseWheel: true, vertical: "hidden" },
                readOnly,
            }}
            onChange={onChange}
            beforeMount={(monaco) =>
                monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                    validate: true,
                    allowComments: true,
                    schemaValidation: "error",
                })
            }
        />
    </div>
);

export const useVariableDisplayProps = (
    input: string,
    onUpdate: (value: string, output: ArrayBuffer) => void,
    type: TypeInfo,
    structs: StructInfo[]
) => {
    const [localValue, setLocalValue] = useState(input);
    useEffect(() => setLocalValue(input), [input]);
    const [error, setError] = useState(false);

    const handleChange = useCallback(
        (value: string | undefined) => {
            if (value === undefined) return;

            setLocalValue(value);

            const output = parseValueForType(type, structs, value);
            if (output === null) setError(true);
            else {
                setError(false);
                onUpdate(value, output);
            }
        },
        [type, structs, onUpdate]
    );

    return { value: localValue, isError: error, onChange: handleChange };
};
