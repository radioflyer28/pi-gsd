# Codebase Concerns

**Analysis Date:** 2026-06-08

## Current Verification Signals

- `npm test` passes 66 Node test-runner tests from `tests/*.test.ts`.
- `npm run typecheck` passes for `src/**/*.ts` through `tsconfig.json`.
- `npm audit --omit=dev --json` reports 0 production vulnerabilities.
- CI in `.github/workflows/ci.yml` runs `npm ci`, `npm run typecheck`, `npm run build`, and `npm test` on Ubuntu with Node 22.

## Tech Debt

**Windows child-process launch path:**
- Issue: `src/extension/dispatcher.ts:259-264` uses `spawn(command, args, { shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(command) })` for package-local `gsd-tools` fallback execution. Node emits `[DEP0190] DeprecationWarning` when the smoke test exercises this path because args are passed while `shell: true` may be active for `.cmd`/`.bat` launchers.
- Files: `src/extension/dispatcher.ts`, `tests/dispatcher.test.ts`, `tests/smoke.test.ts`
- Impact: Windows users rely on the `.cmd` launcher returned by `gsdToolsCommandNames()` in `src/extension/capabilities.ts`; command arguments for `/gsd-run` are user-controlled and the shell-based fallback has a larger quoting/injection surface than direct exec. The warning also makes test logs noisy.
- Fix approach: Replace the Windows `.cmd` fallback with a safer launcher strategy: resolve the package-local JS entrypoint for `@opengsd/gsd-core`, run it through `process.execPath`, or use a small Windows-specific argument-escaping helper with tests that cover spaces, quotes, metacharacters, and cancellation.

**Model-routing command mixes resolution, UI prompting, model switching, and thinking mutation:**
- Issue: `gsdModelCommandHandler()` in `src/extension/register.ts:243-290` handles parsing, route resolution, optional UI select, model lookup, model switching, session override mutation, and thinking-level changes in one function.
- Files: `src/extension/register.ts`, `src/extension/model-routing.ts`, `tests/register.test.ts`, `tests/model-routing.test.ts`
- Impact: The command is hard to modify safely because one change can affect prompt fallback, session override persistence, and Pi runtime mutation. Tests cover the main flows, but future route modes or Pi API changes require editing a large multi-responsibility function.
- Fix approach: Keep pure resolution in `src/extension/model-routing.ts`; extract command-side effects into small helpers such as `chooseFallbackModel()`, `switchResolvedModel()`, and `applyThinkingLevel()`. Add focused tests in `tests/register.test.ts` for each helper boundary.

**Type coverage excludes tests and scripts:**
- Issue: `tsconfig.json:14-16` includes only `src/**/*.ts`; `tests/*.test.ts` and `scripts/live-pi-rpc-smoke.mjs` are not typechecked by `npm run typecheck` or CI.
- Files: `tsconfig.json`, `package.json`, `.github/workflows/ci.yml`, `tests/*.test.ts`, `scripts/live-pi-rpc-smoke.mjs`
- Impact: Test helper API drift, incorrect mock shapes, and accidental use of unsupported Node APIs in tests/scripts can pass `npm run typecheck`. Runtime tests catch syntax and executed paths, but they do not provide full static coverage for mocks and test-only branches.
- Fix approach: Add `tsconfig.test.json` with `noEmit: true`, `allowImportingTsExtensions: true`, and includes for `tests/**/*.ts`; add an npm script such as `typecheck:test` and run it in `.github/workflows/ci.yml`. Keep `scripts/live-pi-rpc-smoke.mjs` covered by a JS-aware lint/type path if desired.

**Build command is typecheck-only:**
- Issue: `package.json:9-10` maps `build` to `tsc -p tsconfig.json`, while `tsconfig.json:9` sets `noEmit: true`. The package points Pi directly at `src/extension/index.ts` in `package.json:22-25`.
- Files: `package.json`, `tsconfig.json`, `src/extension/index.ts`, `.github/workflows/ci.yml`
- Impact: CI's `Build` step validates types but does not produce or validate emitted distribution artifacts. This is acceptable for a Pi TypeScript-source package, but it can confuse release automation or contributors expecting `npm run build` to create `dist/`.
- Fix approach: Rename the current script to `check` or document that `build` is intentionally no-emit. If publishable JS artifacts are needed, add a separate emit tsconfig and test Pi loading from the emitted entrypoint.

## Known Bugs

**No confirmed functional bugs detected:**
- Symptoms: The core test suite passes and smoke coverage confirms package-local `gsd-tools --help` execution through `src/extension/dispatcher.ts`.
- Files: `tests/*.test.ts`, `src/extension/*.ts`
- Trigger: Not detected.
- Workaround: Not applicable.

**Potential Windows `gsd-tools` argument handling bug:**
- Symptoms: Node reports a child-process deprecation/security warning during tests that exercise `execWithNodeSpawn()`.
- Files: `src/extension/dispatcher.ts:259-264`, `tests/smoke.test.ts`, `tests/dispatcher.test.ts`
- Trigger: Running fallback spawn against a `.cmd` or `.bat` `gsd-tools` launcher on Windows with user-provided arguments.
- Workaround: Prefer Pi's `pi.exec` path when available; it bypasses the fallback `spawn()` implementation in `src/extension/dispatcher.ts`.

## Security Considerations

**User-controlled `/gsd-run` arguments reach process spawning:**
- Risk: `parseCommandArgs()` in `src/extension/register.ts` parses slash-command text into args, and `createGsdDispatcher().run()` in `src/extension/dispatcher.ts` passes those args to `pi.exec` or fallback spawn. The fallback Windows shell path increases shell metacharacter exposure.
- Files: `src/extension/register.ts:114-158`, `src/extension/dispatcher.ts:253-288`, `src/extension/capabilities.ts:31-39`
- Current mitigation: Arguments are passed as an array for non-Windows direct spawn; the command path is resolved from package-local capability detection instead of a system-wide `gsd-tools`; tests verify parsed quoted arguments in `tests/register.test.ts`.
- Recommendations: Add explicit Windows injection regression tests for `&`, `|`, `<`, `>`, `^`, quotes, and spaces. Prefer a shell-free launcher for all platforms.

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
- Test coverage: Unit tests mock the current API surface, but CI does not run `npm run test:live-pi`; live runtime compatibility is manually invoked through `scripts/live-pi-rpc-smoke.mjs`.

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

**No cross-platform CI matrix:**
- Problem: `.github/workflows/ci.yml` runs only `ubuntu-latest` despite Windows-specific launcher logic in `src/extension/capabilities.ts` and `src/extension/dispatcher.ts`.
- Blocks: Automated confidence for `.cmd`/`.ps1` `gsd-tools` resolution, Windows path handling, and the fallback spawn path that emits the Node deprecation/security warning.

**No coverage thresholds or coverage reporting:**
- Problem: `package.json` has no coverage script and the Node test runner is invoked without coverage options.
- Blocks: Quantified visibility into untested branches in `src/extension/register.ts`, `src/extension/model-routing.ts`, and platform-specific code in `src/extension/dispatcher.ts`.

## Test Coverage Gaps

**Windows-specific execution and paths:**
- What's not tested: Real Windows `.cmd`/`.ps1` launcher resolution, shell metacharacter handling, drive-letter paths, and cancellation behavior under Windows process semantics.
- Files: `src/extension/capabilities.ts`, `src/extension/dispatcher.ts`, `src/extension/context-mode-guard.ts`
- Risk: Windows Pi users can encounter command-launch failures or argument-handling bugs that Linux CI misses.
- Priority: High

**Live Pi extension compatibility:**
- What's not tested: Actual Pi runtime registration of tools, commands, event hooks, and command-source metadata in CI.
- Files: `src/extension/index.ts`, `src/extension/register.ts`, `src/extension/context-mode-guard.ts`, `scripts/live-pi-rpc-smoke.mjs`
- Risk: A Pi SDK change can break installation or command exposure while unit mocks still pass.
- Priority: High

**Tests are not statically typechecked:**
- What's not tested: Type correctness of `tests/*.test.ts`, mock Pi API shape in `tests/test-utils.ts`, and test-only helper contracts.
- Files: `tsconfig.json`, `tests/test-utils.ts`, `tests/*.test.ts`
- Risk: Type errors in tests can hide incorrect assumptions about the source API or Pi mock behavior.
- Priority: Medium

**Coverage for malformed upstream command body variants:**
- What's not tested: Upstream command markdown using YAML fields beyond `name`, `description`, and `argument-hint`; body references that do not match `@~/.claude/gsd-core/`; positional placeholders beyond simple `$1` forms.
- Files: `src/extension/gsd-core-commands.ts`, `tests/gsd-core-commands.test.ts`
- Risk: Upstream GSD Core command format changes can produce incomplete prompts or incorrect slash command metadata.
- Priority: Medium

---

*Concerns audit: 2026-06-08*
