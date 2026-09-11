import { AnchorButton, Button, Classes, Drawer, Navbar } from "@blueprintjs/core";
import { useState } from "react";

export const AppNavbar: React.FC = () => (
    <Navbar fixedToTop={true} className={`${Classes.DARK} z-10`}>
        <Navbar.Group align="left">
            <Navbar.Heading>WGSL Playground</Navbar.Heading>
        </Navbar.Group>
        <Navbar.Group align="right" className="gap-3">
            <AnchorButton
                icon="share"
                text="WGSL Spec"
                href="https://www.w3.org/TR/WGSL/"
                variant="outlined"
                target="_blank"
            />
            <AnchorButton
                icon="git-new-branch"
                text="View Source"
                href="https://github.com/Athenodoros/wgsl-playground"
                variant="outlined"
                target="_blank"
            />
            <HelpNavbarButton />
        </Navbar.Group>
    </Navbar>
);

const HelpNavbarButton: React.FC = () => {
    const [instructionsOpen, setInstructionsOpen] = useState(false);

    return (
        <>
            <Button
                icon="help"
                variant="minimal"
                aria-label="Open instructions"
                title="Instructions"
                onClick={() => setInstructionsOpen(true)}
            />
            <Drawer
                className="[&>.bp6-drawer-header]:!min-h-[50px]"
                icon="help"
                isOpen={instructionsOpen}
                onClose={() => setInstructionsOpen(false)}
                position="right"
                size="600px"
                title="How to use the playground"
            >
                <div className={`${Classes.DRAWER_BODY} p-6 overflow-y-auto`}>
                    <div className="flex flex-col gap-6">
                        <section>
                            <h3 className="font-semibold mb-2">Getting started</h3>
                            <p>
                                Write WGSL in the editor or load an example. The panels update with the shader's
                                structs, resource bindings, and functions that can be run.
                            </p>
                        </section>

                        <section>
                            <h3 className="font-semibold mb-2">Default binding values</h3>
                            <p className="mb-3">
                                Add a comment to a resource binding declaration to choose its initial values. One value
                                fills the whole binding, whatever its type, and <code>rand(min, max)</code> is drawn
                                separately for every slot it fills:
                            </p>
                            <pre className="bg-slate-100 rounded p-3 overflow-x-auto text-xs">
                                <code>{`@group(0) @binding(0) var<storage, read_write> output: array<i32>; // 0
@group(0) @binding(1) var<uniform> jitter: vec3<f32>;              // rand(-1, 1)`}</code>
                            </pre>
                            <p className="my-3">A comma-separated list gives the components one by one:</p>
                            <pre className="bg-slate-100 rounded p-3 overflow-x-auto text-xs">
                                <code>{`@group(0) @binding(2) var<uniform> colour: vec4<f32>; // 0.5, 0.5, 0.0, 1.0`}</code>
                            </pre>
                            <p className="my-3">
                                Nesting is written with parentheses, so a directive means the same thing wherever it
                                appears. A list is never silently re-read as something nested:
                            </p>
                            <pre className="bg-slate-100 rounded p-3 overflow-x-auto text-xs">
                                <code>{`struct Source { position: vec2<f32>, frequency: f32, amplitude: f32 }

@group(0) @binding(3) var<uniform> points: array<vec3<f32>, 2>;  // (1, 2, 3), (4, 5, 6)
@group(0) @binding(4) var<uniform> sources: array<Source, 2>;    // ((150, 110), 0.12, 1), ((500, 90), 0.09, 1)`}</code>
                            </pre>
                            <p className="my-3">
                                <code>count&nbsp;*&nbsp;value</code> describes an array of that many elements. It is
                                only for arrays - it is not a way to repeat a value inside a list:
                            </p>
                            <pre className="bg-slate-100 rounded p-3 overflow-x-auto text-xs">
                                <code>{`@group(0) @binding(5) var<storage, read> samples: array<f32>;  // 6 * rand(0, 1)
@group(0) @binding(6) var<uniform> sources: array<Source, 4>;  // 4 * ((150, 110), 0.12, 1)`}</code>
                            </pre>
                            <h4 className="font-semibold mt-4 mb-2">Arrays</h4>
                            <p className="mb-3">
                                Each entry in a list is one array element, so on an{" "}
                                <code>{`array<vec3<f32>>`}</code> the directive <code>1, 2, 3</code> is three elements,
                                each filled with a single value - while <code>(1, 2, 3)</code> is one element with three
                                components.
                            </p>
                            <p className="mb-3">
                                An array with no declared length takes its length from the directive:{" "}
                                <code>1, 2, 3</code> gives three elements and <code>6 * 0</code> gives six. A single
                                value says nothing about length, so it gives one element.
                            </p>
                            <p className="mt-3">
                                A comment that does not match the binding's type is reported next to it and ignored,
                                rather than being stretched to fit. Comments with no numbers in them are treated as
                                ordinary prose and passed over. Bindings without a directive are filled with 1.
                            </p>
                        </section>
                    </div>
                </div>
            </Drawer>
        </>
    );
};
