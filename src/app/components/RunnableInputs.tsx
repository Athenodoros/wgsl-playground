import { Button, MenuItem, MenuItemProps, NumericInput, NumericInputProps, SectionCard } from "@blueprintjs/core";
import { ItemRenderer, Select } from "@blueprintjs/select";
import React from "react";
import { useAppState } from "../../state";
import { Runnable } from "../../utilities/types";
import { getTypeDisplay } from "../../utilities/values";

export const RunnableInputs: React.FC = () => {
    const output = useAppState((state) => state.selected);
    const setOutput = useAppState((state) => state.selectRunnable);
    const options = useAppState((state) => state.runnables);

    return (
        <SectionCard padded={true}>
            <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <p className="!mb-0 bg-slate-100 py-1 px-2 rounded-md">Run Target</p>
                    <div className="flex gap-2">
                        <Select<Runnable>
                            items={options}
                            itemRenderer={renderCallOption}
                            onItemSelect={setOutput}
                            // popoverProps={{ matchTargetWidth: true }}
                        >
                            <Button
                                {...getCallOptionProps(output)}
                                variant="outlined"
                                intent="primary"
                                // className="!min-w-2xs [&>.bp5-button-text]:!grow"
                                endIcon="chevron-down"
                                disabled={options.length === 0}
                            />
                        </Select>
                    </div>
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
                                onValueChange={(value) => setOutput({ ...output, vertices: value })}
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
                            <RunnableInput key={arg.name} title={arg.name} subtext={getTypeDisplay(arg.type)}>
                                Hello
                            </RunnableInput>
                        ))}
                    </>
                ) : null}
            </div>
        </SectionCard>
    );
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

const renderCallOption: ItemRenderer<Runnable> = (runnable, { handleClick }) => (
    <MenuItem key={runnable.id} {...getCallOptionProps(runnable)} onClick={handleClick} />
);

const getCallOptionProps = (runnable: Runnable | null): Pick<MenuItemProps, "icon" | "text"> => {
    if (!runnable) {
        return { icon: "widget", text: "No options available" };
    }

    switch (runnable.type) {
        // case "render-triangles":
        //     return { icon: "widget", text: `${runnable.vertex} (Render Triangles)` };
        case "render":
            return { icon: "media", text: `${runnable.vertex} + ${runnable.fragment}` };
        case "compute":
            return { icon: "derive-column", text: `${runnable.name}` };
        case "function":
            return { icon: "variable", text: `${runnable.name}` };
    }
};
