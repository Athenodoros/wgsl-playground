import { NumericInput, NumericInputProps, SectionCard } from "@blueprintjs/core";
import React, { useCallback } from "react";
import { useAppState } from "../../../state";
import { RunnableFunctionArgument } from "../../../utilities/types";
import { useVariableDisplayProps } from "../../shared/useVariableDisplayProps";
import { VariableDisplay } from "../../shared/VariableDisplay";
import { RunnableDropdown } from "./RunnableDropdown";

export const RunnableInputs: React.FC = () => {
    const output = useAppState((state) => state.selected);
    const setOutput = useAppState((state) => state.selectRunnable);
    const options = useAppState((state) => state.runnables);

    return (
        <SectionCard padded={true}>
            <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <p className="!mb-0 bg-slate-100 py-1 px-2 rounded-md">Run Target</p>
                    <RunnableDropdown options={options} selected={output} setOutput={setOutput} />
                </div>
                {output?.type === "compute" ? (
                    <RunnableInput title="Work Group Count" subtext="X, Y, Z">
                        <NumericInputWrapper
                            placeholder="X"
                            defaultValue={output.threads[0]}
                            onValueChange={(value) =>
                                setOutput({ ...output, threads: [value, output.threads[1], output.threads[2]] })
                            }
                        />
                        <NumericInputWrapper
                            placeholder="Y"
                            defaultValue={output.threads[1]}
                            onValueChange={(value) =>
                                setOutput({ ...output, threads: [output.threads[0], value, output.threads[2]] })
                            }
                        />
                        <NumericInputWrapper
                            placeholder="Z"
                            defaultValue={output.threads[2]}
                            onValueChange={(value) =>
                                setOutput({ ...output, threads: [output.threads[0], output.threads[1], value] })
                            }
                        />
                    </RunnableInput>
                ) : output?.type === "render" ? (
                    <>
                        <RunnableInput title="Vertices" subtext="Count">
                            <NumericInputWrapper
                                placeholder="Count"
                                defaultValue={output.vertices}
                                onValueChange={(vertices) => setOutput({ ...output, vertices })}
                            />
                        </RunnableInput>
                        {/* <RunnableInput title="Depth Texture" subtext="depth32float">
                            <Switch
                                className="!mb-0"
                                checked={output.useDepthTexture}
                                onChange={(e) => setOutput({ ...output, useDepthTexture: e.target.checked })}
                                alignIndicator="end"
                                label={output.useDepthTexture ? "Enabled" : "Disabled"}
                            />
                        </RunnableInput> */}
                    </>
                ) : output?.type === "function" ? (
                    <>
                        {output.arguments.map((arg) => (
                            <RunnableInputDisplay key={arg.name} arg={arg} />
                        ))}
                    </>
                ) : null}
            </div>
        </SectionCard>
    );
};

const RunnableInputDisplay: React.FC<{ arg: RunnableFunctionArgument }> = ({ arg }) => {
    const setRunnableInput = useAppState((state) => state.setRunnableInput);
    const onUpdate = useCallback(
        (value: string, buffer: ArrayBuffer) => setRunnableInput(arg.name, value, buffer),
        [arg.name, setRunnableInput]
    );

    const props = useVariableDisplayProps(arg.input, onUpdate, arg.type);

    return <VariableDisplay title={arg.name} subtitle="function argument" type={arg.type} {...props} />;
};

const RunnableInput: React.FC<{ title: string; subtext?: string; children: React.ReactNode }> = ({
    title,
    subtext,
    children,
}) => (
    <div className="flex justify-between items-center">
        <div className="flex gap-2 items-center">
            <p className="!mb-0 bg-slate-100 py-1 px-2 rounded-md">{title}</p>
            {subtext && <p className="text-sm text-slate-400 !mb-0 italic">({subtext})</p>}
        </div>
        <div className="flex gap-2 items-center">{children}</div>
    </div>
);

const NumericInputWrapper: React.FC<NumericInputProps> = ({ ...props }) => (
    <NumericInput
        allowNumericCharactersOnly={true}
        buttonPosition="none"
        {...props}
        className={`[&>.bp5-input-group]:!w-20 ${props.className ?? ""}`}
    />
);
