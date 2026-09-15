import { IconName, Intent } from "@blueprintjs/core";
import { ReactNode } from "react";
import { Attribute, ResourceType, StructInfo } from "wgsl_reflect";
import { NonEmpty } from "./data";
import { StorageTextureFormat } from "./storageTextures";
import { WGSLType } from "./WGSLType";

interface WgslBindingBase {
    id: string;
    group: number;
    index: number;
    name: string;
    type: WGSLType;
    attributes: Attribute[] | null;
    /** The directive comment this binding was configured from, if any. */
    directive: string | null;
    /** Set when that comment could not be read as a directive for this type. */
    warning: string | null;
    writable: boolean;
    resourceType: ResourceType;
}

/** A binding whose contents live on the CPU as text, and are uploaded to a buffer on every run. */
export interface WgslBufferBinding extends WgslBindingBase {
    kind: "buffer";
    input: string;
    buffer: ArrayBuffer;
    /**
     * Whether the playground writes the seconds since the last frame into this binding, rather than
     * the user choosing what it holds. Only an f32 uniform marked `playground-time` is one.
     */
    time: boolean;
}

/**
 * A storage texture, which exists only on the GPU. There is nothing to upload and nothing to edit:
 * the shader writes it, and the directive comment gives its size rather than its contents.
 */
export interface WgslTextureBinding extends WgslBindingBase {
    kind: "texture";
    format: StorageTextureFormat;
    width: number;
    height: number;
}

export type WgslBinding = WgslBufferBinding | WgslTextureBinding;

export interface BindingOutput {
    binding: WgslBufferBinding;
    value: string;
}

export interface FunctionOutput {
    name: string;
    type: WGSLType;
    value: string;
}

export interface RunnerResultError {
    title?: string;
    text: ReactNode;
    intent: Intent;
    icon: IconName;
}
export type RunnerResults =
    | {
          type: "outputs";
          getTextureValue?: (row: number, column: number) => [number, number, number, number] | null;
          bindings: BindingOutput[];
          returned: FunctionOutput | null;
      }
    | { type: "errors"; errors: RunnerResultError[] };

export interface RunnableComputeShader {
    id: string;
    type: "compute";
    name: string;
    threads: [number, number, number];
    /** The directive comment the counts came from, so an edit to it can be told from any other. */
    directive: string | null;
    /** Set when that comment could not be read as a work group count. */
    warning: string | null;
}

export interface RunnableFunctionArgument {
    name: string;
    type: WGSLType;
    input: string;
    buffer: ArrayBuffer;
}

export interface RunnableFunction {
    id: string;
    type: "function";
    name: string;
    startLine: number;
    endLine: number;
    arguments: RunnableFunctionArgument[];
    output: WGSLType | null;
}

export interface RunnableRender {
    id: string;
    type: "render";
    vertex: string;
    fragment: string;
    vertices: number;
    /** The directive comment the count came from, so an edit to it can be told from any other. */
    directive: string | null;
    /** Set when that comment could not be read as a vertex count. */
    warning: string | null;
    useDepthTexture: boolean;
}

export type Runnable = RunnableComputeShader | RunnableRender | RunnableFunction;

/**
 * What a run dispatches, and the one place that says what can be run alongside what.
 *
 * Only compute shaders chain, so only they arrive as a list. A function is run through a generated
 * entry point of its own with bindings to match, and a render pass needs its bindings visible to
 * stages a compute pass does not use, so neither composes with anything else. Saying that here,
 * rather than checking it wherever a target is used, is what lets the runner switch over this and be
 * done - there is no combination left for it to reject.
 *
 * Targets are built through the helpers in `runTarget.ts`, which is what keeps `passes` non-empty:
 * an empty sequence is `none`, not a second way of spelling it.
 */
export type RunTarget =
    | { type: "none" }
    | { type: "compute"; passes: NonEmpty<RunnableComputeShader> }
    | { type: "render"; runnable: RunnableRender }
    | { type: "function"; runnable: RunnableFunction };

/** A target with something in it, which is what the runner takes. */
export type ActiveRunTarget = Exclude<RunTarget, { type: "none" }>;

export interface ParseResults {
    /** What runs, out of the `runnables` below. */
    target: RunTarget;
    /**
     * The entry point names the shader's run order comment gives, as written, or null without one.
     *
     * Kept as written rather than as the passes it resolves to, so that an edit to the comment can be
     * told from an edit anywhere else, and so a name that matches nothing can still be reported.
     */
    runOrder: string[] | null;
    runnables: Runnable[];
    bindings: WgslBinding[];
    structs: StructInfo[];
    /**
     * Whether a compute or render target runs frame after frame rather than once.
     *
     * A parse turns it on exactly when the shader has a time uniform, since that is a shader written
     * to be looped. After that it is the user's, and is only reset when that question changes answer.
     */
    loop: boolean;
}

/** Whether a looping target is advancing, and how far it has got since it last started over. */
export interface PlaybackState {
    playing: boolean;
    clock: LoopClock;
}

export interface LoopClock {
    frames: number;
    /** Seconds, summed over the frames run, so time spent paused is not counted. */
    elapsed: number;
}

export const STOPPED_CLOCK: LoopClock = { frames: 0, elapsed: 0 };
