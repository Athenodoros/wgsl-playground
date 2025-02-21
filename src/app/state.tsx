import { WgslReflect } from "wgsl_reflect";
import { create } from "zustand";
import { DEFAULT_WGSL_CODE } from "../utilities/constants";
import { parseWGSL, Resource } from "../utilities/reflection";

interface AppState {
    wgsl: string;
    parsed: { type: "reflection"; reflection: WgslReflect } | { type: "error"; error: string };
    resources: { [key: string]: Resource };
}

interface AppActions {
    setWGSL: (wgsl: string | undefined) => void;
    updateResource: (group: number, index: number, input: string, output: ArrayBuffer) => void;
}

const getFullState = (wgsl: string): AppState => ({ wgsl, ...parseWGSL(wgsl) });

export const useAppState = create<AppState & AppActions>()((set) => ({
    ...getFullState(DEFAULT_WGSL_CODE),

    setWGSL: (wgsl?: string) => wgsl && set(getFullState(wgsl)),
    updateResource: (group: number, index: number, input: string, output: ArrayBuffer) =>
        set((state) => ({ resources: { ...state.resources, [`${group}:${index}`]: { input, output } } })),
}));
