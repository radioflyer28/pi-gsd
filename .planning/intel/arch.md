---
updated_at: "2026-06-08T14:53:11.885Z"
---

## Architecture Overview

pi-gsd is a TypeScript Pi package that exposes a thin Pi-facing adapter around package-local upstream GSD Core. The extension entry point in `src/extension/index.ts` declares the `gsd` tool schema, delegates registration to `src/extension/register.ts`, and installs the context-mode guard from `src/extension/context-mode-guard.ts`. Runtime execution is intentionally routed through `src/extension/dispatcher.ts`, which resolves capabilities, invokes `gsd-tools`, formats status/doctor output, and resolves model routing without copying upstream workflow semantics.

## Key Components

| Component | Path | Responsibility |
|-----------|------|----------------|
| Package metadata | `package.json` | Defines Pi package resources, npm scripts, peer runtime dependencies, and bundled `@opengsd/gsd-core`. |
| Extension manifest | `extension-manifest.json` | Declares Pi-provided tool `gsd` and slash commands `gsd-status`, `gsd-doctor`, `gsd-run`, `gsd-model`, and `gsd-*`. |
| Extension entry point | `src/extension/index.ts` | Builds the TypeBox tool parameter schema, truncates tool output for Pi display, and calls registration modules. |
| Registration layer | `src/extension/register.ts` | Registers the Pi tool and slash commands, parses command arguments, handles model switching, and dispatches dynamic GSD Core commands. |
| Dispatcher layer | `src/extension/dispatcher.ts` | Implements status, doctor, run, and resolve-model actions over package-local `gsd-tools` and capability data. |
| Capability detection | `src/extension/capabilities.ts` | Detects bundled GSD Core/gsd-tools and optional project/user Pi packages such as context-mode and pi-subagents. |
| GSD Core command bridge | `src/extension/gsd-core-commands.ts` | Discovers upstream command markdown files and expands command prompts with package-local GSD Core references. |
| Model routing | `src/extension/model-routing.ts` | Loads `.pi-gsd/model-routing.json`, resolves agent/skill/command targets, and formats model/thinking recommendations. |
| Context-mode guard | `src/extension/context-mode-guard.ts` | Warns or blocks selected context-mode calls for `.planning` and small source files through Pi `tool_call` events. |
| SDK type shim | `src/types/pi-sdk.d.ts` | Provides local type declarations for Pi extension and TypeBox helper imports. |
| Live smoke script | `scripts/live-pi-rpc-smoke.mjs` | Exercises Pi RPC behavior against a live Pi process. |
| Unit tests | `tests/*.test.ts` | Cover capability detection, dispatcher behavior, command registration, model routing, context-mode guard behavior, metadata, and smoke execution. |
| Documentation | `README.md`, `docs/DESIGN.md`, `docs/USAGE.md`, `skills/pi-gsd/SKILL.md` | Describe adapter boundaries, command usage, optional integrations, and skill rules. |

## Data Flow

`src/extension/index.ts` registers the extension with Pi -> `src/extension/register.ts` registers tool/commands -> `src/extension/dispatcher.ts` resolves cwd and capabilities via `src/extension/capabilities.ts` -> dispatcher invokes package-local upstream `gsd-tools` or model routing in `src/extension/model-routing.ts` -> output is truncated/formatted for Pi. Dynamic slash commands follow `src/extension/gsd-core-commands.ts` discovery -> prompt expansion -> `sendUserMessage()` back into Pi. Context-mode tool calls follow Pi `tool_call` events -> `src/extension/context-mode-guard.ts` decision -> allow, warn, or block.

## Conventions

- Source code uses ESM TypeScript with explicit `.ts` relative imports, configured by `tsconfig.json` with `module` and `moduleResolution` set to `NodeNext`.
- Node built-ins are imported with `node:` specifiers in `src/extension/*.ts`, `tests/*.test.ts`, and `scripts/live-pi-rpc-smoke.mjs`.
- The adapter keeps GSD state in `.planning/` and Pi-wrapper-specific behavior in extension code; `skills/pi-gsd/SKILL.md` documents the boundary.
- Test files import implementation modules directly with `.ts` extensions and run through `node --experimental-strip-types --test tests/*.test.ts` from `package.json`.
- CI in `.github/workflows/ci.yml` runs `npm ci`, `npm run typecheck`, `npm run build`, and `npm test` on Node 22.
