import React from "react";
import { WgslBinding } from "../../utilities/types";
import { VariableDisplay } from "./VariableDisplay";

export const BindingDisplay: React.FC<{
    binding: WgslBinding;
    value: string;
    isError: boolean;
    onChange?: (value?: string) => void;
    readOnly?: boolean;
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
