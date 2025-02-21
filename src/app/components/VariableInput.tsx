import { Editor } from "@monaco-editor/react";
import React from "react";

export const VariableInput: React.FC<{
    value: string;
    isError: boolean;
    onChange: (value?: string) => void;
}> = ({ value, isError, onChange }) => {
    return (
        <Editor
            className={isError ? "border-red-500 border-1" : ""}
            height={value.split("\n").length * 18}
            defaultLanguage="json"
            defaultValue={value}
            options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                scrollbar: { handleMouseWheel: false },
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
