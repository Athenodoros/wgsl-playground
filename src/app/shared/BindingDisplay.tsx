import React, { ReactNode } from "react";
import { WgslBinding } from "../../utilities/types";
import { getBindingSubtitle } from "./bindingSubtitle";
import { BindingSummary } from "./BindingSummary";
import { VariableDisplay } from "./VariableDisplay";

export const BindingDisplay: React.FC<{
    binding: WgslBinding;
    value: string;
    isError: boolean;
    onChange?: (value?: string) => void;
    readOnly?: boolean;
    actions?: ReactNode;
}> = ({ binding, value, isError, onChange, readOnly, actions }) => {
    // The playground writes the time in itself on every frame, so there is no value to edit or to
    // show - only what it will hold.
    if (binding.kind === "buffer" && binding.time)
        return (
            <BindingSummary
                binding={binding}
                info="The playground writes the seconds since the last frame into this uniform before every frame, so there is nothing here to edit."
            >
                Seconds since the last frame
            </BindingSummary>
        );

    return (
        <VariableDisplay
            title={binding.name}
            subtitle={getBindingSubtitle(binding)}
            type={binding.type}
            value={value}
            isError={isError}
            onChange={onChange}
            readOnly={readOnly}
            actions={actions}
        />
    );
};
