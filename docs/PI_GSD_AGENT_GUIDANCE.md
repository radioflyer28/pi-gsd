# pi-gsd Agent Guidance

This document preserves the former `pi-gsd` skill guidance as maintainer documentation. It is **not** registered as a Pi skill; runtime guidance should come from the pi-gsd extension tool metadata and prompt guidelines so it does not compete with upstream GSD Core skills.

## Runtime Behavior

Prefer upstream GSD Core behavior. Do not invent a parallel GSD workflow in chat.

When a GSD command is needed:

1. Use the `gsd` tool with `action: "status"` or `action: "doctor"` to inspect the wrapper and GSD project records.
2. Use `gsd` with `action: "run"` for thin dispatcher-backed calls to the package-local upstream `gsd-tools` installed with `pi-gsd`.
3. Before launching each distinct GSD subagent role, use `gsd` with `action: "resolve-model"` and the exact upstream `agent` name.
4. If `pi-subagents` is reported as available and the task is large, call `subagent({ action: "list" })` before selecting agents or chains. Consume the shared pi-gsd model-routing result: pass `subagent.model` exactly when present so its suffix applies and displays the routed thinking level; otherwise omit model only as instructed.
5. If `context-mode` is reported as available, use `ctx_execute`, `ctx_execute_file`, `ctx_search`, or indexing only when it materially reduces noisy context for the current GSD task.

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
- Do not treat `context-mode` or `pi-subagents` as nested npm dependencies of `pi-gsd`; they must be installed/enabled as Pi packages. Respect `.pi-gsd/config.json` integration masks when status reports an installed tool as disabled for pi-gsd.
- Do not make the `gsd` tool orchestrate pi-subagents internally in v1.
- Keep GSD Core `resolve_model_ids` omitted/inherited under Pi unless the user intentionally configured a non-Pi GSD runtime; Pi-native model routing belongs in `.pi-gsd/model-routing.json` and the `resolve-model` action.
- Do not run nested subagents unless the selected subagent is explicitly intended to orchestrate.
- Prefer concise summaries with file paths to durable artifacts.
