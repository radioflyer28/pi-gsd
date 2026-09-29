# pi-gsd

`pi-gsd` is a thin [Pi](https://github.com/earendil-works/pi-coding-agent) package that exposes upstream `@opengsd/gsd-core` workflows inside Pi.

It does **not** reimplement GSD. It registers a small Pi tool, slash commands, and guardrails that help Pi use GSD safely while keeping workflow behavior in upstream GSD Core. The current compatibility baseline is Pi 0.87.1, GSD Core 1.15.0, and pi-subagents 0.51.0. GSD Core 1.15 requires Node.js 24 or newer.

## Why?
- I want to use GSD inside Pi.
- I want to be able to use OpenRouter with GSD and Pi.
- I don't want to use GSDv2:
  - GSDv2 breaks the `.planning/` directory schemas used by GSDv1, thus abandoning all interoperability between devs using GSDv1 with the agent runtime of their choice.
  - While it is still Pi, it is modified to the extent it's effectively a new agent runtime entirely, thus drifting too far from Pi and making it harder to modify and co-exist with other extensions.

## What it provides
- **Upstream GSD Core slash-command interface** exposed dynamically from the bundled `@opengsd/gsd-core/commands/gsd/*.md`; use `/gsd-plan-phase 1`, `/gsd-execute-phase 1`, etc. without duplicating command content inside pi-gsd.
- **`gsd` tool** for Pi agents:
  - `status` — inspect wrapper capabilities and local GSD project state.
  - `doctor` — show diagnostics and integration guidance.
  - `run` — dispatch to package-local upstream `gsd-tools`.
  - `resolve-model` — resolve Pi-native model/thinking guidance for GSD agents, skills, or commands.
  - `init-config` — create `.pi-gsd/config.json` and `.pi-gsd/model-routing.json` with defaults.
- **Slash commands**:
  - Dynamic upstream GSD Core commands as `/gsd-<command>`, sourced at runtime from `@opengsd/gsd-core` (for example `/gsd-plan-phase 1`).
  - pi-gsd integration commands:
    - `/gsd-status`
    - `/gsd-doctor`
    - `/gsd-run <args>`
    - `/gsd-model [agent|skill|command] <target>` — switch the current Pi session only.
    - `/gsd-model-config <heavy|standard|light>` — interactively persist a provider-neutral tier route.
    - `/gsd-init-config`
- **Agent guidance embedded in extension tool metadata** so pi-gsd presents as an extension/package, not as a competing GSD skill.
- **Optional integration awareness** for:
  - `context-mode` — context-efficient processing for bulky logs, broad scans, generated reports, and repeated search/filtering.
  - `pi-subagents` — fresh-context or parallel planning, execution, and review.
- **Context-mode guardrails** that prevent the most common detrimental uses while leaving legitimate computed processing available.

## Design principles

1. **Stay thin.** Pi-specific registration belongs here; GSD workflow semantics stay in `@opengsd/gsd-core`.
2. **Use package-local GSD Core.** `pi-gsd` installs and uses its own `@opengsd/gsd-core` dependency instead of relying on a system-wide GSD install.
3. **Keep durable GSD state in `.planning/`.** Context-mode indexes are search/cache support, not canonical project memory.
4. **Detect optional accelerators, do not vendor them.** `context-mode` and `pi-subagents` must be installed as Pi packages so their own tools, hooks, skills, and prompts are active.
5. **Prefer real runtime signals.** When Pi exposes active tool inventory, `pi-gsd` trusts tools like `ctx_execute` and `subagent` over filesystem probes.

## Installation

### Local development install

From this repository:

```bash
npm install
pi install . -l
```

The `-l` flag writes the package to project-local Pi settings. Restart Pi or run `/reload` after changing extension code.

### Optional accelerators

Install these separately as Pi packages when you want the additional behavior:

```bash
pi install npm:context-mode
pi install npm:pi-subagents
```

They are intentionally not dependencies of `pi-gsd`. A nested npm install would place files on disk but would not guarantee that Pi loaded their public tools and hooks.

### Git or npm install

This repository is currently configured as a private package. If you install it from GitHub, use Pi's git package source for the repository/ref you want. If it is later published to npm, it can be installed with Pi's npm package source.

## Usage

### Check the wrapper

```text
/gsd-status
```

or ask the agent to call:

```json
{ "action": "status" }
```

Typical output reports:

- current working directory
- whether `.planning/` is present
- detected mode: `inline`, `ctx-inline`, `delegated`, or `delegated-ctx`
- package-local `gsd-tools` path
- whether `context-mode` and `pi-subagents` are available

### Diagnose setup

```text
/gsd-doctor
```

Use this when commands are unavailable, optional integrations are not detected, or you need to confirm the state boundary rules.

### Resolve GSD model routing

Pi is provider/runtime agnostic, so `pi-gsd` keeps GSD Core model IDs omitted/inherited by default and resolves Pi-native model guidance itself.

```json
{ "action": "resolve-model", "agent": "gsd-planner" }
```

Optional project-local routing lives in `.pi-gsd/model-routing.json`. If no route is configured, `pi-gsd` inherits the current Pi model and applies tier-based thinking defaults. For pi-subagents, the consumer block snapshots that inherited model and appends the thinking suffix (for example, `openai-codex/gpt-5.6-sol:medium`) because pi-subagents cannot apply or display a per-run thinking level separately from a model override.

Use `/gsd-model agent gsd-planner` to explicitly switch the current Pi session model/thinking level when the route resolves to an available configured model. It does not persist configuration or arm child routing. Use `/gsd-model-config heavy`, `standard`, or `light` to select an available provider-qualified model, thinking level, and fallback policy and save it to `.pi-gsd/model-routing.json`. Set `fallback: "prompt"` to require a user choice before delegation when a configured model is unavailable; chosen `/gsd-model` fallbacks are remembered per target for the current extension session.

### Run upstream GSD Core

```text
/gsd-run progress
/gsd-run phase list
/gsd-run roadmap --json
```

The `run` action dispatches to the package-local `gsd-tools` binary. It uses Pi's `pi.exec` when available and falls back to Node child-process spawning for the package-local binary when `pi.exec` is unavailable. Dynamic `/gsd-*` prompts include the same execution contract: translate every upstream `gsd-tools`, `gsd_run`, or direct `node .../gsd-tools.cjs` operation into `gsd({ action: "run", args: [...] })` or `/gsd-run`, never execute an upstream runtime-home/global launch shim directly.

Quoted arguments are supported:

```text
/gsd-run phase add "User login"
```

## Optional integration behavior

Run `/gsd-init-config` or `gsd({ action: "init-config" })` to create `.pi-gsd/config.json` and `.pi-gsd/model-routing.json` with the defaults shown below. Existing files are left unchanged unless the tool call passes `force: true`.

By default, `pi-gsd` auto-detects `context-mode` and `pi-subagents` when their tools are loaded or their Pi packages are installed. Project-local `.pi-gsd/config.json` can mask those integrations for GSD guidance and status without uninstalling them globally:

```json
{
  "integrations": {
    "subagents": "auto",
    "contextMode": "auto"
  },
  "diagnostics": {
    "sessionLog": "off"
  },
  "safety": {
    "upstreamGuards": "off"
  }
}
```

Set either value to `"off"` to make `pi-gsd` treat that integration as unavailable. For example, `"subagents": "off"` keeps GSD workflows single-agent even if the `subagent` tool exists; `"contextMode": "off"` also makes pi-gsd's context-mode guard inert for that project. When Pi exposes an active-tool inventory, `pi-gsd` treats that runtime signal as authoritative for availability. Registered-but-inactive tools and package files on disk are reported diagnostically, but they do not enable delegation or context-mode guidance until the public tool is active.

### Private diagnostics

Set `diagnostics.sessionLog` to `"on"` to record a capped, argument-free command outcome log at `.pi-gsd/diagnostics.jsonl`. It is opt-in, best-effort support data—not GSD workflow state—and `/gsd-status` reports whether it is enabled. Keep it off for projects that do not need local troubleshooting history.

Set `safety.upstreamGuards` to `"on"` to opt into two package-local, upstream-owned hard guards: catastrophic whole-file shrink protection for curated `.planning/` artifacts and cross-root writes from GSD-managed worktrees. pi-gsd maps only verified block results; missing scripts, timeouts, crashes, malformed output, and adapter errors fail open. Other official lifecycle bridges remain disabled because they are Claude-specific, inert under Pi, or lack a semantics-preserving Pi event mapping.

### context-mode

When `context-mode` is loaded, `pi-gsd` guides agents to use `ctx_*` tools only when they materially reduce noisy context, such as:

- large logs or test output
- broad repository scans
- web or API documentation retrieval
- generated reports that need search/filtering
- repeated local search during one investigation

`pi-gsd` also registers a lightweight context-mode guard:

- Blocks accidental wholesale indexing of `.planning/`.
- Warns, but does not block, if the latest user request explicitly asks to index `.planning/`.
- Warns for individual `.planning` artifact indexing.
- Warns for small source/planning files where `read` or `edit` is usually clearer.
- Allows small data files, logs, reports, build output, coverage output, and explicit computed extraction tasks without friction.

This guard is meant to prevent accidental misuse, not to stop deliberate user-directed workflows.

### pi-subagents

When `pi-subagents` is loaded, `pi-gsd` reports it and instructs agents to call `subagent({ action: "list" })` before selecting agents or chains.

The `gsd` tool does not call subagents internally. Large planning, execution, review, and verification work should use `pi-subagents` directly from the parent agent when appropriate.

Before delegating each distinct GSD subagent role, agents should call `gsd({ action: "resolve-model", agent: "<exact-gsd-agent-name>" })` and obey the returned pi-subagents consumer action. `pass-model` means pass its exact suffixed `model`; `omit-model` means omit it; `resolve-first` means do not delegate until the route is corrected or the requested user choice is made. Default routes still use the current parent model. A warn-only `tool_call` validator checks the next GSD child launch against freshly resolved guidance without mutating or blocking pi-subagents.

### Upstream Pi plugin coexistence

GSD Core v1.15.0 ships an installable native Pi plugin from `pi/gsd.cjs`; its installer writes the active extension as `~/.pi/agent/extensions/gsd.js` (older installs may leave `gsd.cjs`). `pi-gsd` intentionally does not load it: the upstream plugin exposes a separate `/gsd` command, `gsd_invoke` tool, lifecycle listeners, and independent model-routing behavior. Use either integration, not both; `pi-gsd` remains the provider-agnostic adapter with dynamic `/gsd-*` commands and Pi-native model routing. `/gsd-doctor` warns when it sees an active `/gsd` or `gsd_invoke` surface, or either current or legacy upstream plugin file.

## State boundary

`.planning/` is the canonical project-local GSD record directory. Plans, decisions, phase artifacts, verification notes, and handoffs belong there when they follow GSD-compatible artifact conventions.

Do not use context-mode as durable GSD memory. Context-mode caches and indexes are useful for the current investigation, but they are not the source of truth.

Do not create or assume `.gsd/`; that name can collide with other GSD-family tools. Wrapper-private Pi adapter metadata belongs in `.pi-gsd/`, including optional `.pi-gsd/config.json` integration settings and `.pi-gsd/model-routing.json` routes.

## Development

```bash
npm install
npm run check       # typecheck source and tests
npm run build       # emit JS/declarations to dist/ for release validation
npm test
npm run test:live-pi       # no LLM API key required
npm run test:live-subagent # skipped unless explicitly enabled; uses one parent/child model probe
npm run release:check
```

The test suite uses Node's built-in test runner with TypeScript stripping. `build` validates emitted artifacts even though Pi package metadata loads `src/extension/index.ts` directly during local development. `test:live-pi` starts the package-local Pi runtime in isolated RPC mode and verifies representative `/gsd-*` commands.

The credential-bearing routing probe is deliberately opt-in and cost-bounded to one child. Set `PI_GSD_RUN_LIVE_SUBAGENT=1`, `PI_GSD_LIVE_MODEL=provider/model`, and `PI_GSD_LIVE_API_KEY_ENV` to the name of a non-empty credential environment variable before running `npm run test:live-subagent`. For a trusted local run only, `PI_GSD_LIVE_USE_EXISTING_AUTH=1` may use Pi's existing credential store instead. The probe verifies that the exact suffixed consumer model reaches pi-subagents status. Never run it on untrusted pull-request code.

## Troubleshooting

### `context-mode` or `pi-subagents` is not detected

1. Confirm the package is installed through Pi, not nested under `pi-gsd` only.
2. Restart Pi or run `/reload`.
3. Run `/gsd-status` again.
4. Run `/gsd-doctor` for detailed integration guidance.

### `/gsd-run` cannot find `gsd-tools`

Run `npm install` in this package and verify that `@opengsd/gsd-core` is installed. `pi-gsd` intentionally refuses to fall back to a system-wide `gsd-tools` binary because that could run a different GSD version than the Pi package expects.

### New code is not reflected in Pi

Run `/reload` after editing extension code, or restart Pi. Local package installs point at the source tree, but Pi still needs to reload resources and extension modules.

## More documentation

- [Design notes](docs/DESIGN.md)
- [Usage guide](docs/USAGE.md)
- [Maintenance and compatibility playbook](docs/MAINTENANCE.md)
- [Upstream Pi-integration proposals](docs/UPSTREAM-PROPOSALS.md)
