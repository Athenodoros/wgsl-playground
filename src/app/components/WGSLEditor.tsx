import { Button, IconName, Menu, MenuItem, NonIdealState, PopoverNext, Section } from "@blueprintjs/core";
import { Editor, loader } from "@monaco-editor/react";
import { useEffect, useState } from "react";
import chasers from "../../examples/chasers.wgsl";
import defaultComputeShader from "../../examples/default_compute_shader.wgsl";
import defaultVertexShader from "../../examples/default_vertex_shader.wgsl";
import interferencePattern from "../../examples/interference_pattern.wgsl";
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
    { icon: "flows", text: "Chasers", wgsl: unmangleComments(chasers) },
];

export const WGSLEditor: React.FC = () => {
    const wgsl = useAppState((state) => state.wgsl);
    const setWGSL = useAppState((state) => state.setWGSL);
    const loadExample = useAppState((state) => state.loadExample);
    // A function passed straight to useState is treated as an initialiser and called, so wrap it.
    const [setEditorValue, setSetEditorValue] = useState<(value: string) => void>(() => noop);
    // Monaco is fetched from a CDN, and @monaco-editor/react only logs a failed load, so ask the loader directly.
    const [editorLoadError, setEditorLoadError] = useState<unknown>(null);

    useEffect(() => {
        loader.init().catch((error: unknown) => {
            if ((error as { type?: string } | null)?.type !== "cancelation") setEditorLoadError(error ?? new Error());
        });
    }, []);

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
                    {editorLoadError ? (
                        <NonIdealState
                            icon="offline"
                            title="Editor Not Available"
                            description="The code editor couldn't load. It is fetched from a CDN, so check your connection and reload the page."
                            action={<Button onClick={() => window.location.reload()}>Reload</Button>}
                        />
                    ) : (
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
                    )}
                </div>
            </Section>
        </div>
    );
};
