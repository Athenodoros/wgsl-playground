import {
    Button,
    ButtonGroup,
    Callout,
    Checkbox,
    NumericInput,
    NumericInputProps,
    SectionCard,
    Tooltip,
} from "@blueprintjs/core";
import React, { useCallback } from "react";
import { useAppState } from "../../../state";
import { resolveRunOrder, targetRunnables, updateRunnable } from "../../../utilities/runTarget";
import { Runnable, RunnableFunctionArgument } from "../../../utilities/types";
import { useVariableDisplayProps } from "../../shared/useVariableDisplayProps";
import { VariableDisplay } from "../../shared/VariableDisplay";
import { RunnableKinds } from "./RunnableKinds";
import { RunnableSelect } from "./RunnableSelect";

export const RunnableInputs: React.FC = () => {
    const target = useAppState((state) => state.target);
    const setRunTarget = useAppState((state) => state.setRunTarget);
    const options = useAppState((state) => state.runnables);
    const runOrder = useAppState((state) => state.runOrder);

    const update = useCallback(
        (updated: Runnable) => setRunTarget(updateRunnable(target, updated)),
        [target, setRunTarget],
    );

    const runnables = targetRunnables(target);
    const declared = resolveRunOrder(options, runOrder);

    return (
        <SectionCard padded={true}>
            <div className="flex flex-col gap-4">
                {declared.type === "invalid" ? <RunOrderWarning unknown={declared.unknown} /> : null}
                <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center gap-4">
                        <p className="!mb-0 bg-slate-100 py-1 px-2 rounded-md shrink-0">Run Target</p>
                        <RunnableKinds
                            options={options}
                            runOrder={runOrder}
                            target={target}
                            setRunTarget={setRunTarget}
                        />
                    </div>
                    <div className="flex justify-end min-w-0">
                        <div className="max-w-2/3 min-w-0">
                            <RunnableSelect options={options} target={target} setRunTarget={setRunTarget} />
                        </div>
                    </div>
                    <LoopControls />
                </div>
                {runnables.map((runnable) => (
                    <RunnableFields
                        key={runnable.id}
                        runnable={runnable}
                        named={runnables.length > 1}
                        update={update}
                    />
                ))}
            </div>
        </SectionCard>
    );
};

/**
 * Whether a compute or render target runs in a loop, and the controls for one that does.
 *
 * The checkbox is small and steps back while unticked, so a shader that was never written to loop is
 * not asked about it any louder than it needs to be. A function has nothing to loop over, and gets
 * neither.
 */
const LoopControls: React.FC = () => {
    const loopable = useAppState((state) => state.target.type === "compute" || state.target.type === "render");
    const loop = useAppState((state) => state.loop);
    const playing = useAppState((state) => state.playing);
    const clock = useAppState((state) => state.clock);
    const setLoop = useAppState((state) => state.setLoop);
    const play = useAppState((state) => state.play);
    const pause = useAppState((state) => state.pause);
    const reset = useAppState((state) => state.reset);

    // An error stays with the run it came from, so playing on would only stop again at once.
    const halted = useAppState(
        (state) => !state.playing && state.type === "finished" && state.results.type === "errors",
    );

    if (!loopable) return null;

    return (
        // A fixed height, so that ticking the box and bringing in the buttons does not move what is below.
        <div className="flex justify-between items-center gap-2 h-6">
            {loop ? (
                <div className="flex items-center gap-2">
                    <ButtonGroup size="small" variant="outlined">
                        <Tooltip
                            content="Stopped on an error - reset to run again"
                            position="bottom"
                            disabled={!halted}
                        >
                            <Button
                                icon={playing ? "pause" : "play"}
                                intent="primary"
                                onClick={playing ? pause : play}
                                title={halted ? undefined : playing ? "Pause" : "Play"}
                                aria-label={playing ? "Pause" : "Play"}
                                disabled={halted}
                                // A disabled button gets no pointer events, which would leave the tooltip
                                // around it nothing to open on.
                                className={halted ? "pointer-events-none" : undefined}
                            />
                        </Tooltip>
                        <Button icon="reset" onClick={reset} title="Reset" aria-label="Reset" />
                    </ButtonGroup>
                    <p className="!mb-0 text-xs text-slate-400 tabular-nums">
                        {clock.elapsed.toFixed(2)}s, frame {clock.frames}
                    </p>
                </div>
            ) : (
                <div />
            )}
            <Checkbox
                className={`!mb-0 scale-80 origin-right transition-opacity hover:!opacity-100 ${loop ? "" : "opacity-50"}`}
                label="Run in loop"
                alignIndicator="end"
                checked={loop}
                onChange={(event) => setLoop(event.target.checked)}
            />
        </div>
    );
};

/**
 * Says that the shader's run order comment was ignored, and which of its names is to blame.
 *
 * The target below still shows what actually runs, so this is only here to explain why that is not
 * what the comment asked for.
 */
const RunOrderWarning: React.FC<{ unknown: string[] }> = ({ unknown }) => (
    <Callout intent="warning" icon="warning-sign" compact={true}>
        The run order comment is ignored, because{" "}
        {unknown.map((name, idx) => (
            <React.Fragment key={name}>
                {idx > 0 ? ", " : null}
                <code>{name}</code>
            </React.Fragment>
        ))}{" "}
        {unknown.length === 1 ? "is not a compute entry point" : "are not compute entry points"} in this shader.
    </Callout>
);

/**
 * The inputs belonging to one runnable in the target.
 *
 * A target of several is labelled by entry point name rather than by what the numbers mean, since
 * which pass a count belongs to is the part that stops being obvious once there is more than one.
 */
const RunnableFields: React.FC<{ runnable: Runnable; named: boolean; update: (runnable: Runnable) => void }> = ({
    runnable,
    named,
    update,
}) => (
    <>
        {runnable.type === "compute" ? (
            <RunnableInput
                title={named ? <EntryPointCount name={runnable.name} /> : "Work Group Count"}
                subtext={named ? undefined : "X, Y, Z"}
            >
                <NumericInputWrapper
                    key={`x-${runnable.directive}`}
                    placeholder="X"
                    defaultValue={runnable.threads[0]}
                    onValueChange={(value) =>
                        update({ ...runnable, threads: [value, runnable.threads[1], runnable.threads[2]] })
                    }
                />
                <NumericInputWrapper
                    key={`y-${runnable.directive}`}
                    placeholder="Y"
                    defaultValue={runnable.threads[1]}
                    onValueChange={(value) =>
                        update({ ...runnable, threads: [runnable.threads[0], value, runnable.threads[2]] })
                    }
                />
                <NumericInputWrapper
                    key={`z-${runnable.directive}`}
                    placeholder="Z"
                    defaultValue={runnable.threads[2]}
                    onValueChange={(value) =>
                        update({ ...runnable, threads: [runnable.threads[0], runnable.threads[1], value] })
                    }
                />
            </RunnableInput>
        ) : runnable.type === "render" ? (
            <>
                <RunnableInput title="Vertices" subtext="Count">
                    <NumericInputWrapper
                        key={`vertices-${runnable.directive}`}
                        placeholder="Count"
                        defaultValue={runnable.vertices}
                        onValueChange={(vertices) => update({ ...runnable, vertices })}
                    />
                </RunnableInput>
                {/* <RunnableInput title="Depth Texture" subtext="depth32float">
                    <Switch
                        className="!mb-0"
                        checked={runnable.useDepthTexture}
                        onChange={(e) => update({ ...runnable, useDepthTexture: e.target.checked })}
                        alignIndicator="end"
                        label={runnable.useDepthTexture ? "Enabled" : "Disabled"}
                    />
                </RunnableInput> */}
            </>
        ) : (
            runnable.arguments.map((arg) => <RunnableInputDisplay key={arg.name} arg={arg} />)
        )}
        {(runnable.type === "compute" || runnable.type === "render") && runnable.warning ? (
            <Callout intent="warning" icon="warning-sign" compact={true}>
                {runnable.warning}
            </Callout>
        ) : null}
    </>
);

const RunnableInputDisplay: React.FC<{ arg: RunnableFunctionArgument }> = ({ arg }) => {
    const setRunnableInput = useAppState((state) => state.setRunnableInput);
    const onUpdate = useCallback(
        (value: string, buffer: ArrayBuffer) => setRunnableInput(arg.name, value, buffer),
        [arg.name, setRunnableInput],
    );

    const props = useVariableDisplayProps(arg.input, onUpdate, arg.type);

    return <VariableDisplay title={arg.name} subtitle="function argument" type={arg.type} {...props} />;
};

/**
 * Which entry point a work group count belongs to, with the rest of the label stepped back from it.
 *
 * Once there is more than one pass, the name is the part that has to be read, and "work group count"
 * is the part the row already said when there was only one of them.
 */
const EntryPointCount: React.FC<{ name: string }> = ({ name }) => (
    <>
        {name} <span className="text-xs text-slate-400">work group count</span>
    </>
);

const RunnableInput: React.FC<{ title: React.ReactNode; subtext?: string; children: React.ReactNode }> = ({
    title,
    subtext,
    children,
}) => (
    <div className="flex justify-between items-center gap-2">
        <div className="flex gap-2 items-center min-w-0">
            <p className="!mb-0 bg-slate-100 py-1 px-2 rounded-md truncate">{title}</p>
            {subtext && <p className="text-sm text-slate-400 !mb-0 italic whitespace-nowrap">({subtext})</p>}
        </div>
        <div className="flex gap-2 items-center">{children}</div>
    </div>
);

const NumericInputWrapper: React.FC<NumericInputProps> = ({ ...props }) => (
    <NumericInput
        allowNumericCharactersOnly={true}
        buttonPosition="none"
        {...props}
        className={`[&>.bp6-input-group]:!w-20 ${props.className ?? ""}`}
    />
);
