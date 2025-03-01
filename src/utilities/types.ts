import { IconName, Intent } from "@blueprintjs/core";
import { ReactNode } from "react";
import { ResourceType, StructInfo, TypeInfo } from "wgsl_reflect";

export interface WgslBinding {
    id: string;
    group: number;
    index: number;
    name: string;
    type: TypeInfo;
    writable: boolean;
    resourceType: ResourceType;
    input: string;
    buffer: ArrayBuffer;
}

export interface BindingOutput {
    binding: WgslBinding;
    value: string;
}

export interface FunctionOutput {
    name: string;
    type: TypeInfo;
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
}

export interface RunnableFunction {
    id: string;
    type: "function";
    name: string;
    startLine: number;
    endLine: number;
    arguments: {
        name: string;
        type: TypeInfo;
        input: string;
        buffer: ArrayBuffer;
    }[];
    output: TypeInfo | null;
}

// interface RunnableRenderTriangles {
//     id: string;
//     type: "render-triangles";
//     vertex: string;
//     vertices: number;
// }

export interface RunnableRender {
    id: string;
    type: "render";
    vertex: string;
    fragment: string;
    vertices: number;
    useDepthTexture: boolean;
}

export type Runnable = RunnableComputeShader | RunnableRender | RunnableFunction;

export interface ParseResults {
    selected: Runnable | null;
    runnables: Runnable[];
    bindings: WgslBinding[];
    structs: StructInfo[];
}
