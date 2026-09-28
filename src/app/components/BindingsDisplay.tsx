import { Button, Callout, SectionCard } from "@blueprintjs/core";
import React, { useCallback, useState } from "react";
import { useAppState } from "../../state";
import {
    canRenderBuffer,
    describeBufferLength,
    isLargeBuffer,
    LARGE_BUFFER_ROWS,
    LARGE_TEXT_CHARS,
} from "../../utilities/largeBuffers";
import { WgslBinding, WgslBufferBinding } from "../../utilities/types";
import { AppToaster } from "../shared/AppToaster";
import { BindingDisplay } from "../shared/BindingDisplay";
import { BindingSummary } from "../shared/BindingSummary";
import { RightSection } from "../shared/RightSection";
import { TextureBindingDisplay } from "../shared/TextureBindingDisplay";
import { useVariableDisplayProps } from "../shared/useVariableDisplayProps";

export const BindingsDisplay: React.FC = () => {
    const bindings = useAppState((state) => state.bindings);

    return (
        <RightSection
            followsCollapseComment
            title={`Resource Binding Values (${bindings.length})`}
            icon="property"
            disabled={bindings.length === 0}
            startClosed={false}
        >
            {bindings.length ? (
                <SectionCard padded={false} className="my-4">
                    <div className="flex flex-col gap-4">
                        {bindings.map((binding, index) => (
                            <InnerBindingDisplay key={index} binding={binding} />
                        ))}
                    </div>
                </SectionCard>
            ) : null}
        </RightSection>
    );
};

const InnerBindingDisplay: React.FC<{ binding: WgslBinding }> = ({ binding }) => (
    <div className="flex flex-col gap-2">
        {binding.kind === "texture" ? (
            <TextureBindingDisplay binding={binding} />
        ) : (
            <BufferBindingDisplay binding={binding} />
        )}
        {binding.warning ? (
            <div className="mx-4">
                <Callout intent="warning" icon="warning-sign" compact={true}>
                    {binding.warning}
                </Callout>
            </div>
        ) : null}
    </div>
);

const BufferBindingDisplay: React.FC<{ binding: WgslBufferBinding }> = ({ binding }) => {
    const readOnly = useAppState((state) => state.type === "failed-parse" || state.type === "loading");
    const setBindingInput = useAppState((state) => state.setBindingInput);

    const handleChange = useCallback(
        (value: string, input: ArrayBuffer) => setBindingInput(binding.id, value, input),
        [binding.id, setBindingInput],
    );

    const props = useVariableDisplayProps(binding.input, handleChange, binding.type);

    // Showing a large input as text is a choice made for this binding while it is on screen, and it
    // changes nothing about the run, so it is kept here rather than in the app's state.
    const [rendered, setRendered] = useState(false);
    const large = isLargeBuffer(binding, binding.input);

    if (large && !(rendered && canRenderBuffer(binding)))
        return <LargeInputSummary binding={binding} readOnly={readOnly} render={() => setRendered(true)} />;

    return (
        <BindingDisplay
            binding={binding}
            {...props}
            readOnly={readOnly}
            actions={
                large ? (
                    <Button size="small" variant="minimal" icon="eye-off" onClick={() => setRendered(false)}>
                        Hide Input
                    </Button>
                ) : undefined
            }
        />
    );
};

const LargeInputSummary: React.FC<{ binding: WgslBufferBinding; readOnly: boolean; render: () => void }> = ({
    binding,
    readOnly,
    render,
}) => {
    const setBindingInput = useAppState((state) => state.setBindingInput);
    const renderable = canRenderBuffer(binding);

    const paste = async () => {
        let text: string;
        try {
            text = await navigator.clipboard.readText();
        } catch {
            AppToaster.show({
                message: "Could not read the clipboard. Check your browser’s clipboard permissions and try again.",
                intent: "danger",
                icon: "error",
            });
            return;
        }

        const buffer = binding.type.getBufferFromString(text);
        if (buffer === null) {
            AppToaster.show({
                message: `The clipboard does not hold values for ${binding.name}. Paste JSON in the layout a smaller binding is shown in, or that Copy Values gives for an output.`,
                intent: "warning",
                icon: "warning-sign",
            });
            return;
        }

        setBindingInput(binding.id, text, buffer);
        AppToaster.show({
            message: `Pasted ${describeBufferLength({ ...binding, buffer })} into ${binding.name}.`,
            intent: "success",
            icon: "tick",
        });
    };

    return (
        <BindingSummary
            binding={binding}
            info={
                <>
                    Buffers over {LARGE_BUFFER_ROWS} rows, or {LARGE_TEXT_CHARS.toLocaleString("en")} characters, are
                    not shown as text, being too long to edit by hand and slow to display. Paste Values replaces them
                    with JSON from the clipboard.{" "}
                    {renderable ? "Render Input shows them anyway." : "This one is too long to be shown at all."}
                </>
            }
            actions={
                <>
                    {renderable ? (
                        <Button size="small" variant="outlined" icon="eye-open" onClick={render}>
                            Render Input
                        </Button>
                    ) : null}
                    <Button size="small" variant="outlined" icon="clipboard" onClick={paste} disabled={readOnly}>
                        Paste Values
                    </Button>
                </>
            }
        >
            {describeBufferLength(binding)}
        </BindingSummary>
    );
};
