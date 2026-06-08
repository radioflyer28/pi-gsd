# pi-gsd

Pi extension wrapper around its own installed `@opengsd/gsd-core` dependency.

This package should stay thin: Pi-specific command/tool registration lives here, while GSD workflow behavior stays upstream in the `@opengsd/gsd-core` dependency installed with `pi-gsd`.

## Goals

- Call upstream GSD Core instead of forking it.
- Install the Pi runtime's own `@opengsd/gsd-core` copy as a package dependency rather than relying on a system-wide GSD install.
- Keep Pi-facing namespaced commands and tools under `gsd_*` / `/gsd-*`.
- Detect optional local accelerators:
  - `pi-subagents` for fresh-context or parallel work.
  - `context-mode` for selective context-efficient execution/search.
- Prefer Pi's active tool inventory when available, so `context-mode`/`pi-subagents` are reported when their public tools are actually loaded, with filesystem probes as a fallback.
- Degrade gracefully when optional accelerators are not installed.

## Initial Commands

- `/gsd-status` shows wrapper capability and GSD project record status.
- `/gsd-doctor` reports detected integration paths.
- `/gsd-run <args>` calls upstream `gsd-tools` through the adapter dispatcher.

## Initial Tool

- `gsd` executes a small set of wrapper actions:
  - `status`
  - `doctor`
  - `run`

`run` is currently a CLI seam. It calls the package-local `gsd-tools` binary from `pi-gsd`'s installed `@opengsd/gsd-core` dependency. It uses Pi's `pi.exec` when available and falls back to Node's child-process spawn for the package-local binary when `pi.exec` is unavailable.

Internally, all runtime calls go through a small `GsdDispatcher` boundary. The first dispatcher implementation calls package-local `gsd-tools`; if `gsd-core` later exposes a stable SDK dispatcher, `pi-gsd` should swap only that adapter layer and keep the Pi tool/command API stable.

## Installation

Install the optional Pi accelerators as Pi packages, then install `pi-gsd`:

```bash
pi install npm:context-mode
pi install npm:pi-subagents
pi install npm:pi-gsd
```

For local development:

```bash
pi install . -l
```

`context-mode` and `pi-subagents` are intentionally not `optionalDependencies` of `pi-gsd`. They are independent Pi extensions with their own tools, hooks, skills, prompts, and package manifests. Installing them as nested npm dependencies under `pi-gsd` would put files on disk, but it would not necessarily enable those extensions in Pi. `pi-gsd` detects them from Pi's installed package locations and degrades gracefully when either is absent.

## Development

```bash
npm install
npm run typecheck
npm test
```

## Design Notes

This wrapper intentionally does not copy GSD skills or reimplement phase logic. If `gsd-core` needs a better machine-readable dispatcher for Pi, that should be contributed upstream and consumed here.

GSD is not treated as a runtime-agnostic system install. Installing `pi-gsd` should install the GSD Core version used by the Pi runtime. Updating that dependency updates Pi's GSD behavior without forking upstream.

`context-mode` and `pi-subagents` are optional accelerators. `pi-gsd` detects and reports them, preferring active Pi tools such as `ctx_execute` and `subagent` over filesystem probes, then gives the model guidance to call `ctx_*` or `subagent` directly when useful. The `gsd` tool does not orchestrate subagents internally in v1.

`pi-gsd` also installs a small context-mode guard. It blocks accidental wholesale indexing of `.planning/`, warns when context-mode is used for small source/planning files where read/edit is usually clearer, allows small data files plus bulky/transient inputs like logs and reports without friction, and downgrades the `.planning/` block to a warning when the latest user request explicitly asks to index planning records.

## State Boundary

`.planning/` is the project-local GSD record-keeping directory. GSD project plans, decisions, phase artifacts, verification notes, handoffs, and other durable workflow records belong there so other GSD skills/runtimes can read and contribute to the same project context.

Do not put Pi-wrapper-specific material in `.planning/`. `pi-gsd` should write there only when it is producing normal GSD-compatible records that other GSD skills/runtimes can understand.

There is no default `pi-gsd` project-state directory. If the wrapper later needs project-local metadata that is fundamentally not a GSD record, reserve `.pi-gsd/` for that narrow adapter-private use and document the contents first. Do not use it for canonical GSD project records. Do not use `.gsd/`; that name belongs to other GSD-family tools and may collide with GSDv2 or upstream runtime state.

`context-mode` should only be used when it is beneficial for the immediate task: large logs, broad repo scans, web/docs retrieval, bulky generated output, or repeated local search during one investigation.

Do not treat context-mode as canonical GSD state. Durable GSD project records belong in `.planning/` only when they follow GSD-compatible artifact conventions. Wrapper-private metadata should use user/global Pi config or OS temp/cache locations unless there is a concrete reason it must be project-local.
