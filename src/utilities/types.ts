import { StructInfo, TypeInfo } from "wgsl_reflect";

export interface WgslBinding {
    id: string;
    group: number;
    index: number;
    name: string;
    type: TypeInfo;
    writable: boolean;
    input: string;
    buffer: ArrayBuffer;
}

export interface WgslOutput {
    binding: WgslBinding;
    value: string;
}

interface RunnableComputeShader {
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
}

export type Runnable = RunnableComputeShader | RunnableRender; // | RunnableFunction | RunnableRenderTriangles;

export interface ParseResults {
    selected: string;
    runnables: Runnable[];
    bindings: WgslBinding[];
    structs: StructInfo[];
}
