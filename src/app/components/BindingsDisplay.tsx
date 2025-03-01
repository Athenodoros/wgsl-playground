import { SectionCard } from "@blueprintjs/core";
import React, { useCallback, useEffect, useState } from "react";
import { useAppState } from "../../state";
import { WgslBinding } from "../../utilities/types";
import { parseValueForType } from "../../utilities/values";
import { RightSection } from "./RightSection";
import { BindingDisplay } from "./VariableDisplay";

export const BindingsDisplay: React.FC = () => {
    const bindings = useAppState((state) => state.bindings);

    return (
        <RightSection
            title={`Resource Binding Values (${bindings.length})`}
            icon="property"
            disabled={bindings.length === 0}
            startClosed={true}
        >
            <SectionCard padded={false} className="my-4">
                <div className="flex flex-col gap-4">
                    {bindings.map((binding, index) => (
                        <BindingDisplay key={index} binding={binding} />
                    ))}
                </div>
            </SectionCard>
        </RightSection>
    );
};

const BindingDisplay: React.FC<{ binding: WgslBinding }> = ({ binding }) => {
    const readOnly = useAppState((state) => state.type === "failed-parse" || state.type === "loading");
    const setBindingInput = useAppState((state) => state.setBindingInput);
    const structs = useAppState((state) => state.structs);

    const [localValue, setLocalValue] = useState(binding.input);
    useEffect(() => setLocalValue(binding.input), [binding.input]);
    const [error, setError] = useState(false);

    const handleChange = useCallback(
        (value: string | undefined) => {
            if (value === undefined) return;

            setLocalValue(value);

            const output = parseValueForType(binding.type, structs, value);
            if (output === null) setError(true);
            else {
                setError(false);
                setBindingInput(binding.id, value, output);
            }
        },
        [binding.id, binding.type, structs, setBindingInput]
    );

    return (
        <BindingDisplay
            binding={binding}
            value={localValue}
            isError={error}
            onChange={handleChange}
            readOnly={readOnly}
        />
    );
};
