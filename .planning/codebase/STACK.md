# Technology Stack

**Analysis Date:** 2026-06-08

## Languages

**Primary:**
- TypeScript 6.0.3 - Extension implementation in `src/extension/*.ts` and Pi SDK ambient types in `src/types/pi-sdk.d.ts`; configured by `tsconfig.json` with `strict: true`, `module: "NodeNext"`, and `target: "ES2022"`.
- JavaScript (ES modules) - Live Pi RPC smoke script in `scripts/live-pi-rpc-smoke.mjs`.

**Secondary:**
- Markdown - Pi skill, prompts, and documentation in `skills/pi-gsd/SKILL.md`, `prompts/gsd-review-loop.md`, `README.md`, `docs/DESIGN.md`, and `docs/USAGE.md`.
- YAML - GitHub Actions CI workflow in `.github/workflows/ci.yml`.

## Runtime

**Environment:**
- Node.js >=22.0.0 - Required by `package.json` `engines.node`; CI uses Node 22 in `.github/workflows/ci.yml`.
- Pi platform >=2.29.0 - Required by `extension-manifest.json`; this package registers a Pi extension entry point at `src/extension/index.ts`.

**Package Manager:**
- npm - Scripts and lockfile are npm-based in `package.json` and `package-lock.json`.
- Lockfile: present at `package-lock.json` with lockfileVersion 3.

## Frameworks

**Core:**
- Pi Coding Agent SDK `@earendil-works/pi-coding-agent` 0.78.1 (peer dependency, installed in lockfile) - Pi extension API, tool registration, command registration, output truncation helpers; imported in `src/extension/index.ts`.
- Pi AI SDK `@earendil-works/pi-ai` 0.78.1 (peer dependency, installed in lockfile) - `StringEnum` schema helper used for the `gsd` tool action enum in `src/extension/index.ts`.
- TypeBox `typebox` 1.2.2 (peer dependency, installed in lockfile) - Runtime parameter schema construction in `src/extension/index.ts`.
- Upstream GSD Core `@opengsd/gsd-core` 1.3.1 (dependency, declared as `>=1.3.0`) - Provides package-local `gsd-tools` and dynamic GSD Core command markdown consumed by `src/extension/dispatcher.ts` and `src/extension/gsd-core-commands.ts`.

**Testing:**
- Node built-in test runner - Test command is `node --experimental-strip-types --test tests/*.test.ts` in `package.json`; tests live in `tests/*.test.ts`.
- Node assert module - Assertions use `node:assert/strict` in tests such as `tests/register.test.ts`, `tests/dispatcher.test.ts`, and `tests/capabilities.test.ts`.

**Build/Dev:**
- TypeScript compiler 6.0.3 - `npm run typecheck` executes `tsc --noEmit`; `npm run build` executes `tsc -p tsconfig.json`. Current `tsconfig.json` has `noEmit: true`, so the build is a validation build rather than an artifact-emitting build.
- Node `--experimental-strip-types` - Allows the Node test runner to execute TypeScript test files directly without a separate test transpiler.
- Pi CLI - Optional live smoke test in `scripts/live-pi-rpc-smoke.mjs` starts `pi --mode rpc` and loads `./src/extension/index.ts`.

## Key Dependencies

**Critical:**
- `@opengsd/gsd-core` >=1.3.0 / installed 1.3.1 - The adapter must use its package-local GSD Core copy. `src/extension/capabilities.ts` probes `node_modules/@opengsd/gsd-core/package.json` and `node_modules/.bin/gsd-tools*`; `src/extension/dispatcher.ts` refuses system-wide `gsd-tools` fallback.
- `@earendil-works/pi-coding-agent` * / installed 0.78.1 - Provides the Pi extension contract used by `src/extension/index.ts` and the runtime methods modeled in `src/extension/register.ts`.
- `@earendil-works/pi-ai` * / installed 0.78.1 - Provides `StringEnum` used in the public `gsd` tool schema in `src/extension/index.ts`.
- `typebox` * / installed 1.2.2 - Builds the public JSON schema for Pi tool parameters in `src/extension/index.ts`.

**Infrastructure:**
- `typescript` ^6.0.3 / installed 6.0.3 - Static type checking for `src/**/*.ts`.
- `@types/node` ^24.10.0 / installed 24.12.4 - Node types for filesystem, process, child process, paths, and test-time utilities used across `src/extension/*.ts`, `scripts/live-pi-rpc-smoke.mjs`, and `tests/*.test.ts`.
- Node built-in modules - `node:fs`, `node:path`, `node:os`, `node:url`, `node:child_process`, `node:events`, `node:test`, and `node:assert/strict` are used throughout `src/extension/*.ts`, `scripts/live-pi-rpc-smoke.mjs`, and `tests/*.test.ts`.

## Configuration

**Environment:**
- No `.env` file detected at repository root; do not require environment-variable secrets for normal typecheck, build, or unit tests.
- Runtime behavior is configured through Pi extension metadata in `package.json` (`pi.extensions`, `pi.skills`, `pi.prompts`) and `extension-manifest.json` (`provides.tools`, `provides.commands`, `requires.platform`).
- Optional project-local model routing is read from `.pi-gsd/model-routing.json` by `src/extension/model-routing.ts` when present. This file is wrapper-private adapter metadata, not a GSD Core `.planning/` artifact.
- Optional integration detection probes active Pi tools and filesystem paths for `context-mode` and `pi-subagents` in `src/extension/capabilities.ts`.

**Build:**
- `package.json` - Declares scripts, dependencies, peer dependencies, npm lockfile expectations, and Pi package resources.
- `package-lock.json` - Pins installed package versions for CI and local development.
- `tsconfig.json` - Configures strict TypeScript, NodeNext modules, ES2022 target, TypeScript extension imports, and `src/**/*.ts` inclusion.
- `extension-manifest.json` - Pi package identity and public tool/command metadata.
- `.github/workflows/ci.yml` - Runs `npm ci`, `npm run typecheck`, `npm run build`, and `npm test` on Node 22.

## Platform Requirements

**Development:**
- Node.js 22 or newer; CI uses `actions/setup-node@v5` with `node-version: 22` in `.github/workflows/ci.yml`.
- npm with `package-lock.json`; use `npm install` locally and `npm ci` in CI.
- Pi CLI for local extension installation and optional smoke validation: README commands are `pi install . -l` and `npm run test:live-pi`.
- Optional Pi packages `context-mode` and `pi-subagents` should be installed through Pi (`pi install npm:context-mode`, `pi install npm:pi-subagents`) rather than as nested npm dependencies; this constraint is documented in `README.md`, `docs/DESIGN.md`, and `skills/pi-gsd/SKILL.md`.

**Production:**
- Deployment target is a Pi package loaded by Pi, not a standalone server. The package exposes extension code through `src/extension/index.ts`, skills under `skills/`, and prompts under `prompts/` via `package.json`.
- Runtime requires Pi platform >=2.29.0 per `extension-manifest.json` and package-local `@opengsd/gsd-core` availability for `gsd-tools` execution.
- CI/deployment automation is limited to GitHub Actions in `.github/workflows/ci.yml`; no container image, server host, database, or cloud runtime is configured.

---

*Stack analysis: 2026-06-08*
