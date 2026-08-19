# pi-gsd Usage Guide

This guide is for Pi users and maintainers who want to run GSD workflows from Pi without losing the boundary between Pi integration and upstream GSD Core behavior.

## Quick start

1. Install `pi-gsd` as a Pi package.
2. Restart Pi or run `/reload`.
3. Run `/gsd-status`.
4. If status looks healthy, use upstream GSD Core slash commands like `/gsd-plan-phase 1`, or `/gsd-run <command>` for low-level `gsd-tools` calls.

For local development:

```bash
npm install
pi install . -l
```

For optional accelerators:

```bash
pi install npm:context-mode
pi install npm:pi-subagents
```

Install optional accelerators separately because they provide their own Pi tools, hooks, skills, prompts, and commands.

## Commands

### `/gsd-<core-command> ...`

pi-gsd exposes upstream GSD Core commands dynamically as Pi slash commands without copying them into pi-gsd.

Examples:

```text
/gsd-plan-phase 1
/gsd-execute-phase 1
/gsd-verify-work
```

The command list is loaded from the package-local `@opengsd/gsd-core/commands/gsd/*.md` files. The Pi command name is the GSD Core command name with `gsd:` converted to `gsd-`, so `gsd:plan-phase` becomes `/gsd-plan-phase`.

When invoked, pi-gsd sends the upstream command prompt to the current Pi agent turn with the provided arguments substituted. Every expanded prompt instructs the agent to translate upstream `gsd-tools`, `gsd_run`, direct `node .../gsd-tools.cjs`, and runtime-home launch-shim operations to `gsd({ action: "run", args: [...] })` or `/gsd-run`. pi-gsd does not maintain its own fork of GSD skills or workflow text.

### `/gsd-status`

Shows the current adapter mode and key paths.

Use it when:

- starting work in a repository
- checking whether `.planning/` exists
- confirming whether `context-mode` or `pi-subagents` is loaded
- verifying that package-local `gsd-tools` is detected
- checking command-discovery warnings, integration provenance, upstream-plugin coexistence, or opt-in diagnostic-log status

Modes:

| Mode | Meaning |
| --- | --- |
| `inline` | No optional accelerators detected. |
| `ctx-inline` | `context-mode` detected. |
| `delegated` | `pi-subagents` detected. |
| `delegated-ctx` | Both `context-mode` and `pi-subagents` detected. |

### `/gsd-doctor`

Shows setup diagnostics and integration guidance.

Use it when:

- an optional integration is missing
- `gsd-tools` is not detected or cannot launch
- an upstream `/gsd` / `gsd_invoke` surface may overlap with pi-gsd
- the agent seems to be using the wrong state directory
- you want a reminder of the adapter boundaries

### `/gsd-run <args>`

Runs upstream `gsd-tools` through the adapter.

Examples:

```text
/gsd-run progress
/gsd-run phase list
/gsd-run roadmap --json
/gsd-run phase add "User login"
```

Arguments are parsed with shell-like quoting so spaces inside quoted values are preserved.

### `/gsd-model [agent|skill|command] <target>`

Resolves the Pi-native model/thinking route for a GSD target and explicitly applies it to the current Pi session when an explicit configured model is available.

Examples:

```text
/gsd-model agent gsd-planner
/gsd-model skill gsd-plan-phase
/gsd-model command gsd:execute-phase
```

If the route inherits or omits the model, the current Pi model is left unchanged. Thinking level is applied when the route resolves to a concrete Pi thinking level; pi-gsd reports Pi's effective level after model-capability clamping. A cancelled or unavailable prompt fallback leaves both model and thinking unchanged.

### `/gsd-init-config`

Creates `.pi-gsd/config.json` and `.pi-gsd/model-routing.json` with pi-gsd defaults. Existing files are left unchanged.

Use this when you want an editable, project-local starting point for integration masks, model routing, or opt-in private diagnostics (`diagnostics.sessionLog: "on"`).

## Agent tool usage

Agents can call the `gsd` tool directly with one of five actions.

### Status

```json
{ "action": "status" }
```

### Doctor

```json
{ "action": "doctor" }
```

### Run

```json
{ "action": "run", "args": ["progress"] }
```

The `cwd` parameter can be provided when the command should run against a different project directory.

### Resolve model routing

```json
{ "action": "resolve-model", "agent": "gsd-planner" }
```

Other accepted selectors are `skill`, `command`, or a generic `target`.

The result includes a Pi-native resolved model, thinking level, warnings, and a `subagent` block. When `subagent.model` is present, pass it exactly to the `subagent` tool. Its model suffix carries the routed thinking level so pi-subagents both applies and displays it. When absent, omit `model`; if thinking must still be pinned, configure pi-subagents `defaultThinking` or an agent override.

### Init config

```json
{ "action": "init-config" }
```

By default, this creates missing files but does not overwrite existing project config. To reset both files to defaults:

```json
{ "action": "init-config", "force": true }
```

## Optional integration config

`pi-gsd` auto-detects `context-mode` and `pi-subagents` by default. To make this project ignore either integration for GSD status and guidance, add `.pi-gsd/config.json`:

```json
{
  "integrations": {
    "subagents": "auto",
    "contextMode": "auto"
  }
}
```

Supported values are `"auto"` and `"off"`. `"off"` does not uninstall or hide the underlying Pi tool globally; it only makes pi-gsd treat that integration as unavailable for this project. If `contextMode` is `"off"`, pi-gsd's context-mode guard allows context-mode tool calls without adding pi-gsd warnings or blocks.

## How context-mode should be used

Use context-mode when it avoids loading noisy or bulky raw content into the model context.

Good fits:

- summarizing or filtering large logs
- scanning broad test output
- searching generated reports
- processing coverage output
- fetching and indexing external documentation
- repeated search over the same bulky material during one investigation

Poor fits:

- reading a small source file before editing it
- indexing `.planning/` just because it exists
- treating cached search results as canonical GSD project state
- replacing durable planning artifacts with context-mode memory

When a small file must be edited or understood exactly, use Pi's normal `read` and `edit` tools. When the user asks for computed extraction such as counting, parsing, filtering, or summarizing without loading raw content, `ctx_execute_file` remains appropriate even for small files.

## Context-mode guard behavior

`pi-gsd` registers a guard for context-mode tool calls unless this project's `.pi-gsd/config.json` sets `integrations.contextMode` to `"off"`.

| Tool call pattern | Behavior | Why |
| --- | --- | --- |
| `ctx_index` on the whole `.planning/` directory | Block unless explicitly requested | Prevents accidental caching of canonical GSD records as if they were durable context-mode memory. |
| Explicit user request to index `.planning/` | Warn and allow | User intent wins, but the state boundary is restated. |
| `ctx_index` on an individual `.planning` artifact | Warn and allow | Sometimes useful, but direct reads are usually clearer for small durable records. |
| `ctx_execute_file` on small source/planning files | Warn and allow | `read`/`edit` is usually better when exact code context or edits are likely. |
| `ctx_execute_file` on logs, reports, coverage, build output, or small data files | Allow | These are common context-mode use cases. |
| `ctx_search`, `ctx_execute`, batch/search/doc tools | Allow | These tools are already scoped to context-efficient processing. |

The guard is intentionally conservative. It blocks only the riskiest accidental pattern and uses warnings for cases where there may be legitimate reasons to continue.

## Model routing

GSD Core has its own static model catalog, but Pi is provider/runtime agnostic. For Pi workflows, keep GSD Core model IDs omitted/inherited unless you intentionally configure a non-Pi GSD runtime.

`pi-gsd` reads optional project-local routing from:

```text
.pi-gsd/model-routing.json
```

Minimal example:

```json
{
  "fallback": "inherit",
  "default": { "model": "inherit", "thinking": "inherit" },
  "tiers": {
    "heavy": { "model": "openai/gpt-5.5", "thinking": "xhigh" },
    "standard": { "model": "openai/gpt-5.3-codex", "thinking": "high" },
    "light": { "model": "openai/gpt-5.4-mini", "thinking": "medium" }
  },
  "agents": {
    "gsd-planner": { "tier": "heavy" },
    "gsd-phase-researcher": { "tier": "standard" },
    "gsd-plan-checker": { "tier": "light" }
  },
  "skills": {
    "gsd-plan-phase": { "tier": "heavy" }
  }
}
```

Fallback policies:

| Policy | Behavior |
| --- | --- |
| `inherit` | Use the current Pi session model. Default. |
| `omit` | Return no model so the downstream runtime inherits/defaults. |
| `error` | Surface an error instead of silently falling back. |
| `prompt` | Ask the user to choose an available Pi model when `/gsd-model` is used. |

If a configured model is not available in Pi, `inherit` keeps the current Pi model and emits a warning. `prompt` is opt-in; when the user chooses a fallback model, `pi-gsd` remembers that answer for the target agent/skill/command for the current Pi extension session and subsequent `resolve-model` calls use the remembered model.

## How pi-subagents should be used

Use `pi-subagents` for work that benefits from fresh context or parallelism:

- broad planning
- independent implementation slices
- code review
- security review
- verification sweeps

Before selecting agents or chains, ask Pi to list available subagents:

```json
{ "action": "list" }
```

`pi-gsd` does not call subagents internally. The parent agent should decide when delegation is useful.

Before delegating GSD-specific work, resolve routing through the shared resolver:

```json
{ "action": "resolve-model", "agent": "gsd-planner" }
```

Then consume the returned `subagent` block. Pass `subagent.model` exactly when present; otherwise omit `model` as instructed. Resolve each distinct upstream GSD agent role rather than routing only the enclosing skill. Default pi-gsd routes snapshot the parent model with a tier-specific thinking suffix; configure explicit tier or agent models in `.pi-gsd/model-routing.json` when children should use different models.

## State and artifact rules

- Durable GSD records belong in `.planning/` when they follow GSD-compatible conventions.
- Wrapper-private metadata should not be written into `.planning/`.
- Do not create `.gsd/` for `pi-gsd` state.
- Do not treat context-mode caches as project memory.
- Do not rely on a system-wide GSD install for Pi workflows.

## Verification checklist

Before considering a local change ready:

```bash
npm run typecheck
npm run build
npm test
```

Then run:

```text
/gsd-status
```

If extension code changed, run `/reload` first so Pi loads the new implementation.
