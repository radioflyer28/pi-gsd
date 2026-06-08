# Testing Patterns

**Analysis Date:** 2026-06-08

## Test Framework

**Runner:**
- Node.js built-in test runner with TypeScript stripping.
- Command configured in `package.json`: `node --experimental-strip-types --test tests/*.test.ts`.
- Test files import `test` from `node:test`, as in `tests/register.test.ts`, `tests/dispatcher.test.ts`, and `tests/context-mode-guard.test.ts`.

**Assertion Library:**
- Node strict assertions from `node:assert/strict`.
- Use `assert.equal`, `assert.deepEqual`, `assert.ok`, `assert.match`, and `assert.doesNotMatch` as shown in `tests/dispatcher.test.ts` and `tests/register.test.ts`.

**Run Commands:**
```bash
npm test              # Run all tests with Node's built-in test runner
npm run typecheck     # Run TypeScript strict type checking without emit
npm run build         # Run TypeScript project build config
```

**Watch mode:**
- Not configured in `package.json`.

**Coverage:**
- No coverage script or threshold is configured in `package.json`.

## Test File Organization

**Location:**
- Tests live in the top-level `tests/` directory, separate from implementation files under `src/extension/`.
- Test helpers live in `tests/test-utils.ts`.

**Naming:**
- Use `*.test.ts` for test files: `tests/capabilities.test.ts`, `tests/context-mode-guard.test.ts`, `tests/dispatcher.test.ts`, `tests/metadata.test.ts`, `tests/register.test.ts`, `tests/smoke.test.ts`.
- Name each test file after the module or concern it verifies.

**Structure:**
```text
tests/
├── capabilities.test.ts          # Capability detection modes and optional Pi package detection
├── context-mode-guard.test.ts    # Context-mode state-boundary guard decisions and hook registration
├── dispatcher.test.ts            # Dispatcher cwd, status/doctor/run, truncation, external skill checks
├── metadata.test.ts              # package.json and extension-manifest.json resource contracts
├── register.test.ts              # Pi tool/command registration, command handlers, model routing commands
├── smoke.test.ts                 # Package-local gsd-tools invocation smoke test
└── test-utils.ts                 # Mock Pi API and capability fixtures
```

## Test Structure

**Suite Organization:**
```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { functionUnderTest } from "../src/extension/module.ts";

test("behavior under test is described in plain English", () => {
  const result = functionUnderTest();

  assert.equal(result, expectedValue);
});
```

**Patterns:**
- Use top-level `test(...)` calls rather than nested `describe` blocks. Every existing suite follows this style, including `tests/capabilities.test.ts` and `tests/register.test.ts`.
- Keep tests behavior-focused and descriptive: `dispatcher run refuses to use system-wide gsd-tools when package-local gsd-tools is missing` in `tests/dispatcher.test.ts` and `context-mode guard blocks wholesale .planning indexing unless explicitly requested` in `tests/context-mode-guard.test.ts`.
- Use inline fixtures and temporary directories for filesystem scenarios. `tests/dispatcher.test.ts` and `tests/register.test.ts` use `mkdtempSync`, `mkdirSync`, `writeFileSync`, and `rmSync`.
- Use `try/finally` cleanup for temporary directories, matching `tests/dispatcher.test.ts` and `tests/register.test.ts`.
- Use async tests for command handlers and dispatcher calls that return promises, as in `tests/register.test.ts` and `tests/smoke.test.ts`.

## Mocking

**Framework:**
- No external mocking framework is used.
- Use hand-written fakes, injected option functions, and `tests/test-utils.ts` helpers.

**Patterns:**
```typescript
const calls: unknown[][] = [];
const pi = mockPi(async (...args: unknown[]) => {
  calls.push(args);
  return { stdout: "ok", exitCode: 0 };
});

registerPiGsdCore(pi.api, {
  parameters: {},
  detect: () => capabilities("inline"),
  defaultCwd: process.cwd(),
  gsdCoreCommands: [],
});
```

**What to Mock:**
- Mock Pi API registration and runtime hooks with `mockPi` from `tests/test-utils.ts`.
- Mock capability mode with `capabilities(mode, overrides)` from `tests/test-utils.ts`.
- Mock filesystem probes with injected `exists`, `stat`, `readFile`, and `readdir` functions instead of manipulating real package state where possible.
- Mock `pi.exec` through the `mockPi` helper or dispatcher `exec` option to assert command, args, cwd, and signal handling.
- Mock UI/model registry interactions inline for model routing tests in `tests/register.test.ts`.

**What NOT to Mock:**
- Do not mock package metadata files for metadata contract tests; `tests/metadata.test.ts` reads real `package.json` and `extension-manifest.json`.
- Do not mock the final package-local smoke path in `tests/smoke.test.ts`; it verifies the actual installed `node_modules/.bin/gsd-tools` command.
- Do not mock pure parsing/formatting functions when direct inputs are sufficient, such as `parseCommandArgs` in `tests/register.test.ts` and `detectCapabilities` in `tests/capabilities.test.ts`.

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
    },
    ...overrides,
  };
}
```

**Location:**
- Shared test helpers are in `tests/test-utils.ts`.
- File-specific fakes should remain local to the suite, such as `dirStats()` and `fileStats()` in `tests/context-mode-guard.test.ts`.

## Coverage

**Requirements:** None enforced by tooling.

**View Coverage:**
```bash
# Not configured. Add a Node/V8 coverage command before relying on coverage reports.
```

**Important Coverage Areas:**
- Capability detection modes and candidate priority: `tests/capabilities.test.ts` covers `inline`, `ctx-inline`, `delegated`, `delegated-ctx`, active tool inventory, package-local GSD Core, and optional Pi package lookup.
- Dispatcher behavior: `tests/dispatcher.test.ts` covers cwd resolution, output truncation, status/doctor text, external global GSD skill warning, run dispatch through package-local tools, stderr/non-zero output, Node spawn fallback, missing package-local refusal, and abort handling.
- Pi registration: `tests/register.test.ts` covers tool and command registration, dynamic upstream command exposure, tool default status behavior, cwd propagation, command argument parsing, active tool detection, prompt guidelines, and model switching behavior.
- Context-mode guardrails and state-boundary rules: `tests/context-mode-guard.test.ts` covers `.planning/` indexing block/warn behavior, small source warning, bulky/transient allow behavior, explicit computed extraction allow behavior, and hook UI notifications.
- Package metadata: `tests/metadata.test.ts` covers Pi resources, manifest-provided commands/tools, package-local GSD Core dependency, external optional Pi packages, and configured scripts.
- End-to-end smoke: `tests/smoke.test.ts` covers actual invocation of package-local `gsd-tools --help` without `pi.exec`.

## Test Types

**Unit Tests:**
- Most suites are unit tests around exported pure functions and adapter boundaries: `tests/capabilities.test.ts`, `tests/context-mode-guard.test.ts`, `tests/dispatcher.test.ts`, and `tests/register.test.ts`.
- Use dependency injection to keep unit tests deterministic: `detect`, `exists`, `stat`, `exec`, and `externalGsdSkillPaths` are common seams.

**Integration Tests:**
- `tests/metadata.test.ts` integrates with real repository metadata files.
- `tests/smoke.test.ts` integrates with the installed package-local `gsd-tools` binary under `node_modules/.bin/`.

**E2E Tests:**
- No browser or full Pi runtime E2E framework is present.
- Runtime behavior that needs live Pi verification is documented in `docs/DESIGN.md`: after changes to Pi runtime behavior, run `/gsd-status` after `/reload` in a live Pi session.

## Common Patterns

**Async Testing:**
```typescript
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
});
```

**Error Testing:**
```typescript
test("dispatcher run includes stderr and non-zero exit codes", async () => {
  const dispatcher = createGsdDispatcher({
    exec: async () => ({ stdout: "out", stderr: "err", exitCode: 7 }),
    detect: () => capabilities("inline"),
  });

  const result = await dispatcher.run([], process.cwd());

  assert.match(result.text, /gsd-tools exited with 7/);
  assert.match(result.text, /\[stderr\]\nerr/);
});
```

**Filesystem Testing:**
```typescript
const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-run-"));
try {
  // create files/directories and assert behavior
} finally {
  rmSync(cwd, { recursive: true, force: true });
}
```

## Known Verification Commands

```bash
npm run typecheck
npm run build
npm test
```

Use all three commands before shipping changes. `docs/DESIGN.md` and `README.md` identify these as the normal verification expectations. Use `/gsd-status` after `/reload` in a live Pi session for changes that affect runtime command/tool registration.

---

*Testing analysis: 2026-06-08*
