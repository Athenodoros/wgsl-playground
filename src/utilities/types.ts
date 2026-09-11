import { IconName, Intent } from "@blueprintjs/core";
import { ReactNode } from "react";
import { Attribute, ResourceType, StructInfo } from "wgsl_reflect";
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

export interface ParseResults {
    selected: Runnable | null;
    runnables: Runnable[];
    bindings: WgslBinding[];
    structs: StructInfo[];
}
