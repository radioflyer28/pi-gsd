# Codebase Concerns

**Analysis Date:** 2026-06-08

## Current Verification Signals

- `npm test` passes 67 Node test-runner tests from `tests/*.test.ts`.
- `npm run check` passes source and test TypeScript checks through `tsconfig.json` and `tsconfig.test.json`.
- `npm run build` emits release-validation artifacts to `dist/` through `tsconfig.build.json`.
- `npm audit --omit=dev --json` reports 0 production vulnerabilities.
- CI in `.github/workflows/ci.yml` runs `npm ci`, source typecheck, test typecheck, build, and unit tests on Ubuntu and Windows with Node 22.

## Tech Debt

**Windows child-process launch path:**
- Status: Resolved on 2026-06-08.
- Previous issue: `execWithNodeSpawn()` used `shell: true` for Windows `.cmd`/`.bat` launchers, producing Node `[DEP0190]` warnings and a larger quoting/injection surface.
- Files: `src/extension/dispatcher.ts`, `tests/dispatcher.test.ts`, `tests/smoke.test.ts`
- Current mitigation: package-local Windows shim paths are converted to the package-local `@opengsd/gsd-core/gsd-core/bin/gsd-tools.cjs` entrypoint and launched via `process.execPath` with `shell: false`. Regression tests cover spaces, quotes, and shell metacharacters.

**Model-routing command side effects:**
- Status: Improved on 2026-06-08.
- Previous issue: `gsdModelCommandHandler()` mixed parsing, route resolution, UI select, model lookup, model switching, session override mutation, and thinking-level changes in one function.
- Files: `src/extension/register.ts`, `src/extension/model-routing.ts`, `tests/register.test.ts`, `tests/model-routing.test.ts`
- Current mitigation: model switching and thinking mutation are isolated behind `switchModelRef()`, `switchResolvedModel()`, and `applyThinkingLevel()`, while pure resolution remains in `src/extension/model-routing.ts`. Existing tests cover prompt fallback, unavailable UI, failed model switch, inherited route, `fallback: "error"`, `fallback: "omit"`, ambiguous model names, target inference, and session override precedence.
- Remaining concern: helpers still live in `register.ts`; move to a separate module only if routing side effects grow further.

**Type coverage includes tests:**
- Status: Resolved for TypeScript tests on 2026-06-08.
- Previous issue: `tsconfig.json` included only `src/**/*.ts`, so `tests/*.test.ts` were not statically checked.
- Files: `tsconfig.test.json`, `package.json`, `.github/workflows/ci.yml`, `tests/*.test.ts`, `scripts/live-pi-rpc-smoke.mjs`
- Current mitigation: `npm run typecheck:test` uses `tsconfig.test.json` for tests, `npm run check` runs source + test typechecks, and CI runs both. The JS live Pi smoke script is still covered by runtime execution rather than static JS typechecking.

**Build command emits release-validation artifacts:**
- Status: Resolved on 2026-06-08.
- Previous issue: `npm run build` used the no-emit source typecheck config, which confused CI/release semantics.
- Files: `package.json`, `tsconfig.build.json`, `tsconfig.json`, `src/extension/index.ts`, `.github/workflows/ci.yml`
- Current mitigation: `npm run build` uses `tsconfig.build.json` to emit JS, declarations, and source maps to ignored `dist/`. Pi package metadata still loads `src/extension/index.ts` directly for local package development.

## Known Bugs

**No confirmed functional bugs detected:**
- Symptoms: The core test suite passes and smoke coverage confirms package-local `gsd-tools --help` execution through `src/extension/dispatcher.ts`.
- Files: `tests/*.test.ts`, `src/extension/*.ts`
- Trigger: Not detected.
- Workaround: Not applicable.

**Windows `gsd-tools` argument handling bug resolved:**
- Status: Resolved on 2026-06-08.
- Previous symptoms: Node reported a child-process deprecation/security warning during tests that exercised `execWithNodeSpawn()`.
- Files: `src/extension/dispatcher.ts`, `tests/smoke.test.ts`, `tests/dispatcher.test.ts`
- Current mitigation: fallback spawn now uses the package-local CJS entrypoint through `process.execPath` with `shell: false` when handed a package-local Windows shim.

## Security Considerations

**User-controlled `/gsd-run` arguments reach process spawning:**
- Risk: `parseCommandArgs()` in `src/extension/register.ts` parses slash-command text into args, and `createGsdDispatcher().run()` in `src/extension/dispatcher.ts` passes those args to `pi.exec` or fallback spawn.
- Files: `src/extension/register.ts`, `src/extension/dispatcher.ts`, `src/extension/capabilities.ts`
- Current mitigation: Arguments are passed as arrays; command paths are resolved from package-local capability detection instead of system-wide `gsd-tools`; fallback spawn avoids shell execution for package-local Windows shims; tests verify parsed quoted arguments plus `&`, `|`, `^`, quotes, and spaces.
- Recommendations: Keep `/gsd-run` argument handling array-based. Add more tests before supporting any raw shell command line mode.

**Project model-routing config is read from `.pi-gsd/model-routing.json`:**
- Risk: `loadModelRoutingConfig()` reads project-local JSON and can instruct `/gsd-model` to switch models or set thinking levels.
- Files: `src/extension/model-routing.ts:209-242`, `src/extension/register.ts:243-290`, `tests/model-routing.test.ts`, `tests/register.test.ts`
- Current mitigation: JSON parsing is normalized through `normalizeConfig()`, invalid fields are ignored, unavailable models follow configured fallback behavior, and tests cover invalid JSON plus unavailable model fallbacks.
- Recommendations: Keep `.pi-gsd/model-routing.json` non-secret and review route changes like code. Do not add token-bearing provider config to this file.

**Context-mode guard depends on event context fidelity:**
- Risk: `evaluateContextModeToolCall()` uses `ctx.cwd`, `ctx.sessionManager`, `fs.statSync()`, and `fs.realpathSync()` to decide whether to block or warn on context-mode calls. Missing or inconsistent Pi event context can reduce protections to warnings or allows.
- Files: `src/extension/context-mode-guard.ts:112-241`, `tests/context-mode-guard.test.ts`
- Current mitigation: The guard canonicalizes paths, detects `.planning` case-insensitively, resolves symlinks when available, and tests direct `.planning`, symlink, and case-variant paths.
- Recommendations: Keep guard tests aligned with Pi hook payload shape. Add tests for Windows drive-letter paths and UNC-style paths if Pi supports them.

## Performance Bottlenecks

**Capability detection performs synchronous filesystem probes on status/doctor/run:**
- Problem: `detectCapabilities()` probes package, project-local, and user-scoped optional integration paths every time dispatcher details are built.
- Files: `src/extension/capabilities.ts:63-151`, `src/extension/dispatcher.ts:291-305`, `src/extension/register.ts:83-98`
- Cause: The detector uses synchronous `fs.existsSync()` over a small set of candidate paths and is invoked by `details(cwd)` for each action.
- Improvement path: Keep synchronous checks for simplicity unless status/doctor calls show latency in Pi. If needed, cache detector results per `(cwd, packageRoot, activeToolNames)` for a short TTL and invalidate on `/reload`.

**Upstream command discovery reads every command body at registration:**
- Problem: `discoverGsdCoreCommands()` loads every markdown command from `node_modules/@opengsd/gsd-core/commands/gsd` during extension registration.
- Files: `src/extension/gsd-core-commands.ts:52-81`, `src/extension/register.ts:301-318`, `scripts/live-pi-rpc-smoke.mjs:67-88`
- Cause: Command registration needs descriptions and handlers, and handlers retain each command body for prompt expansion.
- Improvement path: Keep current eager loading while command count remains small. If startup latency grows, load frontmatter eagerly and lazily read `body` inside `gsdCoreCommandHandler()`.

## Fragile Areas

**Upstream GSD Core markdown prompt expansion:**
- Files: `src/extension/gsd-core-commands.ts`, `tests/gsd-core-commands.test.ts`, `src/extension/register.ts`
- Why fragile: `expandGsdCoreCommandPrompt()` rewrites `$ARGUMENTS`, `$@`, positional `$1` values, and `@~/.claude/gsd-core/` references based on assumptions about upstream markdown command format.
- Safe modification: Preserve tests in `tests/gsd-core-commands.test.ts` when changing substitution rules. Add fixtures for any new upstream frontmatter fields or path-reference patterns before modifying `parseFrontmatter()` or replacement logic.
- Test coverage: Unit tests cover malformed frontmatter, multiple command files, missing commands directory, quoted args, and the current `@~/.claude/gsd-core/` rewrite. Live Pi command registration is covered only by optional `npm run test:live-pi`.

**Pi SDK surface is locally typed and permissive:**
- Files: `src/types/pi-sdk.d.ts`, `src/extension/register.ts`, `src/extension/index.ts`, `tests/test-utils.ts`
- Why fragile: `RegisterablePiApi` and `ExtensionAPI` usage depend on Pi runtime APIs such as `registerTool`, `registerCommand`, `getAllTools`, `setModel`, `setThinkingLevel`, `sendUserMessage`, and `on`. Several values are typed as `unknown` or `Record<string, unknown>` to keep the adapter loose.
- Safe modification: Before using a new Pi API, update `src/types/pi-sdk.d.ts`, extend `tests/test-utils.ts`, and add registration tests in `tests/register.test.ts` or `tests/context-mode-guard.test.ts`.
- Test coverage: Unit tests mock the current API surface, tests are now statically typechecked, and live runtime compatibility is manually invoked through `scripts/live-pi-rpc-smoke.mjs`.

**Context-mode guard heuristics:**
- Files: `src/extension/context-mode-guard.ts`, `tests/context-mode-guard.test.ts`
- Why fragile: Allow/block behavior is rule-based across tool names, path extensions, `.planning` detection, bulky/transient directories, and user prompt text. Small wording changes can change whether a tool call is allowed.
- Safe modification: Add one test per new heuristic and keep reason strings stable where tests assert exact block results.
- Test coverage: Unit tests cover main `.planning` and small-file flows; no integration test validates actual Pi UI notification behavior outside the mock in `tests/test-utils.ts`.

## Scaling Limits

**Spawned command output is intentionally tail-limited:**
- Current capacity: `DEFAULT_MAX_OUTPUT_CHARS` is 50,000 and `DEFAULT_MAX_OUTPUT_LINES` is 2,000 in `src/extension/dispatcher.ts:56-57`; fallback spawned stdout/stderr each retain about one third of the final character budget in `src/extension/dispatcher.ts:265-267`.
- Limit: Very large `gsd-tools` output preserves only the tail, so earlier errors or summaries can be dropped before final formatting.
- Scaling path: Keep tail truncation for Pi responsiveness. For commands where head context matters, add structured `--json` support through upstream `gsd-tools` or add a bounded head+tail truncator with tests in `tests/dispatcher.test.ts`.

**External global GSD skill warning shows only first 10 paths:**
- Current capacity: `formatExternalGsdSkillWarning()` displays up to 10 global `gsd-*` skill paths.
- Limit: Environments with more than 10 global GSD skills hide the remaining paths behind a count.
- Scaling path: Keep the abbreviated doctor output for readability. Add a `--json` or verbose doctor path upstream if complete inventory becomes necessary.

## Dependencies at Risk

**Node experimental strip-types test runner:**
- Risk: `package.json:11` uses `node --experimental-strip-types --test tests/*.test.ts`; Node prints the feature name as experimental.
- Impact: Test execution depends on Node 22+ behavior for stripping TypeScript at runtime. Changes to Node's strip-types implementation can affect test startup even when source compilation succeeds.
- Migration plan: Continue pinning CI to Node 22 in `.github/workflows/ci.yml`. If the experimental flag becomes unstable, run tests through a stable TS runner or precompile tests with a test tsconfig.

**Broad dependency range for `@opengsd/gsd-core`:**
- Risk: `package.json:39` declares `@opengsd/gsd-core` as `>=1.3.0` while command discovery depends on the package-local directory layout `node_modules/@opengsd/gsd-core/commands/gsd`.
- Impact: A future upstream layout change can remove or rename markdown command files and reduce slash-command exposure at runtime.
- Migration plan: Keep `tests/gsd-core-commands.test.ts`, `tests/smoke.test.ts`, and `scripts/live-pi-rpc-smoke.mjs` as compatibility checks. Consider narrowing the range or adding startup diagnostics when command discovery returns unexpectedly few commands.

**Pi peer dependency wildcards:**
- Risk: `package.json:33-36` uses `*` peer ranges for `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `typebox`.
- Impact: Breaking changes in Pi or typebox can affect extension registration before TypeScript catches local API drift.
- Migration plan: Keep `extension-manifest.json` platform requirement in sync with the actual Pi SDK surface. Pin minimum peer versions once the required APIs are known.

## Missing Critical Features

**CI does not run live Pi RPC smoke:**
- Problem: `.github/workflows/ci.yml` runs unit tests only; `scripts/live-pi-rpc-smoke.mjs` is available through `npm run test:live-pi` but not part of CI.
- Blocks: Automated verification that Pi can load `src/extension/index.ts`, expose dynamic upstream `gsd-*` commands, and report command source as `extension` in a real Pi runtime.

**Cross-platform CI matrix present:**
- Status: Resolved on 2026-06-08.
- Previous problem: `.github/workflows/ci.yml` ran only `ubuntu-latest` despite Windows-specific launcher logic.
- Current mitigation: CI now runs on both `ubuntu-latest` and `windows-latest` with Node 22, including source typecheck, test typecheck, build, and unit tests.

**No coverage thresholds or coverage reporting:**
- Problem: `package.json` has no coverage script and the Node test runner is invoked without coverage options.
- Blocks: Quantified visibility into untested branches in `src/extension/register.ts`, `src/extension/model-routing.ts`, and platform-specific code in `src/extension/dispatcher.ts`.

## Test Coverage Gaps

**Windows-specific execution and paths:**
- What's now tested: CI runs on Windows, fallback shim handling avoids shell launch, and unit coverage includes shell metacharacter handling plus cancellation behavior.
- What's still not tested: real installed Pi command execution through `pi.exec`, UNC path variants, and `.ps1` launcher behavior beyond the CJS-entrypoint fallback.
- Files: `src/extension/capabilities.ts`, `src/extension/dispatcher.ts`, `src/extension/context-mode-guard.ts`
- Risk: Windows Pi users can encounter command-launch failures or argument-handling bugs that local mocks miss.
- Priority: Medium

**Live Pi extension compatibility:**
- What's not tested: Actual Pi runtime registration of tools, commands, event hooks, and command-source metadata in CI.
- Files: `src/extension/index.ts`, `src/extension/register.ts`, `src/extension/context-mode-guard.ts`, `scripts/live-pi-rpc-smoke.mjs`
- Risk: A Pi SDK change can break installation or command exposure while unit mocks still pass.
- Priority: High

**Tests are statically typechecked:**
- Status: Resolved on 2026-06-08.
- What's now tested: Type correctness of `tests/*.test.ts`, mock Pi API shape in `tests/test-utils.ts`, and test-only helper contracts through `npm run typecheck:test`.
- Files: `tsconfig.test.json`, `tests/test-utils.ts`, `tests/*.test.ts`
- Remaining gap: `scripts/live-pi-rpc-smoke.mjs` is JavaScript and is covered by runtime execution, not static typechecking.
- Priority: Low

**Coverage for malformed upstream command body variants:**
- What's not tested: Upstream command markdown using YAML fields beyond `name`, `description`, and `argument-hint`; body references that do not match `@~/.claude/gsd-core/`; positional placeholders beyond simple `$1` forms.
- Files: `src/extension/gsd-core-commands.ts`, `tests/gsd-core-commands.test.ts`
- Risk: Upstream GSD Core command format changes can produce incomplete prompts or incorrect slash command metadata.
- Priority: Medium

---

*Concerns audit: 2026-06-08*
