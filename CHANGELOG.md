# Changelog

All notable changes to this project are documented here.

## [Unreleased]

## [1.19.0-pi.3] - 2026-11-13

### Added

- Versioned structured `gsd` results with an output schema, explicit success/error state, execution evidence, model-routing decisions and cwd-scoped runtime registration. Display text and legacy details remain available.
- A dedicated leaf provider that exposes GSD operations without parent coordination guidance or nested runtime-role registration.
- Explicit, trusted child-provider bindings for multi-edit on the phase researcher, planner, pattern mapper and executor, and research web on the phase researcher. Parent installation alone does not opt children in; unavailable requested providers affect only dependent roles.
- Known-source pi-subagents compatibility diagnostics and an approval-gated repair guide with the reviewed 0.88.1 runtime-only lookup patch. Unknown source versions are not presumed broken. No repair, installation or activation occurs automatically.
- Reproducible no-model compatibility matrices and Unix process-cleanup acceptance checks with explicit SDK, owner and provider inputs.

### Changed

- Preserve stock child `read`/`edit`/`write` authoring and `codemode` by default. An explicit multi-edit binding supplies matched read/edit tools without a redundant separate write tool.
- Support verified builtin Windows `powershell` when no `pwsh` integration is registered. A valid approved `pwsh` provider retains precedence; hidden or broken integrations are not bypassed, and Windows does not fall back to Bash.
- Distinguish loaded provider provenance, activation availability, registration, role lookup and unverified child readiness in status/doctor output. Activation is not delegation authorization or managed-process readiness.
- Keep GSD Core pinned exactly to 1.19.0. Workflow semantics, canonical role bodies, routing policy and opt-in upstream guard ownership remain unchanged.

### Fixed

- Run package-local Core CLI children with subprocess-local Pi identity while preserving the CLI main-module entrypoint, parent environment, project/global defaults and Core's physical installation facts.
- Bound native output capture and recovery, separate process exit from inherited-pipe drainage, and make cancellation/timeout escalation report incomplete capture or unconfirmed termination truthfully. Recovery failures remain sticky rather than implying complete output.
- Avoid treating every source file beneath a temporary checkout as transient context: classify paths relative to the project root.

### Verification and limitations

- Windows acceptance: 244 tests, source/test typechecks, build, release metadata and package-content checks; 72 native-child cases across Pi 1.3.0/1.5.2, stock/enhanced tools and foreground/detached modes, including direct and codemode calls.
- Ubuntu WSL acceptance included native Linux process cleanup, host CLI identity, visible RPC reports and 18 equipped child cases; the subsequent profile/guidance follow-up passed 36 tests, and the release candidate's full suite passed 244 tests under native Ubuntu Node. Detailed checkpoints and source provenance are in the profile guide and design review.
- Native-child acceptance used the reviewed patched pi-subagents 0.88.1 source, not stock-owner end-to-end acceptance. Minimum-owner, credentialed model/web workflows, ambient deployment and existing-session reload remain unverified; macOS has not received the equivalent native-child acceptance matrix.
- Existing installations must select this adapter release before reload/restart can expose it. Changing the owner source requires the separately approved activation and full restart described in the repair guide. No installed settings or stopped project workflows are changed by this release.

## [1.19.0-pi.2] - 2026-11-02

### Fixed

- Publish slash-command text as visible session messages without starting a model turn. Pi ignores handler return values, which previously left doctor, status and other local command results invisible. Canonical workflow prompt dispatch remains unchanged.
- Require the live Pi smoke test to find the visible doctor diagnostic report, not merely a successful command acknowledgement. Add shared command-output regression coverage.
- Keep GSD Core pinned to exactly 1.19.0.

## [1.19.0-pi.1] - 2026-11-02

### Changed

- Align release versions with the exact GSD Core dependency: `1.19.0-pi.1` pins GSD Core `1.19.0`; adapter-only fixes increment `pi.N`. Release validation checks the declared, locked and installed Core versions.
- Remove repository-local automatic package loading to avoid conflicts with a user-wide pi-gsd installation.
- Raise the package-local GSD Core dependency baseline to exactly 1.19.0. Consume upstream workflow, role and guard updates through the existing CLI/resource seams; retain the Pi >=1.0.0 peer minimum and Node.js >=24 requirement.
- Keep upstream's newly package-installable Pi extension, native `gsd_dispatch` and lifecycle hook bridge separate from pi-gsd. The adapter continues to own its commands, model routing and optional pi-subagents runtime profiles; upstream guards remain opt-in.

### Added

- Reviewed native leaf profiles expanded from five to 33, preserving canonical role bodies and declaration-based file/shell grants (including block-list tool declarations). Nested debug coordination and browser-only DOM verification have explicit exclusions.
- Preserve the canonical GSD Core command/role/CLI wrapping boundary. Dedicated upstream Pi skill and debug/checkpoint adaptations remain deferred rather than adding another maintenance surface.
- Tested workflow/role/hook parity matrix and broader-hook failure-policy evaluation. No extra hooks are enabled and existing opt-in guard behavior is unchanged.
- Integration coverage for the complete bundled command inventory and Pi prompt contract, installed routing-catalog version and native-role coverage, and exact current upstream role bodies in runtime profiles.

## [0.3.1] - 2026-10-22

### Fixed

- Distinguish current-session subagent availability and resolved models from unverified child tool/provider readiness in status, doctor, model results, tool guidelines and expanded GSD commands. Require assignment-specific capability checks for planning, execution, verification, review and research children, or inline execution instead of a silent parent command relay; preserve generic worker restrictions and optional integrations.

### Added

- Operator-configured Unix/WSL and native Windows operational subagent templates plus a tool-minimized inspection-only template. They separate upstream role/model handoffs from runtime tool/provider policy, permit native codemode, and document per-capability child canaries, write-capable GSD actions, explicit coordinator boundaries and optional managed jobs. Deferred-tool discovery and inherited skills remain opt-in. The old executor-guide link forwards to the generalized setup guide. Core planner, executor, verifier, plan-checker and code-reviewer definitions now register through the optional pi-subagents runtime-agent event API, with current upstream instructions, explicit GSD/codemode/shell tools and child provider paths; registration failures are visible and partial registration rolls back. Local profile files remain untouched.

## [0.3.0] - 2026-10-16

### Changed

- Retain Pi coding-agent and pi-ai peers >=1.0.0; refresh the development lockfile to Pi 1.3.0. Pi remains host-provided rather than a bundled runtime dependency.
- Raise the bundled GSD Core dependency baseline to ^1.17.0; retain Node.js >=24.
- Align the opt-in upstream guard subprocess timeout with upstream's 120-second blocking budget, preserve cancellation/fail-open behavior, and expose bounded timeout/stderr diagnostics.
- Probe optional child-factory compatibility from an isolated source snapshot using repository peers, without changing the installed fork. Verify virtual registration/queue draining before model resolution rather than expecting the historical failure.
- Leave the optional, separately installed pi-subagents fork unchanged.
- Align all CI workflow runtimes with the declared Node.js 24 minimum.
- Read agent routing tiers from the installed GSD Core catalog instead of a copied role roster; report unavailable/invalid metadata without inventing a cheap tier.
- Block delegation on unreadable or malformed routing policies rather than silently reverting to defaults. Valid legacy policies retain their existing routing/fallback behavior.

### Added

- An audited implementation plan and reproducible, no-model-call compatibility spike for coordinator-selected task tiers, optional Pi virtual models and GSD-owned wave/worktree integration. Virtual children and parallel writing remain gated; no installed fork or upstream registry is patched.
- Research/design notes for a proposed reusable routing dependency; these do not enable virtual routing or add a package dependency.
- A strict opt-in version-2 physical routing policy foundation, with provider-qualified references, role-pin metadata, fail-closed physical-model eligibility, config content revisions and catalog provenance. Virtual-routing enablement remains gated.
- Task-scoped `resolve-model` tier requests with bounded caller labels, explicit tier allowlists, locked-role/operator-pin rejection, complete tier selection and immutable unique decisions. Resolution neither switches the parent nor launches children or writes policy.
- Bounded decision-aware advisory evidence with lifecycle/cwd scoping. Unique legacy direct-role attempts can be checked; task-scoped/scripted/generic-worker or differing-cwd launches report validation unavailable rather than guessing associations or clearing unrelated pending decisions.

## [0.2.0] - 2026-08-19

### Added

- Pi-native model-routing audits and an interactive `/gsd-model-config` tier wizard.
- Warn-only validation for GSD subagent launches that do not consume a freshly resolved child model contract.
- Optional upstream-owned write-shrink and GSD-worktree path guards behind `safety.upstreamGuards: "on"`.
- Package version/path provenance for Pi, GSD Core, pi-subagents, and context-mode diagnostics.
- Credential-gated live pi-subagents routing smoke coverage and scheduled latest-dependency compatibility CI across Linux, Windows, and macOS.
- Release validation, package allowlisting, repository metadata, and an MIT license file.

### Changed

- Updated the compatibility baseline to Pi 0.84.2 and GSD Core 1.10.0.
- Dynamic `/gsd-*` prompts now use Pi's native collapsible skill envelope.
- GSD child routing now snapshots inherited Pi models with explicit thinking suffixes for pi-subagents.
- `/gsd-doctor` now distinguishes Pi-session model actions, child-launch guidance, package provenance, and deliberate lifecycle-hook compatibility decisions.

### Fixed

- Installed-but-inactive optional integrations no longer enable delegation or context-mode behavior.
- Doctor output now gives reload/restart guidance for registered or installed inactive integrations.
- Error and prompt model fallbacks stop child delegation instead of implying that an omitted model is safe.
- Empty Pi available-model inventories are authoritative and no longer expose catalog-only models as launchable.
- GSD subagent thinking is no longer presented as a nonexistent standalone pi-subagents launch argument.

[0.2.0]: https://github.com/radioflyer28/pi-gsd/compare/8fed9cd...v0.2.0
