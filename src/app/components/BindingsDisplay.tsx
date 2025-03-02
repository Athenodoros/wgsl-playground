import { SectionCard } from "@blueprintjs/core";
import React, { useCallback } from "react";
import { useAppState } from "../../state";
import { WgslBinding } from "../../utilities/types";
import { RightSection } from "./RightSection";
import { BindingDisplay, useVariableDisplayProps } from "./VariableDisplay";

export const BindingsDisplay: React.FC = () => {
    const bindings = useAppState((state) => state.bindings);

    return (
        <RightSection
            title={`Resource Binding Values (${bindings.length})`}
            icon="property"
            disabled={bindings.length === 0}
            startClosed={false}
        >
            <SectionCard padded={false} className="my-4">
                <div className="flex flex-col gap-4">
                    {bindings.map((binding, index) => (
                        <InnerBindingDisplay key={index} binding={binding} />
                    ))}
                </div>
            </SectionCard>
        </RightSection>
    );
};

const InnerBindingDisplay: React.FC<{ binding: WgslBinding }> = ({ binding }) => {
    const readOnly = useAppState((state) => state.type === "failed-parse" || state.type === "loading");
    const setBindingInput = useAppState((state) => state.setBindingInput);
    const structs = useAppState((state) => state.structs);

    const handleChange = useCallback(
        (value: string, input: ArrayBuffer) => setBindingInput(binding.id, value, input),
        [binding.id, setBindingInput]
    );

    const props = useVariableDisplayProps(binding.input, handleChange, binding.type, structs);

    return <BindingDisplay binding={binding} {...props} readOnly={readOnly} />;
};
