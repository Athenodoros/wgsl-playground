import { StoreApi } from "zustand";
import { noop, range } from "../utilities/data";
import { parseWGSL } from "../utilities/parseWGSL";
import { computeTarget, resolveRunOrder, targetRunnables } from "../utilities/runTarget";
import { runWGSLFunction } from "../utilities/runWGSLFunction";
import { ParseResults, RunTarget, Runnable, RunnableComputeShader, RunnableFunction } from "../utilities/types";
import { AppActions, AppFailedParseState, AppFinishedState, AppRunningState, AppState } from "./types";

export const getAppActions = (set: StoreApi<AppState>["setState"], get: StoreApi<AppState>["getState"]): AppActions => {
    let cancel: () => void = noop;

    const applyWGSL = (wgsl: string, source: CodeSource) => {
        const state = get();
        if (state.wgsl === wgsl) return;
        if (state.type === "loading") {
            set({ ...state, wgsl });
            return;
        }

        const result = parseWGSL(wgsl);
        if (result.type === "failed-parse") {
            set({ ...state, ...result, wgsl }, true);
            return;
        }

        if (result.runnables.length === 0) {
            set({ ...state, type: "failed-parse", error: "No runnable functions found", wgsl }, true);
            return;
        }

        updateParseResultsFromPrevious(result, state, source);

        startGPUProcessing({ ...state, ...result, wgsl });
    };

    const startGPUProcessing = (state: AppRunningState) => {
        set(state, true);
        if (state.device === null) return;

        cancel();

        const { target } = state;
        if (target.type === "none") return;

        let cancelled = false;
        cancel = () => {
            cancelled = true;
        };

        runWGSLFunction(state.device, state.wgsl, target, state.bindings, state.canvas).then((results) => {
            if (cancelled) return;
            set({ ...state, type: "finished", results }, true);
        });
    };

    return {
        setDevice: (device: GPUDevice | null) => {
            const state = get();
            if (state.type !== "loading" || state.canvas === undefined) {
                set({ ...state, device });
                return;
            }

            const result = parseWGSL(state.wgsl);
            if (result.type === "failed-parse") set({ ...state, ...result, device, canvas: state.canvas }, true);
            else startGPUProcessing({ ...state, ...result, device, canvas: state.canvas });
        },
        setCanvas: (canvas: HTMLCanvasElement | null) => {
            if (canvas === null) return;

            const state = get();
            if (state.type !== "loading" || state.device === undefined) {
                // Collapsing a section unmounts the canvas, and opening it again mounts a fresh one
                // with nothing drawn on it. What the last run drew lives in the old element's swap
                // chain and cannot be copied across, so the run has to happen again.
                if (canvas !== state.canvas && (state.type === "running" || state.type === "finished")) {
                    startGPUProcessing({ ...state, type: "running", canvas });
                    return;
                }

                set({ ...state, canvas });
                return;
            }

            const result = parseWGSL(state.wgsl);
            if (result.type === "failed-parse") set({ ...state, ...result, canvas, device: state.device }, true);
            else startGPUProcessing({ ...state, ...result, canvas, device: state.device });
        },
        setWGSL: (wgsl: string | undefined) => {
            if (wgsl !== undefined) applyWGSL(wgsl, "edit");
        },
        loadExample: (wgsl: string) => applyWGSL(wgsl, "example"),
        setBindingInput: (id: string, input: string, buffer: ArrayBuffer) => {
            const state = get();
            if (state.type === "loading") {
                console.error(`Cannot set binding input for ${state.type} state`);
                return;
            }

            const binding = state.bindings.find((b) => b.id === id);
            if (binding === undefined) {
                console.error(`Binding ${id} not found`);
                return;
            }
            if (binding.kind !== "buffer") {
                console.error(`Binding ${id} has no value to set`);
                return;
            }

            const bindings = state.bindings.map((b) =>
                b.id === id && b.kind === "buffer" ? { ...b, input, buffer } : b,
            );
            if (state.type === "failed-parse") set({ ...state, bindings }, true);
            else startGPUProcessing({ ...state, type: "running", bindings });
        },
        setRunTarget: (target) => {
            const state = get();

            if (state.type === "loading" || state.type === "failed-parse") set({ ...state, target });
            else startGPUProcessing({ ...state, target, type: "running" });
        },
        setRunnableInput: (name: string, input: string, buffer: ArrayBuffer) => {
            const state = get();
            if (state.type === "loading") {
                console.error(`Cannot set binding input for ${state.type} state`);
                return;
            }

            // Arguments belong to a function, and a function is the whole target when it is running,
            // so there is exactly one runnable here to update.
            if (state.target.type !== "function") {
                console.error(`Cannot set a function argument while the target is ${state.target.type}`);
                return;
            }

            const { runnable } = state.target;
            startGPUProcessing({
                ...state,
                type: "running",
                target: {
                    type: "function",
                    runnable: {
                        ...runnable,
                        arguments: runnable.arguments.map((arg) =>
                            arg.name === name ? { ...arg, input, buffer } : arg,
                        ),
                    },
                },
            });
        },
    };
};

/** Where new code came from: typed into the file that is open, or loaded in place of it. */
type CodeSource = "edit" | "example";

const updateParseResultsFromPrevious = (
    result: ParseResults,
    state: AppFailedParseState | AppRunningState | AppFinishedState,
    source: CodeSource,
) => {
    for (const binding of result.bindings) {
        const oldBinding =
            state.bindings.find((b) => b.id === binding.id) ?? state.bindings.find((b) => b.name === binding.name);
        if (oldBinding === undefined) continue;

        // A storage texture has no value to carry across: everything about it, size included, comes
        // from the code that was just re-read.
        if (binding.kind !== "buffer" || oldBinding.kind !== "buffer") continue;

        // Values the user set by hand are kept across an edit, but only while both the binding's
        // shape and the directive comment behind it are unchanged. Comparing generated values alone
        // is not enough: getDefaultValue() here takes no directive, so every binding compares equal
        // as all 1s and an edited comment is silently discarded. The comment cannot be compared by
        // the values it produces either, since `rand` gives different ones every time.
        const newDefault = binding.type.getDefaultValue();
        const oldDefault = oldBinding.type.getDefaultValue();
        if (
            newDefault.type === "values" &&
            oldDefault.type === "values" &&
            newDefault.value === oldDefault.value &&
            binding.directive === oldBinding.directive
        ) {
            binding.input = oldBinding.input;
            binding.buffer = oldBinding.buffer;
        }
    }

    // A run order comment that changed is the shader asking for a new sequence, so it replaces
    // whatever was picked, empty included. One that does not resolve yet - usually because it is
    // still being typed - asks for nothing, and the target is carried over as for any other edit.
    // `result.target` is already that sequence, since a fresh parse runs a run order that resolves.
    const declared = resolveRunOrder(result.runnables, result.runOrder);
    if (declared.type === "passes" && !sameNames(result.runOrder, state.runOrder)) {
        const previous = targetRunnables(state.target);
        for (const pass of declared.passes) {
            const old = previous.find((r) => r.type === "compute" && r.name === pass.name);
            if (old?.type === "compute") carryOverCounts(pass, old);
        }
        return;
    }

    // Nothing selected is a choice, and an edit elsewhere in the file is no reason to undo it. An
    // example is not an edit to the file, though, and opening one onto nothing would hide what it is
    // for. The fallback is for a target the edit emptied out, and for a shader that had nothing to run
    // in the first place, where picking up whatever the edit just added is the point.
    const clearedByHand = source === "edit" && state.target.type === "none" && state.runnables.length > 0;
    if (clearedByHand) result.target = { type: "none" };
    else result.target = carryOverTarget(state.target, result.runnables) ?? result.target;
};

const sameNames = (a: string[] | null, b: string[] | null) =>
    a === b || (a !== null && b !== null && a.length === b.length && a.every((name, idx) => name === b[idx]));

/**
 * Counts set by hand survive an edit, but only while the directive behind them is unchanged - the
 * same rule the bindings above use for their inputs, so that editing a comment takes effect instead
 * of being quietly discarded.
 */
const carryOverCounts = (current: RunnableComputeShader, previous: RunnableComputeShader) => {
    if (current.directive === previous.directive) current.threads = previous.threads;
};

/**
 * The target for a new parse: the same entry points as before, wherever the edit left them in place.
 *
 * Null means the edit took away everything the target named, and the caller falls back to what a
 * fresh parse of the new code would have picked. Each arm matches and carries over together, because
 * what identifies a runnable across an edit and what is worth keeping off the old one are the same
 * question asked twice.
 */
const carryOverTarget = (previous: RunTarget, runnables: Runnable[]): RunTarget | null => {
    if (previous.type === "none") return null;

    if (previous.type === "compute") {
        const passes = previous.passes.flatMap((pass) => {
            const match = runnables.find((r) => r.type === "compute" && r.name === pass.name);
            if (match?.type !== "compute") return [];

            carryOverCounts(match, pass);
            return [match];
        });

        // A sequence outlives the loss of some of its passes, and only becomes nothing when the edit
        // has taken away every one of them.
        return passes.length > 0 ? computeTarget(passes) : null;
    }

    if (previous.type === "render") {
        const { runnable } = previous;
        const match = runnables.find(
            (r) => r.type === "render" && r.vertex === runnable.vertex && r.fragment === runnable.fragment,
        );
        if (match?.type !== "render") return null;

        if (match.directive === runnable.directive) match.vertices = runnable.vertices;
        return { type: "render", runnable: match };
    }

    const match = runnables.find((r) => r.type === "function" && r.name === previous.runnable.name);
    if (match?.type !== "function") return null;

    carryOverArguments(match, previous.runnable);
    return { type: "function", runnable: match };
};

/** Copies argument values the user typed onto the function that replaced the one they typed them on. */
const carryOverArguments = (current: RunnableFunction, previous: RunnableFunction) => {
    for (const idx of range(current.arguments.length)) {
        const arg = current.arguments[idx];
        const oldArg = previous.arguments.find((a) => a.name === arg.name) ?? previous.arguments[idx];
        if (oldArg === undefined) continue;

        const newDefault = arg.type.getDefaultValue();
        const oldDefault = oldArg.type.getDefaultValue();
        if (newDefault.type === "values" && oldDefault.type === "values" && newDefault.value === oldDefault.value) {
            arg.input = oldArg.input;
            arg.buffer = oldArg.buffer;
        }
    }
};
