# AGENTS.md

- Commands: `yarn dev`, `yarn lint`, `yarn test`, `yarn build`.
- Yarn 4 comes from `packageManager` via corepack. Run `corepack enable` once, or `yarn` stays on 1.x and errors.
- The Yarn version is pinned in two places: `packageManager` in `package.json` and the `YARN_VERSION` build variable on the Cloudflare Worker. Bump them together; Yarn versions write different lockfile formats, so a mismatch fails Cloudflare's immutable install.
- Deploys: Cloudflare Workers Builds deploys `main` to https://wgsl.hms.dev and a preview for every other branch (configured in `wrangler.jsonc`). GitHub CI only checks lint, tests and the build.
