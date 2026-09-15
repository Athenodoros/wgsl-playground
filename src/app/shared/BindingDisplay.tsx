import React from "react";
import { WgslBinding } from "../../utilities/types";
import { VariableDisplay, VariableHeader } from "./VariableDisplay";

export const BindingDisplay: React.FC<{
    binding: WgslBinding;
    value: string;
    isError: boolean;
    onChange?: (value?: string) => void;
    readOnly?: boolean;
}> = ({ binding, value, isError, onChange, readOnly }) => {
    const subtitle = `(Group ${binding.group}, Binding ${binding.index})`;

    // The playground writes the time in itself on every frame, so there is no value to edit or to
    // show - only what it will hold.
    if (binding.kind === "buffer" && binding.time)
        return (
            <div className="mr-4">
                <VariableHeader title={binding.name} subtitle={subtitle} type={binding.type} />
                <p className="!mb-0 ml-4 text-sm italic text-slate-400">
                    Filled in by the playground with the seconds since the last frame.
                </p>
            </div>
        );

    return (
        <VariableDisplay
            title={binding.name}
            subtitle={subtitle}
            type={binding.type}
            value={value}
            isError={isError}
            onChange={onChange}
            readOnly={readOnly}
        />
    );
};
