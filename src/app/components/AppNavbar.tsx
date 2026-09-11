import { AnchorButton, Button, Classes, Drawer, Navbar } from "@blueprintjs/core";
import { useState } from "react";

export const AppNavbar: React.FC = () => (
    <Navbar fixedToTop={true} className="bp5-dark z-10">
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
                className="[&>.bp5-drawer-header]:!min-h-[50px]"
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
                                Add a comment to a resource binding declaration to choose its initial values. A number
                                fills the binding with that value:
                            </p>
                            <pre className="bg-slate-100 rounded p-3 overflow-x-auto text-xs">
                                <code>{`@group(0) @binding(0) var<storage> output: array<i32>; // 0`}</code>
                            </pre>
                            <p className="my-3">
                                Use <code>rand(min, max)</code> to generate each value within a range:
                            </p>
                            <pre className="bg-slate-100 rounded p-3 overflow-x-auto text-xs">
                                <code>{`@group(0) @binding(1) var<storage, read> input: array<f32>; // rand(-1, 1)`}</code>
                            </pre>
                            <p className="my-3">
                                A comma-separated list fills the binding's fields in order, repeating from the start if
                                the binding has more fields than the list has entries:
                            </p>
                            <pre className="bg-slate-100 rounded p-3 overflow-x-auto text-xs">
                                <code>{`@group(0) @binding(2) var<uniform> light: Light; // 0.5, 0.5, 0.0, 1.0`}</code>
                            </pre>
                            <p className="my-3">
                                Numbers and <code>rand</code> can be mixed in one list. Each repetition draws new random
                                values, so this fills every third field with a fresh one:
                            </p>
                            <pre className="bg-slate-100 rounded p-3 overflow-x-auto text-xs">
                                <code>{`@group(0) @binding(3) var<storage, read> jitter: array<f32>; // rand(-1, 1), 0, 0`}</code>
                            </pre>
                            <p className="mt-3">Bindings without a default-value comment are initialized to 1.</p>
                        </section>
                    </div>
                </div>
            </Drawer>
        </>
    );
};
