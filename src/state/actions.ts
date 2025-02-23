import { StoreApi } from "zustand";
import { assertNever, noop } from "../frontend-utils/general/data";
import { parseWGSL } from "../utilities/parseWGSL";
import { runWGSLFunction } from "../utilities/runner";
import { RunnableComputeShader, RunnableRender } from "../utilities/types";
import { getDefaultValue } from "../utilities/values";
import { AppActions, AppRunningState, AppState } from "./types";

export const getAppActions = (set: StoreApi<AppState>["setState"], get: StoreApi<AppState>["getState"]): AppActions => {
    let cancel: () => void = noop;

    const startGPUProcessing = (state: AppRunningState) => {
        set(state, true);
        if (state.device === null) return;

        cancel();

        if (state.selected === null) return;

        let cancelled = false;
        cancel = () => {
            cancelled = true;
        };

        runWGSLFunction(state.device, state.wgsl, state.selected, state.bindings, state.structs, state.canvas).then(
            (results) => {
                if (cancelled) return;
                set({ ...state, type: "finished", results }, true);
            }
        );
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

            for (const binding of result.bindings) {
                const oldBinding =
                    state.bindings.find((b) => b.id === binding.id) ??
                    state.bindings.find((b) => b.name === binding.name);
                if (oldBinding === undefined) continue;

                const newDefault = getDefaultValue(binding.type, result.structs);
                const oldDefault = getDefaultValue(oldBinding.type, state.structs);
                if (
                    newDefault.type === "values" &&
                    oldDefault.type === "values" &&
                    newDefault.value === oldDefault.value
                ) {
                    binding.input = oldBinding.input;
                    binding.buffer = oldBinding.buffer;
                }
            }

            if (result.selected && result.selected.type === state.selected?.type) {
                if (result.selected.type === "compute")
                    result.selected.threads = (state.selected as RunnableComputeShader).threads;
                else if (result.selected.type === "render")
                    result.selected.fragment = (state.selected as RunnableRender).fragment;
                else assertNever(result.selected);
            }

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

            const bindings = state.bindings.map((b) => (b.id === id ? { ...b, input, buffer } : b));
            if (state.type === "failed-parse") set({ ...state, bindings }, true);
            else startGPUProcessing({ ...state, type: "running", bindings });
        },
        selectRunnable: (runnable) => {
            const state = get();

            if (state.type === "loading" || state.type === "failed-parse") set({ ...state, selected: runnable });
            else startGPUProcessing({ ...state, selected: runnable, type: "running" });
        },
    };
};
