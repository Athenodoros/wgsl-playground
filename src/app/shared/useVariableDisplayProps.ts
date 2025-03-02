import { useCallback, useEffect, useState } from "react";
import { WGSLType } from "../../utilities/WGSLType";

export const useVariableDisplayProps = (
    input: string,
    onUpdate: (value: string, output: ArrayBuffer) => void,
    type: WGSLType
) => {
    const [localValue, setLocalValue] = useState(input);
    useEffect(() => setLocalValue(input), [input]);
    const [error, setError] = useState(false);

    const handleChange = useCallback(
        (value: string | undefined) => {
            if (value === undefined) return;

            setLocalValue(value);

            const output = type.getBufferFromString(value);
            if (output === null) setError(true);
            else {
                setError(false);
                onUpdate(value, output);
            }
        },
        [type, onUpdate]
    );

    return { value: localValue, isError: error, onChange: handleChange };
};
