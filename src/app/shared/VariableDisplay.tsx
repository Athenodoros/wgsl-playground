import { Editor } from "@monaco-editor/react";
import React from "react";
import { WGSLType } from "../../utilities/WGSLType";

export const VariableDisplay: React.FC<{
    title: string;
    subtitle: string;
    type: WGSLType;
    value: string;
    isError: boolean;
    onChange?: (value?: string) => void;
    readOnly?: boolean;
}> = ({ title, subtitle, type, value, isError, onChange, readOnly }) => (
    <div className="mr-4">
        <div className="flex justify-between mb-2 ml-4">
            <div className="flex items-center gap-1">
                <pre className="text-sm leading-none bg-slate-100 py-1 px-2 rounded-md">{title}</pre>
                <p className="text-xs italic text-gray-500 leading-none !mb-0">{subtitle}</p>
            </div>
            <p className="text-sm italic !mb-0">{type.getDisplay()}</p>
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
                readOnly: readOnly ?? onChange === undefined,
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
