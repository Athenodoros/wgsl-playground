import { Editor } from "@monaco-editor/react";
import React from "react";
import { StructInfo, TypeInfo } from "wgsl_reflect";
import { getDefaultValue } from "./values";

export const VariableInput: React.FC<{ type: TypeInfo; structs: StructInfo[] }> = ({ type, structs }) => {
    const value = getDefaultValue(type, structs, true);

    return value.type === "values" ? (
        <Editor
            height={value.value.split("\n").length * 18}
            defaultLanguage="json"
            defaultValue={value.value}
            options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                scrollbar: { handleMouseWheel: false },
            }}
            beforeMount={(monaco) =>
                monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                    validate: true,
                    allowComments: true,
                    schemaValidation: "error",
                })
            }
        />
    ) : (
        <p className="text-sm italic">{value.value}</p>
    );
};
