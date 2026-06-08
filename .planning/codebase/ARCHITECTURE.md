<!-- refreshed: 2026-06-08 -->
# Architecture

**Analysis Date:** 2026-06-08

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                   Pi Extension Entry Layer                  │
│              `src/extension/index.ts`                       │
├──────────────────┬──────────────────┬───────────────────────┤
│   Tool Schema    │   Core Register  │  Context Guard Hook   │
│ `TOOL_PARAMS`    │ `registerPi...`  │ `registerContext...`  │
│ `index.ts:14`    │ `register.ts`    │ `context-mode-guard.ts`│
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                Pi Command and Tool Exposure                  │
│         `src/extension/register.ts`                         │
│  `gsd` tool + `/gsd-status`, `/gsd-doctor`, `/gsd-run`,      │
│  `/gsd-model`, and dynamic `/gsd-*` upstream commands        │
└────────┬─────────────────┬──────────────────────┬───────────┘
         │                 │                      │
         ▼                 ▼                      ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Dispatcher        │ │ Capability Model │ │ Model Routing     │
│ `dispatcher.ts`   │ │ `capabilities.ts`│ │ `model-routing.ts`│
└────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│             Package-local Upstream GSD Core                  │
│ `node_modules/@opengsd/gsd-core` + `.bin/gsd-tools`          │
│ `src/extension/gsd-core-commands.ts` discovers command md    │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Pi extension entry | Defines `gsd` tool parameters, adapts Pi's extension API, installs the GSD core registration and context-mode guard. | `src/extension/index.ts` |
| Registration layer | Owns Pi-facing tool and slash-command registration, parameter parsing, CWD resolution, and handler wiring. | `src/extension/register.ts` |
| Dispatcher | Implements `status`, `doctor`, `run`, and `resolve-model`; formats diagnostics; executes package-local `gsd-tools`. | `src/extension/dispatcher.ts` |
| Capability detector | Detects package-local GSD Core, `gsd-tools`, `context-mode`, and `pi-subagents`; computes `inline`, `ctx-inline`, `delegated`, or `delegated-ctx` mode. | `src/extension/capabilities.ts` |
| Upstream command discovery | Reads bundled upstream `@opengsd/gsd-core/commands/gsd/*.md`, derives slash names, and expands command prompts with argument substitution. | `src/extension/gsd-core-commands.ts` |
| Model routing | Resolves Pi-native model and thinking guidance for GSD agents, skills, and commands from defaults plus `.pi-gsd/model-routing.json`. | `src/extension/model-routing.ts` |
| Context-mode guard | Registers a `tool_call` hook that blocks or warns for unsafe context-mode use around `.planning/` and small source files. | `src/extension/context-mode-guard.ts` |
| Package metadata | Exposes Pi extension resources, skill and prompt directories, public tool/command manifest, and dependency boundaries. | `package.json`, `extension-manifest.json` |

## Pattern Overview

**Overall:** Thin adapter / anti-corruption layer around upstream GSD Core.

**Key Characteristics:**
- Keep GSD workflow semantics in package-local `@opengsd/gsd-core`; Pi-specific code only registers surfaces, detects capabilities, and dispatches to upstream seams (`docs/DESIGN.md`).
- Use explicit boundaries: `registerPiGsdCore` handles Pi API exposure, `createGsdDispatcher` handles command execution, `detectCapabilities` handles mode discovery, and `resolveModelRouting` handles Pi model guidance.
- Prefer runtime evidence over filesystem heuristics: `activeToolNames` from Pi tool inventory proves `context-mode` or `pi-subagents` is loaded before fallback path probes (`src/extension/capabilities.ts:102`).
- Namespace everything as `gsd` or `gsd-*` to avoid generic Pi command collisions (`src/extension/register.ts:309`, `src/extension/register.ts:333`).

## Layers

**Extension Bootstrap Layer:**
- Purpose: Register this package with Pi and provide the public tool schema.
- Location: `src/extension/index.ts`
- Contains: `TOOL_PARAMS`, `truncateForPiTool`, default `registerPiGsdExtension` export.
- Depends on: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `typebox`, `src/extension/register.ts`, `src/extension/context-mode-guard.ts`.
- Used by: Pi package loader configured in `package.json` under `pi.extensions`.

**Pi Surface Registration Layer:**
- Purpose: Convert Pi tool and slash-command invocations into internal dispatcher calls or upstream prompt injection.
- Location: `src/extension/register.ts`
- Contains: `RegisterablePiApi`, `executeGsd`, `parseCommandArgs`, `commandHandler`, `gsdCoreCommandHandler`, `gsdModelCommandHandler`, `registerPiGsdCore`.
- Depends on: `src/extension/dispatcher.ts`, `src/extension/capabilities.ts`, `src/extension/gsd-core-commands.ts`, `src/extension/model-routing.ts`.
- Used by: `src/extension/index.ts` and tests in `tests/register.test.ts`.

**Dispatcher Layer:**
- Purpose: Provide a small execution abstraction for `status`, `doctor`, `run`, and `resolve-model` actions.
- Location: `src/extension/dispatcher.ts`
- Contains: `GsdDispatcher`, `createGsdDispatcher`, `formatCapabilities`, `formatDoctor`, `execWithNodeSpawn`, output truncation.
- Depends on: Node `child_process`, `fs`, `os`, `path`, `src/extension/capabilities.ts`, `src/extension/model-routing.ts`.
- Used by: `src/extension/register.ts` and tests in `tests/dispatcher.test.ts`.

**Capability Detection Layer:**
- Purpose: Compute integration capabilities and runtime mode without importing optional Pi packages.
- Location: `src/extension/capabilities.ts`
- Contains: `CapabilityName`, `GsdMode`, `Capabilities`, `detectCapabilities`, package-local and optional integration path candidates.
- Depends on: Node `fs`, `os`, `path`, `url`.
- Used by: `src/extension/register.ts`, `src/extension/dispatcher.ts`, and tests in `tests/capabilities.test.ts`.

**Upstream Command Exposure Layer:**
- Purpose: Dynamically mirror upstream GSD Core command markdown into Pi slash commands without copying command bodies into this repository.
- Location: `src/extension/gsd-core-commands.ts`
- Contains: `GsdCoreCommand`, `discoverGsdCoreCommands`, `expandGsdCoreCommandPrompt`.
- Depends on: Node `fs`, `path`, `defaultPackageRoot` from `src/extension/capabilities.ts`.
- Used by: `registerPiGsdCore` in `src/extension/register.ts`.

**Model Routing Layer:**
- Purpose: Resolve Pi-native model IDs, thinking levels, fallback behavior, and subagent consumer guidance for GSD targets.
- Location: `src/extension/model-routing.ts`
- Contains: route types, default tier maps, config loading from `.pi-gsd/model-routing.json`, `resolveModelRouting`, `formatResolvedModelRouting`.
- Depends on: Node `fs`, `path`.
- Used by: `src/extension/dispatcher.ts` for `gsd` tool `resolve-model` and `src/extension/register.ts` for `/gsd-model`.

**Guardrail Layer:**
- Purpose: Enforce project-state and context-mode usage boundaries at Pi `tool_call` time.
- Location: `src/extension/context-mode-guard.ts`
- Contains: context-mode tool allowlist, `.planning/` path detection, latest-user-intent checks, `evaluateContextModeToolCall`, `registerContextModeGuard`.
- Depends on: Node `fs`, `path`.
- Used by: `src/extension/index.ts`; tests live in `tests/context-mode-guard.test.ts`.

## Data Flow

### Primary `gsd` Tool Request Path

1. Pi loads `src/extension/index.ts` from `package.json` and calls default `registerPiGsdExtension` (`src/extension/index.ts:68`).
2. `registerPiGsdExtension` passes TypeBox `TOOL_PARAMS` and truncation behavior into `registerPiGsdCore` (`src/extension/index.ts:69`).
3. `registerPiGsdCore` builds a runtime-aware detector, discovers upstream GSD Core commands, creates the dispatcher, and registers the `gsd` tool (`src/extension/register.ts:288`, `src/extension/register.ts:297`, `src/extension/register.ts:300`, `src/extension/register.ts:309`).
4. A `gsd` tool call invokes `executeGsd`, which resolves the action, CWD, args, and model context (`src/extension/register.ts:97`).
5. `executeGsd` routes to `dispatcher.status`, `dispatcher.doctor`, `dispatcher.resolveModel`, or `dispatcher.run` based on `params.action` (`src/extension/register.ts:113`-`src/extension/register.ts:118`).
6. The dispatcher detects capabilities for the request CWD and returns text plus `details.caps` (`src/extension/dispatcher.ts:250`-`src/extension/dispatcher.ts:287`).
7. `toToolResult` wraps text as Pi tool content with capability details (`src/extension/register.ts:47`).

### `/gsd-run` Slash Command Flow

1. `registerPiGsdCore` registers `/gsd-run` with `commandHandler(dispatcher, "run", ...)` (`src/extension/register.ts:343`).
2. `commandHandler` shell-parses the raw string only for `run` actions using `parseCommandArgs` (`src/extension/register.ts:162`, `src/extension/register.ts:172`).
3. `executeGsd` calls `dispatcher.run(args, cwd, signal)` (`src/extension/register.ts:118`).
4. `createGsdDispatcher.run` refuses execution when package-local `gsd-tools` is missing (`src/extension/dispatcher.ts:287`).
5. When available, `run` uses Pi `exec` or the Node `spawn` fallback and truncates formatted output (`src/extension/dispatcher.ts:287`, `src/extension/dispatcher.ts:221`).

### Dynamic Upstream Slash Command Flow

1. `discoverGsdCoreCommands` reads package-local upstream command markdown from `node_modules/@opengsd/gsd-core/commands/gsd` (`src/extension/gsd-core-commands.ts:51`).
2. Each markdown file's frontmatter supplies `name`, `description`, and `argument-hint`; file names fill missing core names (`src/extension/gsd-core-commands.ts:16`).
3. `registerPiGsdCore` registers every discovered command as `command.slashName` (`src/extension/register.ts:354`).
4. `gsdCoreCommandHandler` verifies `pi.sendUserMessage` exists and the session is idle when an idle check is available (`src/extension/register.ts:225`).
5. `expandGsdCoreCommandPrompt` substitutes `$ARGUMENTS`, `$@`, `$1`, `$2`, and package-local GSD Core paths, then the handler injects the prompt into Pi via `sendUserMessage` (`src/extension/gsd-core-commands.ts:117`, `src/extension/register.ts:239`).

### Capability Detection Flow

1. `createRuntimeAwareDetector` requests active Pi tool names through `pi.getAllTools` (`src/extension/register.ts:80`).
2. `detectCapabilities` builds package-local and optional integration candidate paths (`src/extension/capabilities.ts:65`, `src/extension/capabilities.ts:102`).
3. Active tools `subagent` and `ctx_execute`/`ctx_*` take precedence over filesystem probes (`src/extension/capabilities.ts:119`).
4. Detected optional integrations determine mode: `inline`, `ctx-inline`, `delegated`, or `delegated-ctx` (`src/extension/capabilities.ts:135`).
5. Dispatcher status and doctor include these capabilities in user-visible diagnostics (`src/extension/dispatcher.ts:130`, `src/extension/dispatcher.ts:171`).

### Model Routing Flow

1. A `gsd` tool call with `action: "resolve-model"` reaches `dispatcher.resolveModel` (`src/extension/dispatcher.ts:278`).
2. `/gsd-model` parses optional `agent`, `skill`, or `command` target selectors and calls `resolveModelRouting` directly (`src/extension/register.ts:181`, `src/extension/register.ts:243`).
3. `resolveModelRouting` loads `.pi-gsd/model-routing.json` if present and merges defaults, tier routes, explicit target routes, and session overrides (`src/extension/model-routing.ts:215`, `src/extension/model-routing.ts:311`).
4. The result includes recommended action and a `subagent` block; `/gsd-model` may apply a model or thinking level via Pi APIs (`src/extension/register.ts:249`, `src/extension/register.ts:270`).

**State Management:**
- Durable GSD project records belong in `.planning/`; `src/extension/dispatcher.ts:130` reports whether `.planning/` exists but Pi-specific adapter state does not live there.
- Optional adapter-private model routing uses `.pi-gsd/model-routing.json` through `src/extension/model-routing.ts:215`.
- Session-only fallback selections for `/gsd-model` live in an in-memory `Map<string, string>` inside `registerPiGsdCore` (`src/extension/register.ts:294`).
- No global mutable singleton controls dispatcher state; most behavior is created per Pi extension registration via dependency injection options in `registerPiGsdCore` and `createGsdDispatcher`.

## Key Abstractions

**`RegisterablePiApi`:**
- Purpose: Minimal Pi API surface this adapter needs for tools, commands, model switching, thinking level, prompt injection, and execution.
- Examples: `src/extension/register.ts:31`, `tests/test-utils.ts`.
- Pattern: Narrow adapter interface for testability and Pi SDK decoupling.

**`GsdDispatcher`:**
- Purpose: Stable boundary between Pi handlers and upstream GSD execution/diagnostics.
- Examples: `src/extension/dispatcher.ts:56`, `src/extension/register.ts:300`.
- Pattern: Dependency-injected service object with `status`, `doctor`, `run`, and `resolveModel` methods.

**`Capabilities`:**
- Purpose: Single shape for package-local GSD Core availability and optional Pi accelerator availability.
- Examples: `src/extension/capabilities.ts:13`, `src/extension/dispatcher.ts:130`.
- Pattern: Pure detection function returning data; formatting happens in dispatcher.

**`GsdCoreCommand`:**
- Purpose: Parsed representation of an upstream markdown command ready for Pi slash-command registration.
- Examples: `src/extension/gsd-core-commands.ts:4`, `src/extension/register.ts:354`.
- Pattern: Runtime discovery from installed upstream package.

**`ResolvedModelRouting`:**
- Purpose: Complete model/thinking resolution result for GSD agents, skills, or commands, including subagent guidance.
- Examples: `src/extension/model-routing.ts:40`, `src/extension/dispatcher.ts:278`.
- Pattern: Config merge + availability check + formatted recommendation.

**`GuardDecision`:**
- Purpose: Normalize context-mode guard outcomes as allow, warn, or block.
- Examples: `src/extension/context-mode-guard.ts:26`, `src/extension/context-mode-guard.ts:164`.
- Pattern: Pure policy function plus side-effecting Pi hook registration.

## Entry Points

**Pi Package Extension:**
- Location: `src/extension/index.ts`
- Triggers: Pi loads the extension listed in `package.json` under `pi.extensions`.
- Responsibilities: Register the tool/commands and context-mode guard.

**Public `gsd` Tool:**
- Location: `src/extension/register.ts:309`
- Triggers: Pi tool calls with action `status`, `doctor`, `run`, or `resolve-model`.
- Responsibilities: Provide agent-facing access to upstream GSD Core diagnostics, execution, and model routing.

**Core Slash Commands:**
- Location: `src/extension/register.ts:333`-`src/extension/register.ts:358`
- Triggers: Pi slash commands `/gsd-status`, `/gsd-doctor`, `/gsd-run`, `/gsd-model`, or dynamic `/gsd-*` commands.
- Responsibilities: Expose named command UX without duplicating upstream GSD workflow text.

**Context-mode Guard Hook:**
- Location: `src/extension/context-mode-guard.ts:226`
- Triggers: Pi `tool_call` events.
- Responsibilities: Block accidental wholesale `.planning/` indexing and warn for risky context-mode usage.

## Architectural Constraints

- **Threading:** Node single-threaded event loop. `dispatcher.run` starts a child process for package-local `gsd-tools` when Pi `exec` is unavailable (`src/extension/dispatcher.ts:215`).
- **Global state:** Avoid module-level mutable state for runtime behavior. Per-registration mutable session model overrides are local to `registerPiGsdCore` (`src/extension/register.ts:294`).
- **Circular imports:** Keep directional imports: `index.ts` → `register.ts`/`context-mode-guard.ts`; `register.ts` → dispatcher/capabilities/command discovery/model routing; `dispatcher.ts` → capabilities/model routing. Do not import `register.ts` from these lower layers.
- **Upstream boundary:** Do not copy GSD command bodies or workflow semantics into `pi-gsd`; discover from package-local `@opengsd/gsd-core` via `src/extension/gsd-core-commands.ts`.
- **Package-local execution:** Do not fall back to a system-wide `gsd-tools`; `dispatcher.run` requires the package-local binary path from capabilities (`src/extension/dispatcher.ts:296`).
- **Optional integrations:** Do not import or depend on `context-mode` or `pi-subagents`; detect active public tools or Pi package paths in `src/extension/capabilities.ts`.
- **Command namespace:** Add Pi commands under the `gsd-*` namespace only, matching `extension-manifest.json`.

## Anti-Patterns

### Reimplementing GSD Workflow Semantics in Pi Code

**What happens:** Command bodies, phase logic, artifact schemas, or lifecycle rules are added under `src/extension/`.
**Why it's wrong:** This package is a thin adapter; duplicated semantics drift from `@opengsd/gsd-core` and can break `.planning/` interoperability.
**Do this instead:** Add Pi registration or dispatch seams in `src/extension/register.ts` and keep workflow behavior in upstream command markdown discovered by `src/extension/gsd-core-commands.ts`.

### Bypassing Capability Detection

**What happens:** Code assumes `context-mode`, `pi-subagents`, or `gsd-tools` exists because files appear under `node_modules`.
**Why it's wrong:** Optional Pi integrations must be loaded by Pi to expose tools and hooks; a nested package install is not enough.
**Do this instead:** Route availability through `detectCapabilities` in `src/extension/capabilities.ts` and prefer `activeToolNames` from `pi.getAllTools` in `src/extension/register.ts`.

### Dispatching to System-Wide `gsd-tools`

**What happens:** A PATH lookup or shell command uses whatever `gsd-tools` is globally installed.
**Why it's wrong:** A different GSD version can create incompatible artifacts or behavior.
**Do this instead:** Use `createGsdDispatcher` in `src/extension/dispatcher.ts`, which resolves package-local `@opengsd/gsd-core` and refuses to run when package-local `gsd-tools` is missing.

### Storing Adapter State in `.planning/`

**What happens:** Pi-specific caches, model routing, or integration metadata are written to `.planning/`.
**Why it's wrong:** `.planning/` is durable GSD project state shared with other GSD runtimes; adapter-private data pollutes canonical records.
**Do this instead:** Use `.pi-gsd/model-routing.json` for explicit adapter-private routing config through `src/extension/model-routing.ts`.

## Error Handling

**Strategy:** Prefer non-throwing diagnostics and clear user-facing text for missing optional capabilities or runtime APIs; reserve thrown exceptions for unexpected filesystem/process failures handled by tests.

**Patterns:**
- Capability and config reads catch filesystem/JSON failures and return defaults plus warnings (`src/extension/model-routing.ts:218`).
- Dynamic command dispatch returns a text error when `pi.sendUserMessage` is unavailable (`src/extension/register.ts:230`).
- `dispatcher.run` returns a text error when package-local `gsd-tools` is missing instead of falling back to PATH (`src/extension/dispatcher.ts:296`).
- Child-process cancellation returns exit code `130` style text when the AbortSignal fires (`src/extension/dispatcher.ts:235`).
- Output truncation is centralized in `src/extension/dispatcher.ts:76` and the Pi-specific truncator in `src/extension/index.ts:48`.

## Cross-Cutting Concerns

**Logging:** No structured logging framework is present. Runtime feedback uses returned text for tool/command results and `ctx.ui.notify` only for guard warnings/blocks in `src/extension/context-mode-guard.ts:226`.

**Validation:** Public `gsd` tool parameters use TypeBox and `StringEnum` in `src/extension/index.ts:14`. Internal parsers normalize command arguments, frontmatter, model routing config, and target selectors in `src/extension/register.ts`, `src/extension/gsd-core-commands.ts`, and `src/extension/model-routing.ts`.

**Authentication:** No application authentication layer exists. External service access is delegated to Pi runtime APIs, installed Pi packages, and package-local `gsd-tools` execution.

**Command/tool registration:** `src/extension/register.ts` is the single place to register `gsd` tool and `gsd-*` commands. `extension-manifest.json` advertises the same public surface for package metadata.

**Capability detection:** Use `src/extension/capabilities.ts` for all mode decisions. Status and doctor output in `src/extension/dispatcher.ts` are the user-visible representation of capability state.

**Command exposure:** Dynamic upstream slash commands come from `src/extension/gsd-core-commands.ts`; static integration commands are explicitly listed in `src/extension/register.ts` and `extension-manifest.json`.

---

*Architecture analysis: 2026-06-08*
