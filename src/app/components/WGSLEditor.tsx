import { Button, IconName, Menu, MenuItem, PopoverNext, Section } from "@blueprintjs/core";
import { Editor } from "@monaco-editor/react";
import { useState } from "react";
import defaultComputeShader from "../../examples/default_compute_shader.wgsl";
import defaultVertexShader from "../../examples/default_vertex_shader.wgsl";
import interferencePattern from "../../examples/interference_pattern.wgsl";
import travellingWaves from "../../examples/travelling_waves.wgsl";
import { useAppState } from "../../state";
import { INITIAL_APP_STATE } from "../../state/defaults";
import { noop } from "../../utilities/data";
import { ShareButton } from "./ShareButton";

// vite-plugin-glsl mangles comments unless they have triple slashes, so the files use `///` throughout
// and they are put back to `//` here.
const unmangleComments = (wgsl: string) => wgsl.replace(/\/\/\//g, "//");

const EXAMPLES: { icon: IconName; text: string; wgsl: string }[] = [
    { icon: "media", text: "Triangle Vertex Shader", wgsl: unmangleComments(defaultVertexShader) },
    { icon: "derive-column", text: "CumSum Compute Shader", wgsl: unmangleComments(defaultComputeShader) },
    { icon: "heatmap", text: "Interference Pattern", wgsl: unmangleComments(interferencePattern) },
    { icon: "play", text: "Travelling Waves", wgsl: unmangleComments(travellingWaves) },
];

export const WGSLEditor: React.FC = () => {
    const wgsl = useAppState((state) => state.wgsl);
    const setWGSL = useAppState((state) => state.setWGSL);
    const loadExample = useAppState((state) => state.loadExample);
    const [setEditorValue, setSetEditorValue] = useState<(value: string) => void>(noop);

    const setExample = (example: string) => () => {
        // Loaded before the editor is told, so the change the editor then reports is already the code
        // on show and is not taken for an edit to it.
        loadExample(example);
        setEditorValue(example);
    };

    return (
        <div className="basis-md grow min-w-0 flex flex-col gap-4">
            <Section
                title="Editor"
                className="grow shrink min-w-0 flex flex-col"
                rightElement={
                    <div className="flex items-center gap-2">
                        <PopoverNext
                            placement="bottom"
                            content={
                                <Menu>
                                    {EXAMPLES.map((example) => (
                                        <MenuItem
                                            key={example.text}
                                            icon={example.icon}
                                            text={example.text}
                                            onClick={setExample(example.wgsl)}
                                            disabled={wgsl === example.wgsl}
                                        />
                                    ))}
                                </Menu>
                            }
                        >
                            <Button variant="outlined" intent="primary" endIcon="chevron-down">
                                Load Example
                            </Button>
                        </PopoverNext>
                        <ShareButton />
                    </div>
                }
            >
                <div className="bg-slate-200 p-2 grow shrink min-w-0">
                    <Editor
                        defaultLanguage="wgsl"
                        defaultValue={INITIAL_APP_STATE.wgsl}
                        onChange={setWGSL}
                        onMount={(editor) =>
                            // Extra currying because react calls functions to get the new state value
                            setSetEditorValue(
                                (_state: unknown) => (value: string) => editor.getModel()?.setValue(value),
                            )
                        }
                    />
                </div>
            </Section>
        </div>
    );
};
