# Testing Patterns

**Analysis Date:** 2026-06-08

## Test Framework

**Runner:**
- Node.js built-in test runner via `node:test`.
- Tests run TypeScript directly with Node's strip-types support: `node --experimental-strip-types --test tests/*.test.ts` in `package.json`.
- Config: no `jest.config.*`, `vitest.config.*`, or Node test config file detected; test behavior is controlled by `package.json` scripts.

**Assertion Library:**
- `node:assert/strict` is used throughout tests: `tests/dispatcher.test.ts`, `tests/register.test.ts`, `tests/model-routing.test.ts`, `tests/context-mode-guard.test.ts`.
- Use `assert.equal()` for scalar equality, `assert.deepEqual()` for arrays/objects, `assert.match()` / `assert.doesNotMatch()` for text output, and `assert.ok()` for boolean conditions.

**Run Commands:**
```bash
npm test              # Run all tests with node --experimental-strip-types --test tests/*.test.ts
npm run typecheck     # Typecheck src/**/*.ts with tsc --noEmit
npm run build         # Run tsc -p tsconfig.json; tsconfig currently has noEmit: true
npm run test:live-pi  # Run scripts/live-pi-rpc-smoke.mjs for live Pi RPC smoke coverage
```

## Test File Organization

**Location:**
- Tests live in the top-level `tests/` directory rather than beside source files.
- Source modules in `src/extension/*.ts` generally have a matching `tests/*.test.ts` file:
  - `src/extension/capabilities.ts` → `tests/capabilities.test.ts`
  - `src/extension/context-mode-guard.ts` → `tests/context-mode-guard.test.ts`
  - `src/extension/dispatcher.ts` → `tests/dispatcher.test.ts`
  - `src/extension/gsd-core-commands.ts` → `tests/gsd-core-commands.test.ts`
  - `src/extension/model-routing.ts` → `tests/model-routing.test.ts`
  - `src/extension/register.ts` and `src/extension/index.ts` → `tests/register.test.ts`
- Package and extension metadata are tested in `tests/metadata.test.ts`.
- End-to-end package-local GSD tool invocation is smoke-tested in `tests/smoke.test.ts`.

**Naming:**
- Use `*.test.ts` for all test files.
- Match the module name when practical: `context-mode-guard.test.ts`, `model-routing.test.ts`, `gsd-core-commands.test.ts`.
- Use `tests/test-utils.ts` for shared helpers; do not name helper files `*.test.ts`.

**Structure:**
```text
tests/
├── capabilities.test.ts          # capability detection modes and path precedence
├── context-mode-guard.test.ts    # context-mode guard decisions and hook registration
├── dispatcher.test.ts            # dispatcher formatting, command execution, truncation, cancellation
├── gsd-core-commands.test.ts     # upstream GSD command discovery and prompt expansion
├── metadata.test.ts              # package.json and extension-manifest.json contract
├── model-routing.test.ts         # model routing config, fallback, target inference
├── register.test.ts              # Pi tool/command registration and command handlers
├── smoke.test.ts                 # package-local gsd-tools invocation
└── test-utils.ts                 # mock Pi API and shared capability fixtures
```

## Test Structure

**Suite Organization:**
```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { createGsdDispatcher } from "../src/extension/dispatcher.ts";
import { capabilities } from "./test-utils.ts";

test("dispatcher status returns capability details without executing commands", async () => {
  let execCalled = false;
  const dispatcher = createGsdDispatcher({
    exec: async () => {
      execCalled = true;
      return "unexpected";
    },
    detect: () => capabilities("ctx-inline"),
  });

  const result = await dispatcher.status(process.cwd());

  assert.equal(execCalled, false);
  assert.equal(result.details.caps.mode, "ctx-inline");
  assert.match(result.text, /context-mode: detected/);
});
```

**Patterns:**
- Use one `test("behavior description", ...)` per behavior; there are no nested `describe()` suites.
- Test names are complete behavior statements: `"dispatcher run refuses to use system-wide gsd-tools when package-local gsd-tools is missing"` in `tests/dispatcher.test.ts`.
- Import only the production functions under test and small shared helpers from `tests/test-utils.ts`.
- For async behavior, mark the test callback `async` and `await` the function under test.
- Use deterministic injected dependencies (`exists`, `detect`, `readFile`, `readdir`, `exec`) instead of relying on host environment state.

## Mocking

**Framework:** manual mocks and dependency injection; no Jest/Vitest mocking library is used.

**Patterns:**
```typescript
const calls: unknown[][] = [];
const dispatcher = createGsdDispatcher({
  exec: async (...args: unknown[]) => {
    calls.push(args);
    return { stdout: "ok", exitCode: 0 };
  },
  detect: () => capabilities("inline"),
});

const result = await dispatcher.run(["progress", "--json"], cwd, controller.signal);
assert.deepEqual(calls, [["package-local-gsd-tools", ["progress", "--json"], { cwd, signal: controller.signal }]]);
assert.match(result.text, /ok/);
```

```typescript
const pi = mockPi();
registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), gsdCoreCommands: [] });

assert.equal(pi.tools.length, 1);
assert.equal(pi.tools[0].name, "gsd");
assert.deepEqual([...pi.commands.keys()].sort(), ["gsd-doctor", "gsd-model", "gsd-run", "gsd-status"]);
```

**What to Mock:**
- Mock Pi runtime APIs with `mockPi()` in `tests/test-utils.ts` when testing registration and command handlers in `tests/register.test.ts`.
- Mock capability detection with `detect: () => capabilities("inline")` or another mode when testing dispatcher behavior in `tests/dispatcher.test.ts`.
- Mock filesystem existence with `exists: (candidate) => ...` for capability detection and command discovery tests in `tests/capabilities.test.ts` and `tests/gsd-core-commands.test.ts`.
- Mock command discovery file reads with `readFile` and `readdir` options in `discoverGsdCoreCommands()` tests.
- Mock model registries with minimal `getAvailable()`, `getAll()`, and `find()` objects in `tests/model-routing.test.ts` and `tests/register.test.ts`.
- Mock context-mode guard filesystem details using local `dirStats()` and `fileStats()` helpers in `tests/context-mode-guard.test.ts`.

**What NOT to Mock:**
- Do not mock pure functions such as `parseCommandArgs()`, `truncateTailText()`, `modelRef()`, or `resolveModelRouting()`; call them directly with representative inputs.
- Do not mock Node assertions or the Node test runner.
- Do not mock package metadata for `tests/metadata.test.ts`; read `package.json` and `extension-manifest.json` directly.
- Keep the `tests/smoke.test.ts` smoke test tied to the real package-local `node_modules/.bin/gsd-tools` path to verify the bundled dependency integration.

## Fixtures and Factories

**Test Data:**
```typescript
export function capabilities(mode: GsdMode, overrides: Partial<Capabilities> = {}): Capabilities {
  const subagents = mode === "delegated" || mode === "delegated-ctx";
  const contextMode = mode === "ctx-inline" || mode === "delegated-ctx";
  return {
    gsdCore: true,
    subagents,
    contextMode,
    mode,
    paths: {
      gsdCore: "package-local-gsd-core",
      gsdTools: "package-local-gsd-tools",
      subagents: subagents ? "subagent" : null,
      contextMode: contextMode ? "context-mode" : null,
      ...overrides.paths,
    },
    ...overrides,
  };
}
```

```typescript
function withRoutingConfig(config: string | object, fn: (cwd: string) => void) {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-model-routing-"));
  mkdirSync(path.join(cwd, ".pi-gsd"));
  writeFileSync(path.join(cwd, ".pi-gsd", "model-routing.json"), typeof config === "string" ? config : JSON.stringify(config));

  try {
    fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
```

**Location:**
- Shared capabilities and Pi runtime mocks: `tests/test-utils.ts`.
- Test-local fixtures stay in their test files when they are only used once, such as `withRoutingConfig()` in `tests/model-routing.test.ts`, `dirStats()` and `fileStats()` in `tests/context-mode-guard.test.ts`.
- Temporary filesystem fixtures use `mkdtempSync(path.join(tmpdir(), "pi-gsd-..."))` and must be cleaned with `rmSync(cwd, { recursive: true, force: true })` in `finally` blocks.

## Coverage

**Requirements:** None enforced. No coverage script or coverage threshold is configured in `package.json`.

**View Coverage:**
```bash
# Not configured. Add a coverage-capable runner or Node coverage workflow before relying on coverage reports.
```

## Test Types

**Unit Tests:**
- Primary test type. Unit tests cover pure and dependency-injected behavior in `tests/capabilities.test.ts`, `tests/context-mode-guard.test.ts`, `tests/dispatcher.test.ts`, `tests/gsd-core-commands.test.ts`, `tests/model-routing.test.ts`, and `tests/register.test.ts`.
- Use injected seams to avoid global state and side effects: `exists`, `detect`, `exec`, `readFile`, `readdir`, and fake Pi APIs.
- Assert full contract details, not just success: returned text, detail objects, command arrays, warnings, selected models, and UI notifications.

**Integration Tests:**
- `tests/metadata.test.ts` integrates with real repository metadata in `package.json` and `extension-manifest.json`.
- `tests/smoke.test.ts` integrates `createGsdDispatcher()` with package-local `node_modules/.bin/gsd-tools` and asserts the real help output contains `Usage: gsd-tools`.
- Some dispatcher tests spawn the real Node executable with `process.execPath` to exercise fallback spawning and cancellation in `src/extension/dispatcher.ts`.

**E2E Tests:**
- No browser or full Pi end-to-end framework is used.
- Live Pi smoke coverage is available through `npm run test:live-pi`, which runs `scripts/live-pi-rpc-smoke.mjs`; keep this separate from the normal `npm test` suite.

## Common Patterns

**Async Testing:**
```typescript
test("dispatcher run resolves cancellation after spawn starts", async () => {
  const dispatcher = createGsdDispatcher({
    gsdToolsCommand: process.execPath,
    detect: () => capabilities("inline"),
  });
  const controller = new AbortController();
  const running = dispatcher.run(["-e", "setInterval(() => {}, 1000)"], process.cwd(), controller.signal);

  setTimeout(() => controller.abort(), 50);
  const result = await running;

  assert.match(result.text, /gsd-tools exited with 130/);
  assert.match(result.text, /Cancelled while running|AbortError|The operation was aborted/i);
});
```

**Error Testing:**
```typescript
test("model routing surfaces invalid project config and falls back to defaults", () => {
  withRoutingConfig("{not json", (cwd) => {
    const resolved = resolveModelRouting(
      { agent: "gsd-planner" },
      { cwd, model: { provider: "openai", id: "current" }, thinkingLevel: "medium" },
    );

    assert.match(resolved.warnings.join("\n"), /Failed to read .*model-routing\.json/);
    assert.equal(resolved.model, "openai/current");
    assert.equal(resolved.thinking, "xhigh");
    assert.equal(resolved.recommendedAction.mode, "inherit-current");
  });
});
```

**Filesystem Testing:**
```typescript
const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-format-"));
mkdirSync(path.join(cwd, ".planning"));

try {
  const text = formatCapabilities(cwd, capabilities("delegated-ctx"));
  assert.match(text, /\.planning present: yes/);
} finally {
  rmSync(cwd, { recursive: true, force: true });
}
```

**Current Test Health:**
- `npm test` passes 66 tests with 0 failures.
- `npm run typecheck` completes successfully with `tsc --noEmit`.
- A Node deprecation warning appears during the smoke path for shell-spawned Windows commands; tests still pass and assert the expected behavior.

---

*Testing analysis: 2026-06-08*
