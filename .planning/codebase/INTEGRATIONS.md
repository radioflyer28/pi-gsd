# External Integrations

**Analysis Date:** 2026-06-08

## APIs & External Services

**Pi Runtime:**
- Pi Coding Agent - Host runtime for the extension, tool registration, slash command registration, UI notifications, command dispatch, model switching, and optional process execution.
  - SDK/Client: `@earendil-works/pi-coding-agent` imported by `src/extension/index.ts`; runtime API surface modeled by `RegisterablePiApi` and `GsdExecutionContext` in `src/extension/register.ts` and `src/extension/dispatcher.ts`.
  - Auth: Not detected in this repository. Pi runtime/provider authentication is external to `pi-gsd`.
- Pi AI model registry - Used only for Pi-native model lookup and switching in `src/extension/model-routing.ts` and `src/extension/register.ts`.
  - SDK/Client: Pi runtime `modelRegistry`, `setModel`, `getThinkingLevel`, and `setThinkingLevel` methods modeled in `src/extension/register.ts`.
  - Auth: Not detected in this repository; configured by the user's Pi installation.

**GSD Core:**
- Upstream `@opengsd/gsd-core` - Source of GSD workflow command prompts and package-local `gsd-tools` binary. `src/extension/gsd-core-commands.ts` discovers markdown command definitions from `node_modules/@opengsd/gsd-core/commands/gsd/*.md`; `src/extension/dispatcher.ts` executes the package-local `gsd-tools` path detected by `src/extension/capabilities.ts`.
  - SDK/Client: `@opengsd/gsd-core` npm package and `node_modules/.bin/gsd-tools*` command.
  - Auth: None detected.

**Optional Pi Packages:**
- `context-mode` - Optional context-efficient toolset detected for agent guidance and guarded by `src/extension/context-mode-guard.ts`.
  - SDK/Client: Active Pi tool inventory names (`ctx_execute`, `ctx_execute_file`, `ctx_search`, `ctx_index`, `ctx_batch_execute`) or filesystem probes in `src/extension/capabilities.ts`.
  - Auth: Not detected in this repository; installed through Pi when needed.
- `pi-subagents` - Optional fresh-context/parallel delegation capability detected for agent guidance in status/doctor output.
  - SDK/Client: Active Pi tool inventory name `subagent` or filesystem probes in `src/extension/capabilities.ts`.
  - Auth: Not detected in this repository; installed through Pi when needed.

**Package Registries:**
- npm registry - Dependency source for `@opengsd/gsd-core`, Pi peer packages, TypeScript, and Node types as recorded in `package-lock.json`.
  - SDK/Client: npm CLI via `npm install` / `npm ci` in `README.md` and `.github/workflows/ci.yml`.
  - Auth: No `.npmrc` file detected or read; no repository-local npm token is used.

## Data Storage

**Databases:**
- Not detected.
  - Connection: Not applicable.
  - Client: Not applicable.

**File Storage:**
- Local filesystem only.
  - `src/extension/capabilities.ts` reads local package and Pi installation paths to detect `@opengsd/gsd-core`, `gsd-tools`, `context-mode`, and `pi-subagents`.
  - `src/extension/gsd-core-commands.ts` reads package-local upstream GSD Core command markdown files from `node_modules/@opengsd/gsd-core/commands/gsd/*.md`.
  - `src/extension/model-routing.ts` optionally reads `.pi-gsd/model-routing.json` for project-local Pi model routing.
  - `src/extension/dispatcher.ts` reads `$HOME/.pi/agent/skills/*/SKILL.md` paths to warn about external global `gsd-*` skills.

**Caching:**
- None implemented by this package.
- `context-mode` may provide its own caches when installed, but `pi-gsd` treats those as optional supporting context and not durable state; this boundary is documented in `README.md`, `docs/DESIGN.md`, and `skills/pi-gsd/SKILL.md`.

## Authentication & Identity

**Auth Provider:**
- Not detected.
  - Implementation: `pi-gsd` does not implement user identity, sessions, tokens, login flows, or OAuth. It inherits any provider/model authentication from the surrounding Pi runtime.

**Model Identity:**
- Pi-native provider/model references are represented as `provider/id` strings by `modelRef()` in `src/extension/model-routing.ts`.
- Optional routing configuration is read from `.pi-gsd/model-routing.json`; missing or unavailable configured models fall back according to `inherit`, `omit`, `error`, or `prompt` policy in `src/extension/model-routing.ts`.

## Monitoring & Observability

**Error Tracking:**
- None.

**Logs:**
- Tool and command results are returned as text to Pi rather than sent to external logs. `src/extension/register.ts` wraps tool results in `content: [{ type: "text", text }]`.
- `src/extension/dispatcher.ts` includes stdout, stderr, and exit code from `gsd-tools` execution in the returned text.
- `src/extension/index.ts` truncates tool output with Pi helper functions `truncateTail`, `DEFAULT_MAX_BYTES`, and `DEFAULT_MAX_LINES`.
- `src/extension/dispatcher.ts` bounds spawned process output with `StreamingTextTail` before final truncation.
- `scripts/live-pi-rpc-smoke.mjs` writes smoke-test failures and timeout details to stderr for local/CI diagnostics.

## CI/CD & Deployment

**Hosting:**
- Pi package loaded by Pi from this repository or an installed package source.
- Local development install is documented as `pi install . -l` in `README.md`.
- `extension-manifest.json` declares package id `pi-gsd`, tool `gsd`, and command patterns `gsd-status`, `gsd-doctor`, `gsd-run`, `gsd-model`, and `gsd-*`.

**CI Pipeline:**
- GitHub Actions in `.github/workflows/ci.yml`.
- Pipeline triggers on pushes to `main` and pull requests.
- Pipeline uses `actions/checkout@v5`, `actions/setup-node@v5`, Node 22, npm cache, `npm ci`, `npm run typecheck`, `npm run build`, and `npm test`.
- Optional live Pi RPC smoke test is available via `npm run test:live-pi` in `package.json` and `scripts/live-pi-rpc-smoke.mjs`, but it is not part of `.github/workflows/ci.yml`.

## Environment Configuration

**Required env vars:**
- None detected for package build, unit tests, or normal extension registration.
- No `.env` file detected at repository root. Do not add secrets to codebase docs or planning artifacts.

**Secrets location:**
- Not detected in this repository.
- Pi provider credentials, if any, live outside this package in the user's Pi/runtime configuration.
- Repository-local `.pi/settings.json` exists but was not needed for integration analysis and should not be treated as an application secret source.

**Runtime config files:**
- `package.json` - Pi package resource registration and npm scripts.
- `extension-manifest.json` - Pi platform requirement and public tool/command metadata.
- `tsconfig.json` - TypeScript runtime/module assumptions.
- `.pi-gsd/model-routing.json` - Optional project-local model routing read by `src/extension/model-routing.ts` when present.

## Webhooks & Callbacks

**Incoming:**
- None detected. No HTTP server, webhook route, or API endpoint exists in `src/extension/*.ts`.
- Pi invokes extension registration through `src/extension/index.ts` and command/tool handlers registered in `src/extension/register.ts`.

**Outgoing:**
- No direct HTTP API calls detected in `src/extension/*.ts`, `tests/*.test.ts`, or `scripts/live-pi-rpc-smoke.mjs`.
- Outgoing process execution is limited to package-local `gsd-tools` via Pi `exec` or Node `child_process.spawn` in `src/extension/dispatcher.ts`, and to the Pi CLI smoke test in `scripts/live-pi-rpc-smoke.mjs`.
- npm dependency installation and GitHub Actions use network services outside application runtime; configuration is in `package.json`, `package-lock.json`, and `.github/workflows/ci.yml`.

---

*Integration audit: 2026-06-08*
