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
                                Each entry in a list is one array element, so on an <code>{`array<vec3<f32>>`}</code>{" "}
                                the directive <code>1, 2, 3</code> is three elements, each filled with a single value -
                                while <code>(1, 2, 3)</code> is one element with three components.
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

                        <section>
                            <h3 className="font-semibold mb-2">Default run counts</h3>
                            <p className="mb-3">
                                The same comment on a <code>@compute</code> or <code>@vertex</code> declaration sets the
                                run's initial work group count or vertex count, which can still be changed in the Run
                                Target panel afterwards:
                            </p>
                            <pre className="bg-slate-100 rounded p-3 overflow-x-auto text-xs">
                                <code>{`@compute // 8, 8, 1
@workgroup_size(64, 1, 1)
fn main() { }

@vertex // 6
fn vertex_main() -> @builtin(position) vec4<f32> { }`}</code>
                            </pre>
                            <p className="my-3">
                                This is the number of work groups to dispatch, not the size of each one - that is what{" "}
                                <code>@workgroup_size</code> sets. Trailing dimensions can be left off, so{" "}
                                <code>// 16</code> means <code>16, 1, 1</code>.
                            </p>
                            <p className="mt-3">
                                Counts have to be whole numbers of at least one, so <code>rand</code> and the
                                parentheses and <code>*</code> used for binding values are not accepted here. Without a
                                comment a run starts at <code>1, 1, 1</code> work groups or <code>3</code> vertices.
                            </p>
                        </section>

                        <section>
                            <h3 className="font-semibold mb-2">Running compute passes in sequence</h3>
                            <p className="mb-3">
                                Several compute entry points can be picked in the Run Target panel. They run one after
                                another in the order they were picked, over the same bindings, so a pass can read what
                                the one before it wrote. Only the state left once the last pass has finished is shown.
                            </p>
                            <p className="mb-3">
                                A shader can say which passes it runs, and in what order, with a comment on a line of
                                its own:
                            </p>
                            <pre className="bg-slate-100 rounded p-3 overflow-x-auto text-xs">
                                <code>{`// playground-compute-run-order: measure, draw

@compute @workgroup_size(64, 1, 1)
fn measure() { }

@compute @workgroup_size(8, 8, 1)
fn draw() { }`}</code>
                            </pre>
                            <p className="mt-3">
                                This is what runs when the shader is opened, when the comment is edited, and when
                                Compute is chosen again after running something else. Every name has to be a compute
                                entry point in the shader: a run order naming one that is not is reported at the top of
                                the Function Runner and ignored as a whole, rather than partly run.
                            </p>
                        </section>

                        <section>
                            <h3 className="font-semibold mb-2">Running in a loop</h3>
                            <p className="mb-3">
                                Tick <strong>Run in loop</strong> under the Run Target to run a compute or render
                                target once per frame, with controls to play, pause and reset it. Buffers and textures
                                last from one frame to the next, so each frame reads what the one before it wrote.
                                Reset throws that away and starts again from the binding values.
                            </p>
                            <p className="mb-3">
                                Mark an <code>f32</code> uniform with this comment to have the playground fill it with
                                the seconds since the last frame:
                            </p>
                            <pre className="bg-slate-100 rounded p-3 overflow-x-auto text-xs">
                                <code>{`@group(0) @binding(0) var<uniform> delta_time: f32; // playground-time`}</code>
                            </pre>
                            <p className="mt-3">
                                A shader with one of these starts out looping. It is zero whenever the target is run
                                once, and on the first frame after playing or resetting. While the loop plays, outputs
                                update a few times a second, and the colour under the pointer is shown once it is
                                paused.
                            </p>
                        </section>
                    </div>
                </div>
            </Drawer>
        </>
    );
};
