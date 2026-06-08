# External Integrations

**Analysis Date:** 2026-06-08

## APIs & External Services

**Pi SDK / Pi Runtime:**
- Pi extension API - registers `pi-gsd` as a Pi extension and exposes the `gsd` tool plus slash commands.
  - SDK/Client: peer package `@earendil-works/pi-coding-agent`; ambient declarations are in `src/types/pi-sdk.d.ts`.
  - Auth: not applicable; Pi runtime provides `ExtensionAPI` to the default export in `src/extension/index.ts`.
  - Implementation: `src/extension/index.ts` calls `registerPiGsdCore` and `registerContextModeGuard`; `src/extension/register.ts` uses `registerTool`, `registerCommand`, `getAllTools`, `getThinkingLevel`, `setThinkingLevel`, `setModel`, `sendUserMessage`, and `exec` when present.
  - Provided surfaces: `extension-manifest.json` declares tool `gsd` and commands `gsd-status`, `gsd-doctor`, `gsd-run`, `gsd-model`, and dynamic `gsd-*`.

**Upstream GSD Core:**
- `@opengsd/gsd-core` - authoritative GSD workflow implementation used by this package without copying GSD semantics.
  - SDK/Client: npm dependency `@opengsd/gsd-core` in `package.json`; resolved version 1.3.1 in `package-lock.json`.
  - Auth: not applicable.
  - Command execution: `src/extension/dispatcher.ts` locates package-local `node_modules/.bin/gsd-tools` variants via `src/extension/capabilities.ts` and runs them through Pi `exec` or Node `child_process.spawn`.
  - Command prompt loading: `src/extension/gsd-core-commands.ts` reads package-local markdown commands from `node_modules/@opengsd/gsd-core/commands/gsd/*.md`, converts `gsd:<name>` to `/gsd-<name>`, substitutes arguments, and rewrites `@~/.claude/gsd-core/` references to the package-local GSD Core root.
  - Boundary: `docs/DESIGN.md`, `README.md`, and `skills/pi-gsd/SKILL.md` require GSD workflow semantics, phase artifact naming, and command behavior to remain upstream.

**context-mode:**
- Optional Pi accelerator for bulky/transient context processing, broad scans, logs, reports, and repeated search/filtering.
  - SDK/Client: no npm dependency in `package.json`; detected as a separately installed Pi package through active tools or filesystem probes.
  - Auth: not applicable.
  - Detection: `src/extension/capabilities.ts` treats active tools `ctx_execute`, `ctx_execute_file`, `ctx_search`, `ctx_index`, or `ctx_batch_execute` as the strongest signal, then probes `.pi` and home-level Pi extension/package paths.
  - Guardrails: `src/extension/context-mode-guard.ts` registers a Pi `tool_call` event handler that blocks accidental wholesale `.planning/` indexing, warns for individual `.planning` indexing, warns for small source/planning `ctx_execute_file` use, and allows logs/reports/build/coverage/data-style paths.
  - Agent guidance: `src/extension/register.ts` prompt guidelines and `skills/pi-gsd/SKILL.md` instruct agents to use `ctx_*` only when it materially reduces noisy context and not as durable GSD memory.

**pi-subagents:**
- Optional Pi accelerator for fresh-context or parallel planning, execution, review, and verification.
  - SDK/Client: no npm dependency in `package.json`; detected as a separately installed Pi package through active `subagent` tool or filesystem probes.
  - Auth: not applicable.
  - Detection: `src/extension/capabilities.ts` treats active tool `subagent` as the strongest signal, then probes `.pi` and home-level Pi extension/package paths.
  - Boundary: `src/extension/register.ts`, `src/extension/dispatcher.ts`, `docs/DESIGN.md`, `docs/USAGE.md`, and `skills/pi-gsd/SKILL.md` explicitly state that the `gsd` tool does not orchestrate subagents internally; parent agents call pi-subagents directly when appropriate.
  - Model handoff: `src/extension/model-routing.ts` returns a `subagent` block with an optional `model` and advisory `thinking`; consumers pass `subagent.model` only when present and otherwise omit `model` to inherit/default.

**Pi Model Routing Surfaces:**
- Pi-native model/thinking resolution for GSD agents, skills, and commands.
  - SDK/Client: Pi runtime `modelRegistry`, current `model`, `getThinkingLevel`, `setThinkingLevel`, `setModel`, and optional UI `select`, declared in `src/types/pi-sdk.d.ts` and consumed by `src/extension/register.ts` and `src/extension/model-routing.ts`.
  - Auth: model provider authentication is handled by Pi; this package only asks Pi to find/switch models and reports unavailable/auth failures.
  - Configuration: optional `.pi-gsd/model-routing.json` read by `src/extension/model-routing.ts`; no such file is present in this repository.
  - Commands/tools: `gsd` tool action `resolve-model` is implemented in `src/extension/dispatcher.ts`; `/gsd-model [agent|skill|command] <target>` is implemented by `src/extension/register.ts`.
  - Defaults: `src/extension/model-routing.ts` maps heavy GSD targets to `xhigh`, standard targets to `high`, and light targets to `medium`, while model selection defaults to `inherit`.
  - Fallback policies: `inherit`, `omit`, `error`, and `prompt` are supported by `src/extension/model-routing.ts`; prompt choices are remembered in memory via `sessionModelOverrides` in `src/extension/register.ts`.

**Schema and Tool Parameter Construction:**
- `typebox` and `@earendil-works/pi-ai` - build runtime parameter schema for the `gsd` tool.
  - SDK/Client: peer packages `typebox` and `@earendil-works/pi-ai`.
  - Auth: not applicable.
  - Implementation: `src/extension/index.ts` constructs `TOOL_PARAMS` with `Type.Object`, `Type.Array`, `Type.String`, `Type.Optional`, and `StringEnum` for actions `status`, `doctor`, `run`, and `resolve-model`.

## Data Storage

**Databases:**
- Not detected.
  - Connection: not applicable.
  - Client: no ORM or database client in `package.json`, `package-lock.json`, or `src/extension/*.ts`.

**File Storage:**
- Local filesystem only.
  - Package metadata: `package.json`, `package-lock.json`, `extension-manifest.json`, `.pi/settings.json`, and `tsconfig.json`.
  - GSD Core command prompts: read from package-local `node_modules/@opengsd/gsd-core/commands/gsd/*.md` by `src/extension/gsd-core-commands.ts`.
  - Optional model routing: `.pi-gsd/model-routing.json` read by `src/extension/model-routing.ts` when present.
  - GSD records: `.planning/` is the canonical project-local record directory by convention in `README.md`, `docs/DESIGN.md`, `docs/USAGE.md`, and `skills/pi-gsd/SKILL.md`.

**Caching:**
- In-memory session cache only for model fallback selections.
  - Implementation: `src/extension/register.ts` keeps `sessionModelOverrides` as a `Map<string, string>` for the current Pi extension session.
  - External cache: context-mode may maintain its own cache/index when installed, but `pi-gsd` does not use it as durable storage.

## Authentication & Identity

**Auth Provider:**
- Pi runtime / configured model providers.
  - Implementation: `src/extension/register.ts` calls `pi.setModel` only after `findPiModel` resolves a model from Pi's registry; if Pi reports missing auth or unavailable model, the command reports that failure.
  - No application-level users, OAuth providers, sessions, JWT libraries, or identity service clients are present in `package.json` or `src/extension/*.ts`.

## Monitoring & Observability

**Error Tracking:**
- None detected.
  - No Sentry, OpenTelemetry, Datadog, or similar dependency is present in `package.json` or imports under `src/extension/*.ts`.

**Logs:**
- User-visible tool/command output and Pi UI notifications.
  - Status/doctor output: `src/extension/dispatcher.ts` formats capability and integration diagnostics for the `gsd` tool and commands.
  - Context-mode guard notifications: `src/extension/context-mode-guard.ts` calls `ctx.ui.notify` with `warning` or `error` when Pi UI is available.
  - Runtime command output: `src/extension/dispatcher.ts` combines `stdout`, `stderr`, and exit code from `gsd-tools`, then truncates via `src/extension/index.ts` Pi truncation helpers or local `truncateTailText` fallback.

## CI/CD & Deployment

**Hosting:**
- Pi package installation.
  - Local development install: `README.md` and `docs/USAGE.md` use `npm install` followed by `pi install . -l`.
  - Package metadata: `extension-manifest.json` marks this as package id `pi-gsd` with version `0.1.0` and community tier.

**CI Pipeline:**
- None detected in the repository scan.
  - No `.github/workflows` files were observed in the first-level file listing.
  - Canonical verification commands are documented in `README.md`, `docs/DESIGN.md`, and `docs/USAGE.md`: `npm run typecheck`, `npm run build`, and `npm test`.

## Environment Configuration

**Required env vars:**
- None detected for this package.
- Model provider credentials, if needed, are owned by the host Pi/model provider configuration, not by `pi-gsd` source files.

**Secrets location:**
- Not detected in repository files scanned.
- Do not store secrets in `.planning/codebase/*.md`; if environment files are added later, note existence only and never quote contents.

**Optional project config:**
- `.pi-gsd/model-routing.json` - optional project-local model routing file read by `src/extension/model-routing.ts`; currently absent.
- `.pi/settings.json` - local Pi package registration for development; currently lists `..` under `packages`.

## Webhooks & Callbacks

**Incoming:**
- Pi extension registration callback - `src/extension/index.ts` default export receives `ExtensionAPI` and registers tools, commands, and event guard handlers.
- Pi tool execution callback - `src/extension/register.ts` registers the `gsd` tool `execute` callback for actions `status`, `doctor`, `run`, and `resolve-model`.
- Pi command callbacks - `src/extension/register.ts` registers handlers for `/gsd-status`, `/gsd-doctor`, `/gsd-run`, `/gsd-model`, and each dynamic upstream `/gsd-*` command.
- Pi `tool_call` event callback - `src/extension/context-mode-guard.ts` registers `pi.on("tool_call", ...)` to evaluate context-mode guard decisions.

**Outgoing:**
- Local process execution - `src/extension/dispatcher.ts` calls package-local `gsd-tools` through Pi `exec` or Node `child_process.spawn`; no network API calls are made by this adapter layer.
- Pi agent message dispatch - `src/extension/register.ts` uses `pi.sendUserMessage` to inject expanded upstream GSD Core command prompts for dynamic `/gsd-*` commands.
- Pi UI/model operations - `src/extension/register.ts` calls optional `ctx.ui.select`, `pi.setModel`, and `pi.setThinkingLevel` for `/gsd-model` flows.

---

*Integration audit: 2026-06-08*
