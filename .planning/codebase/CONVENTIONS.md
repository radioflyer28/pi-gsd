# Coding Conventions

**Analysis Date:** 2026-06-08

## Naming Patterns

**Files:**
- Use lowercase kebab-case for implementation modules under `src/extension/`: `src/extension/context-mode-guard.ts`, `src/extension/gsd-core-commands.ts`, `src/extension/model-routing.ts`.
- Use `.test.ts` suffix for tests under `tests/`: `tests/register.test.ts`, `tests/dispatcher.test.ts`, `tests/context-mode-guard.test.ts`.
- Keep package resource metadata in stable root/documentation paths: `package.json`, `extension-manifest.json`, `README.md`, `docs/DESIGN.md`, `docs/USAGE.md`, `skills/pi-gsd/SKILL.md`.

**Functions:**
- Use camelCase named functions for reusable logic: `resolveCwd` in `src/extension/dispatcher.ts`, `detectCapabilities` in `src/extension/capabilities.ts`, `discoverGsdCoreCommands` in `src/extension/gsd-core-commands.ts`.
- Use verb-first function names for actions and transformations: `registerPiGsdCore` in `src/extension/register.ts`, `evaluateContextModeToolCall` in `src/extension/context-mode-guard.ts`, `formatResolvedModelRouting` in `src/extension/model-routing.ts`.
- Keep private helper functions unexported and close to the public API that uses them: `activeToolNames`, `modelContext`, and `executeGsd` in `src/extension/register.ts`.

**Variables:**
- Use camelCase for local variables and parameters: `sessionModelOverrides` in `src/extension/register.ts`, `candidatePaths` in `src/extension/capabilities.ts`, `resultDetails` in `src/extension/dispatcher.ts`.
- Use UPPER_SNAKE_CASE for constants that define global defaults or allowlists: `DEFAULT_MAX_OUTPUT_CHARS` in `src/extension/dispatcher.ts`, `CONTEXT_MODE_TOOLS` in `src/extension/context-mode-guard.ts`, `DEFAULT_AGENT_TIERS` in `src/extension/model-routing.ts`.
- Use explicit names for injected test seams: `exists`, `readFile`, `readdir`, `externalGsdSkillPaths`, and `detect` appear in option objects in `src/extension/capabilities.ts`, `src/extension/gsd-core-commands.ts`, and `src/extension/dispatcher.ts`.

**Types:**
- Export TypeScript types that form module boundaries: `Capabilities` and `GsdMode` in `src/extension/capabilities.ts`, `GsdDispatcher` and `GsdParams` in `src/extension/dispatcher.ts`, `RegisterablePiApi` in `src/extension/register.ts`.
- Use discriminated unions for finite state: `GsdAction` in `src/extension/dispatcher.ts`, `GuardDecision` in `src/extension/context-mode-guard.ts`, `ModelFallback` and `ThinkingLevel` in `src/extension/model-routing.ts`.
- Use `type` imports when importing only type symbols: `import { type Capabilities, ... }` in `src/extension/dispatcher.ts` and `src/extension/register.ts`.

## Code Style

**Formatting:**
- No Prettier, Biome, or ESLint config is detected in the repository root. Follow the existing TypeScript formatting in `src/extension/*.ts`.
- Use two-space indentation, semicolons, double quotes, and trailing commas in multiline object/array/function argument lists, matching `src/extension/index.ts` and `src/extension/register.ts`.
- Prefer readable multiline object literals for public API registration and TypeBox schemas, as in `TOOL_PARAMS` in `src/extension/index.ts` and `pi.registerTool?.({...})` in `src/extension/register.ts`.
- Keep line length practical rather than rigidly enforced. Existing long diagnostic strings are allowed where splitting would reduce clarity, such as guard reasons in `src/extension/context-mode-guard.ts`.

**Linting:**
- No lint command is configured in `package.json`. Use `npm run typecheck`, `npm run build`, and `npm test` as the enforced quality gates.
- `tsconfig.json` enables `strict: true`, `module: NodeNext`, `moduleResolution: NodeNext`, and `allowImportingTsExtensions: true`; keep imports TypeScript-extension explicit.

## Import Organization

**Order:**
1. Node built-ins first with the `node:` prefix when importing named APIs: `node:fs`, `node:os`, `node:path`, `node:test` in `tests/dispatcher.test.ts` and `src/extension/dispatcher.ts`.
2. External Pi/package dependencies next: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, and `typebox` in `src/extension/index.ts`.
3. Local relative modules last, using explicit `.ts` extensions: `./dispatcher.ts`, `./capabilities.ts`, `../src/extension/register.ts`, and `./test-utils.ts`.
4. Separate import groups with a blank line when mixing built-ins/external/local modules, matching `src/extension/index.ts` and `tests/register.test.ts`.

**Path Aliases:**
- No TypeScript path aliases are configured in `tsconfig.json`.
- Use relative imports with explicit `.ts` extensions for all local source and test imports: `../src/extension/capabilities.ts` in `tests/capabilities.test.ts` and `./context-mode-guard.ts` in `src/extension/index.ts`.

## Extension API Patterns

**Public extension entry:**
- Register the Pi package through the default export in `src/extension/index.ts`. New extension-level behavior should be wired from `registerPiGsdExtension(pi)` after defining narrow helper modules.
- Keep runtime schema parameters in `src/extension/index.ts` using `typebox` and `StringEnum`, as shown by `TOOL_PARAMS`.
- Truncate user-visible tool output before returning it from the public tool boundary. `truncateForPiTool` in `src/extension/index.ts` delegates to `truncateTail` and appends a concise truncation notice.

**Tool and command registration:**
- Register exactly one namespaced tool named `gsd` through `registerPiGsdCore` in `src/extension/register.ts`.
- Register Pi slash commands with `gsd-` names, not broad generic names. Existing fixed commands are `gsd-status`, `gsd-doctor`, `gsd-run`, and `gsd-model` in `src/extension/register.ts`.
- Expose upstream GSD Core commands dynamically from package-local command markdown via `discoverGsdCoreCommands` in `src/extension/gsd-core-commands.ts`; do not copy upstream command text into this repository.
- Command handlers should return `{ text }` instead of pushing large UI notifications, matching `commandHandler` in `src/extension/register.ts` and test coverage in `tests/register.test.ts`.

**Dispatcher boundary:**
- Keep all `gsd-tools` execution behind `createGsdDispatcher` in `src/extension/dispatcher.ts`.
- Do not execute a system-wide `gsd-tools` binary. `createGsdDispatcher(...).run()` refuses execution when package-local `gsd-tools` is not detected.
- Use injected seams (`exec`, `detect`, `exists`, `externalGsdSkillPaths`, `truncateOutput`) for behavior that needs tests, as demonstrated across `tests/dispatcher.test.ts` and `tests/register.test.ts`.

**Optional integration detection:**
- Detect optional Pi capabilities through `detectCapabilities` in `src/extension/capabilities.ts`.
- Prefer active Pi tool inventory over filesystem probes when `getAllTools()` is available. This pattern is implemented in `createRuntimeAwareDetector` in `src/extension/register.ts` and covered by `tests/register.test.ts`.
- Keep `context-mode` and `pi-subagents` external to `pi-gsd`; metadata tests in `tests/metadata.test.ts` enforce that these are not package dependencies.

## Docs Conventions

**Markdown structure:**
- Use H1 title, short purpose paragraphs, H2/H3 sections, bullet lists, and fenced code blocks, matching `README.md`, `docs/DESIGN.md`, and `docs/USAGE.md`.
- Put maintainer-facing design constraints in `docs/DESIGN.md`; put user-facing commands, setup, and troubleshooting in `docs/USAGE.md`; keep package overview and quick usage in `README.md`.
- Cross-link related docs from `README.md` under “More documentation” using relative links such as `docs/DESIGN.md` and `docs/USAGE.md`.
- Document live command examples in `text` fences for slash commands and `json` fences for tool calls, as used in `docs/USAGE.md`.

**Boundary language:**
- State GSD/Pi boundaries explicitly in docs. `docs/DESIGN.md` and `README.md` both say `pi-gsd` is thin and does not own upstream GSD workflow semantics.
- Document verification expectations in docs when behavior changes: `docs/DESIGN.md` and `README.md` list `npm run typecheck`, `npm run build`, and `npm test`.

## State-Boundary Rules

**Canonical GSD state:**
- Treat `.planning/` as canonical GSD project state. This boundary is documented in `skills/pi-gsd/SKILL.md`, `docs/DESIGN.md`, `docs/USAGE.md`, and enforced by `src/extension/context-mode-guard.ts`.
- Do not place Pi-wrapper-specific metadata in `.planning/`; `.planning/` is only for GSD-compatible records.
- Do not create or assume `.gsd/`; `docs/DESIGN.md` and `src/extension/dispatcher.ts` explicitly warn against that name because it can collide with other GSD-family tools.
- Use `.pi-gsd/model-routing.json` only for wrapper-private Pi model routing metadata, implemented by `getModelRoutingConfigPath` in `src/extension/model-routing.ts`.

**Context-mode boundary:**
- Do not use context-mode as durable project memory. It is a cache/search aid for large logs, broad scans, generated reports, web/API docs, and repeated filtering.
- Block accidental wholesale indexing of `.planning/` through `evaluateContextModeToolCall` in `src/extension/context-mode-guard.ts`.
- Warn on individual `.planning` artifact indexing and small source/planning `ctx_execute_file` usage; allow explicit computed extraction and bulky/transient files.

## Error Handling

**Patterns:**
- Prefer defensive `try/catch` around filesystem/runtime probes that can fail in different Pi environments. Examples: `activeToolNames` in `src/extension/register.ts`, `findExternalGsdSkillPaths` in `src/extension/dispatcher.ts`, and `loadModelRoutingConfig` in `src/extension/model-routing.ts`.
- Return structured warning text instead of throwing for recoverable configuration issues. `loadModelRoutingConfig` returns `warnings`, and `resolveModelRouting` surfaces warning/error fields in `src/extension/model-routing.ts`.
- Preserve cancellation and non-zero command output at dispatcher boundaries. `createGsdDispatcher(...).run()` handles aborted signals and includes stderr/exit code text in `src/extension/dispatcher.ts`.

## Logging

**Framework:** console not used as a logging framework.

**Patterns:**
- Return user-visible diagnostics through tool/command text and UI notifications rather than writing console logs. Examples are `formatCapabilities` and `formatDoctor` in `src/extension/dispatcher.ts`.
- Use `ctx.ui.notify` only for guard warnings/errors where Pi UI feedback is appropriate, as in `registerContextModeGuard` in `src/extension/context-mode-guard.ts`.

## Comments

**When to Comment:**
- Comment only to clarify non-obvious product decisions or fallback behavior. Existing comments are sparse and targeted, such as the model routing note in `inferRequest` in `src/extension/model-routing.ts`.
- Prefer self-descriptive types, constants, and helper names over inline comments.

**JSDoc/TSDoc:**
- No broad JSDoc/TSDoc convention is used. Public APIs are documented through types and docs files rather than per-symbol docblocks.

## Function Design

**Size:** Keep pure helpers small and focused. Larger functions are acceptable only when they assemble public output or register API surfaces, such as `registerPiGsdCore` in `src/extension/register.ts`.

**Parameters:** Prefer option objects for public or testable constructors: `CapabilityDetectionOptions` in `src/extension/capabilities.ts`, `GsdDispatcherOptions` in `src/extension/dispatcher.ts`, and `GsdCoreCommandDiscoveryOptions` in `src/extension/gsd-core-commands.ts`.

**Return Values:** Return explicit typed objects for boundaries rather than loosely shaped values. Examples include `Capabilities`, `GsdDispatchResult`, `ResolvedModelRouting`, and `PiToolResult`.

## Module Design

**Exports:**
- Export public functions used by tests or other modules; keep formatting/parsing helpers private unless directly tested or reused.
- Maintain clear module ownership: capability detection in `src/extension/capabilities.ts`, command discovery in `src/extension/gsd-core-commands.ts`, dispatch execution in `src/extension/dispatcher.ts`, Pi registration in `src/extension/register.ts`, context guard in `src/extension/context-mode-guard.ts`, and model routing in `src/extension/model-routing.ts`.

**Barrel Files:**
- No barrel files are used. Import directly from the owning module path.

---

*Convention analysis: 2026-06-08*
