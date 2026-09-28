import { ParseResults, PlaybackState, RunTarget, RunnerResults } from "../utilities/types";

/** How the outputs panel shows what a run reads back, which decides what a run reads back at all. */
interface OutputDisplayState {
    /**
     * Large buffer bindings, by id, that were asked to be shown as text anyway. Every other large
     * buffer is left out of what a run reads back, and only its length is shown.
     */
    renderedOutputs: string[];
    /**
     * How many times a shader has asked for the panels about its code to be collapsed. The panels
     * collapse whenever it goes up, and are the user's to open again after that.
     */
    collapseRequests: number;
}

interface AppLoadingState extends ParseResults, PlaybackState, OutputDisplayState {
    type: "loading";
    device?: GPUDevice | null;
    canvas?: HTMLCanvasElement;
    wgsl: string;
}

export interface AppFailedParseState extends ParseResults, PlaybackState, OutputDisplayState {
    type: "failed-parse";
    device: GPUDevice | null;
    canvas: HTMLCanvasElement;
    wgsl: string;
    error: string;
}

export interface AppRunningState extends ParseResults, PlaybackState, OutputDisplayState {
    type: "running";
    device: GPUDevice | null;
    canvas: HTMLCanvasElement;
    wgsl: string;
}

export interface AppFinishedState extends ParseResults, PlaybackState, OutputDisplayState {
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
    /** Shows a large buffer's output as text, or goes back to showing only its length. */
    setOutputRendered: (id: string, rendered: boolean) => void;
    /** Reads a buffer's value as the run in progress, or the last one, left it. */
    readOutput: (id: string) => Promise<string>;
}
