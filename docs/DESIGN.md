# pi-gsd Design

`pi-gsd` is an adapter between Pi and upstream GSD Core. It owns Pi integration, capability discovery, command/tool registration, and guardrails. It does not own GSD workflow semantics.

## Reader model

This document is for maintainers changing `pi-gsd`. After reading it, a maintainer should know where new behavior belongs, which boundaries must not be crossed, and how optional Pi integrations should be detected and guided.

## Boundary with upstream GSD Core

GSD behavior belongs upstream in `@opengsd/gsd-core`:

- command behavior
- phase loop semantics
- project artifact semantics
- artifact naming
- cross-runtime compatibility

For Pi, `pi-gsd` depends on upstream `@opengsd/gsd-core` and uses that package-local copy. It intentionally does not assume a runtime-agnostic or system-wide GSD install.

If GSD Core needs a better programmatic dispatcher, that seam should be added upstream. `pi-gsd` should then replace only its adapter layer while keeping the Pi-facing tool and command surface stable.

## Pi-facing surface

`pi-gsd` exposes one tool and five fixed integration commands plus dynamic upstream GSD Core commands.

Tool:

- `gsd`

Commands:

- `/gsd-status`
- `/gsd-doctor`
- `/gsd-run <args>`
- `/gsd-model [agent|skill|command] <target>`
- `/gsd-init-config`

The tool supports five actions:

- `status(cwd)`
- `doctor(cwd)`
- `run(args, cwd, signal)`
- `resolve-model(agent|skill|command|target, cwd)`
- `init-config(cwd, force?)`

The command names are intentionally namespaced. Avoid adding broad names like `/status`, `/doctor`, or `/run`.

## Dispatcher boundary

All GSD execution goes through a small dispatcher abstraction with these operations:

- `status`
- `doctor`
- `run`
- `resolveModel`
- `initConfig`

The current dispatcher uses package-local `gsd-tools` as the execution seam. It prefers Pi's `pi.exec` when available and falls back to Node child-process spawning for the package-local binary when `pi.exec` is unavailable.

The dispatcher must not fall back to a system-wide `gsd-tools` binary. A system-wide binary may be a different GSD version from the package-local dependency and could produce incompatible behavior or artifacts.

## Capability model

The wrapper reports four modes:

| Mode | Meaning |
| --- | --- |
| `inline` | No optional accelerators detected. |
| `ctx-inline` | `context-mode` detected. |
| `delegated` | `pi-subagents` detected. |
| `delegated-ctx` | Both optional accelerators detected. |

Detection prefers active Pi tool inventory when available. Public tools such as `ctx_execute` and `subagent` are stronger signals than files on disk because they prove the other Pi package is actually loaded.

Filesystem probes remain as a fallback for runtimes that do not expose active tool inventory.

Project-local `.pi-gsd/config.json` can mask optional integrations after detection:

```json
{
  "integrations": {
    "subagents": "auto",
    "contextMode": "auto"
  }
}
```

`"off"` means pi-gsd reports and guides as if that integration is unavailable, even when the tool is installed or active. The underlying Pi package remains available globally; this is a pi-gsd integration mask only.

## Optional integrations

`context-mode` and `pi-subagents` are optional Pi runtime capabilities, not nested npm dependencies of `pi-gsd`.

They should be installed through Pi's package manager:

```bash
pi install npm:context-mode
pi install npm:pi-subagents
```

This matters because both packages provide Pi resources, not just importable JavaScript. Their extensions, tools, hooks, skills, prompts, and commands need to be discovered and enabled by Pi.

### context-mode

Use context-mode only where it materially improves a GSD workflow by reducing noisy context:

- large logs or test output
- broad repository scans
- web or API documentation retrieval
- generated reports that need search/filtering
- repeated local search during one investigation

Do not use context-mode as durable project memory. `.planning/` is the project-local GSD record-keeping directory and the canonical place for GSD-compatible plans, decisions, phase artifacts, verification notes, and handoffs.

### Context-mode guard

Prompt guidance is not enough for the most common mistakes, so `pi-gsd` registers a `tool_call` guard for context-mode tools.

The guard:

- blocks accidental wholesale `ctx_index` calls against `.planning/`
- warns, but allows, wholesale `.planning/` indexing when the latest user request explicitly asks for it
- warns for individual `.planning` artifact indexing
- warns for small source/planning `ctx_execute_file` usage where `read` or `edit` is usually clearer
- allows small data files, logs, reports, build output, coverage output, and explicit computed extraction tasks without friction

The guard should stay conservative. It should block only high-risk accidental behavior and prefer warnings when legitimate user intent is plausible.

### pi-subagents

Use `pi-subagents` for fresh-context and parallel work. The parent agent should call `subagent({ action: "list" })` before selecting agents or chains.

`pi-gsd` does not call `subagent` internally. Large GSD planning, execution, review, and verification can use `pi-subagents` directly from the parent model when status or doctor output reports it as available.

In combined mode, the preferred pattern is:

1. The parent GSD flow uses subagents for delegation.
2. Child agents use context-mode tools when they need context-efficient processing.
3. Nested subagents are avoided unless the selected subagent is explicitly intended to orchestrate.

## State boundaries

`.planning/` is the canonical GSD project record directory.

Do not put Pi-wrapper-specific material in `.planning/`. Other GSD skills and runtimes should not need to understand `pi-gsd` internals.

Do not create `.gsd/` for `pi-gsd` state. That name can collide with other GSD-family tools.

`pi-gsd` may use `.pi-gsd/` for wrapper-private project metadata. `.pi-gsd/config.json` stores pi-gsd integration settings, and `.pi-gsd/model-routing.json` maps GSD agents/skills/commands to Pi-native model IDs, thinking levels, and fallback policy. These files are intentionally not GSD Core artifacts and should not be stored in `.planning/`.

Model routing supports an opt-in `prompt` fallback. Prompt answers are remembered in memory per target for the current Pi extension session only; they are not written to `.planning/` or `.pi-gsd/` unless the user edits config explicitly.

## V1 decisions

- Use package-local `gsd-tools` behind the dispatcher boundary.
- Use `pi.exec` when available and Node child-process spawning as a fallback.
- Publish `@opengsd/gsd-core` as a regular dependency of `pi-gsd`.
- Keep `context-mode` and `pi-subagents` as separately installed Pi packages.
- Support project-local `auto`/`off` integration masks in `.pi-gsd/config.json` without disabling those Pi packages globally.
- Do not ship packaged `gsd.planner`, `gsd.executor`, or `gsd.reviewer` agents in v1.
- Keep context-mode usage selective and guardrail-driven rather than adding a broad aggressiveness configuration.
- Keep GSD Core `resolve_model_ids` omitted/inherited under Pi by default; Pi-native model resolution belongs to `pi-gsd` because Pi can run arbitrary providers and custom model IDs.

## Adding new behavior

Before adding behavior, classify it:

| Behavior | Belongs in |
| --- | --- |
| Pi tool/command registration | `pi-gsd` |
| Pi-specific detection or guardrails | `pi-gsd` |
| GSD workflow semantics | upstream GSD Core |
| Phase artifact naming or lifecycle | upstream GSD Core |
| Fresh-context or parallel execution | `pi-subagents`, called by the parent agent |
| Bulky context processing | `context-mode`, called directly when useful |

When in doubt, keep `pi-gsd` thin and move reusable GSD semantics upstream.

## Verification expectations

Every change should pass:

```bash
npm run typecheck
npm run build
npm test
```

Changes that affect Pi runtime behavior should also be checked with `/gsd-status` after `/reload` in a live Pi session.
