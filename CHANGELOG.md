# Changelog

All notable changes to this project are documented here.

## [Unreleased]

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
