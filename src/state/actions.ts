import { StoreApi } from "zustand";
import { parseWGSL } from "../utilities/parseWGSL";
import { WgslOutput } from "../utilities/types";
import { AppActions, AppRunningState, AppState } from "./types";

export const getAppActions = (set: StoreApi<AppState>["setState"], get: StoreApi<AppState>["getState"]): AppActions => {
    const startGPUProcessing = (state: AppRunningState) => {
        set(state, true);

        setTimeout(() => {
            const binding = state.bindings[0];
            if (binding === undefined) return;
            const stubOutput: WgslOutput = { binding, value: "[ 1.0, 2.0, 3.0 ]" };
            set({ ...state, type: "finished", results: [stubOutput] }, true); // TODO: Remove stub
        }, 500);
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
        setCanvas: (canvas: HTMLCanvasElement) => {
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
            if (result.type === "failed-parse") set({ ...state, ...result, wgsl }, true);
            else startGPUProcessing({ ...state, ...result, wgsl });
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
    };
};
