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
                                A comma-separated list fills the binding's fields in order:
                            </p>
                            <pre className="bg-slate-100 rounded p-3 overflow-x-auto text-xs">
                                <code>{`@group(0) @binding(2) var<uniform> light: Light; // 0.5, 0.5, 0.0, 1.0`}</code>
                            </pre>
                            <p className="my-3">
                                The list repeats from the start if the binding has more fields than the list has
                                entries, so an array of structs needs only one element's worth of values:
                            </p>
                            <pre className="bg-slate-100 rounded p-3 overflow-x-auto text-xs">
                                <code>{`struct Source { position: vec2<f32>, frequency: f32 }

@group(0) @binding(3) var<uniform> sources: array<Source, 4>; // 150, 110, 0.12`}</code>
                            </pre>
                            <p className="my-3">
                                Numbers and <code>rand</code> can be mixed in one list, and each repetition draws new
                                random values - so this gives all four sources the same position, but a different
                                frequency each:
                            </p>
                            <pre className="bg-slate-100 rounded p-3 overflow-x-auto text-xs">
                                <code>{`@group(0) @binding(4) var<uniform> sources: array<Source, 4>; // 150, 110, rand(0.05, 0.2)`}</code>
                            </pre>
                            <p className="mt-3">
                                A single number and a bare <code>rand(min, max)</code> are the one-entry cases of this:
                                they repeat for every field. Bindings without a default-value comment are initialized to
                                1.
                            </p>
                        </section>

                        <section>
                            <h3 className="font-semibold mb-2">Default run counts</h3>
                            <p className="mb-3">
                                The same comment on a <code>@compute</code> or <code>@vertex</code> declaration sets the
                                run's initial work group count or vertex count, which can still be changed in the Run
                                Target panel afterwards:
                            </p>
                            <pre className="bg-slate-100 rounded p-3 overflow-x-auto text-xs">
                                <code>{`@compute @workgroup_size(64, 1, 1) // 8, 8, 1`}</code>
                            </pre>
                            <pre className="bg-slate-100 rounded p-3 mt-3 overflow-x-auto text-xs">
                                <code>{`@vertex // 6`}</code>
                            </pre>
                            <p className="my-3">
                                Note that this is the number of work groups to dispatch, not the size of each one - that
                                is what <code>@workgroup_size</code> sets. Counts have to be whole numbers of at least
                                one, so <code>rand</code> is not accepted here.
                            </p>
                            <p>
                                Without a comment, a run starts at <code>1, 1, 1</code> work groups or <code>3</code>{" "}
                                vertices. A count changed by hand is kept while you edit the shader, unless you change
                                the comment it came from.
                            </p>
                        </section>
                    </div>
                </div>
            </Drawer>
        </>
    );
};
