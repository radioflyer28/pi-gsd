# pi-gsd Usage Guide

This guide is for Pi users and maintainers who want to run GSD workflows from Pi without losing the boundary between Pi integration and upstream GSD Core behavior.

## Quick start

1. Install `pi-gsd` as a Pi package.
2. Restart Pi or run `/reload`.
3. Run `/gsd-status`.
4. If status looks healthy, use `/gsd-run <command>` for upstream GSD Core commands.

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

### `/gsd-status`

Shows the current adapter mode and key paths.

Use it when:

- starting work in a repository
- checking whether `.planning/` exists
- confirming whether `context-mode` or `pi-subagents` is loaded
- verifying that package-local `gsd-tools` is detected

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
- `gsd-tools` is not detected
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

## Agent tool usage

Agents can call the `gsd` tool directly with one of three actions.

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

`pi-gsd` registers a guard for context-mode tool calls.

| Tool call pattern | Behavior | Why |
| --- | --- | --- |
| `ctx_index` on the whole `.planning/` directory | Block unless explicitly requested | Prevents accidental caching of canonical GSD records as if they were durable context-mode memory. |
| Explicit user request to index `.planning/` | Warn and allow | User intent wins, but the state boundary is restated. |
| `ctx_index` on an individual `.planning` artifact | Warn and allow | Sometimes useful, but direct reads are usually clearer for small durable records. |
| `ctx_execute_file` on small source/planning files | Warn and allow | `read`/`edit` is usually better when exact code context or edits are likely. |
| `ctx_execute_file` on logs, reports, coverage, build output, or small data files | Allow | These are common context-mode use cases. |
| `ctx_search`, `ctx_execute`, batch/search/doc tools | Allow | These tools are already scoped to context-efficient processing. |

The guard is intentionally conservative. It blocks only the riskiest accidental pattern and uses warnings for cases where there may be legitimate reasons to continue.

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
