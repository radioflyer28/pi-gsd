# Coding Conventions

**Analysis Date:** 2026-06-08

## Naming Patterns

**Files:**
- Use kebab-case for source modules in `src/extension/`: `src/extension/context-mode-guard.ts`, `src/extension/gsd-core-commands.ts`, `src/extension/model-routing.ts`.
- Use short domain names for single-purpose modules: `src/extension/capabilities.ts`, `src/extension/dispatcher.ts`, `src/extension/register.ts`, `src/extension/index.ts`.
- Use matching kebab-case or domain names for tests in `tests/*.test.ts`: `tests/context-mode-guard.test.ts`, `tests/gsd-core-commands.test.ts`, `tests/model-routing.test.ts`.
- Keep shared test helpers in `tests/test-utils.ts`; do not create helper code inside production modules.

**Functions:**
- Use camelCase function names for all helpers and exported APIs: `detectCapabilities()` in `src/extension/capabilities.ts`, `createGsdDispatcher()` in `src/extension/dispatcher.ts`, `registerPiGsdCore()` in `src/extension/register.ts`.
- Prefix factory functions with `create`: `createRuntimeAwareDetector()` in `src/extension/register.ts`, `createGsdDispatcher()` in `src/extension/dispatcher.ts`.
- Prefix formatters with `format`: `formatCapabilities()`, `formatDoctor()`, and `formatExecResult()` in `src/extension/dispatcher.ts`; `formatResolvedModelRouting()` in `src/extension/model-routing.ts`.
- Prefix parsers and normalizers with `parse` / `normalize`: `parseCommandArgs()` in `src/extension/register.ts`, `parseFrontmatter()` in `src/extension/gsd-core-commands.ts`, `normalizeConfig()` in `src/extension/model-routing.ts`.
- Use predicate-style names for boolean helpers: `hasAnyTool()` in `src/extension/capabilities.ts`, `isPlanningPath()` and `isBulkyOrTransientPath()` in `src/extension/context-mode-guard.ts`.

**Variables:**
- Use camelCase for local variables and parameters: `packageRoot`, `candidatePaths`, `activeToolNames`, `sessionModelOverrides`.
- Use UPPER_SNAKE_CASE for module constants: `DEFAULT_MAX_OUTPUT_CHARS`, `DEFAULT_MAX_OUTPUT_LINES` in `src/extension/dispatcher.ts`; `CONTEXT_MODE_TOOLS`, `ALWAYS_ALLOW_TOOLS` in `src/extension/context-mode-guard.ts`; `DEFAULT_CONFIG`, `DEFAULT_AGENT_TIERS` in `src/extension/model-routing.ts`.
- Use `candidate` for filesystem path probes and `cwd` for resolved working directories across `src/extension/capabilities.ts`, `src/extension/dispatcher.ts`, and `src/extension/context-mode-guard.ts`.

**Types:**
- Export TypeScript type aliases rather than interfaces for public shapes: `Capabilities`, `GsdDispatcher`, `GsdParams`, `ModelRoutingConfig`, `ResolvedModelRouting`.
- Use union literal types for bounded domains: `GsdMode` in `src/extension/capabilities.ts`, `GsdAction` in `src/extension/dispatcher.ts`, `ThinkingLevel` and `RoutingTier` in `src/extension/model-routing.ts`.
- Keep private helper types unexported when they are local to one module: `ToolCallEvent`, `ToolCallContext`, and `GuardDecision` in `src/extension/context-mode-guard.ts`.
- Use `type` imports for type-only dependencies: `import { type Capabilities, ... } from "./capabilities.ts"` in `src/extension/dispatcher.ts` and `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"` in `src/extension/index.ts`.

## Code Style

**Formatting:**
- No project Prettier, Biome, or EditorConfig file is present at the repository root; follow the existing TypeScript formatting manually.
- Use two-space indentation throughout `src/extension/*.ts` and `tests/*.test.ts`.
- Use double quotes for string literals: `import * as path from "node:path"` in `src/extension/dispatcher.ts`.
- Use semicolons after statements, type aliases, and exports.
- Prefer trailing commas in multi-line arrays, objects, parameter lists, and calls, as in `TOOL_PARAMS` in `src/extension/index.ts` and `DEFAULT_AGENT_TIERS` in `src/extension/model-routing.ts`.
- Keep one blank line between import groups and between top-level declarations.
- Use concise single-line returns for small helpers: `if (!model?.id) return null;` in `src/extension/model-routing.ts`.
- For nested conditional expressions, align continuation levels as in `detectCapabilities()` in `src/extension/capabilities.ts` and `executeGsd()` in `src/extension/register.ts`.

**Linting:**
- No ESLint/Biome config or lint script is detected in `package.json`; validate quality with `npm run typecheck` and `npm test`.
- `tsconfig.json` enables `strict: true`; new code must typecheck under strict TypeScript without relying on implicit `any`.
- `tsconfig.json` includes `src/**/*.ts` only; test files run through Node's strip-types loader and are not part of `tsc --noEmit` unless the config changes.

## Import Organization

**Order:**
1. Node built-ins first, using `node:` specifiers: `node:fs`, `node:os`, `node:path`, `node:test`.
2. External packages next: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `typebox` in `src/extension/index.ts`.
3. Local relative imports last, separated by a blank line: `./capabilities.ts`, `./dispatcher.ts`, `../src/extension/model-routing.ts`.

**Path Aliases:**
- No path aliases are configured in `tsconfig.json`.
- Use explicit relative imports with `.ts` extensions for all local TypeScript modules: `import { registerPiGsdCore } from "./register.ts"` in `src/extension/index.ts`; `import { capabilities } from "./test-utils.ts"` in tests.
- Use package imports only for external Pi SDK and GSD Core-facing packages; keep Pi SDK declarations in `src/types/pi-sdk.d.ts`.

## Error Handling

**Patterns:**
- Use defensive `try`/`catch` around optional runtime APIs and filesystem probes, returning safe defaults rather than throwing: `activeToolNames()` in `src/extension/register.ts`, `availableModelRefs()` in `src/extension/register.ts`, `safeStat()` and `safeRealpath()` in `src/extension/context-mode-guard.ts`.
- Normalize external or user-provided data before use: `normalizeConfig()` in `src/extension/model-routing.ts`, `parseFrontmatter()` in `src/extension/gsd-core-commands.ts`.
- Surface recoverable issues as warnings in returned data instead of throwing: `loadModelRoutingConfig()` adds warning strings in `src/extension/model-routing.ts`.
- Return structured results for tool execution paths: `GsdDispatchResult` in `src/extension/dispatcher.ts`, `PiToolResult` in `src/extension/register.ts`, and `GuardDecision` in `src/extension/context-mode-guard.ts`.
- For subprocess execution, preserve stdout/stderr/exit code and handle cancellation explicitly in `execWithNodeSpawn()` and `createGsdDispatcher().run()` in `src/extension/dispatcher.ts`.

## Logging

**Framework:** console is not used in production modules.

**Patterns:**
- Return human-readable text to Pi tool/command callers instead of logging: `formatCapabilities()` and `formatDoctor()` in `src/extension/dispatcher.ts`.
- Use UI notifications only for guard warnings/blocks: `registerContextModeGuard()` in `src/extension/context-mode-guard.ts` calls `ctx.ui.notify()` when available.
- Tests assert returned text and notification arrays instead of inspecting logs: `tests/register.test.ts` and `tests/context-mode-guard.test.ts`.

## Comments

**When to Comment:**
- Keep comments rare and explanatory. Existing comments clarify intent or security-relevant constraints, such as the `gsd-planner` inference note in `src/extension/model-routing.ts` and the fallback comment in `src/extension/model-routing.ts`.
- Prefer named helpers and explicit result shapes over inline comments for routine logic.
- Do not add TODO/FIXME/HACK comments as placeholders; no such comments are present in `src/extension/*.ts`.

**JSDoc/TSDoc:**
- Not used in current production modules. Prefer exported type aliases and descriptive function names over TSDoc unless public API documentation is explicitly needed.

## Function Design

**Size:**
- Keep most helpers small and single-purpose, as in `firstExisting()` and `hasAnyTool()` in `src/extension/capabilities.ts`.
- Larger orchestration functions are acceptable when they own a single flow with local helper functions: `createGsdDispatcher()` in `src/extension/dispatcher.ts`, `registerPiGsdCore()` in `src/extension/register.ts`, and `resolveModelRouting()` in `src/extension/model-routing.ts`.
- Extract parsing, formatting, filesystem probing, and normalization into named helpers before adding more logic to entry points.

**Parameters:**
- Use an options object for functions with optional dependencies or test seams: `detectCapabilities(options)`, `createGsdDispatcher(options)`, `discoverGsdCoreCommands(options)`.
- Inject filesystem/runtime dependencies for testability: `exists`, `readFile`, `readdir`, `externalGsdSkillPaths`, and `detect` appear in source options and tests.
- Use default parameters for common runtime defaults: `defaultPackageRoot(exists = fs.existsSync)`, `findExternalGsdSkillPaths(homeDir = os.homedir())`, `truncateTailText(text, maxChars = ..., maxLines = ...)`.

**Return Values:**
- Return explicit typed objects for decisions and results rather than loose primitives: `Capabilities`, `GsdDispatchResult`, `ResolvedModelRouting`, `GuardDecision`.
- Return arrays for discovery operations and preserve sorted deterministic order: `discoverGsdCoreCommands()` sorts by `slashName` in `src/extension/gsd-core-commands.ts`.
- Return safe defaults on missing optional resources: empty arrays from `findExternalGsdSkillPaths()` and `discoverGsdCoreCommands()`, null paths from capability detection.

## Module Design

**Exports:**
- Export production functions that are used by both runtime registration and tests: `evaluateContextModeToolCall()`, `createGsdDispatcher()`, `discoverGsdCoreCommands()`, `resolveModelRouting()`.
- Keep internal helper functions unexported unless tests or other modules need them.
- Export public runtime entry as default from `src/extension/index.ts`: `registerPiGsdExtension(pi)`.
- Export constants only when they define externally useful limits: `DEFAULT_MAX_OUTPUT_CHARS` and `DEFAULT_MAX_OUTPUT_LINES` in `src/extension/dispatcher.ts`.

**Barrel Files:**
- No barrel files are used. Import directly from the implementation module that owns the behavior.
- `src/extension/index.ts` is the extension entry point, not a general barrel; keep it focused on Pi tool parameter schema and registration.

---

*Convention analysis: 2026-06-08*
