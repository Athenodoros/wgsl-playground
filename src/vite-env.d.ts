/// <reference types="vite/client" />

declare module "*.wgsl" {
    const code: string;
    export default code;
}
