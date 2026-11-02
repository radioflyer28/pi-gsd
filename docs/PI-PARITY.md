# Pi integration parity — GSD Core 1.19.0

This decision-scoped matrix helps maintainers distinguish installed resources, configured capabilities, and verified behavior. It compares pi-gsd with GSD Core's built-in Pi package. Do not load both extensions. pi-gsd retains command/model-routing ownership; pi-subagents owns child execution.

## Coverage and evidence

| Surface | pi-gsd disposition | Evidence and limits |
| --- | --- | --- |
| 72 upstream commands | Discoverable; canonical wrapper | Read `commands/gsd` directly, substitute package-local paths and append the existing Pi execution contract. Do not consume generated Pi skills or the native Pi extension. Command discovery does not certify every workflow. |
| 183 workflow Markdown resources | Available, not independently certified | Package-local includes remain upstream-owned. Inventory tests detect changes; file presence and prompt expansion do not prove successful workflow execution. |
| 33 leaf roles | Native baseline profiles | Explicit reviewed roster, canonical upstream role bodies, optional pi-subagents owner, model resolved separately. Built-in workers and capability ceilings remain unchanged. |
| `gsd-debug-session-manager` | Not registered; adaptation deferred | Requires nested delegation, which baseline profiles do not grant. The canonical debug command remains discoverable; the full nested workflow is not certified. A debugger leaf profile is not a replacement session manager. |
| `gsd-dom-verifier` | Requires separately configured profile | Requires approved Chrome MCP families, explicitly not Playwright; baseline registration would falsely imply browser readiness. No automatic fallback. |
| Web/MCP/skills and interactive requirements | Conditional, not supplied | Role prompts list declared capabilities absent from the baseline. Check the assignment and approved profile before launch. Missing required evidence/tools must be escalated, not fabricated or silently skipped. MemPalace and other CLI services still require their own installation/configuration. |
| Child startup | Representative no-model probes | Probe planner/executor/verifier plus debugger/roadmapper/Nyquist auditor in foreground and separate-process factories. This is not a credentialed workflow run, optional-provider test or proof of all 33 roles end to end. |
| Model policy | Adapter-owned | Preserve provider-qualified models, thinking suffixes, pins and consumer actions. Re-resolve each continuation. Task-scoped launch correlation remains advisory, not proven. |
| CLI and codemode | Existing `gsd` interface | Multiple operations can share a codemode call; each CLI operation still starts a subprocess. No new dispatcher or persistent CLI engine. |

Counts above come from the installed 1.19.0 artifact; upstream's prose table still says 181 workflows, but the package contains 183 Markdown workflow files.

The executable roster and hook dispositions are in `src/extension/parity.ts`; canonical-resource and inventory tests are in `tests/pi-parity.test.ts`. Add a disposition when upstream adds a role or hook. Do not automatically grant new upstream capabilities.

### Role tool boundaries

Canonical `tools` declarations support both comma-separated and YAML block lists. This matters for Nyquist auditing and security auditing. Write/edit grants follow those declarations. Only roles declaring Bash receive the platform shell and `gsd` (a mutating tool); file-only roles get neither. The user profiler has only read, codemode and supervisor contact. Codemode grants no additional tools. Operational roles with shell or GSD access are not read-only sandboxes even if the role forbids implementation edits.

Windows shell roles explicitly load the trusted parent `pwsh` provider; Unix roles use native bash. No ambient extensions, inherited skills catalog or nested delegation are enabled. Registration is all-or-nothing under the owner's existing collision rules. `/gsd-status` and `/gsd-doctor` show excluded roles and distinguish registration from child health.

### Thin-wrapper boundary and deferred debugging/checkpoints

pi-gsd wraps GSD Core itself, as it did before upstream shipped a Pi package. Upstream's native Pi skills, dispatcher, checkpoint-loop adaptations and extension internals are comparison material, not implementation dependencies. Do not copy their loops or maintain text-rewrite rules against their templates.

The canonical debug command remains exposed, and approved bounded debugging assignments can use the new debugger leaf profile. The nested session manager is deliberately excluded. Full debug/checkpoint workflow parity is deferred; do not imply that discoverability or a leaf role closes that gap. Stop when a required workflow step needs unavailable coordination capabilities rather than inventing a replacement loop.

## Hook evaluation and disposition

**Decision: do not import or enable the entire upstream Pi extension/hook bridge.** Evaluation is complete; broader hook implementation is deferred. The existing `safety.upstreamGuards` setting remains opt-in, off by default, and retains its existing behavior. This change does not enable additional guards, alter user settings, or remove separately installed `gsd-hooks.ts`.

| Hooks | pi-gsd disposition / reason |
| --- | --- |
| `gsd-write-guard.js`, `gsd-worktree-path-guard.js` | Existing opt-in bridge for matching write/edit events. |
| `gsd-prompt-guard.js`, `gsd-workflow-guard.js` | Deferred: current Pi multi-file/anchor edits and PowerShell require correct input mapping before guard coverage can be claimed. |
| `gsd-read-guard.js`, `gsd-read-injection-scanner.js` | Deferred: need bounded, sanitized advisory delivery, tool-result mapping and session cleanup. |
| `gsd-secret-read-guard.js` | Deferred: requires deliberate fail-closed timeout/output policy and coverage for file/search/shell tools. Existing fail-open runner is not a compatible implementation. |
| `gsd-session-state.sh`, `gsd-validate-commit.sh`, `gsd-phase-boundary.sh`, `gsd-graphify-update.sh` | Deferred: shell availability, lifecycle, upstream feature gates and Windows behavior need explicit support. |
| `gsd-context-monitor.js` | Deferred: distinguish pre-compaction behavior from Claude-statusline-dependent metrics; do not claim equivalent context monitoring. |
| `gsd-ensure-canonical-path.js` | Not needed: package-local references avoid creating runtime-home links. |
| `gsd-path-export.js` | Not needed: CLI access belongs to the existing `gsd` tool. |
| `gsd-check-update.js` | Not used: package updates remain operator-managed. |
| `gsd-statusline.js`, `gsd-update-banner.js` | Unsupported Claude statusline interface. |
| `gsd-agent-isolation-guard.js` | Unsupported Claude Agent isolation argument; owner policy remains authoritative. |
| `gsd-config-reload.js` | No corresponding file-change bridge. |
| `gsd-check-update-worker.js`, `gsd-node-runner.sh` | Internal helpers, not independent event integrations. |
| Six `gsd-cursor-*` and two `gsd-windsurf-*` scripts | Other runtimes, not applicable. |

### Why the broader bridge is not a drop-in

Upstream's `pi/gsd.cjs` exports its bridge under `_internals`, not a stable public adapter API. Its runners use `spawnSync`, blocking the extension host. It maps `bash`/`powershell`, not our `pwsh`, and expects edit fields `oldText`/`newText` under a top-level path, not current multi-file anchor edits. Importing internal helpers would add a version-sensitive dependency without solving those mappings. Loading the whole extension would also add competing commands, dispatch and model steering.

Failure policies differ materially:

- Upstream interprets exit 2 or JSON `decision: block` as a block; it delivers sanitized/capped additional-context advisories. Secret-read timeout and output-buffer overflow refuse the call. Other hook timeouts become advisories; missing scripts, spawn failures and malformed results generally allow the call.
- Our existing runner accepts explicit JSON block decisions, uses a 120-second bound and 64 KiB stdout cap, and fails open on timeout, overflow, cancellation or adapter failure with bounded diagnostics. It does not implement upstream's general exit-code/advisory protocol. Its current write/edit mapping is narrower than modern multi-file edits.
- Upstream starts dispatched children with no extensions, so its bridge does not run inside them. Our shell-capable children load pi-gsd and can run our existing opt-in guards, subject to configuration and event-shape limits. Neither is an OS sandbox.

A future hook change should add an asynchronous bounded runner, tested modern edit and PowerShell mappings, explicit per-hook failure policies, advisory lifecycle cleanup, opt-in gates, and no double execution with external hooks. Do not silently broaden the existing setting's semantics.

## Sources and validation

Primary sources at upstream tag v1.19.0:

- [Pi extension and bridge](https://github.com/open-gsd/gsd-core/blob/v1.19.0/pi/gsd.cjs)
- [Pi parity matrix and limited live-run evidence](https://github.com/open-gsd/gsd-core/blob/v1.19.0/docs/reference/pi-parity-matrix.md)
- [Hook contracts and limitations](https://github.com/open-gsd/gsd-core/blob/v1.19.0/docs/reference/pi-hook-parity.md)
- [Dispatch design](https://github.com/open-gsd/gsd-core/blob/v1.19.0/docs/adr/5559-pi-agent-role-dispatch.md)

Run `npm run check`, `npm test`, `npm run build`, `npm run release:check`, and `npm run test:live-pi`. The optional `npm run test:child-tools -- <trusted-owner-checkout> <trusted-pwsh-provider>` probes real no-model child startup. These checks do not replace authorized model-backed workflow evaluation. Releases use the exact Core baseline plus an adapter revision (for example `1.19.0-pi.1`); see the maintenance guide.
