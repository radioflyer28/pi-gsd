# Codebase Concerns

**Analysis Date:** 2026-06-08

## Tech Debt

**Thin adapter depends on CLI text/process seam:**
- Issue: Runtime execution is delegated to the package-local `gsd-tools` binary through `src/extension/dispatcher.ts` instead of a typed upstream API. `createGsdDispatcher().run()` formats stdout/stderr and exit codes as text, then truncates that text for Pi.
- Files: `src/extension/dispatcher.ts`, `src/extension/index.ts`, `docs/DESIGN.md`, `tests/dispatcher.test.ts`, `tests/smoke.test.ts`
- Impact: Planner/executor behavior stays upstream-compatible, but Pi cannot inspect structured GSD command results. Output truncation can hide root-cause lines when `gsd-tools` produces long logs. Windows command handling relies on package-local shim discovery and `spawn()` behavior.
- Fix approach: Keep `src/extension/dispatcher.ts` as the only seam. If structured dispatch is needed, add a typed command API upstream in `@opengsd/gsd-core`, then swap only `createGsdDispatcher()` internals and add integration tests in `tests/dispatcher.test.ts`.

**Large multi-responsibility extension modules:**
- Issue: `src/extension/model-routing.ts` contains default tier policy, config loading, route normalization, Pi model lookup, fallback policy, subagent advice formatting, and text rendering in one 439-line module. `src/extension/register.ts` combines Pi tool registration, command handlers, model switching, shell-style argument parsing, and upstream command prompt dispatch in one 361-line module.
- Files: `src/extension/model-routing.ts`, `src/extension/register.ts`, `tests/register.test.ts`
- Impact: Small changes to model routing or command registration are easy to couple accidentally. Route fallback changes require reviewing config parsing, session overrides, Pi registry lookup, and formatted output together.
- Fix approach: Preserve public exports used by tests. Split only behind those exports: move default tier tables and config parsing from `src/extension/model-routing.ts` into a dedicated internal helper, and move `/gsd-model` command behavior from `src/extension/register.ts` into a focused handler module. Keep tests in `tests/register.test.ts` and add focused route tests alongside the split.

**Runtime metadata relies on peer dependencies supplied by Pi:**
- Issue: `src/extension/index.ts` imports `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, and `typebox` as peer dependencies. `package.json` declares these peers as `*`, so compatibility is enforced by the Pi runtime and `extension-manifest.json`, not by npm semver.
- Files: `src/extension/index.ts`, `package.json`, `extension-manifest.json`, `tests/metadata.test.ts`
- Impact: A Pi platform or peer API change can break extension loading even when `npm test` passes against the local installation. The package only declares `extension-manifest.json` platform `>=2.29.0`.
- Fix approach: When changing imports from Pi packages, update `extension-manifest.json` platform requirements and add a metadata test in `tests/metadata.test.ts`. Keep `package.json` peers external; do not move Pi packages into `dependencies`.

**Dependency range can float upstream GSD Core behavior:**
- Issue: `package.json` declares `@opengsd/gsd-core` as `>=1.3.0`. The lockfile pins local installs, but package consumers can receive newer upstream behavior without a `pi-gsd` code change.
- Files: `package.json`, `package-lock.json`, `src/extension/gsd-core-commands.ts`, `src/extension/dispatcher.ts`, `tests/metadata.test.ts`
- Impact: Upstream command markdown layout, command frontmatter, or `gsd-tools` CLI output can change and affect `discoverGsdCoreCommands()` or `createGsdDispatcher().run()` at install time.
- Fix approach: Keep smoke coverage in `tests/smoke.test.ts` for real package-local `gsd-tools --help`. For releases, test against the minimum supported `@opengsd/gsd-core` and latest available version before publishing.

**No lint or formatter enforcement:**
- Issue: `package.json` provides `typecheck`, `build`, and `test`, but no lint or format script. The repository has no ESLint, Prettier, or Biome config.
- Files: `package.json`, `tsconfig.json`, `src/extension/*.ts`, `tests/*.test.ts`
- Impact: Style drift and import-order drift can accumulate in modules that already carry several responsibilities. TypeScript catches type issues but not consistency, complexity, or unused test patterns outside compiler coverage.
- Fix approach: Add lint/format tooling only if it can run locally without Pi runtime assumptions. Until then, keep conventions enforced through code review and tests.

## Known Bugs

**No confirmed reproducible bugs detected in source comments or tests:**
- Symptoms: TODO/FIXME/HACK/XXX scans over `src/**/*.ts`, `tests/**/*.ts`, and Markdown files returned no current markers.
- Files: `src/extension/capabilities.ts`, `src/extension/context-mode-guard.ts`, `src/extension/dispatcher.ts`, `src/extension/gsd-core-commands.ts`, `src/extension/index.ts`, `src/extension/model-routing.ts`, `src/extension/register.ts`, `tests/*.test.ts`
- Trigger: Not detected.
- Workaround: Not applicable.

**Command argument parsing is custom and intentionally narrow:**
- Symptoms: `/gsd-run` and upstream command expansion use custom shell-word parsers rather than a full shell parser. Current tests cover whitespace, quotes, and backslash escaping.
- Files: `src/extension/register.ts`, `src/extension/gsd-core-commands.ts`, `tests/register.test.ts`
- Trigger: Complex shell syntax beyond quotes/backslashes, such as environment assignment, glob expansion, command substitution, or platform-specific quoting, is not interpreted as a shell would interpret it.
- Workaround: Pass simple positional arguments to `/gsd-run` and slash-command wrappers. For complex shell operations, use a shell tool outside `pi-gsd` rather than relying on `/gsd-run` parsing.

## Security Considerations

**User-supplied command arguments reach package-local `gsd-tools`:**
- Risk: `gsd({ action: "run", args })` and `/gsd-run <args>` execute package-local `gsd-tools` with user-provided arguments in the selected working directory. This is expected behavior but remains an operational boundary.
- Files: `src/extension/dispatcher.ts`, `src/extension/register.ts`, `tests/dispatcher.test.ts`, `tests/register.test.ts`
- Current mitigation: `src/extension/dispatcher.ts` uses `spawn(command, args, ...)` without a general shell, refuses system-wide `gsd-tools`, and only enables `shell: true` for Windows `.cmd`/`.bat` shims. The tool schema in `src/extension/index.ts` uses an array for `args`.
- Recommendations: Keep argument handling array-based. Do not change `createGsdDispatcher().run()` to concatenate shell strings. Add security tests in `tests/dispatcher.test.ts` if command discovery or execution begins accepting raw command lines.

**Prompt expansion injects command markdown and user arguments into Pi conversation:**
- Risk: `expandGsdCoreCommandPrompt()` embeds upstream command body text and raw user arguments into a new Pi user message. Upstream command markdown is trusted package-local content, but arguments can contain arbitrary text.
- Files: `src/extension/gsd-core-commands.ts`, `src/extension/register.ts`, `tests/register.test.ts`
- Current mitigation: The expanded prompt starts with explicit provenance (`Execute upstream GSD Core command ... via pi-gsd`) and package-local root information. It replaces only known placeholders (`$ARGUMENTS`, `$@`, `$1`, etc.) and rewrites `@~/.claude/gsd-core/` paths to the package-local core root.
- Recommendations: Keep command markdown sourced only from `node_modules/@opengsd/gsd-core/commands/gsd`. Do not discover commands from project directories unless a separate trust model and tests are added.

**Context-mode guard blocks accidental durable artifact indexing but is heuristic:**
- Risk: `evaluateContextModeToolCall()` uses latest-user-text regexes to distinguish accidental and explicit context-mode use. False positives or false negatives can warn/block unexpectedly.
- Files: `src/extension/context-mode-guard.ts`, `tests/context-mode-guard.test.ts`, `docs/DESIGN.md`
- Current mitigation: The guard blocks only wholesale `.planning` indexing by default, warns for smaller risky uses, and allows explicit computed extraction or bulky/transient files.
- Recommendations: Keep the block list narrow. Add tests in `tests/context-mode-guard.test.ts` for every new heuristic and prefer warnings over blocks unless data loss or durable-state confusion is likely.

**Model routing config is project-local and may contain operational policy:**
- Risk: `.pi-gsd/model-routing.json` is read from the project working directory and can influence model selection, thinking level, and fallback behavior for GSD agents/skills/commands.
- Files: `src/extension/model-routing.ts`, `src/extension/register.ts`, `docs/DESIGN.md`, `tests/register.test.ts`
- Current mitigation: Config parsing normalizes known fields only, invalid JSON produces warnings and defaults, and session prompt fallback choices stay in memory instead of writing files.
- Recommendations: Treat `.pi-gsd/model-routing.json` as user-controlled project policy. Do not put secrets in this file. Keep parse failures non-fatal and visible in `formatResolvedModelRouting()` output.

## Performance Bottlenecks

**Synchronous filesystem probes run during status/doctor/registration paths:**
- Problem: Capability detection and command discovery use synchronous filesystem APIs.
- Files: `src/extension/capabilities.ts`, `src/extension/gsd-core-commands.ts`, `src/extension/dispatcher.ts`, `src/extension/register.ts`
- Cause: `detectCapabilities()` probes package-local and optional Pi package paths with `fs.existsSync()`. `discoverGsdCoreCommands()` reads command markdown synchronously during registration. `findExternalGsdSkillPaths()` scans global skill directories synchronously during doctor.
- Improvement path: Keep synchronous probes bounded to known directories. If startup latency grows, cache command discovery during extension registration and expose a reload path rather than scanning broader trees.

**Command output accumulation is bounded before final truncation:**
- Status: Resolved for the built-in Node spawn fallback on 2026-06-08.
- Previous problem: `execWithNodeSpawn()` accumulated full stdout/stderr strings, and truncation happened only after the child process closed.
- Files: `src/extension/dispatcher.ts`, `src/extension/index.ts`, `tests/dispatcher.test.ts`
- Current mitigation: `execWithNodeSpawn()` now keeps separate streaming tail buffers for stdout and stderr before producing the final `PiExecResult`, while preserving the external `PiExec` compatibility surface. Final Pi-facing truncation still happens through `truncateTailText()` / `truncateForPiTool()`.
- Remaining limit: Custom `pi.exec` implementations supplied by the Pi runtime may still return already-accumulated strings; pi-gsd can only bound memory for its own fallback spawn path.

**Model registry lookup can scan available models repeatedly:**
- Problem: `findPiModel()` calls `availableModels()` and filters candidates when a provider/id direct lookup fails or the model reference lacks a provider.
- Files: `src/extension/model-routing.ts`, `src/extension/register.ts`, `tests/register.test.ts`
- Cause: Model routing prioritizes compatibility with both `modelRegistry.find()` and list-style registries.
- Improvement path: Keep current behavior for small registries. If Pi exposes large registries, memoize `availableModels()` per command invocation or prefer provider/id references in `.pi-gsd/model-routing.json`.

## Fragile Areas

**Upstream command discovery and prompt rewriting:**
- Files: `src/extension/gsd-core-commands.ts`, `src/extension/register.ts`, `tests/register.test.ts`
- Why fragile: `discoverGsdCoreCommands()` assumes upstream command files are Markdown files under `node_modules/@opengsd/gsd-core/commands/gsd`, with simple frontmatter fields (`name`, `description`, `argument-hint`). `expandGsdCoreCommandPrompt()` rewrites a Claude-specific path prefix to the package-local core root.
- Safe modification: Change discovery in `src/extension/gsd-core-commands.ts` only. Keep slash command names normalized with the `gsd-` prefix, and update `tests/register.test.ts` to cover any new placeholder or frontmatter syntax.
- Test coverage: Unit coverage exists for one command prompt expansion in `tests/register.test.ts`; add cases for multiple command files, malformed frontmatter, and path rewriting on Windows before broadening discovery.

**Capability detection can disagree with actual runtime availability:**
- Files: `src/extension/capabilities.ts`, `src/extension/register.ts`, `src/extension/dispatcher.ts`, `tests/capabilities.test.ts`, `tests/register.test.ts`
- Why fragile: Detection prefers active Pi tool inventory when available, otherwise falls back to filesystem paths under the current project and user home. Filesystem existence does not prove an extension is loaded, while missing tool inventory can under-report loaded packages.
- Safe modification: Preserve active-tool preference in `detectCapabilities()`. Add tests in `tests/capabilities.test.ts` for every new candidate path or active tool name.
- Test coverage: Good unit coverage exists for detection modes and path priority. Live Pi detection still requires manual `/gsd-status` after `/reload` as documented in `docs/DESIGN.md`.

**Model switching combines routing policy with Pi side effects:**
- Files: `src/extension/model-routing.ts`, `src/extension/register.ts`, `tests/register.test.ts`
- Why fragile: `gsdModelCommandHandler()` resolves policy, optionally prompts via UI, calls `pi.setModel()`, stores session overrides, and sets thinking level. A partial failure can leave model and thinking state changed differently from the text message a user expects.
- Safe modification: Keep `resolveModelRouting()` pure in `src/extension/model-routing.ts`. Keep Pi side effects isolated in `src/extension/register.ts`, and test prompt, unavailable model, inherited route, and thinking-level branches in `tests/register.test.ts`.
- Test coverage: Existing tests cover inherit fallback and prompt fallback. Add tests for `fallback: "error"`, `fallback: "omit"`, failed `pi.setModel()`, unavailable `ctx.ui.select`, and session override precedence.

**Context-mode guard depends on session-manager message shape:**
- Files: `src/extension/context-mode-guard.ts`, `tests/context-mode-guard.test.ts`
- Why fragile: `latestUserText()` handles two possible session entry shapes and uses `any` for entry extraction. A Pi session-manager API change can make explicit-user-intent detection fail silently.
- Safe modification: Keep missing/unknown session history as a safe default. Do not require session history for baseline allow/block decisions. Add tests for every session entry shape supported.
- Test coverage: Unit tests cover explicit `.planning` indexing and computed extraction prompts. Live hook behavior is covered through a mock in `tests/context-mode-guard.test.ts`, not an actual Pi runtime.

## Scaling Limits

**Repository scope is intentionally small:**
- Current capacity: Source is six extension modules plus one type declaration under `src/`, with tests under `tests/` and command resources under `skills/` and `prompts/`.
- Limit: As more Pi integrations or GSD-specific policies are added, `src/extension/register.ts` and `src/extension/model-routing.ts` become central merge-conflict and regression hotspots.
- Scaling path: Add new behavior behind narrow modules under `src/extension/` and keep `src/extension/index.ts` limited to public schema/registration wiring.

**Command discovery assumes flat upstream command directory:**
- Current capacity: `discoverGsdCoreCommands()` reads `.md` files directly in one commands directory.
- Limit: Nested command directories, non-Markdown command definitions, or metadata generated outside frontmatter are not discovered.
- Scaling path: Extend `src/extension/gsd-core-commands.ts` only after upstream `@opengsd/gsd-core` formalizes the command metadata shape. Add fixtures in `tests/register.test.ts` or a dedicated command-discovery test.

**Output handling is tail-only:**
- Current capacity: Dispatcher output is capped at 50,000 chars / 2,000 lines in `src/extension/dispatcher.ts`, then Pi tool output uses Pi defaults in `src/extension/index.ts`.
- Limit: Long-running commands with important early output can lose context because only the tail survives.
- Scaling path: Prefer upstream structured summaries or store large logs as artifacts. If text output remains the seam, include explicit start/end summaries from upstream `gsd-tools` so tail truncation stays useful.

## Dependencies at Risk

**`@opengsd/gsd-core`:**
- Risk: Package-local dependency is intentionally the source of GSD behavior, but the semver range is open-ended (`>=1.3.0`). Command layout and CLI output are outside `pi-gsd` control.
- Impact: Slash command discovery, prompt expansion, and smoke invocation can break after dependency updates.
- Migration plan: Keep `src/extension/dispatcher.ts` and `src/extension/gsd-core-commands.ts` thin. Prefer upstream additions over local duplication, and update `tests/smoke.test.ts` when upstream CLI behavior changes.

**Node built-in TypeScript stripping:**
- Risk: Tests run with `node --experimental-strip-types --test tests/*.test.ts`, and the package requires Node `>=22.0.0`.
- Impact: Test execution depends on Node's experimental TypeScript stripping behavior. Developers on older or incompatible Node versions cannot run tests even though TypeScript source is otherwise standard.
- Migration plan: Keep `engines.node` in `package.json` aligned with the test runner. If Node changes strip-types behavior, switch tests to compiled JS or a stable TS test runner and update `tests/metadata.test.ts`.

**Pi peer APIs:**
- Risk: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, and `typebox` are wildcard peers supplied by Pi.
- Impact: Extension load failures can appear only in live Pi when peer APIs change.
- Migration plan: Use `extension-manifest.json` to raise platform requirements when importing new APIs. Keep mock-based tests in `tests/test-utils.ts` updated with any required Pi API methods.

## Missing Critical Features

**CI workflow present:**
- Status: Resolved on 2026-06-08.
- Previous problem: The repository had scripts for typecheck, build, and test, but no detected `.github/workflows` or other CI configuration in the current tree.
- Current mitigation: `.github/workflows/ci.yml` runs `npm ci`, `npm run typecheck`, `npm run build`, and `npm test` on pushes to `main` and pull requests.

**Live Pi integration smoke harness is optional/local:**
- Status: Partially resolved on 2026-06-08.
- Previous problem: Tests used mocks for Pi APIs and a smoke test for package-local `gsd-tools`, but no automated test loaded the extension in a real Pi runtime.
- Current mitigation: `npm run test:live-pi` starts `pi --mode rpc` with `src/extension/index.ts`, calls RPC `get_commands`, and verifies core extension commands plus representative upstream `gsd-*` commands are registered from the extension. This covers extension loading and command-palette registration without requiring an LLM provider/API key.
- Remaining gap: This smoke is not part of default CI because GitHub runners do not necessarily have the `pi` CLI installed/configured. It also does not exercise a full interactive TUI `/reload`, live UI selection, or model registry side effects.

**No structured upstream command result API:**
- Problem: `src/extension/dispatcher.ts` returns text for status/doctor/run output. The adapter cannot reason over typed upstream results.
- Blocks: Reliable programmatic orchestration, rich UI rendering, and robust error classification inside Pi remain limited until upstream exposes a structured seam.

## Test Coverage Gaps

**Live extension lifecycle:**
- What's now tested: Optional `npm run test:live-pi` covers actual Pi extension loading in RPC mode and command palette registration for pi-gsd integration commands plus representative upstream GSD commands.
- What's still not tested: interactive TUI `/reload`, tool schema validation beyond extension startup, live UI notification/select behavior, and live model registry side effects.
- Files: `src/extension/index.ts`, `src/extension/register.ts`, `src/extension/context-mode-guard.ts`, `tests/register.test.ts`, `tests/context-mode-guard.test.ts`, `scripts/live-pi-rpc-smoke.mjs`
- Risk: Mock APIs in `tests/test-utils.ts` can diverge from Pi's runtime API.
- Priority: Medium

**Model routing edge cases:**
- What's now tested: Invalid `.pi-gsd/model-routing.json`, `fallback: "error"`, `fallback: "omit"`, and session override precedence are covered in `tests/model-routing.test.ts`.
- What's still not tested: failed `pi.setModel()`, unavailable `ctx.ui.select`, ambiguous model names, and command-vs-skill inference for unknown targets.
- Files: `src/extension/model-routing.ts`, `src/extension/register.ts`, `tests/register.test.ts`, `tests/model-routing.test.ts`
- Risk: GSD model guidance can silently inherit an unintended model or set only part of the intended runtime state.
- Priority: Medium

**Command discovery edge cases:**
- What's now tested: Multiple upstream-style command files, missing command directory, malformed/missing frontmatter, quoted argument placeholder expansion, and package-local GSD Core path rewriting are covered in `tests/gsd-core-commands.test.ts`.
- What's still not tested: nested command folders, duplicate normalized slash names, and a live Windows command-palette path rewrite assertion.
- Files: `src/extension/gsd-core-commands.ts`, `src/extension/register.ts`, `tests/register.test.ts`, `tests/gsd-core-commands.test.ts`
- Risk: Upstream command changes can remove or mis-register slash commands without obvious compile-time failures.
- Priority: Low

**Child process and cancellation behavior under load:**
- What's now tested: Large stdout/stderr from the Node spawn fallback is covered by a regression test that verifies streaming tail truncation before final output truncation.
- What's still not tested: process cancellation after spawn starts, Windows `.cmd` shell invocation, stderr-only failures with very large output, and non-UTF8 output.
- Files: `src/extension/dispatcher.ts`, `tests/dispatcher.test.ts`, `tests/smoke.test.ts`
- Risk: Long or failed GSD commands can degrade Pi responsiveness or hide actionable diagnostics.
- Priority: Medium

**Context-mode heuristic breadth:**
- What's not tested: Symlinked `.planning` paths, Windows drive/case variants, additional context-mode tool names, multi-turn user intent where the latest user message is not the relevant instruction, and large source files that exceed the small-file warning threshold.
- Files: `src/extension/context-mode-guard.ts`, `tests/context-mode-guard.test.ts`
- Risk: The guard may warn/block legitimate workflows or miss accidental indexing as Pi context-mode tools evolve.
- Priority: Medium

---

*Concerns audit: 2026-06-08*
