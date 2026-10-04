# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Changed

- Require Pi coding-agent and pi-ai peers >=1.0.0; refresh the development lockfile to Pi 1.0.1, including its brace-expansion security fix. Pi remains host-provided rather than a bundled runtime dependency.
- Confirmed bundled GSD Core 1.15.0 is still the latest stable npm release; retain the ^1.15.0 dependency and Node.js >=24 requirement.
- Leave the optional, separately installed pi-subagents fork unchanged.

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
