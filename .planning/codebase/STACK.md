# Technology Stack

**Analysis Date:** 2026-06-08

## Languages

**Primary:**
- TypeScript ES2022 - extension source under `src/extension/*.ts`, ambient Pi SDK declarations in `src/types/pi-sdk.d.ts`, and Node test files in `tests/*.test.ts`.

**Secondary:**
- JSON - package metadata in `package.json`, lockfile in `package-lock.json`, TypeScript compiler settings in `tsconfig.json`, Pi package metadata in `extension-manifest.json`, and local Pi package registration in `.pi/settings.json`.
- Markdown - user/maintainer documentation in `README.md`, `docs/DESIGN.md`, `docs/USAGE.md`, prompt content in `prompts/gsd-review-loop.md`, and the package skill in `skills/pi-gsd/SKILL.md`.

## Runtime

**Environment:**
- Node.js >=22.0.0 - required by `package.json` `engines.node`; tests run through Node's built-in test runner with `--experimental-strip-types`.
- ECMAScript modules - `package.json` sets `"type": "module"`; source imports use explicit `.ts` extensions, enabled by `tsconfig.json` `allowImportingTsExtensions`.
- Pi platform >=2.29.0 - declared in `extension-manifest.json` under `requires.platform`.

**Package Manager:**
- npm - `package-lock.json` lockfile version 3 is present.
- Lockfile: present at `package-lock.json`; installed package versions include `@opengsd/gsd-core` 1.3.1, `typescript` 6.0.3, and `@types/node` 24.12.4.

## Frameworks

**Core:**
- Pi coding-agent extension API - `src/extension/index.ts` exports the default Pi extension registration function and imports `ExtensionAPI`, truncation helpers, and command/tool registration surfaces from `@earendil-works/pi-coding-agent`.
- Upstream GSD Core - `@opengsd/gsd-core` is a regular dependency in `package.json`; command discovery reads package-local markdown command prompts from `node_modules/@opengsd/gsd-core/commands/gsd` via `src/extension/gsd-core-commands.ts`.
- Node standard library - `src/extension/capabilities.ts`, `src/extension/dispatcher.ts`, `src/extension/gsd-core-commands.ts`, `src/extension/context-mode-guard.ts`, and `src/extension/model-routing.ts` use `node:fs`, `node:path`, `node:os`, `node:url`, and `node:child_process`.

**Testing:**
- Node test runner - `package.json` `test` script runs `node --experimental-strip-types --test tests/*.test.ts`.
- Node `assert/strict` - used by `tests/capabilities.test.ts`, `tests/context-mode-guard.test.ts`, `tests/dispatcher.test.ts`, `tests/metadata.test.ts`, `tests/register.test.ts`, and `tests/smoke.test.ts`.

**Build/Dev:**
- TypeScript 6.0.3 - `package.json` scripts use `tsc --noEmit` and `tsc -p tsconfig.json`; `tsconfig.json` sets strict `NodeNext` compilation with `noEmit`.
- typebox - peer dependency used in `src/extension/index.ts` to define the `gsd` tool parameter schema.
- `@earendil-works/pi-ai` - peer dependency used in `src/extension/index.ts` for `StringEnum` schema construction.

## Key Dependencies

**Critical:**
- `@opengsd/gsd-core` >=1.3.0 (`package-lock.json`: 1.3.1) - authoritative GSD workflow source; `src/extension/dispatcher.ts` invokes its package-local `gsd-tools` binary and `src/extension/gsd-core-commands.ts` dynamically exposes its command prompts.
- `@earendil-works/pi-coding-agent` * (peer) - provides the Pi extension API, tool/command registration, `pi.exec`, model/thinking APIs, active tool inventory, UI hooks, and truncation utilities used by `src/extension/index.ts` and `src/extension/register.ts`.
- `@earendil-works/pi-ai` * (peer) - provides `StringEnum` for runtime tool parameter validation in `src/extension/index.ts`.
- `typebox` * (peer) - provides `Type.Object`, `Type.Array`, `Type.String`, and `Type.Optional` in `src/extension/index.ts`.

**Infrastructure:**
- `typescript` ^6.0.3 - static validation and build command driver.
- `@types/node` ^24.10.0 - Node type declarations for standard-library imports and test files.
- Node built-ins (`fs`, `path`, `os`, `url`, `child_process`, `node:test`, `assert/strict`) - no Jest/Vitest dependency is present.

## Configuration

**Environment:**
- Pi package surfaces are declared in `package.json` under `pi.extensions`, `pi.skills`, and `pi.prompts`; the extension entry is `src/extension/index.ts`, skills are loaded from `skills`, and prompts from `prompts`.
- Package metadata for Pi installation is declared in `extension-manifest.json`, providing the `gsd` tool and `gsd-status`, `gsd-doctor`, `gsd-run`, `gsd-model`, and dynamic `gsd-*` commands.
- Local development Pi registration is configured by `.pi/settings.json`, which points Pi at the parent package path `..`.
- Optional model routing configuration is read from `.pi-gsd/model-routing.json` by `src/extension/model-routing.ts`; no project-local `.pi-gsd/model-routing.json` file is present in this repository.
- `.env` files: not detected in the repository root or first two levels during this scan; do not add secrets to codebase documents.

**Build:**
- `tsconfig.json` uses `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `strict: true`, `skipLibCheck: true`, `allowImportingTsExtensions: true`, `noEmit: true`, and `types: ["node"]`.
- `package.json` build/typecheck/test scripts are the canonical verification commands:
  - `npm run typecheck` - run `tsc --noEmit`.
  - `npm run build` - run `tsc -p tsconfig.json`.
  - `npm test` - run Node tests in `tests/*.test.ts`.
- No ESLint, Prettier, Biome, Jest, Vitest, or bundler config files were detected at the repository root.

## Package Layout

**Pi package roots:**
- `src/extension/index.ts` - default extension entry that registers the `gsd` tool and context-mode guard.
- `skills/pi-gsd/SKILL.md` - Pi skill that instructs agents to use upstream GSD Core through the adapter and to keep `.planning/` as the GSD record boundary.
- `prompts/gsd-review-loop.md` - bundled prompt resource declared by `package.json`.
- `extension-manifest.json` - Pi package identity, platform requirement, and provided tool/command declarations.

**Source modules:**
- `src/extension/register.ts` - central Pi tool/command registration, model command handler, dynamic upstream command handler, and command argument parsing.
- `src/extension/dispatcher.ts` - dispatcher for `status`, `doctor`, `run`, and `resolve-model`; calls package-local `gsd-tools` through `pi.exec` or Node `spawn`.
- `src/extension/capabilities.ts` - capability detection for GSD Core, `gsd-tools`, context-mode, and pi-subagents.
- `src/extension/gsd-core-commands.ts` - dynamic upstream command discovery and prompt expansion.
- `src/extension/context-mode-guard.ts` - guardrails for context-mode tool calls.
- `src/extension/model-routing.ts` - Pi-native GSD model/thinking routing and `.pi-gsd/model-routing.json` loading.
- `src/types/pi-sdk.d.ts` - ambient declarations for peer-provided Pi and Pi AI APIs.

## Platform Requirements

**Development:**
- Install dependencies with `npm install` in the package root containing `package.json` and `package-lock.json`.
- Use Node.js >=22.0.0.
- For local Pi development, run `pi install . -l` from this repository and reload/restart Pi as described in `README.md` and `docs/USAGE.md`.
- Optional accelerators must be installed separately with `pi install npm:context-mode` and `pi install npm:pi-subagents`; they are not nested dependencies of `pi-gsd`.

**Production:**
- Deployed as a Pi package/extension exposing `src/extension/index.ts` as the extension entry.
- Requires Pi platform >=2.29.0 and peer availability of `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, and `typebox` from the Pi runtime/package environment.
- Uses the package-local `@opengsd/gsd-core` dependency; never depend on a system-wide `gsd-tools` binary for production behavior.

---

*Stack analysis: 2026-06-08*
