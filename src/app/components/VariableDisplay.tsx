import { Editor } from "@monaco-editor/react";
import React from "react";
import { TypeInfo } from "wgsl_reflect";
import { WgslBinding } from "../../utilities/types";
import { getTypeDisplay } from "../../utilities/values";

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
        <VariableInput value={value} onChange={onChange} isError={isError} readOnly={readOnly} />
    </div>
);

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
