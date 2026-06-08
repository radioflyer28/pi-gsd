# pi-gsd Design

## Boundary

`pi-gsd` is an adapter. It owns Pi integration and capability discovery, not GSD workflow semantics.

GSD is installed per agent runtime. For Pi, `pi-gsd` depends on upstream `@opengsd/gsd-core` and uses that package-local copy. It does not assume a runtime-agnostic or system-wide GSD install.

Upstream `@opengsd/gsd-core` owns:

- command behavior
- phase loop semantics
- upstream state and artifact semantics
- artifact naming
- cross-runtime compatibility

## Dispatcher Boundary

All GSD execution goes through an internal `GsdDispatcher` with three operations:

- `status(cwd)`
- `doctor(cwd)`
- `run(args, cwd, signal)`

The v1 dispatcher calls package-local `gsd-tools` through `pi.exec()`. This is intentionally the only place that knows about the CLI seam. If upstream `gsd-core` later exposes a supported programmatic dispatcher, replace this adapter and keep the Pi-facing tool and command API unchanged.

## Capability Model

The wrapper reports four modes:

- `inline`: no optional accelerators detected
- `ctx-inline`: `context-mode` detected
- `delegated`: `pi-subagents` detected
- `delegated-ctx`: both detected

The extension cannot safely assume it can call another extension's LLM tool directly from inside its own tool handler. Instead it exposes capability status and installs skill guidance so the parent model can choose `subagent` or `ctx_*` tools when they are present.

## Optional Integrations

`context-mode` and `pi-subagents` are optional Pi runtime capabilities, not npm `optionalDependencies` of `pi-gsd`.

They should be installed through Pi's package manager:

```bash
pi install npm:context-mode
pi install npm:pi-subagents
```

This matters because both packages provide Pi resources, not just importable libraries. Their extensions, tools, hooks, skills, prompts, and commands need to be discovered and enabled by Pi itself. A nested install under `pi-gsd/node_modules` would not be a reliable signal that those resources are active in the running Pi session.

`pi-gsd` therefore treats them as externally installed optional capabilities: detect them, report the mode, and guide the parent model to call their public tools directly when present. When Pi exposes active tool inventory, `pi-gsd` treats public tools such as `ctx_execute` and `subagent` as the strongest signal that those integrations are usable; filesystem probes are fallback signals for runtimes that do not expose tool inventory.

### pi-subagents

Use for fresh-context and parallel work. The parent agent should call `subagent({ action: "list" })` before selecting agents or chains.

`pi-gsd` does not call `subagent` internally in v1. Large GSD planning, execution, review, and parallel verification can use pi-subagents directly from the parent model when the status/doctor output reports it as available.

### context-mode

Use only where it materially improves a GSD workflow by reducing noisy context:

- large logs or test output
- broad repo scans
- web/docs retrieval
- generated reports that need search/filtering before summarizing
- repeated local search during one investigation

In combined mode, the preferred pattern is: the parent GSD flow uses `subagent`, and child agents use `ctx_*` tools when context-mode is loaded. Do not run nested subagents unless the selected subagent is explicitly meant to orchestrate.

Do not use context-mode as durable project memory. `.planning/` is the project-local GSD record-keeping directory and the canonical place for GSD-compatible plans, decisions, phase artifacts, verification notes, and handoffs. Do not place Pi-wrapper-specific material in `.planning/`; other GSD skills/runtimes should not need to understand pi-gsd internals. The wrapper should not create a project-local private directory by default. If project-local Pi adapter metadata later becomes necessary and is fundamentally not compatible with `.planning/`, reserve `.pi-gsd/` for that narrow documented use. Upstream GSD Core artifacts should stay under whatever public layout upstream owns. Context-mode caches and indexes can support the current investigation, but should not become the source of truth.

To make that boundary more than prompt guidance, the extension registers a `tool_call` guard for context-mode tools. The guard blocks accidental wholesale `ctx_index` calls against `.planning/`, warns for individual planning artifacts and small source/planning `ctx_execute_file` usage where read/edit is usually clearer, allows small data files and logs/reports/transient outputs without friction, and does not block when the latest user request explicitly asks to index `.planning/`.

## V1 Decisions

- Start with the package-local `gsd-tools` CLI seam behind `GsdDispatcher`.
- Use `pi.exec` when available, but fall back to Node child-process spawning for the package-local `gsd-tools` binary so `/gsd-run` still works in Pi modes that do not expose `pi.exec`.
- Publish `@opengsd/gsd-core` as a regular dependency of `pi-gsd`; consuming upstream as a dependency avoids forking while matching GSD's per-runtime install model.
- Do not list `context-mode` or `pi-subagents` as `optionalDependencies`; document them as recommended optional Pi packages installed with `pi install`.
- Do not ship packaged `gsd.planner`, `gsd.executor`, or `gsd.reviewer` agents in v1.
- Do not add a context-mode aggressiveness config in v1; keep usage selective and guidance-driven.
