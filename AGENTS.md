# AGENTS.md

WGSL Playground is a browser app for trying out WGSL (WebGPU shader) code: write a shader in the editor, and it shows the shader's structs and bindings, lets you fill in inputs, and runs compute, vertex or render functions on the GPU to show their outputs. Comments in the shader ("directives") can set things like workgroup counts and run order.

The code is a React + Vite + TypeScript app under `src/`. `app/` holds the UI: `components/` for the editor and each panel, `shared/` for pieces they reuse. `state/` is the Zustand store, its actions and the run loop. `utilities/` holds the non-UI logic, chiefly parsing WGSL (`parseWGSL.ts`), running it on the GPU (`runWGSLFunction.tsx`), share links and the directive grammar (`directives/`). `examples/` has the bundled example shaders. Tests sit next to the code as `*.test.ts`.

- Commands: `yarn dev`, `yarn lint`, `yarn test`, `yarn build`.
- Yarn 4 comes from `packageManager` via corepack. Run `corepack enable` once, or `yarn` stays on 1.x and errors.
- The Yarn version is pinned in two places: `packageManager` in `package.json` and the `YARN_VERSION` build variable on the Cloudflare Worker. Bump them together; Yarn versions write different lockfile formats, so a mismatch fails Cloudflare's immutable install.
- Deploys: Cloudflare Workers Builds deploys `main` to https://wgsl.hms.dev and a preview for every other branch (configured in `wrangler.jsonc`). GitHub CI only checks lint, tests and the build.
