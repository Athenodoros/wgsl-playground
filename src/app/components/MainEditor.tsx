import { Button, Menu, MenuItem, Popover, Section } from "@blueprintjs/core";
import { Editor } from "@monaco-editor/react";
import { useState } from "react";
import { noop } from "../../frontend-utils/general/data";
import { useAppState } from "../../state";
import { DEFAULT_COMPUTE_SHADER, DEFAULT_VERTEX_SHADER, INITIAL_APP_STATE } from "../../state/defaults";

export const MainEditor: React.FC = () => {
    const wgsl = useAppState((state) => state.wgsl);
    const setWGSL = useAppState((state) => state.setWGSL);
    const [setEditorValue, setSetEditorValue] = useState<(value: string) => void>(noop);

    const setExample = (example: string) => () => {
        setWGSL(example);
        setEditorValue(example);
    };

    return (
        <div className="basis-md grow flex flex-col gap-4">
            <Section
                title="Editor"
                className="grow shrink flex flex-col"
                rightElement={
                    <Popover
                        position="bottom"
                        content={
                            <Menu>
                                <MenuItem
                                    icon="media"
                                    text="Triangle Vertex Shader"
                                    onClick={setExample(DEFAULT_VERTEX_SHADER)}
                                    disabled={wgsl === DEFAULT_VERTEX_SHADER}
                                />
                                <MenuItem
                                    icon="derive-column"
                                    text="CumSum Compute Shader"
                                    onClick={setExample(DEFAULT_COMPUTE_SHADER)}
                                    disabled={wgsl === DEFAULT_COMPUTE_SHADER}
                                />
                            </Menu>
                        }
                    >
                        <Button variant="outlined" intent="primary" endIcon="chevron-down">
                            Load Example
                        </Button>
                    </Popover>
                }
            >
                <div className="bg-slate-200 p-2 grow shrink">
                    <Editor
                        defaultLanguage="wgsl"
                        defaultValue={INITIAL_APP_STATE.wgsl}
                        onChange={setWGSL}
                        onMount={(editor) =>
                            // Extra currying because react calls functions to get the new state value
                            setSetEditorValue(() => (value: string) => editor.getModel()?.setValue(value))
                        }
                    />
                </div>
            </Section>
        </div>
    );
};
