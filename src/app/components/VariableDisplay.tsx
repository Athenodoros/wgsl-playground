import { Editor } from "@monaco-editor/react";
import React from "react";
import { WgslBinding } from "../../utilities/types";
import { getTypeDisplay } from "../../utilities/values";

export const VariableDisplay: React.FC<{
    binding: WgslBinding;
    value: string;
    isError: boolean;
    onChange: (value?: string) => void;
    readOnly: boolean;
}> = ({ binding, value, isError, onChange, readOnly }) => (
    <div className="mr-4">
        <div className="flex justify-between mb-2 ml-4">
            <div className="flex items-center gap-1">
                <pre className="text-sm leading-none bg-slate-100 py-1 px-2 rounded-md">{binding.name}</pre>
                <p className="text-xs italic text-gray-500 leading-none !mb-0">
                    (Group {binding.group}, Binding {binding.index})
                </p>
            </div>
            <p className="text-sm italic !mb-0">{getTypeDisplay(binding.type)}</p>
        </div>
        <VariableInput value={value} onChange={onChange} isError={isError} readOnly={readOnly} />
    </div>
);

const VariableInput: React.FC<{
    value: string;
    isError: boolean;
    onChange: (value?: string) => void;
    readOnly: boolean;
}> = ({ value: value, isError, onChange, readOnly }) => {
    return (
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
    );
};
