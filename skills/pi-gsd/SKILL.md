---
name: pi-gsd
description: Use when running GSD workflows from Pi, inspecting GSD project records, planning or executing phases, verifying work, or shipping through the GSD Core wrapper.
---

# pi-gsd

Use this skill when the user asks Pi to run GSD workflows, inspect GSD project records, plan phases, execute GSD tasks, verify work, or ship through GSD.

## Runtime Behavior

Prefer upstream GSD Core behavior. Do not invent a parallel GSD workflow in chat.

When a GSD command is needed:

1. Use the `gsd` tool with `action: "status"` or `action: "doctor"` to inspect the wrapper and GSD project records.
2. Use `gsd` with `action: "run"` for thin dispatcher-backed calls to the package-local upstream `gsd-tools` installed with `pi-gsd`.
3. If `pi-subagents` is available and the task is large, call `subagent({ action: "list" })` before selecting agents or chains, then use `subagent` directly for fresh-context planning, execution, or review.
4. If `context-mode` is available, use `ctx_execute`, `ctx_execute_file`, `ctx_search`, or indexing only when it materially reduces noisy context for the current GSD task.

## Boundaries

- Use `.planning/` as the project-local GSD record-keeping directory for plans, decisions, phase artifacts, verification notes, and handoffs.
- Do not put Pi-wrapper-specific material in `.planning/`; write there only when producing normal GSD-compatible records.
- Do not create a Pi-wrapper project-state directory by default. Reserve `.pi-gsd/` only for future project-local adapter metadata that is concrete, documented, and fundamentally not a GSD-compatible `.planning/` record.
- Do not create or assume `.gsd/`; that can conflict with other GSD-family tools.
- Treat `.planning/` as the canonical GSD project record. Context-mode caches are supporting context, not durable GSD memory.
- Do not index or cache GSD artifacts just because they exist. Read them directly when they are small and relevant.
- Use context-mode for bulky/transient material: large logs, broad scans, web/docs retrieval, generated reports, and repeated search/filtering.
- Do not copy or rewrite GSD Core command semantics.
- Do not rely on a system-wide GSD install; Pi uses the `@opengsd/gsd-core` dependency installed with `pi-gsd`.
- Do not treat `context-mode` or `pi-subagents` as nested npm dependencies of `pi-gsd`; they must be installed/enabled as Pi packages.
- Do not make the `gsd` tool orchestrate pi-subagents internally in v1.
- Do not run nested subagents unless the selected subagent is explicitly intended to orchestrate.
- Prefer concise summaries with file paths to durable artifacts.
