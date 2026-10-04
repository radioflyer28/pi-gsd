# pi-gsd Maintenance and Compatibility Playbook

This playbook is for maintainers and agents updating `pi-gsd` after changes in Pi, GSD Core, context-mode, or pi-subagents.

After reading it, a maintainer should be able to decide whether `pi-gsd` needs a code change, a dependency bump, documentation changes, or no action.

## Maintenance stance

`pi-gsd` should stay a thin adapter:

- Pi integration belongs in `pi-gsd`.
- GSD workflow semantics belong in upstream GSD Core.
- Context-efficient processing belongs in context-mode.
- Fresh-context and parallel delegation belong in pi-subagents.

Do not copy upstream prompts, reimplement GSD command behavior, vendor optional Pi packages, or add orchestration that belongs to another extension.

## When to run this playbook

Run this process when any of these happen:

- Pi is upgraded.
- `pi update --extensions` changes installed Pi packages.
- `@opengsd/gsd-core` has a new release.
- context-mode changes tool names, package layout, or hook behavior.
- pi-subagents changes tool names, package layout, or delegation contract.
- Live Pi smoke tests fail.
- `/gsd-status`, `/gsd-doctor`, `/gsd-run`, or dynamic `/gsd-*` commands behave differently after an update.

## First classify the change

Before editing code, decide which surface changed.

| Surface | Typical signs | Likely action |
| --- | --- | --- |
| Pi harness API | Type errors around extension imports, tool definitions, command handlers, events, model switching, tool inventory, or shell execution | Update the Pi adapter layer and tests. |
| Pi package rules | Package no longer loads, resources are missing, local/project package behavior changed | Update package metadata or install docs. |
| GSD Core | New or removed `gsd:*` commands, changed `gsd-tools` binary, changed command prompt format, changed planning artifact semantics | Prefer dependency bump and dynamic discovery; only adapt the dispatcher if seams moved. |
| context-mode | New/renamed `ctx_*` tools, different package path, different indexing behavior | Update detection and guardrails only. |
| pi-subagents | New/renamed `subagent` tool, changed acceptance/model fields, package path changes | Update detection and guidance/model-routing output only. |
| Local dependency drift | Repo `node_modules` differs from installed Pi runtime but tests pass | Refresh lockfile/dev install if useful; avoid unnecessary code changes. |

## Baseline inventory

Capture the runtime and installed package state before changing anything.

```bash
pi --version
pi list
npm ls --depth=0
npm outdated --depth=0 || true
```

Also inspect user/project Pi package settings if detection looks wrong.

```bash
node - <<'NODE'
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
for (const file of [
  path.join(os.homedir(), '.pi', 'agent', 'settings.json'),
  path.join(process.cwd(), '.pi', 'settings.json'),
  path.join(process.cwd(), '.pi-gsd', 'config.json'),
  path.join(process.cwd(), '.pi-gsd', 'model-routing.json'),
]) {
  console.log(`\n--- ${file}`);
  console.log(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '<missing>');
}
NODE
```

Expected healthy state for full integration mode:

- Pi lists `pi-gsd` as a project or user package.
- Optional accelerators, if installed, are listed as Pi packages rather than nested dependencies of `pi-gsd`.
- `/gsd-status` or `gsd({ action: "status" })` reports package-local GSD Core support, command-discovery status, integration provenance, native-plugin coexistence, and optional diagnostics state.
- If context-mode and pi-subagents are loaded and not masked, mode is `delegated-ctx`.

## Pi harness API compatibility

Review Pi's current extension docs and installed type declarations when Pi changes. Pay special attention to these adapter touchpoints:

- extension factory signature
- `registerTool` definition shape
- tool `execute` signature and result shape
- `registerCommand` handler signature and return behavior
- `tool_call` event blocking contract
- `getAllTools` / active tool inventory
- `exec` contract for shell command execution
- `sendUserMessage` delivery modes
- `setModel`, `getThinkingLevel`, and `setThinkingLevel`
- truncation helper exports
- package manifest rules under the `pi` key

Useful checks:

```bash
rg -n "interface ExtensionAPI|registerTool|registerCommand|getAllTools|setModel|sendUserMessage|exec\(" \
  "$APPDATA/npm/node_modules/@earendil-works/pi-coding-agent/dist" -g "*.d.ts"

rg -n "DEFAULT_MAX_BYTES|DEFAULT_MAX_LINES|truncateTail|formatSize" \
  "$APPDATA/npm/node_modules/@earendil-works/pi-coding-agent/dist" -g "*.d.ts"
```

If Pi changed only by adding fields or events, no `pi-gsd` change is usually required. If Pi changed a required signature or removed an export, update the adapter and tests before changing behavior.

### Pi package compatibility

Confirm the package manifest still follows Pi package rules:

- Pi core packages stay in peer dependencies, never bundled runtime dependencies. pi-gsd requires `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` >=1.0.0; `typebox` retains its wildcard peer range.
- The lockfile records the tested development install, not a second Pi runtime to ship. Test the declared minimum as well as the locked/latest version when raising compatibility requirements.
- Runtime dependencies used by `pi-gsd` itself stay in dependencies.
- context-mode and pi-subagents are not dependencies of `pi-gsd`.
- Pi resources are declared under the `pi` manifest.

If package loading changes, update metadata and installation docs together.

## GSD Core compatibility

`pi-gsd` should consume GSD Core dynamically wherever possible.

Check the currently installed GSD Core package:

```bash
node - <<'NODE'
const fs = require('node:fs');
const pkg = JSON.parse(fs.readFileSync('node_modules/@opengsd/gsd-core/package.json', 'utf8'));
console.log(JSON.stringify({ version: pkg.version, bin: pkg.bin, exports: pkg.exports, type: pkg.type }, null, 2));
const dir = 'node_modules/@opengsd/gsd-core/commands/gsd';
console.log('commands dir exists:', fs.existsSync(dir));
if (fs.existsSync(dir)) {
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.md')).sort();
  console.log('command count:', files.length);
  console.log(files.join('\n'));
}
NODE
```

Check available upstream versions:

```bash
npm view @opengsd/gsd-core version dist-tags time --json
npm outdated @opengsd/gsd-core || true
```

When testing a newer GSD Core release, verify:

- the `gsd-tools` binary still exists and can be launched package-locally;
- the command markdown directory still exists;
- dynamic command discovery finds the expected command count and degrades to doctor-visible warnings if a file is unreadable;
- new commands are exposed without copying prompt files into `pi-gsd`;
- every expanded dynamic prompt preserves the Pi execution contract (`gsd({ action: "run" })` / `/gsd-run`), even when upstream prose mentions `gsd-tools`, `gsd_run`, a direct `node .../gsd-tools.cjs` command, or a runtime-home launch shim;
- removed or renamed commands do not leave stale fixed tests/docs;
- planning artifact semantics remain upstream-owned.

Do not adapt by copying upstream command prompts. If GSD Core moves its command directory or binary seam, update the discovery/dispatcher seam only.

### v1.15.0 Pi-integration ownership

GSD Core introduced its native Pi extension in v1.7 and continues to support Pi as a first-class installable runtime in v1.15.0. `pi-gsd` remains the authoritative Pi adapter rather than auto-loading that extension:

- `pi-gsd` owns its provider-agnostic model routing, dynamic `/gsd-*` prompt commands, `gsd` tool, context-mode guardrails, and pi-subagents guidance.
- The upstream plugin adds a separate `/gsd` command, `gsd_invoke` tool, lifecycle listeners, and its own model-steering policy. Loading both creates overlapping GSD surfaces and bypasses pi-gsd's routing policy.
- The packaged plugin source remains `pi/gsd.cjs`, while the installer writes `extensions/gsd.js`, the suffix Pi discovers. Coexistence detection must recognize `gsd.js` and the legacy `gsd.cjs` path.
- In v1.15.0 the upstream plugin stages its shared hook bundle under `gsd-hooks/` rather than Pi's reserved `hooks/` directory. pi-gsd never loads that plugin. Its separate opt-in `safety.upstreamGuards` bridge invokes only the package dependency's `gsd-write-guard.js` and `gsd-worktree-path-guard.js`; all other official lifecycle listeners remain outside pi-gsd.
- GSD Core labels `gsd-core/bin/lib/host-integration-sdk.cjs` as a public, protocol-versioned SDK surface. It still has no package `exports` map or complete in-process command-routing hub, and the upstream Pi plugin itself uses subprocess dispatch. Keep pi-gsd on the package-local binary seam unless a future exported API provides a clear advantage and passes live Pi validation.
- The v1.15.0 MCP resource/prompt catalog belongs to the separate upstream `gsd-mcp-server` surface. Do not auto-register it from pi-gsd; pi-gsd's current command/tool adapter continues to use package-local `gsd-tools`.

For this adapter, the verified v1.15.0 seams remain the package-local `gsd-tools` binary and flat `commands/gsd/*.md` directory. Dynamic discovery exposes the full set without copied prompts; compatibility tests assert representative required commands and tolerate additive upstream commands rather than freezing the count. Normalize explicit `~/.claude/gsd-core` references in upstream prompt bodies to the package-local core root, including the `@` and `$HOME` spellings. Because current prompts also contain `gsd_run`, direct Node invocations, and multi-runtime launch shims, the injected Pi execution contract must tell the agent to translate all of those forms to the `gsd` tool or `/gsd-run`.

## context-mode compatibility

context-mode is an optional Pi package. `pi-gsd` should detect it and add guardrails; it should not import it or depend on it.

Check:

- whether the Pi package is installed and loaded;
- whether active tool inventory includes `ctx_*` tools; when that inventory exists, do not treat stale package files as proof of availability;
- whether registered-but-inactive tools and standard package paths are reported as inactive rather than available or wholly absent;
- whether filesystem fallback paths still match Pi's package layout;
- whether new `ctx_*` tools should be allowed, warned, or blocked by the guard.

The guard should remain conservative:

- block accidental wholesale indexing of durable GSD planning records;
- warn when a user intent might be legitimate but risky;
- allow bulky/transient processing;
- allow explicit computed extraction;
- avoid becoming a general context-mode policy engine.

If context-mode adds a new tool that can index or persist project content, decide whether it belongs in the guarded tool set. If it only reads/searches/transforms transient output, it likely belongs in the always-allow set.

## pi-subagents compatibility

pi-subagents is an optional Pi package. `pi-gsd` should detect it and provide guidance; it should not call it internally.

Check:

- whether active tool inventory still exposes `subagent`; when that inventory exists, do not treat stale package files as proof of availability;
- whether a registered or installed but inactive `subagent` tool is reported with reload/restart guidance;
- whether filesystem fallback paths still match Pi's package layout;
- whether `subagent({ action: "list" })` still works;
- whether model delegation still accepts an optional top-level `model` default with a thinking suffix;
- whether `pass-model`, `omit-model`, and `resolve-first` guidance still maps cleanly to pi-subagents;
- whether acceptance/review contracts changed in a way that affects pi-gsd guidance.

The invariant is: `gsd` resolves model guidance, and the parent agent chooses whether to call pi-subagents directly. Do not make the `gsd` tool orchestrate subagents internally unless the project intentionally changes that design.

## Decision rules

Use these rules to avoid unnecessary churn.

### No code change

Choose no code change when:

- Pi APIs used by `pi-gsd` are still present;
- optional integrations are detected;
- tests and live smoke pass;
- differences are only newer package versions or additive upstream commands.

Document the evidence in the issue/PR/session summary.

### Dependency-only update

Choose a dependency-only update when:

- GSD Core has a compatible release with the same binary and command seams;
- local Pi peer/dev installs lag the current Pi runtime but no API changes are needed;
- type/package metadata updates do not require source edits.

Run the full verification matrix before committing lockfile changes.

### Adapter update

Change `pi-gsd` source when:

- a Pi API signature changed;
- package-local `gsd-tools` launch changed;
- command discovery cannot find upstream commands;
- optional integration detection no longer reflects loaded tools;
- guardrails miss a newly risky context-mode operation;
- model-routing output no longer matches pi-subagents' delegation contract.

Keep changes narrowly scoped to the adapter seam that moved.

### Upstream contribution

Prefer an upstream GSD Core change when:

- the behavior is GSD workflow semantics;
- artifact naming/lifecycle changed;
- a better machine-readable command/dispatcher seam is needed;
- the same fix would benefit non-Pi GSD runtimes.

## Verification matrix

Always run local verification:

```bash
npm run check
npm test
npm run build
```

For runtime-facing changes, also run live Pi verification:

```bash
npm run test:live-pi
npm run test:live-subagent  # opt-in; skips unless PI_GSD_RUN_LIVE_SUBAGENT=1
```

The credentialed probe additionally requires `PI_GSD_LIVE_MODEL`, `PI_GSD_LIVE_API_KEY_ENV`, and a non-empty credential in the named environment variable. It launches one child and must run only against trusted code. Weekly `.github/workflows/compatibility.yml` overlays latest Pi/GSD dependencies without changing the lockfile and exercises Linux, Windows, and macOS.

In a live Pi session after reload/restart, verify:

```text
/gsd-status
/gsd-doctor
/gsd-model agent gsd-planner
/gsd-run progress
```

If context-mode is installed, exercise one allowed and one guarded operation in tests rather than by intentionally indexing project planning records in a live session.

If pi-subagents is installed, confirm the parent-agent flow still starts with:

```json
{ "action": "list" }
```

Then confirm pi-gsd model routing returns a `pi-subagents consumer` action, inherited routes produce exact suffixed models, and `error`/`prompt` routes return `resolve-first`.

## Release checklist

Before merging a maintenance update:

- [ ] Runtime/package inventory captured.
- [ ] Change classified by surface.
- [ ] No boundary violations introduced.
- [ ] Pi package, lockfile, extension manifest, and changelog versions agree (`npm run release:check`).
- [ ] Optional integrations remain optional.
- [ ] GSD Core remains package-local.
- [ ] Tests pass.
- [ ] Live Pi smoke passes for runtime-facing changes; the credentialed child smoke passes before release when approved.
- [ ] `npm pack --dry-run --json` contains only allowlisted release files.
- [ ] README/docs updated if install, detection, commands, or guidance changed.
- [ ] Any residual risk is written down.

## Common failure modes

### Optional integration installed but not detected

First check whether it is installed as a Pi package and loaded by Pi. Files under `node_modules` are not enough. If active tool inventory contains the public tool, detection should prefer that over filesystem probes. If the package or registered tool exists but the public tool is inactive, status/doctor should report that distinction and recommend `/reload` or a Pi restart without enabling the integration prematurely.

### `gsd-tools` not found

Do not fall back to a system binary. Repair or bump the package-local GSD Core dependency. Falling back to a global binary can run a different GSD version and produce incompatible artifacts.

### Dynamic `/gsd-*` commands missing

Check whether GSD Core moved or renamed its command prompt directory. If the directory moved, update discovery. Do not copy the missing prompts into `pi-gsd`.

### Typecheck passes but live Pi fails

The repo may be compiling against an older local Pi package while the live harness is newer. Compare local dependency versions with the installed Pi CLI package, then refresh the local install or adjust the adapter to the live API.

### context-mode guard is too aggressive

Prefer warnings over blocks when user intent is plausible. Blocks should be reserved for high-risk accidental behavior.

### pi-subagents behavior changed

Update guidance and model-routing output if the delegation contract changed. Keep orchestration in the parent agent or pi-subagents, not inside the `gsd` tool.
