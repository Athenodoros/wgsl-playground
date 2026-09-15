import { ParseResults, PlaybackState, RunTarget, RunnerResults } from "../utilities/types";

interface AppLoadingState extends ParseResults, PlaybackState {
    type: "loading";
    device?: GPUDevice | null;
    canvas?: HTMLCanvasElement;
    wgsl: string;
}

export interface AppFailedParseState extends ParseResults, PlaybackState {
    type: "failed-parse";
    device: GPUDevice | null;
    canvas: HTMLCanvasElement;
    wgsl: string;
    error: string;
}

export interface AppRunningState extends ParseResults, PlaybackState {
    type: "running";
    device: GPUDevice | null;
    canvas: HTMLCanvasElement;
    wgsl: string;
}

export interface AppFinishedState extends ParseResults, PlaybackState {
    type: "finished";
    device: GPUDevice | null;
    canvas: HTMLCanvasElement;
    wgsl: string;
    results: RunnerResults;
}

export type AppState = AppLoadingState | AppFailedParseState | AppRunningState | AppFinishedState;

export interface AppActions {
    setDevice: (device: GPUDevice | null) => void;
    setCanvas: (canvas: HTMLCanvasElement | null) => void;
    setWGSL: (wgsl: string | undefined) => void;
    /** Replaces the code with an example, which is a new file rather than an edit to the one open. */
    loadExample: (wgsl: string) => void;
    setBindingInput: (id: string, input: string, buffer: ArrayBuffer) => void;
    setRunTarget: (target: RunTarget) => void;
    setRunnableInput: (name: string, input: string, buffer: ArrayBuffer) => void;
    setLoop: (loop: boolean) => void;
    play: () => void;
    pause: () => void;
    /** Throws away everything a loop has written, and starts it again from the bindings' values. */
    reset: () => void;
}
