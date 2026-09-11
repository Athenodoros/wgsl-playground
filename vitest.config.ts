import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            // wgsl_reflect ships a CommonJS `main` inside a package marked "type": "module", so Node
            // resolves a file it then refuses to load. Point tests at the same ES build the browser
            // gets through the `module` field.
            alias: { wgsl_reflect: "wgsl_reflect/wgsl_reflect.module.js" },
        },
    })
);
