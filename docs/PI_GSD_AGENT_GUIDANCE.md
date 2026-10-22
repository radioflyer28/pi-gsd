# pi-gsd Agent Guidance

This document preserves the former `pi-gsd` skill guidance as maintainer documentation. It is **not** registered as a Pi skill; runtime guidance should come from the pi-gsd extension tool metadata and prompt guidelines so it does not compete with upstream GSD Core skills.

## Runtime Behavior

Prefer upstream GSD Core behavior. Do not invent a parallel GSD workflow in chat.

When a GSD command is needed:

1. Use the `gsd` tool with `action: "status"` or `action: "doctor"` to inspect the wrapper and GSD project records.
2. Use `gsd` with `action: "run"` for thin dispatcher-backed calls to the package-local upstream `gsd-tools` installed with `pi-gsd`.
3. Before launching each distinct GSD subagent role, use `gsd` with `action: "resolve-model"` and the exact upstream `agent` name.
4. If delegation is authorized and useful, inspect `subagent({ action: "list", options: { capabilities: true } })` before selecting any GSD child, including planning, execution, verification, review and research helpers. Parent integration detection and model resolution do not establish child readiness. Select tools by the assignment's operations: GSD operations require both allowlisted `gsd` and the loaded pi-gsd provider; file writes/tests need their appropriate tools. `gsd` has mutating actions and no read-only action restriction; inspection-only helpers should omit GSD, shell and write tools. Do not silently drop required upstream steps to fit a restricted profile. Managed jobs and coordination/nested delegation require separate policy/configuration. Listing is configuration evidence, not provider-registration proof. If requirements are missing or unknown, keep the assignment inline rather than relaying commands. Prefer the real automatically registered core role definitions (`gsd-planner`, `gsd-executor`, `gsd-verifier`, `gsd-plan-checker`, `gsd-code-reviewer`) when their operational capabilities are authorized; check status/doctor for registration failures instead of substituting a generic worker. See [subagent profile setup](SUBAGENT-PROFILES.md). Resolve the exact upstream role, not the runtime profile name, and obey the shared consumer action: pass the exact suffixed model for `pass-model`, omit it for `omit-model`, and do not delegate for `resolve-first`.
5. If `context-mode` is reported as available, use `ctx_execute`, `ctx_execute_file`, `ctx_search`, or indexing only when it materially reduces noisy context for the current GSD task.

## Boundaries

- Use `.planning/` as the project-local GSD record-keeping directory for plans, decisions, phase artifacts, verification notes, and handoffs.
- Do not put Pi-wrapper-specific material in `.planning/`; write there only when producing normal GSD-compatible records.
- Reserve `.pi-gsd/` for documented project-local adapter configuration and opt-in diagnostics that are fundamentally not GSD-compatible `.planning/` records.
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
