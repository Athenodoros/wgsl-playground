import { Button, Menu, MenuItem, Popover, Section } from "@blueprintjs/core";
import { Editor } from "@monaco-editor/react";
import { useState } from "react";
import defaultComputeShader from "../../examples/default_compute_shader.wgsl";
import defaultVertexShader from "../../examples/default_vertex_shader.wgsl";
import { noop } from "../../frontend-utils/general/data";
import { useAppState } from "../../state";
import { INITIAL_APP_STATE } from "../../state/defaults";

export const WGSLEditor: React.FC = () => {
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
                                    onClick={setExample(defaultVertexShader.replace(/\/\/\//g, "//"))} // vite-plugin-glsl mangles comments unless they have triple slashes...
                                    disabled={wgsl === defaultVertexShader.replace(/\/\/\//g, "//")}
                                />
                                <MenuItem
                                    icon="derive-column"
                                    text="CumSum Compute Shader"
                                    onClick={setExample(defaultComputeShader.replace(/\/\/\//g, "//"))}
                                    disabled={wgsl === defaultComputeShader.replace(/\/\/\//g, "//")}
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
                            setSetEditorValue(
                                (_state: unknown) => (value: string) => editor.getModel()?.setValue(value)
                            )
                        }
                    />
                </div>
            </Section>
        </div>
    );
};
