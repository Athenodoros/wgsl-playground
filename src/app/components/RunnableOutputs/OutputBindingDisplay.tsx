import { Button } from "@blueprintjs/core";
import React, { useState } from "react";
import { useAppState } from "../../../state";
import { copyText } from "../../../utilities/clipboard";
import {
    canRenderBuffer,
    describeBufferLength,
    isLargeBuffer,
    LARGE_BUFFER_ROWS,
    RENDERABLE_BUFFER_ROWS,
} from "../../../utilities/largeBuffers";
import { BindingOutput } from "../../../utilities/types";
import { AppToaster } from "../../shared/AppToaster";
import { BindingDisplay } from "../../shared/BindingDisplay";
import { BindingSummary } from "../../shared/BindingSummary";

/**
 * A buffer as a run left it. A large one is not read back unless it is asked to be shown, so it is
 * summarised by its length, with its values a copy away.
 */
export const OutputBindingDisplay: React.FC<{ output: BindingOutput }> = ({ output: { binding, value } }) => {
    const rendered = useAppState((state) => state.renderedOutputs.includes(binding.id));
    const setOutputRendered = useAppState((state) => state.setOutputRendered);

    if (!isLargeBuffer(binding)) return <BindingDisplay binding={binding} value={value ?? ""} isError={false} />;

    // A rendered output is summarised until the read that includes it lands.
    if (rendered && canRenderBuffer(binding) && value !== null)
        return (
            <BindingDisplay
                binding={binding}
                value={value}
                isError={false}
                actions={
                    <Button
                        size="small"
                        variant="minimal"
                        icon="eye-off"
                        onClick={() => setOutputRendered(binding.id, false)}
                    >
                        Hide Output
                    </Button>
                }
            />
        );

    return <LargeOutputSummary output={{ binding, value }} rendering={rendered} />;
};

const LargeOutputSummary: React.FC<{ output: BindingOutput; rendering: boolean }> = ({
    output: { binding },
    rendering,
}) => {
    const setOutputRendered = useAppState((state) => state.setOutputRendered);
    const readOutput = useAppState((state) => state.readOutput);
    const [copying, setCopying] = useState(false);
    const renderable = canRenderBuffer(binding);

    const copy = async () => {
        setCopying(true);
        try {
            await copyText(readOutput(binding.id));
            AppToaster.show({
                message: `Copied ${describeBufferLength(binding)} from ${binding.name}.`,
                intent: "success",
                icon: "tick",
            });
        } catch {
            AppToaster.show({
                message: `Could not copy ${binding.name}. Check your browser’s clipboard permissions and try again.`,
                intent: "danger",
                icon: "error",
            });
        } finally {
            setCopying(false);
        }
    };

    return (
        <BindingSummary
            binding={binding}
            info={
                <>
                    Buffers over {LARGE_BUFFER_ROWS} rows are not read back after a run, which for a loop can take
                    longer than running it. Copy Values reads them from the GPU as the last frame left them.{" "}
                    {renderable
                        ? "Render Output reads them back after every run, and shows them."
                        : `Buffers over ${RENDERABLE_BUFFER_ROWS} rows cannot be shown at all.`}
                </>
            }
            actions={
                <>
                    {renderable ? (
                        <Button
                            size="small"
                            variant="outlined"
                            icon="eye-open"
                            loading={rendering}
                            onClick={() => setOutputRendered(binding.id, true)}
                        >
                            Render Output
                        </Button>
                    ) : null}
                    <Button size="small" variant="outlined" icon="duplicate" loading={copying} onClick={copy}>
                        Copy Values
                    </Button>
                </>
            }
        >
            {describeBufferLength(binding)}
        </BindingSummary>
    );
};
