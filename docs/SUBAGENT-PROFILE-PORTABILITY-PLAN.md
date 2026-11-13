# Portable GSD subagent profiles: WSL findings and implementation plan

**Status: implementation proposed; documentation updated 2026-11-13.** The original investigation installed no profiles and launched no children. Subsequent upgrade verification installed pi-subagents 0.88.1 and created isolated no-model child sessions; it did not equip research/edit profiles or run credential-bearing assignments. This document separates that evidence from the remaining implementation and acceptance work.

**Reader:** a pi-gsd maintainer. **Post-read action:** implement and verify portable role-specific child capabilities without copying machine-specific profiles, weakening tool boundaries, or replacing upstream GSD workflows.

## 1. Findings and the two separate problems

Windows pi-gsd already registers native GSD leaf roles. Missing physical Markdown profiles are **not**, by themselves, evidence that registration failed. Two different issues need separate fixes:

1. **Runtime inspection inconsistency:** pi-subagents 0.84.0 included runtime agents in `list` but omitted them in `get`. The same omission remains in the inspected 0.88.1 release source. This explains the observed “listed, but not found” result; upgrading alone does not repair it.
2. **Additional provider capabilities:** the Ubuntu project has custom profiles supplying web access, multi-edit, and managed processes beyond pi-gsd's baseline. Those capabilities must be configured and validated in the child; runtime registration alone does not supply them.

The first problem belongs to pi-subagents. The second belongs to pi-gsd's capability adaptation and operator configuration. Copying files to Windows does not repair the first problem and can create name collisions.

### Original investigation baseline (historical)

| Component | Observed state |
| --- | --- |
| Windows source checkout | `C:/Users/akriz/code/pi-gsd`, branch `main`, initially clean |
| Windows loaded pi-gsd | Separate checkout under `~/.pi/agent/git/github.com/radioflyer28/pi-gsd` |
| Both Windows checkouts | Commit `489e929`, pi-gsd `1.19.0-pi.2`, Core dependency `1.19.0` |
| Installed Windows pi-subagents | `0.84.0` |
| Ubuntu installed pi-gsd | Commit `c7f76fe`, release `1.19.0-pi.1` |
| Ubuntu custom profiles | Four untracked files in `/home/akriz/code/echodyne-parser/.pi/agents/` |
| Ubuntu global Pi profiles | `/home/akriz/.pi/agent/agents/` absent at inspection |
| Ubuntu Claude profiles | Present under `/home/akriz/.claude/agents/`; these are upstream role instructions, not equipped Pi profiles |

The requested `~/code/pi-gsd` checkout exists on Windows. No `/home/akriz/code/pi-gsd` checkout was found in Ubuntu; its installed extension checkout is the relevant source there.

The live Windows capability listing showed `gsd-phase-researcher`, but `get` returned `Agent 'gsd-phase-researcher' not found`. A separate **no-model, process-local fixture** reproduced the same behavior using the installed owner's registry and management functions:

```text
REPRODUCED: runtime fixture is listed, but get reports not found
Agent 'profile-lookup-probe' not found. Available: none.
No model turns or profile-file writes were performed.
```

The fixture used an empty configured catalog, one registered runtime agent, and the same runtime owner for both calls; its registration was disposed afterward. An initial fixture attempt was rejected because its fake ExtensionAPI lacked required methods; adding inert `on` and `registerTool` methods allowed the reproduction. This establishes the inspection defect, **not** launch/provider health.

### Upgrade evidence — 2026-11-13

| Area | Verified evidence and limits |
| --- | --- |
| Windows owner installation | Upgraded from 0.84.0 to pinned `npm:pi-subagents@0.88.1`; unrelated Pi settings unchanged. Installation is not proof an already-open session has reloaded. |
| Release-age policy | Exception applied only to the install process; saved npm minimum remains seven days. Not a recommendation to disable the policy for routine upgrades. |
| Adapter baseline | pi-gsd 1.19.0-pi.2, exact GSD Core 1.19.0; no adapter runtime changes needed for the exercised paths. |
| Repository checks | Typechecks and 185 tests passed during upgrade verification. These are historical results, not acceptance of proposed capability bindings. |
| Native startup probe | 12 no-model cases passed against the 0.88.1 release source snapshot: planner, executor, verifier, debugger, roadmapper and Nyquist auditor, each in foreground-session and detached-process modes. |
| Probe environment | Native Windows, repository Pi peers at 1.3.0, trusted PowerShell provider, isolated state and empty in-memory credentials. The installed CLI was 1.5.2, but that is not the SDK used by this source-snapshot probe. |
| What the probe proved | Public event registration and disposal, selected child tool registries, direct/codemode GSD and shell calls, and policy narrowing. |
| What remains unverified | Corrected runtime-only `get`, researcher web access, selected read/edit schema, credentialed workflow, and the same matrix on the actual loaded host and Unix/WSL. |

The **target compatibility range is 0.86.0 and later**, not an established guarantee for every version in that range. The 0.86.0 minimum-version matrix remains pending. Record each tested owner version/revision, host SDK, platform and launch mode; do not infer coverage from a version comparison. pi-subagents remains an optional integration, not a new hard dependency of pi-gsd.

The lookup omission was also found in the earlier 0.78.0-child-profiles.1 baseline. Evidence supports a longstanding inspection gap exposed by runtime roles, not a newly established breaking change. Prior registration/startup tests did not cover runtime-only `get`. Later owner fixes for reload/compaction tool activation and MCP startup do not add missing web tools to pi-gsd's explicit allowlists.

### Why `get` disagrees with `list`

In the inspected 0.84.0 installation and 0.88.1 release source, the agent-management module has this mismatch:

- `handleList` calls `effectiveAgentsForScope` with `ctx.runtimeAgentOwner` and the preferred model provider.
- `handleGet` calls `findAgentsInDiscovery(params.agent, discovered, scope)` without that owner/provider.
- `findAgentsInDiscovery` only merges runtime agents when the owner is supplied.
- The not-found diagnostic also calls `availableAgentNamesFromDiscovery(discovered)` without the owner.

The read-only `models` path already supplies the owner. The supported fix should make `get` use the same effective selection semantics and preserve policy/trust filtering. Do not make mutating management actions able to rewrite runtime registrations merely to fix inspection.

**Correction to the earlier diagnosis:** “get failed” does not prove the native role is unavailable for launch. In the blocked geopack session, readiness remained unverified and no launch was attempted. Retain that distinction in troubleshooting guidance.

## 2. The Ubuntu profiles worth adapting

Source directory:

```text
\\wsl.localhost\Ubuntu\home\akriz\code\echodyne-parser\.pi\agents
```

| File | Upstream role | Extra capability / adaptation |
| --- | --- | --- |
| `gsd-phase-researcher-web.md` | `gsd-phase-researcher` | pi-gsd plus pi-web-access; explicit web tool allowlist |
| `gsd-planner-edit.md` | `gsd-planner` | pi-gsd plus pi-multiedit; upstream Write/Edit performed with multi-file `edit` |
| `gsd-pattern-mapper-edit.md` | `gsd-pattern-mapper` | Same edit provider, with writes limited by assignment to PATTERNS.md |
| `gsd-phase35-1-executor-managed.md` | `gsd-executor` | pi-gsd, pi-multiedit, POSIX pi-processes, and a project-owned process-lifetime extension |

All four use fresh context, replace-mode prompts, project-context inheritance, no global-context/skills inheritance, a writer acceptance role, and no nested subagents. Their bodies direct the child to read the **current package-local upstream role**, route GSD commands through the `gsd` tool, verify actual tools/providers, and preserve assignment ownership. These are useful contracts to retain.

They are historical project-local adaptations, not a tested cross-platform distribution. Their existence and old run artifacts do not certify current Windows launch readiness.

### Do not copy these parts verbatim

- Absolute `/home/akriz/...` provider and role paths.
- `bash` into a native Windows allowlist; use trusted `pwsh` instead.
- POSIX `process` into Windows. Windows managed jobs use `pwsh` plus `pwsh_job` and a separate lifetime check.
- The Phase 35.1 name, RED/GREEN evidence policy, or `echodyne-parser/.pi/runtime/process-lifetime.mjs` as generic extension defaults.
- A broad web capability set into every role, or shell/GSD grants into file-only roles.
- Fixed models, copied upstream role bodies, credentials, package settings, or session logs.

The researcher profile loads web access but does not explicitly load pi-multiedit. Do not infer that its `edit` name has the Windows parent's anchor/multi-file schema. Inspect the actual child tool and bind an edit provider when that schema is required.

## 3. Safe manual Windows adaptation (optional workaround)

This section is a procedure for a later approved change, not a record that copying occurred.

1. Inventory the current runtime registrations and project/user definitions. Run `list` with `capabilities: true`; inspect returned capability details as well as the text. Record tool names, providers, exclusions, source, and ceiling restrictions. Do not treat the known `get` defect as proof that a runtime name cannot launch.
2. Copy the selected WSL files to a **non-discovered staging directory** for review. Do not copy `.claude/agents` as Pi profiles. The Windows project target, after approval, is `<project>/.pi/agents/`; the user-wide alternative is `~/.pi/agent/agents/`.
3. Keep the suffixed custom names, or choose other distinct names. Do **not** add canonical names such as `gsd-planner` while pi-gsd registers them at runtime. Installed owner collision logic rejects configured names or aliases colliding with runtime names; pi-gsd rolls back a failed registration batch. Ordinary project-over-user precedence does not make a runtime collision safe.
4. Replace every provider/role path with the reviewed Windows path. Resolve provider entrypoints from installed manifests or registered `sourceInfo.path`, not by replacing `/home/akriz` text mechanically. Verify each file exists. Never copy secrets.
5. Preserve empty `extensions` to disable ambient discovery; use explicit `subagentOnlyExtensions` for required providers. For edit-equipped profiles, map both Write and Edit responsibilities to the supported `edit` tool and verify absent-file creation. Remove a redundant `write` grant if all authorized writing uses `edit`.
6. On Windows replace `bash` with `pwsh` and include its trusted provider. Add web tools/provider only to a profile that needs them. Do not install the managed executor until its job/lifetime policy has been separately designed and approved for Windows.
7. Reload Pi after activating reviewed files. Inspect the effective profile and execute a disposable capability canary before substantive work. Resolve the **upstream** role's model immediately before each assignment and pass its exact consumer model when required.

For example, a custom `gsd-planner-edit` profile remains bound to upstream `gsd-planner` instructions and its freshly resolved model; the custom runtime name is not a new GSD role or routing tier. Using such a variant must be allowed by the active execution contract. If that contract insists on canonical native names, repair/equip the canonical registration instead; do not silently substitute.

### Windows provider paths observed during this investigation

These are evidence/examples, not portable defaults:

| Capability | Installed entrypoint |
| --- | --- |
| GSD | `C:/Users/akriz/.pi/agent/git/github.com/radioflyer28/pi-gsd/src/extension/index.ts` |
| PowerShell | `C:/Users/akriz/.pi/agent/git/github.com/radioflyer28/pi-pwsh-notify-secure/src/index.ts` |
| Multi-edit | `C:/Users/akriz/.pi/agent/git/github.com/radioflyer28/pi-multiedit/index.ts` |
| Web | WSL profile names `dist/index.js`; the inspected Windows pi-web-access manifest declares `./dist`. Resolve the installed concrete entrypoint rather than assuming identical packaging. |

Native Pi `codemode` needs an allowlist grant and compatible host, not a guessed provider path. `tool_search` is separate; fixed-toolset profiles need not include it. A provider registering a tool does not override the profile allowlist, and an allowlisted tool name does not load its provider.

## 4. Recommended pi-gsd update

**Extend the existing runtime builder; do not ship four hardcoded copies.** The current adapter already reads canonical roles from its exact Core dependency and registers 33 reviewed leaf roles through the owner's event contract. Reuse that machinery and preserve upstream ownership of workflows.

### A. Track A — owner inspection repair (pi-subagents)

Make `get` pass the runtime owner and preferred provider to both selection and not-found diagnostics. Add a regression around an agent that exists only through runtime registration. Test scope, policy/trust behavior and names/aliases with the same semantics as `list` and `models`.

**Owner repair checkpoint:** the geopack session reproduced the defect on both 0.84.0 and installed 0.88.1, then prepared the two-line fix and regression coverage at `C:/Users/akriz/code/pi-subagents-0.88.1` on base revision `83cf25f86b6a70ab917a7e198d0153bc32309f29`. Ninety-two focused tests, TypeScript checking, the package build and the original runtime-only reproduction passed on that candidate. The personal package entry selects this local source instead of npm; after reload, live `get gsd-phase-researcher` succeeded. This does not certify child providers or credentials. The earlier 0.84.0 broad unit run encountered Windows fixture failures; no full-suite or workflow success is claimed. The repair is uncommitted, not a released minimum-version guarantee.

Do not patch installed `node_modules`, import private management internals from pi-gsd, or add fallback discovery rules in pi-gsd to mask this defect. Record the first verified owner version once released; do not invent a minimum version based solely on the presence of the registration event.

Until that fix is available, document the known inspection limitation separately from registration and launch errors. If required capability details cannot be inspected, stop the assignment; do not weaken the capability check just to continue.

### B. Track B — portable capability bindings (pi-gsd)

Develop this track independently of the owner's inspection repair. First define the opt-in configuration schema and trust behavior, then implement read/edit binding and research-provider binding in small separately verified increments. Development need not wait for Track A, but final workflow acceptance requires both tracks. Preserve canonical roles; no duplicated prompts or alternative orchestration engine.

#### Represent capability recipes, not copied prompts

Use reviewed role identity plus a small capability recipe:

| Recipe | Intended use | Provider behavior |
| --- | --- | --- |
| Existing canonical leaf role | Default upstream assignment | Keep current platform shell/GSD boundary; bind required authoring provider where configured |
| Edit-equipped planning/mapping | Planning artifacts with atomic/anchored editing | Load reviewed edit provider and translate Write/Edit instructions explicitly |
| Web-equipped research | Research requiring current external sources | Opt-in web allowlist plus explicit web provider; report unavailable separately |
| Managed executor | Assignments whose policy requires managed jobs | Separate optional platform-specific recipe; not default execution behavior |

Prefer equipping canonical roles for the common contract rather than adding parallel workflow roles. If distinct variants are necessary, register them with noncolliding names and explicit upstream-role provenance, using the same builder. Enable them only by operator configuration. Do not register excluded nested/debug-manager or browser-verifier roles through these recipes.

Keep these defaults: `extensions: []`, fresh context, no nested dispatch, no pinned model, no inherited global context or skills catalog. Retain project context as currently configured. Operational `gsd`/shell grants are write-capable even for a checker; an acceptance label is not a sandbox.

### C. Resolve providers explicitly and portably

The current builder's Windows PowerShell binding is the model to extend: inspect registered tool source metadata, require an existing trusted entrypoint, and canonicalize it. Add handling for providers whose registration wrappers do not expose usable metadata through a narrowly scoped, explicitly approved configuration path. Validate configuration against the actual installed provider, not just filesystem existence.

The local source adapter now implements the narrow opt-in `childProviders.multiEdit` and `childProviders.researchWeb` bindings documented in [SUBAGENT-PROFILES.md](SUBAGENT-PROFILES.md#opt-in-planning-provider-bindings). Each entry must match the actual registered, nonhidden parent tool provider; project trust must be positively granted. Multi-edit is limited to phase researcher/planner/pattern mapper, and web to phase researcher. The local continuation adds per-role optional-provider failure isolation: affected roles are omitted, unrelated roles remain registered, and doctor reports `partial` with reasons and equipped-role tool/provider provenance. Malformed configuration, untrusted opt-in bindings and registration collisions remain fail-closed. This is not the full recipe framework proposed here: other role variants and managed execution remain proposals. Never load arbitrary project code merely because a path exists.

Important requirements:

- Load pi-gsd only for roles that need GSD operations; do not broaden file-only roles.
- Bind custom read/edit providers as a compatible pair when anchor formats require it. Do not assume the child's builtin `edit` matches the parent's multi-edit schema.
- If upstream Write is implemented using `edit`, include concrete whole-file creation/replacement guidance and test it. Do not merely change the allowlist while leaving contradictory prompt instructions.
- Supply all required web tools, including source inspection/checking, in both the allowlist and provider registry. Missing credentials/network access are later operational failures, not successful readiness.
- Never inherit all ambient parent extensions to solve one missing tool.
- Preserve owner ceilings, exclusions, trust, and cancellation rules. Missing required providers fail before substantive work; optional variants may be unavailable without disabling unrelated canonical roles. Keep the base registration batch's rollback behavior.
- Keep provider credentials in existing secure stores; diagnostics must not print credential values or full settings/session payloads.

### D. Make diagnostics actionable

Status/doctor should distinguish:

1. owner/event support and profile registration;
2. selected role/variant, current upstream source, declared tools, and resolved provider provenance;
3. inspection limitations or collisions;
4. actual child startup/tool-canary evidence, including mode and timestamp when available;
5. model-resolution guidance, separately from all capability evidence.

Do not persist a universal “ready” bit after one canary. Foreground/background sessions, provider hooks, reloads, trust and policy can change the effective registry. Keep readiness assignment- and mode-specific. Do not auto-launch credential-bearing children in doctor.

### E. Deferred — managed execution is its own optional seam

Do not generalize the WSL executor by renaming its project process-lifetime extension. A portable implementation must separately prove:

- Unix/WSL `process` provider and skill integration when requested;
- Windows `pwsh` background execution plus `pwsh_job` management;
- owning child remains alive across an initial turn ending, receives completion, retrieves output, and verifies exit status;
- cancellation/shutdown cleans up jobs; Windows notifications remain metadata-only.

If a project requires managed validation and these properties cannot be demonstrated, stop. Use bounded foreground validation only when its policy permits it. Never substitute another CLI or a parent command-running relay.

### F. Deferred — packaging alternative, if physical profiles are required

pi-subagents supports package-provided agent directories via `pi-subagents.agents` or `pi.subagents.agents` manifest metadata. That is preferable to silently writing files into a user's home directory, but is **not** the first choice here:

- The current pi-gsd package has no packaged-agent directory declaration.
- Static Linux/Windows frontmatter cannot select the correct shell/providers dynamically.
- Relative provider paths are resolved from the agent definition file, not the user's cwd.
- Package definitions must not collide with runtime registrations of the same names/aliases.
- Package-shipped prompts should remain thin current-role adapters, not copied upstream workflows.

If a physical export is added, make it an explicit preview/export operation into a caller-selected staging directory. Render paths/role provenance from the installed runtime, report conflicts, never overwrite owner files without approval, and require activation/reload/canary afterward. Do not add both runtime and package versions of the same role as a workaround for `get`.

## 5. Implementation map and verification gates

These are proposed code seams, not edits made by this document:

| Area | Change |
| --- | --- |
| `src/extension/runtime-agents.ts` | Reuse role loading/tool mapping; add reviewed capability recipes, provider binding, variant diagnostics and prompt adaptation |
| `src/extension/config.ts` | Add validated opt-in capability/provider configuration with explicit trust/approval behavior |
| `src/extension/parity.ts` | Review any new variant dispositions; retain excluded roles and no nesting |
| `src/extension/subagent-guidance.ts` | Explain canonical/variant selection, independent roles, inspection defect, and per-assignment upstream-model resolution |
| `tests/runtime-agents.test.ts` | Add cross-platform binding, exact capability/prompt and unavailable-provider tests |
| `scripts/subagent-tool-capability-smoke.mjs` | Extend actual child-registry coverage to researcher/planner/checker/mapper recipes and edit/web contracts |
| Owner's agent-management tests | Add the runtime-only `get` regression and policy-aware selection coverage in pi-subagents |

### Track C — integration acceptance (pi-gsd with the verified owner)

The planning lane needs explicit coverage for `gsd-phase-researcher`, `gsd-planner`, `gsd-plan-checker`, and `gsd-pattern-mapper` when pattern mapping is enabled. The original six-role probe included only the planner from that set. The local probe now includes all four planning roles (nine roles/eighteen mode cases overall), corrected runtime-only lookup, selectable host SDK and optional real edit/web provider checks. Record fresh results rather than transferring the old six-role pass to this expanded coverage.

For each required role, inspect effective tools and provider provenance, then verify startup in each intended launch mode. Authoring coverage must exercise the selected read/edit schema, creation and atomic failure behavior. Research coverage must verify search, fetch and source-inspection tool availability; separately authorized live checks establish actual access. Only then run an authorized research → planning → independent checker workflow in disposable state. Keep the real geopack planning task outside this documentation/adapter acceptance scope.

Test the target minimum owner 0.86.0 and the selected 0.88.1 baseline, recording known inspection failures separately from registration/startup outcomes. A repaired owner revision needs its own lookup evidence; neither version is presumed fixed. Run the relevant host/platform matrix, including the actual loaded Pi host, before expanding support claims.

### Acceptance matrix

1. **No-model lookup regression:** runtime-only agent appears consistently in `list`, `get`, and `models`; missing names still fail; aliases, trust and ceilings retain their intended semantics. Do not make registration success stand in for this test.
2. **Provider binding:** Linux/WSL uses bash; native Windows uses trusted pwsh. Test missing, hidden, invalid and stale source paths; multiple tools from one provider deduplicate loading. Exercise optional capabilities both off and on.
3. **Editing:** a disposable child reads an anchored fixture, creates a new file, and performs one atomic multi-file edit with the selected provider. Assert actual schema/behavior and rollback on a failed edit. No shell-authored test documents.
4. **Research:** required web names survive filtering; explicit provider loads in the intended launch mode. Missing provider produces a clear pre-model error. A separately approved live canary verifies one small fetch/source-inspection operation; do not run web/model traffic in offline unit tests.
5. **Isolation:** no changes to builtin worker, no nested launch grants, no new shell/GSD grants on file-only roles, no silent ceiling bypass. Registration/disposal/reload are idempotent. Configured-name/alias collisions are explicit and preserve existing rollback.
6. **Role provenance:** every recipe uses the current installed canonical role and GSD resource paths; no machine/user/project paths or fixed models are committed as portable defaults.
7. **Mode coverage:** check foreground child sessions and detached/background children separately. The no-model startup probe is not a credentialed end-to-end assignment. Managed lifetime coverage is required only for the managed recipe, but cannot be replaced with a short foreground command.
8. **Workflow integrity:** after capability acceptance, run an authorized small research → planning → independent checker workflow in a disposable project. Resolve each exact upstream role's model freshly. Parent retains approvals, ownership and acceptance; do not implement a parallel GSD workflow engine.

Current ordinary repository checks are `npm run check`, `npm test`, `npm run build`, and `npm run release:check`. They must be run after implementation, not claimed by this documentation-only investigation. The existing `npm run test:child-tools -- <owner-source-checkout> <trusted-pwsh-entrypoint>` expects a **TypeScript source checkout** of pi-subagents; the installed npm distribution inspected here exposes compiled JavaScript, so do not assume it is a compatible argument. Update the probe or supply a reviewed source checkout first.

Credential-bearing probes are opt-in. Use disposable state, bounded operations, no commits/publication, no secret output, and the actual provider paths/model route selected for that assignment. A failed launch/provider setup stops that lane and must be reported, not worked around through another runner.

## 6. Rollout and non-goals

Track A and Track B may proceed independently; Track C gates claims that the planning lane is ready. Managed execution and physical-profile export are deferred and are not prerequisites for this repair.

### Status checklist

- [x] Diagnose the runtime-only inspection mismatch separately from launch readiness.
- [x] Install and pin Windows pi-subagents 0.88.1 with a one-install release-age exception; retain the saved seven-day policy.
- [x] Record 185 passing tests/typechecks and 12 passing no-model cases against the 0.88.1 source snapshot with repository Pi 1.3.0 peers.
- [ ] **Track A:** finish the existing owner lookup repair, reconcile its baseline with 0.88.1, and verify runtime-only `list`/`get`/`models` behavior.
- [ ] **Track A:** record the verified repair revision and confirm the intended owner source is actually loaded after approved activation/reload.
- [ ] **Track B:** define/test opt-in capability configuration and provider trust/approval behavior before publishing executable configuration examples.
- [ ] **Track B:** implement and verify the compatible read/edit binding, including creation and atomic multi-file failure behavior.
- [ ] **Track B:** implement and verify opt-in research bindings, with separate approval for live access checks.
- [ ] **Track C:** cover researcher/planner/checker and conditional mapper in the required modes, with policy narrowing and missing-provider failures.
- [ ] **Track C:** test minimum owner 0.86.0, the selected 0.88.1 baseline and any repaired revision; record actual host/platform coverage and known failures.
- [ ] **Track C:** after both repair tracks pass, run the separately authorized disposable research → planning → independent checker acceptance workflow.
- [ ] Refresh operator/maintenance guidance with measured results, then perform the separately approved release/package/loaded-checkout verification.

Do not check an implementation gate merely because this document describes it. New tests and code changes require fresh verification. Managed executor lifetime work and physical-profile export remain deferred unless explicitly requested.

Editing `C:/Users/akriz/code/pi-gsd` alone does not update the separately loaded Git-installed checkout. Do not accidentally test the old extension and attribute its result to the new source. Updating/repointing the active package, copying profiles into discovery, model canaries, commits and publication are separate actions requiring appropriate approval.

Non-goals: widen generic workers, install optional providers automatically, copy Ubuntu credentials/configuration, enable nested orchestration, vendor upstream GSD workflows, modify the geopack package/prototype, or resume its paused Phase 6 planning as part of this documentation task.

## Evidence and related guides

- [Current profile setup](SUBAGENT-PROFILES.md): automatic core registration, operational/inspection boundaries, optional job requirements.
- [Maintenance playbook](MAINTENANCE.md): ownership, compatibility and release checks.
- [Parity matrix](PI-PARITY.md): reviewed native roles and exclusions.
- Ubuntu source files listed in Section 2; inspected directly via the WSL filesystem. They remain untracked in their owning project and were not altered.
- pi-gsd role builder/tests, config and package manifest at the Windows revision listed above.
- Installed pi-subagents `src/agents/agent-management.js`, `runtime-agent-registry.js`, `agents.js`, and `docs/agents.md`: lookup behavior, collision policy, package discovery and extension-path semantics. These are investigation pointers, not private APIs for pi-gsd to depend on.

**Reader check:** the manual path identifies source, staging/activation boundaries, shell/provider translation, collision handling, reload and canary requirements. The implementation path names ownership, existing seams, proposed capabilities and falsifiable acceptance gates. Neither path asserts an untested launch or claims that profile copying fixes the runtime inspection defect.

## Local repair acceptance checkpoint — 2026-11-13

The expanded probe passed eighteen baseline cases on Pi 1.3.0 and eighteen
explicit-provider cases on Pi 1.5.2 against the patched local owner 0.88.1 source.
Planning-role runtime-only inspection passed; the unpatched release reproduced
the lookup failure. Real edit creation/anchors/multi-file rollback passed in both
modes for all three equipped author roles. Research web checks covered registration
and schemas only. Adapter checks passed 190 tests, typechecking, build and release
metadata validation; owner typechecking and package build passed. A fresh offline
Pi 1.5.2 RPC process in geopack with explicit reviewed extensions and project
approval displayed the equipped-role doctor report. Existing-session reload and
ambient discovery are not inferred from that probe. Credentialed web/model
acceptance, minimum-version and Unix/WSL matrix gates were open at that checkpoint.
The adapter follow-ups are included in release 1.19.0-pi.3, not 1.19.0-pi.2.
The separate local owner repair remains outside the adapter release; its activation
requires explicit approval and a full restart. Subsequent acceptance is recorded below.

## Follow-up: CLI identity versus runtime registration

The adapter now identifies package-local CLI children as Pi with subprocess-local
`GSD_RUNTIME=pi`, including the normal host executor and Windows shim path. This
fixes the Claude runtime fallback without changing shared project/global settings.
Core's filesystem installation fields remain verbatim, even when false. The
extension adds separate, cwd-scoped session-registration metadata and guidance to
initialization reports, status and doctor. This reports the adapter's registrations,
not the owner's final launch policy or a successful child canary. Cross-project
requests cannot borrow a registered-role list; restricted children do not inherit
parent evidence. No workflow templates, physical profiles, model routing policy,
owner internals or global defaults are rewritten. See the operator guide's
“CLI runtime identity and filesystem installation reports” section.

Follow-up validation passed 197 tests, typechecks, build, release metadata,
Pi 1.3.0/1.5.2 visible doctor/init RPC reports and eighteen Pi 1.5.2 native child
cases. The geopack fresh-process check simultaneously reported Pi runtime identity,
false physical-install completeness and registered Pi profiles; no field was
falsified to force success. The normal host-executor test exercises Core's real
main-module guard, not only a mocked script. No model/web requests, workflow
resumption, shared-config edits, commits or publication were performed.

## Subsequent Ubuntu WSL acceptance

The historical Unix/WSL startup gate above is now covered for **Ubuntu 24.04.5,
Node 24.14.0, Pi 1.5.2 and the patched owner 0.88.1 source**. All eighteen equipped
native-child cases passed, including exact-role inspection, Bash/gsd/codemode,
leaf guidance, anchored editing and atomic rollback. The full suite passed 228
checks on Ubuntu and Windows after correcting context-mode classification of
projects beneath `/tmp`. Real POSIX signal escalation and host-executor identity
also passed. See [the detailed acceptance record](PACKAGE-DESIGN-REVIEW.md#ubuntu-wsl-acceptance).
No profile installation, global configuration changes or credentialed requests
were performed. Track C's research/planning/checker model workflow, minimum-owner
acceptance and managed-process integrations remain separate unverified gates.
