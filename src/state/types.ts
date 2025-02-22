import { ParseResults, Runnable, RunnerResults } from "../utilities/types";

interface AppLoadingState extends ParseResults {
    type: "loading";
    device?: GPUDevice | null;
    canvas?: HTMLCanvasElement;
    wgsl: string;
}

interface AppFailedParseState extends ParseResults {
    type: "failed-parse";
    device: GPUDevice | null;
    canvas: HTMLCanvasElement;
    wgsl: string;
    error: string;
}

export interface AppRunningState extends ParseResults {
    type: "running";
    device: GPUDevice | null;
    canvas: HTMLCanvasElement;
    wgsl: string;
}

interface AppFinishedState extends ParseResults {
    type: "finished";
    device: GPUDevice | null;
    canvas: HTMLCanvasElement;
    wgsl: string;
    results: RunnerResults;
}

export type AppState = AppLoadingState | AppFailedParseState | AppRunningState | AppFinishedState;

export interface AppActions {
    setDevice: (device: GPUDevice | null) => void;
    setCanvas: (canvas: HTMLCanvasElement) => void;
    setWGSL: (wgsl: string | undefined) => void;
    setBindingInput: (id: string, input: string, buffer: ArrayBuffer) => void;
    selectRunnable: (runnable: Runnable) => void;
}
