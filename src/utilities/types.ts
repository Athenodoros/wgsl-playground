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

export interface WgslOutput {
    binding: WgslBinding;
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
          outputs: WgslOutput[];
      }
    | { type: "errors"; errors: RunnerResultError[] };

export interface RunnableComputeShader {
    id: string;
    type: "compute";
    name: string;
    threads: [number, number, number];
}

// interface RunnableFunction {
//     type: "function";
//     name: string;
//     arguments: any[];
// }

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

export type Runnable = RunnableComputeShader | RunnableRender; // | RunnableFunction | RunnableRenderTriangles;

export interface ParseResults {
    selected: Runnable | null;
    runnables: Runnable[];
    bindings: WgslBinding[];
    structs: StructInfo[];
}
