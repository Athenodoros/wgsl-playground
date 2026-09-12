import { StoreApi } from "zustand";
import { noop, range } from "../utilities/data";
import { parseWGSL } from "../utilities/parseWGSL";
import { runWGSLFunction } from "../utilities/runWGSLFunction";
import { ParseResults, Runnable } from "../utilities/types";
import { AppActions, AppFailedParseState, AppFinishedState, AppRunningState, AppState } from "./types";

export const getAppActions = (set: StoreApi<AppState>["setState"], get: StoreApi<AppState>["getState"]): AppActions => {
    let cancel: () => void = noop;

    const startGPUProcessing = (state: AppRunningState) => {
        set(state, true);
        if (state.device === null) return;

        cancel();

        if (state.sequence.length === 0) return;

        let cancelled = false;
        cancel = () => {
            cancelled = true;
        };

        runWGSLFunction(state.device, state.wgsl, state.sequence[0], state.bindings, state.canvas).then((results) => {
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
            if (wgsl === undefined) return;

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

            updateParseResultsFromPrevious(result, state);

            startGPUProcessing({ ...state, ...result, wgsl });
        },
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
        selectRunnable: (runnable) => {
            const state = get();

            if (state.type === "loading" || state.type === "failed-parse") set({ ...state, sequence: [runnable] });
            else startGPUProcessing({ ...state, sequence: [runnable], type: "running" });
        },
        setRunnableInput: (name: string, input: string, buffer: ArrayBuffer) => {
            const state = get();
            if (state.type === "loading") {
                console.error(`Cannot set binding input for ${state.type} state`);
                return;
            }

            // Only a function has arguments, and a function is never run alongside anything else,
            // so there is only ever one of them in the sequence to update.
            const selected = state.sequence.find((runnable) => runnable.type === "function");
            if (selected === undefined) {
                console.error("Cannot set runnable input when no function is selected");
                return;
            }

            startGPUProcessing({
                ...state,
                type: "running",
                sequence: state.sequence.map((runnable) =>
                    runnable === selected
                        ? {
                              ...selected,
                              arguments: selected.arguments.map((arg) =>
                                  arg.name === name ? { ...arg, input, buffer } : arg,
                              ),
                          }
                        : runnable,
                ),
            });
        },
    };
};

const updateParseResultsFromPrevious = (
    result: ParseResults,
    state: AppFailedParseState | AppRunningState | AppFinishedState,
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

    // Each entry in the sequence is matched to whatever took its place in the new parse, so that a
    // sequence survives an edit that leaves the functions it names alone. An entry whose function
    // has gone is dropped, and a sequence left with nothing falls back to the first runnable, which
    // is what a fresh parse would have selected.
    const carried = state.sequence.flatMap((previous) => {
        const runnable = result.runnables.find((r) => isSameRunnable(r, previous));
        if (runnable === undefined) return [];

        carryOverInputs(runnable, previous);
        return [runnable];
    });
    result.sequence = carried.length > 0 ? carried : result.runnables.slice(0, 1);
};

/** Whether a runnable from a new parse is the one a runnable from the previous parse named. */
const isSameRunnable = (runnable: Runnable, previous: Runnable): boolean => {
    if (runnable.type === "compute" && previous.type === "compute") return runnable.name === previous.name;
    if (runnable.type === "render" && previous.type === "render")
        return runnable.vertex === previous.vertex && runnable.fragment === previous.fragment;
    if (runnable.type === "function" && previous.type === "function") return runnable.name === previous.name;
    return false;
};

/**
 * Copies the inputs a user set by hand onto the runnable replacing it after an edit.
 *
 * Counts survive only while the directive behind them is unchanged - the same rule the bindings
 * above use for their inputs, so that editing a comment takes effect instead of being quietly
 * discarded.
 */
const carryOverInputs = (runnable: Runnable, previous: Runnable) => {
    if (runnable.type === "compute" && previous.type === "compute") {
        if (runnable.directive === previous.directive) runnable.threads = previous.threads;
        return;
    }

    if (runnable.type === "render" && previous.type === "render") {
        if (runnable.directive === previous.directive) runnable.vertices = previous.vertices;
        return;
    }

    if (runnable.type !== "function" || previous.type !== "function") return;

    for (const idx of range(runnable.arguments.length)) {
        const arg = runnable.arguments[idx];
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
