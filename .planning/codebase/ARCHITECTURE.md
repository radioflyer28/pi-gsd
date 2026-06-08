<!-- refreshed: 2026-06-08 -->
# Architecture

**Analysis Date:** 2026-06-08

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                 Pi Extension Runtime                         │
│                 `src/extension/index.ts`                     │
├──────────────────────┬──────────────────────────────────────┤
│ `gsd` Pi tool         │ `/gsd-*` slash commands              │
│ `src/extension/       │ `src/extension/register.ts`          │
│  register.ts`         │                                      │
└──────────┬────────────┴──────────────────┬───────────────────┘
           │                               │
           ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│              Adapter / Coordination Layer                    │
│ `src/extension/register.ts`                                  │
│ - normalizes Pi tool and command calls                       │
│ - resolves cwd and model routing context                     │
│ - registers dynamic upstream GSD Core commands               │
└──────────┬────────────────────┬──────────────────────────────┘
           │                    │
           ▼                    ▼
┌────────────────────────────┐  ┌──────────────────────────────┐
│ Dispatcher                  │  │ Guardrails / Routing          │
│ `src/extension/             │  │ `src/extension/               │
│  dispatcher.ts`             │  │  context-mode-guard.ts`       │
│ - status/doctor/run         │  │ `src/extension/               │
│ - package-local gsd-tools   │  │  model-routing.ts`            │
└──────────┬─────────────────┘  └──────────────┬───────────────┘
           │                                   │
           ▼                                   ▼
┌─────────────────────────────────────────────────────────────┐
│               Capability + Command Discovery                 │
│ `src/extension/capabilities.ts`                              │
│ `src/extension/gsd-core-commands.ts`                          │
└──────────┬──────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│        Package-Local Upstream GSD Core + Project State        │
│ `node_modules/@opengsd/gsd-core`                              │
│ `node_modules/.bin/gsd-tools`                                 │
│ `.planning/`                                                  │
│ optional `.pi-gsd/model-routing.json`                         │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Extension entry point | Define the public `gsd` tool parameter schema, attach Pi output truncation, register the core adapter, and register the context-mode guard. | `src/extension/index.ts` |
| Pi registration layer | Convert Pi tool calls and slash commands into dispatcher calls; register `/gsd-status`, `/gsd-doctor`, `/gsd-run`, `/gsd-model`, and dynamic upstream `/gsd-*` commands. | `src/extension/register.ts` |
| Dispatcher | Implement `status`, `doctor`, `run`, and `resolve-model` as a thin boundary around package-local GSD Core and Pi execution. | `src/extension/dispatcher.ts` |
| Capability detection | Detect package-local `@opengsd/gsd-core`, package-local `gsd-tools`, optional `context-mode`, and optional `pi-subagents`; compute `inline`, `ctx-inline`, `delegated`, or `delegated-ctx` mode. | `src/extension/capabilities.ts` |
| GSD Core command discovery | Read upstream command markdown from `node_modules/@opengsd/gsd-core/commands/gsd`, parse frontmatter, and expand it into Pi user-message prompts. | `src/extension/gsd-core-commands.ts` |
| Model routing | Resolve Pi-native model and thinking guidance from defaults, tier maps, optional `.pi-gsd/model-routing.json`, current Pi model, model registry, and session fallback choices. | `src/extension/model-routing.ts` |
| Context-mode guard | Register a Pi `tool_call` hook that blocks accidental wholesale `.planning/` indexing and warns on low-value context-mode use for small durable files. | `src/extension/context-mode-guard.ts` |
| Pi SDK ambient types | Declare the subset of Pi extension and AI APIs consumed by TypeScript source. | `src/types/pi-sdk.d.ts` |
| Live smoke script | Start Pi in RPC mode and verify live extension registration without LLM keys. | `scripts/live-pi-rpc-smoke.mjs` |
| Tests | Exercise each module through Node's built-in test runner with TypeScript stripping. | `tests/*.test.ts`, `tests/test-utils.ts` |

## Pattern Overview

**Overall:** Thin adapter / boundary layer around upstream GSD Core.

**Key Characteristics:**
- Keep GSD workflow semantics in upstream `@opengsd/gsd-core`; Pi-specific code lives under `src/extension/`.
- Prefer explicit typed seams (`GsdDispatcher`, `RegisterablePiApi`, `Capabilities`, `ResolvedModelRouting`) over direct cross-module side effects.
- Detect runtime integrations from active Pi tool inventory first, then from filesystem probes in `src/extension/capabilities.ts`.
- Treat `.planning/` as canonical GSD project records and `.pi-gsd/model-routing.json` as optional wrapper-private model routing configuration.
- Keep `context-mode` and `pi-subagents` optional Pi packages, not nested runtime dependencies of `pi-gsd`.

## Layers

**Pi Extension Surface:**
- Purpose: Define what Pi loads and what the user can call.
- Location: `src/extension/index.ts`
- Contains: Typebox parameter schema, output truncation adapter, extension default export.
- Depends on: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `typebox`, `src/extension/register.ts`, `src/extension/context-mode-guard.ts`.
- Used by: Pi through the `pi.extensions` entry in `package.json`.

**Registration and Command Layer:**
- Purpose: Translate Pi tool/command invocations into adapter operations.
- Location: `src/extension/register.ts`
- Contains: `registerPiGsdCore`, command handlers, argument parsing, active tool inventory collection, session model override tracking.
- Depends on: `src/extension/dispatcher.ts`, `src/extension/capabilities.ts`, `src/extension/gsd-core-commands.ts`, `src/extension/model-routing.ts`.
- Used by: `src/extension/index.ts` and tests in `tests/register.test.ts`.

**Dispatch Layer:**
- Purpose: Centralize package-local GSD Core interaction and status/doctor formatting.
- Location: `src/extension/dispatcher.ts`
- Contains: `createGsdDispatcher`, `resolveCwd`, output truncation, external GSD skill warning, Node spawn fallback.
- Depends on: Node `child_process`, `fs`, `os`, `path`, `src/extension/capabilities.ts`, `src/extension/model-routing.ts`.
- Used by: `src/extension/register.ts` and `tests/dispatcher.test.ts`.

**Discovery Layer:**
- Purpose: Discover installed capabilities and upstream command definitions without duplicating GSD Core behavior.
- Location: `src/extension/capabilities.ts`, `src/extension/gsd-core-commands.ts`
- Contains: filesystem candidate construction, active tool signals, command markdown frontmatter parsing, `$ARGUMENTS` and `$1` expansion.
- Depends on: Node `fs`, `os`, `path`, `url`.
- Used by: `src/extension/dispatcher.ts`, `src/extension/register.ts`, `tests/capabilities.test.ts`, `tests/gsd-core-commands.test.ts`.

**Policy and Guardrails Layer:**
- Purpose: Keep Pi-specific safety policies close to Pi integration points.
- Location: `src/extension/context-mode-guard.ts`, `src/extension/model-routing.ts`
- Contains: context-mode tool-call decisions, model tier defaults, `.pi-gsd/model-routing.json` loading, fallback handling, formatting for subagent consumers.
- Depends on: Node `fs`, `path` and Pi context objects supplied through `RegisterablePiApi`/`GsdExecutionContext`.
- Used by: `src/extension/index.ts`, `src/extension/register.ts`, `src/extension/dispatcher.ts`, `tests/context-mode-guard.test.ts`, `tests/model-routing.test.ts`.

**Test Support Layer:**
- Purpose: Isolate Pi runtime behavior behind deterministic fakes.
- Location: `tests/test-utils.ts`
- Contains: `capabilities()`, `mockPi()`, and `toolText()` helpers.
- Depends on: public types from `src/extension/capabilities.ts`.
- Used by: all `tests/*.test.ts` files.

## Data Flow

### Pi Tool Request Path

1. Pi loads `src/extension/index.ts` from `package.json` and calls `registerPiGsdExtension(pi)` (`src/extension/index.ts:58`).
2. `registerPiGsdExtension` calls `registerPiGsdCore` with the Typebox `TOOL_PARAMS` schema and `truncateForPiTool` (`src/extension/index.ts:59`).
3. `registerPiGsdCore` creates a runtime-aware capability detector, discovers upstream GSD Core commands, creates a dispatcher, and registers the `gsd` tool (`src/extension/register.ts:301`).
4. A `gsd` tool call enters the registered `execute` callback and calls `executeGsd` (`src/extension/register.ts:337`).
5. `executeGsd` resolves the cwd with `resolveCwd`, builds model routing context, and dispatches by `action` to `status`, `doctor`, `resolveModel`, or `run` (`src/extension/register.ts:80`).
6. `createGsdDispatcher` formats status/doctor output, resolves model routing, or runs package-local `gsd-tools` via `pi.exec` or Node spawn (`src/extension/dispatcher.ts:271`).
7. The result returns as Pi text content with capability details attached (`src/extension/register.ts:28`).

### Slash Command Path

1. `registerPiGsdCore` registers fixed commands `/gsd-status`, `/gsd-doctor`, `/gsd-run`, and `/gsd-model` (`src/extension/register.ts:343`).
2. `/gsd-run <args>` uses `parseCommandArgs` to preserve quoted and escaped CLI arguments before calling dispatcher `run` (`src/extension/register.ts:105`).
3. `/gsd-model [agent|skill|command] <target>` parses target text with `parseGsdModelTarget`, resolves route with `resolveModelRouting`, optionally switches Pi model via `pi.setModel`, and applies thinking via `pi.setThinkingLevel` (`src/extension/register.ts:182`).
4. Dynamic upstream commands are registered from `GsdCoreCommand[]` and send an expanded upstream command prompt back to Pi through `pi.sendUserMessage` (`src/extension/register.ts:278`).

### Dynamic Upstream Command Flow

1. `discoverGsdCoreCommands` locates `node_modules/@opengsd/gsd-core/commands/gsd` using `gsdCoreCommandsDir` (`src/extension/gsd-core-commands.ts:53`).
2. It reads `*.md` command files, parses `name`, `description`, and `argument-hint` frontmatter, and converts each to a namespaced slash command such as `/gsd-plan-phase` (`src/extension/gsd-core-commands.ts:58`).
3. The command handler calls `expandGsdCoreCommandPrompt`, replacing `$ARGUMENTS`, `$@`, `$1`, and `@~/.claude/gsd-core/` references with package-local paths (`src/extension/gsd-core-commands.ts:113`).
4. The expanded prompt is delivered through `pi.sendUserMessage`; `pi-gsd` does not execute or reinterpret upstream command semantics (`src/extension/register.ts:170`).

### Capability Detection Flow

1. `createRuntimeAwareDetector` collects active Pi tool names with `pi.getAllTools` (`src/extension/register.ts:62`).
2. `detectCapabilities` checks active tool names for `subagent` and `ctx_*` before using filesystem candidates (`src/extension/capabilities.ts:112`).
3. Package-local GSD Core and `gsd-tools` candidates are resolved under the extension package root (`src/extension/capabilities.ts:50`).
4. Optional integration candidates check project-local and global Pi package/extension directories (`src/extension/capabilities.ts:61`).
5. The resulting `Capabilities.mode` is one of `inline`, `ctx-inline`, `delegated`, or `delegated-ctx` (`src/extension/capabilities.ts:133`).

### Context-Mode Guard Flow

1. `registerPiGsdExtension` registers the guard on the Pi `tool_call` event (`src/extension/index.ts:63`).
2. `evaluateContextModeToolCall` allows high-value context-mode tools such as `ctx_execute`, `ctx_batch_execute`, `ctx_fetch_and_index`, `ctx_search`, and diagnostics (`src/extension/context-mode-guard.ts:28`).
3. For `ctx_index`, planning-root paths are blocked unless the latest user message explicitly asks to index `.planning/`; individual planning artifacts warn but proceed (`src/extension/context-mode-guard.ts:147`).
4. For `ctx_execute_file`, small source/planning files warn unless the user explicitly requested computed extraction or the path is bulky/transient (`src/extension/context-mode-guard.ts:186`).
5. Blocking decisions return `{ block: true, reason }`; warnings notify UI when available (`src/extension/context-mode-guard.ts:223`).

### Model Routing Flow

1. Model routing requests enter through `gsd` action `resolve-model`, `/gsd-model`, or dispatcher `resolveModel` (`src/extension/register.ts:88`, `src/extension/dispatcher.ts:298`).
2. `resolveModelRouting` loads `.pi-gsd/model-routing.json` when present and merges it with `DEFAULT_CONFIG` (`src/extension/model-routing.ts:202`).
3. Target type is inferred as agent, skill, or command; known GSD targets map to heavy, standard, or light tiers (`src/extension/model-routing.ts:274`).
4. Route precedence is default route, tier route, explicit target route, then session override from `/gsd-model` fallback choice (`src/extension/model-routing.ts:320`).
5. The resolved result includes a Pi action recommendation and a `subagent` consumer block; pass `subagent.model` only when populated (`src/extension/model-routing.ts:367`).

**State Management:**
- Durable project records live in `.planning/`; `src/extension/context-mode-guard.ts` protects this boundary from accidental wholesale indexing.
- Wrapper-private, project-local model routing lives in optional `.pi-gsd/model-routing.json`, read by `src/extension/model-routing.ts`.
- Session-only model fallback choices live in the `sessionModelOverrides` `Map` inside `registerPiGsdCore` (`src/extension/register.ts:301`).
- Capability status is recomputed per cwd through `detect(cwd)` rather than stored globally (`src/extension/dispatcher.ts:259`).
- Output retention for spawned processes is bounded by `StreamingTextTail` before final truncation (`src/extension/dispatcher.ts:181`).

## Key Abstractions

**`RegisterablePiApi`:**
- Purpose: Minimal Pi API surface the extension needs.
- Examples: `src/extension/register.ts`, `src/types/pi-sdk.d.ts`, `tests/test-utils.ts`.
- Pattern: Structural typing keeps tests and runtime integration independent of the full Pi SDK.

**`GsdDispatcher`:**
- Purpose: Stable adapter seam for status, doctor, run, and model resolution.
- Examples: `src/extension/dispatcher.ts`, `src/extension/register.ts`, `tests/dispatcher.test.ts`.
- Pattern: Dependency-injected `exec`, `detect`, `exists`, `truncateOutput`, and `externalGsdSkillPaths` make runtime behavior testable.

**`Capabilities`:**
- Purpose: Represent available upstream and optional Pi integrations.
- Examples: `src/extension/capabilities.ts`, `src/extension/dispatcher.ts`, `tests/test-utils.ts`.
- Pattern: Booleans plus path metadata and derived `GsdMode` communicate both detection and source.

**`GsdCoreCommand`:**
- Purpose: Normalize upstream GSD command markdown into Pi slash command registrations.
- Examples: `src/extension/gsd-core-commands.ts`, `src/extension/register.ts`, `tests/gsd-core-commands.test.ts`.
- Pattern: Frontmatter-driven discovery avoids vendoring or duplicating command text.

**`ResolvedModelRouting`:**
- Purpose: Give Pi-native model/thinking guidance and subagent delegation hints without forcing upstream GSD model IDs.
- Examples: `src/extension/model-routing.ts`, `src/extension/register.ts`, `tests/model-routing.test.ts`.
- Pattern: Merge defaults, tiers, explicit config, current Pi model, available model registry, and fallback policy into one formatted decision.

**`GuardDecision`:**
- Purpose: Return allow/warn/block decisions for context-mode tool calls.
- Examples: `src/extension/context-mode-guard.ts`, `tests/context-mode-guard.test.ts`.
- Pattern: Pure evaluation function plus thin event registration keeps guard logic testable.

## Entry Points

**Pi extension registration:**
- Location: `src/extension/index.ts`
- Triggers: Pi loads the `pi.extensions` entry declared in `package.json`.
- Responsibilities: Build schema, wire output truncation, register core adapter, register context-mode guard.

**Public `gsd` tool:**
- Location: `src/extension/register.ts`
- Triggers: Pi tool call with `action` `status`, `doctor`, `run`, or `resolve-model`.
- Responsibilities: Resolve cwd and model context; delegate to `GsdDispatcher`; return text and `details.caps`.

**Fixed slash commands:**
- Location: `src/extension/register.ts`
- Triggers: `/gsd-status`, `/gsd-doctor`, `/gsd-run`, `/gsd-model`.
- Responsibilities: Expose common wrapper operations without duplicating upstream GSD command semantics.

**Dynamic upstream slash commands:**
- Location: `src/extension/register.ts`, `src/extension/gsd-core-commands.ts`
- Triggers: `/gsd-*` commands discovered from package-local `@opengsd/gsd-core` markdown.
- Responsibilities: Expand upstream command prompts and send them back into Pi via `pi.sendUserMessage`.

**Live Pi smoke check:**
- Location: `scripts/live-pi-rpc-smoke.mjs`
- Triggers: `npm run test:live-pi`.
- Responsibilities: Validate extension command registration in a live Pi RPC process.

## Architectural Constraints

- **Threading:** Runtime code is single-process Node.js/TypeScript; external `gsd-tools` execution uses `pi.exec` when available or `child_process.spawn` in `src/extension/dispatcher.ts`.
- **Global state:** No cross-session global mutable state is used. Session fallback model choices are held in a `Map` scoped to one `registerPiGsdCore` invocation in `src/extension/register.ts`.
- **Circular imports:** Source imports are acyclic: `index.ts` imports `register.ts` and `context-mode-guard.ts`; `register.ts` imports dispatcher/discovery/routing; dispatcher imports capabilities/routing; no module imports `index.ts`.
- **Package-local execution:** Always resolve `@opengsd/gsd-core` and `gsd-tools` from the package root in `src/extension/capabilities.ts` and `src/extension/dispatcher.ts`; do not call a system-wide `gsd-tools` binary.
- **State boundary:** Store normal GSD artifacts in `.planning/`; keep Pi-wrapper-specific config in `.pi-gsd/model-routing.json`; do not create `.gsd/`.
- **Optional integrations:** `context-mode` and `pi-subagents` are detected capabilities, not dependencies to import from source code.
- **Output bounds:** Preserve bounded output from external processes with `StreamingTextTail` and final truncation in `src/extension/dispatcher.ts` and `src/extension/index.ts`.
- **Runtime compatibility:** Use explicit `.ts` relative imports throughout `src/extension/*.ts` because Node's strip-types test/runtime path executes TypeScript source directly.

## Anti-Patterns

### Reimplementing GSD Core Semantics

**What happens:** Adding phase lifecycle, artifact naming, or command behavior directly in `src/extension/register.ts` or `src/extension/dispatcher.ts` duplicates upstream GSD Core.
**Why it's wrong:** `docs/DESIGN.md` defines `pi-gsd` as a thin adapter; duplicated semantics drift from package-local `@opengsd/gsd-core` and break cross-runtime interoperability.
**Do this instead:** Discover upstream command markdown with `src/extension/gsd-core-commands.ts` or dispatch to package-local `gsd-tools` through `src/extension/dispatcher.ts`.

### Using System-Wide GSD Tools

**What happens:** Calling `gsd-tools` from `PATH` or a global install bypasses `node_modules/@opengsd/gsd-core`.
**Why it's wrong:** A system binary can be a different GSD Core version and produce incompatible `.planning/` artifacts.
**Do this instead:** Use `detectCapabilities` in `src/extension/capabilities.ts` to resolve `node_modules/.bin/gsd-tools`, and let `createGsdDispatcher` refuse to run when package-local tools are missing (`src/extension/dispatcher.ts`).

### Treating Optional Pi Packages as Importable Dependencies

**What happens:** Importing `context-mode` or `pi-subagents` from source code assumes nested npm installation is enough.
**Why it's wrong:** These are Pi packages with tools, hooks, skills, and prompts that must be loaded by Pi; files on disk alone do not prove runtime availability.
**Do this instead:** Detect active tool names with `pi.getAllTools` in `src/extension/register.ts` and filesystem candidates only as fallback in `src/extension/capabilities.ts`.

### Storing Wrapper Internals in `.planning/`

**What happens:** Writing Pi adapter config, caches, or private state into `.planning/` mixes wrapper state with GSD project records.
**Why it's wrong:** `.planning/` is the canonical GSD record directory consumed by other GSD-compatible tools and runtimes.
**Do this instead:** Put wrapper-private model routing in optional `.pi-gsd/model-routing.json` as read by `src/extension/model-routing.ts`; keep durable GSD artifacts in `.planning/` only when they follow GSD-compatible conventions.

## Error Handling

**Strategy:** Prefer conservative fallback and explicit diagnostics over throwing across Pi boundaries.

**Patterns:**
- Capability detection wraps filesystem reads in safe checks and returns null paths for missing integrations (`src/extension/capabilities.ts`).
- `activeToolNames` catches `pi.getAllTools` errors and treats unavailable inventory as empty (`src/extension/register.ts`).
- Dispatcher `run` refuses to execute when package-local `gsd-tools` is missing and returns guidance text instead of falling back to `PATH` (`src/extension/dispatcher.ts`).
- Node spawn resolves aborts as exit code `130` with retained output instead of rejecting the entire tool call (`src/extension/dispatcher.ts`).
- Model config loading catches JSON/read errors, records warnings, and uses defaults (`src/extension/model-routing.ts`).
- Context-mode guard blocks only high-risk accidental `.planning/` indexing and otherwise warns or allows (`src/extension/context-mode-guard.ts`).

## Cross-Cutting Concerns

**Logging:** No dedicated logging framework is used in source. User-facing diagnostics are formatted as tool/command text in `src/extension/dispatcher.ts`, `src/extension/model-routing.ts`, and guard UI notifications in `src/extension/context-mode-guard.ts`.

**Validation:** Tool input schema is Typebox in `src/extension/index.ts`. Runtime target/config normalization is implemented in `src/extension/model-routing.ts`. Command args are shell-word parsed in `src/extension/register.ts` and `src/extension/gsd-core-commands.ts`.

**Authentication:** The extension does not handle secrets or credentials. Model availability and switching are delegated to Pi's `modelRegistry` and `setModel` APIs in `src/extension/register.ts`. External GSD commands run through package-local `gsd-tools` without reading `.env` files.

**Security:** The primary security boundary is avoiding secret reads and avoiding accidental context-mode indexing of `.planning/`. `src/extension/context-mode-guard.ts` inspects paths, symlink-resolved paths, and latest user intent before blocking or warning.

**Testing:** Module-level behavior is covered by Node test files in `tests/*.test.ts`, with deterministic fakes in `tests/test-utils.ts` and live runtime coverage in `scripts/live-pi-rpc-smoke.mjs`.

---

*Architecture analysis: 2026-06-08*
