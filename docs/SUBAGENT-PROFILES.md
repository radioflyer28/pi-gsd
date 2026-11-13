# Configure GSD-capable subagents

This guide is for operators assigning approved GSD planning, execution,
verification, review or research work to pi-subagents children. Configure tools by
the assignment's operations, not just its upstream role name. These are local
configuration templates for additional/custom profiles. Core operational roles are
now registered automatically at runtime as described below; no local profile files
are installed or overwritten.

For the Ubuntu-to-Windows investigation, the runtime `list`/`get` mismatch, and a
proposed portable edit/web/managed capability update, see the
[profile portability implementation plan](SUBAGENT-PROFILE-PORTABILITY-PLAN.md).
That proposal does not install profiles or change current runtime behavior.

## Compatibility and known limitations

**Operator action:** inspect the selected profile and verify the capabilities needed
for the approved assignment before launching it. Prefer the canonical runtime role;
use a custom variant only when explicitly approved and permitted by the workflow.

Runtime registration, profile inspection, child startup, and assignment readiness
are separate checks. A role can register and launch while an owner inspection
command is defective. Registration alone does not prove additional provider readiness.

The 2026-11-13 upgrade checkpoint verified the unmodified owner 0.88.1 against
pi-gsd 1.19.0-pi.2 using repository Pi 1.3.0 peers (twelve no-model cases). The
subsequent local repair selects the patched `pi-subagents-0.88.1` source checkout
and the pi-gsd source checkout instead of their installed release packages. Source
selection is not proof that an already-open session reloaded. The target is owner
0.86.0 and later; minimum-version and broader host/platform coverage remain pending.
See the [implementation plan](SUBAGENT-PROFILE-PORTABILITY-PLAN.md) for evidence,
ownership and remaining gates. The narrow opt-in `childProviders` configuration
below supplies authoring multi-edit and phase-research web bindings; managed jobs,
other role recipes and credentialed child acceptance remain separate work.

The runtime-only `get` lookup omission was reproduced on 0.84.0 and remains in
inspected 0.88.1 release source. Upgrading alone does not fix it. Repair belongs in
pi-subagents; do not patch installed modules or duplicate canonical profile files.
Status/doctor now report reviewed source fingerprints in
`capabilities.subagentCompatibility`. A known-unpatched source prompts a parent
agent advisory to ask the user before preparing a repair. Follow the bundled
[approval-gated owner repair guide](PI-SUBAGENTS-REPAIR.md); detection never applies
patches, activates delegation or changes source selection automatically.

| Symptom | Interpretation / next action |
| --- | --- |
| Role absent from listing | First filter the listing for that role; then investigate startup, owner support, collisions, integration settings, scope and trust. |
| Listed, but `get` says “not found” | Known owner inspection defect for runtime-only profiles; not proof of launch failure. Repair inspection rather than duplicate the role. |
| Tool allowlisted but unavailable in child | Check explicit provider loading, startup errors, exclusions and capability ceilings. |
| Research role lacks web capabilities | Supply approved research tools and their provider; an owner upgrade does not widen the profile's explicit allowlist. |
| Same tool name, incompatible edit schema | Inspect the actual child read/edit provider pair; the parent's anchor/multi-file behavior is not inherited automatically. |

On owner 0.88.0+, list output is limited to 30 agents. Use the supported search
filter; omission from an unfiltered result does not mean registration failed:

```javascript
subagent({ action: "list", options: { capabilities: true, search: "gsd-phase-researcher" } })
```

For older owners, use `list` with `capabilities: true` without the newer search
option. Inspect returned capability details, not just names. Use corrected `get`
when available to inspect the effective definition. If required provider/policy
information cannot be established, stop the required child step; do not launch
blindly or replace independent research/checking with inline work. Listing alone
is not a child startup or access check.

## Automatic core role startup

At parent `session_start`, pi-gsd uses the supported
`pi-subagents:runtime-agent-register:v1` event to register 33 reviewed leaf roles
with the installed optional pi-subagents owner. These include planning, execution,
verification, research, roadmapping, debugging and audit roles. Select the exact
registered name directly. The nested debug session manager and browser-dependent
DOM verifier are excluded; see the [parity matrix](PI-PARITY.md).
Prompts come from current package-local canonical role files, not vendored workflows.
Resolve each role's model immediately before launch; definitions do not pin models
or authorize delegation.

Each definition permits native `codemode`, `read` and `contact_supervisor`.
Search/write/edit tools follow upstream declarations, including block-list syntax.
Only shell-declaring roles receive `gsd`, the platform shell and explicit provider
paths. File-only roles receive neither shell nor GSD. Shell-capable foreground and
background children load pi-gsd through `subagentOnlyExtensions`;
`extensions: []` disables ambient discovery.
Windows preserves a registered `pwsh` integration by adding its actual provider
entrypoint from `sourceInfo.path`, not an assumed install directory. Without that
integration, a host-provided builtin `powershell` tool can supply bounded foreground
validation without a shell extension. The builtin must have verified builtin source
metadata; an arbitrary extension named `powershell` is not a substitute. A hidden or
broken registered `pwsh` blocks shell roles rather than silently falling back around
its policy. If neither supported shell is available, only shell-dependent roles are
omitted. Windows never falls back to Bash. Unix/WSL continues to use native `bash`.
Doctor reports the registered shell separately from child startup readiness.
Managed jobs remain a separate, explicitly verified capability.

Shell-capable profiles are **write-capable operational agents**, including checker/reviewer roles:
`gsd` and the shell are not read-only grants. Use the inspector template below for
strictly tool-minimized evidence inspection. No runtime definitions modify builtin
workers, grant nested orchestration or inherit a skills catalog. Conditional web
requires the opt-in binding below; other upstream requirements still need explicit setup.

`/gsd-status` and `/gsd-doctor` show registration separately from unverified child
health. An unsupported/absent owner or a collision produces an unavailable state
and rolls back partial registration. Existing owner collision rules, exclusions,
trust and capability ceilings remain authoritative at launch. Disable integration
with `integrations.subagents: off` and reload to remove these registrations.
Owned registrations are disposed on parent shutdown/reload; loading pi-gsd in a
restricted child without a parent subagent interface does not register more roles.
Do not substitute a generic worker if registration fails. If the workflow requires
a child role, stop that step until configuration is repaired; skip only explicitly
optional steps. Work that upstream permits inline remains a separate choice.

## Stock editing and opt-in provider bindings

Stock Pi `read`/`edit`/`write` tools are the default, including for `gsd-executor`.
Ordinary multi-file work can use separate stock file edits; it does not require a
multi-file editing extension. Follow the child's actual tool schemas rather than
copying the parent's anchored edit calls. Stock editing does not promise atomic
rollback across files. All native GSD roles retain `codemode` alongside their
allowlisted tools; it is tested with stock and enhanced tooling and grants no
additional permissions.

Installing or loading an enhanced editor in the parent does not opt children in.
Choose the explicit binding below when those enhanced semantics are wanted.

The source adapter accepts these optional keys in `.pi-gsd/config.json`:

```json
{
  "childProviders": {
    "multiEdit": "C:/ABSOLUTE/pi-multiedit/index.ts",
    "researchWeb": "C:/ABSOLUTE/pi-web-access/dist/index.js"
  }
}
```

These paths are examples, not portable defaults. Both keys are absent by default.
Project-selected bindings require a positive Pi project-trust decision; missing or
declined trust prevents registration, even if the provider is loaded in the parent.
An entry must be an existing absolute file and must match the canonical source
of the required nonhidden tools already registered in the parent. A project path
alone cannot cause arbitrary extension loading. Multi-edit requires the same
provider for `read` and `edit`; research web requires `web_search`, `fetch_content`,
`get_search_content` and `source_check`. Review and load each provider in the parent
first. A missing, hidden or mismatched optional provider omits only the roles
requiring that binding; doctor reports `partial` registration with per-role reasons.
It never silently registers those roles without their requested capabilities.
Unrelated roles remain available. Malformed configuration or missing project trust
makes registration unavailable; registration collisions still roll back the batch.
Doctor also lists tools and canonical provider paths for equipped roles. These
are configuration diagnostics, not a cached readiness certificate.

`multiEdit` equips canonical `gsd-phase-researcher`, `gsd-planner`,
`gsd-pattern-mapper` and `gsd-executor`. Their upstream Write/Edit responsibilities map to `edit`,
including selector-free whole-file creation, and the redundant `write` grant is
removed. `researchWeb` equips only `gsd-phase-researcher`; it does not supply any
MCP provider. Other canonical roles, file-only boundaries, ambient-extension
restrictions, model routing, owner ceilings and exclusions remain unchanged.
Managed execution is not enabled. Registration still does not prove child startup,
read/edit schema compatibility, web connectivity or assignment readiness.

After activating an edited source checkout, reload Pi, inspect the effective
profiles and run the authorized disposable capability canaries before planning.
Do not load both the source checkout and the separately installed pi-gsd package.

## Three independent contracts

Each assignment needs current package-local upstream role/workflow instructions,
a runtime profile with the required tools **and their providers**, and the model
returned by `gsd` action `resolve-model`. None supplies the others. Prefer the
canonical registered role, such as `gsd-planner`, when it satisfies the assignment.
An operator-approved custom profile such as `pi-gsd-operator` may serve that role
only when the execution contract permits the substitution; still resolve the
upstream `gsd-planner` model and supply its current instructions. Do not silently
replace a required canonical identity. A custom profile's name is not a new GSD
role or routing tier, and each independent assignment needs its own context.

Status/doctor detect integrations in the **current Pi session**, not a selected
child's registry. Model-routing advisories do not certify tool readiness. The
builtin `worker` lacks `gsd`; supplying planner or verifier instructions does not
change that. Do not widen generic workers globally or bypass pi-gsd with a
shell-launched GSD CLI.

## Select capabilities for the assignment

| Assigned work | Capability decision |
| --- | --- |
| Planning | If upstream initialization, GSD queries or plan validation are required, allow `gsd` and load pi-gsd. Include file tools for authorized plan/artifact writes and a shell only when required. |
| Execution | Include `gsd` for upstream GSD operations, appropriate editing tools and a platform shell for approved implementation and validation. |
| Verification | Include `gsd` when upstream verification commands are required, a shell for tests and file tools for required report writes. A verification label does not make these tools read-only. |
| Review / plan checking | Supplied-evidence inspection can use the inspector below. If the full upstream assignment needs GSD operations, tests or artifact writes, use an authorized equipped profile instead; do not omit required steps. |
| Research / scouting | Local evidence inspection can use the inspector. Web/MCP tools, GSD operations or artifact writes require their own explicit tools/providers; neither template is a universal research toolkit. |
| Phase coordination | Separate authorization, nesting policy and tool configuration are required. Neither template grants nested delegation or phase-level tracking ownership. |

These examples are not a copied GSD role roster or a new workflow engine. Read
the current upstream instructions and compare their actual requirements each time.

**There is no read-only `gsd` grant.** The current tool has mutating actions and
pi-gsd provides no per-action permission restriction. `acceptanceRole: read-only`
is an acceptance label, not access enforcement. A shell can also write files.
For inspection-only work, omit `gsd`, shell and write tools; task prose saying
"only query" is not a substitute. If those capabilities become necessary, stop
and obtain authorization for an equipped profile. Work inline only where upstream
permits it; never replace a required independent child step. Do not
silently replace a required upstream step with an incomplete inspection.

## Operational profile: Unix / WSL

After operator approval, save as `.pi/agents/pi-gsd-operator.md` or the user
alternative `~/.pi/agent/agents/pi-gsd-operator.md`. This native Pi profile is
write-capable and appropriate only for authorized operational assignments. Narrow
its tools further when a particular deployment does not need all of them.

Replace every `/ABSOLUTE/...` placeholder with an existing trusted entrypoint from
the actual installation. Resolve pi-gsd's entrypoint from its `pi.extensions`
manifest and keep its package-local GSD Core dependency installed. Do not load
the separate upstream GSD Pi plugin alongside pi-gsd. WSL/Linux is the Unix case,
even on a Windows desktop.

```yaml
---
name: pi-gsd-operator
description: Perform one approved upstream GSD operational assignment
acceptanceRole: writer
systemPromptMode: replace
inheritProjectContext: true
inheritGlobalContext: false
inheritSkills: false
allowNestedSubagents: false
maxSubagentDepth: 0
defaultContext: fresh
tools: read, grep, find, ls, bash, edit, write, gsd, codemode, contact_supervisor
extensions: []
subagentOnlyExtensions:
  - /ABSOLUTE/pi-gsd/src/extension/leaf.ts
---
Perform only the supplied approved assignment using its supplied current
package-local upstream role and workflow. Read project instructions. Use gsd for
GSD operations and bash for approved bounded foreground validation; inspect exit
status and output. Write only assigned artifacts and perform scoped commits only
when authorized. Report results and verification evidence. Escalate genuine scope,
authority, dependency or safety decisions. Do not delegate further, coordinate a
phase or advance to another assignment.
Use codemode for useful batching, filtering or deterministic tool chains; await
all calls and check tool-specific errors and exit statuses. Keep simple reads and
authored edits direct; parallelize only independent, non-conflicting operations.
```

## Operational profile: native Windows

Use this alternative profile with pi-pwsh-notify-secure, not the Unix shell
allowlist. Resolve both entrypoints from the installed providers' `pi.extensions`
manifests rather than assuming an installation directory.

```yaml
---
name: pi-gsd-operator
description: Perform one approved upstream GSD operational assignment on Windows
acceptanceRole: writer
systemPromptMode: replace
inheritProjectContext: true
inheritGlobalContext: false
inheritSkills: false
allowNestedSubagents: false
maxSubagentDepth: 0
defaultContext: fresh
tools: read, grep, find, ls, pwsh, edit, write, gsd, codemode, contact_supervisor
extensions: []
subagentOnlyExtensions:
  - C:/ABSOLUTE/pi-gsd/src/extension/leaf.ts
  - C:/ABSOLUTE/pi-pwsh-notify-secure/src/index.ts
---
Perform only the supplied approved assignment using its supplied current
package-local upstream role and workflow. Read project instructions. Use gsd for
GSD operations and pwsh for approved bounded foreground validation; inspect exit
status and output. Write only assigned artifacts and perform scoped commits only
when authorized. Report results and verification evidence. Escalate genuine scope,
authority, dependency or safety decisions. Do not delegate further, coordinate a
phase or advance to another assignment.
Use codemode for useful batching, filtering or deterministic tool chains; await
all calls and check tool-specific errors and exit statuses. Keep simple reads and
authored edits direct; parallelize only independent, non-conflicting operations.
```

The secure PowerShell provider requires a trusted runtime. If it deactivates
`pwsh` and retains builtin shells, this profile is **not** ready: repair the
provider/runtime and stop any required child step until repaired. Inline work is
an option only where upstream permits it. The fallback does not satisfy the explicit
allowlist. Managed jobs are not included in either operational template.

## Inspection-only profile: either platform

Use `.pi/agents/pi-gsd-inspector.md` (or the user equivalent) only when the complete
approved assignment can be performed by inspecting supplied/local evidence and
returning findings. This profile does not run tests or write a review artifact;
if upstream requires either, choose an authorized operational profile instead.

```yaml
---
name: pi-gsd-inspector
description: Inspect supplied GSD evidence without operational tools
acceptanceRole: read-only
systemPromptMode: replace
inheritProjectContext: true
inheritGlobalContext: false
inheritSkills: false
allowNestedSubagents: false
maxSubagentDepth: 0
defaultContext: fresh
tools: read, grep, find, ls, codemode, contact_supervisor
extensions: []
---
Inspect only the supplied evidence using the assigned current upstream role and
workflow, provided the complete assignment fits this inspection-only contract.
Read project instructions and return findings with evidence references; do not
write artifacts, run shell commands or perform GSD operations. If required steps
need missing tools or authority, stop and escalate rather than skip them or ask
for a routine command relay. Do not delegate further or coordinate a phase.
Use codemode for useful batching and filtering of permitted reads; await all
calls and inspect errors. Keep simple reads direct. Do not use codemode to bypass
tool restrictions.
```

`extensions: []` disables ambient extensions, not the native codemode factory.
Host-required extensions and inherited policies may still apply: verify the final
filtered registry. This is a tool-minimized profile, **not an operating-system
sandbox** or a promise that every GSD reviewer role fits it.

## Parent and leaf entrypoints

Parents load the normal `src/extension/index.ts` package entrypoint. Native GSD
leaf profiles and the manual operational templates load `src/extension/leaf.ts`
instead. Both provide the same single `gsd` tool and result schema. The leaf
entrypoint omits parent-coordination tool guidelines and never registers another
batch of child profiles; it does not widen or replace the owner's tool policy.
Load only one entrypoint per session. Existing manually configured leaf profiles
using `index.ts` should switch to `leaf.ts` after their active work finishes.

## Structured results and lazy activation

`gsd` now returns a version-1 object through codemode. Check `ok`; use
`execution.json` only when provided, otherwise inspect stdout/stderr and truncation
or recovery metadata. `runtimeAgents` and `modelRouting` are separate fields, not
launch authorization. See [README](../README.md#codemode-result-contract).

An active `subagents_enable` with registered but inactive `subagent` is normal lazy
activation. Doctor reports `activation-available`; only activate when delegation
is authorized or existing runs need management. Inspect the execution tools on the
next model request. Do not reload merely for this state. Loaded tool-provider paths
and installed package candidates are reported separately; the latter cannot identify
a patched checkout. On Windows, lack of a usable builtin PowerShell or registered
pwsh provider excludes shell roles while preserving file-only profiles; partial
registration still needs per-role checks.

## Loading, codemode and skills

- `tools` is an allowlist. Adding `gsd` does not load pi-gsd; loading pi-gsd alone
  does not add `gsd` to a strict allowlist. The same applies to `pwsh` and its
  provider. Exclusions and capability ceilings remain authoritative.
- `subagentOnlyExtensions` loads named providers in child sessions without
  replacing background ambient discovery. Native foreground children do not load
  parent ambient extensions. Background children normally do unless an explicit
  extension policy or ceiling prevents it. `extensions: []` disables ambient
  discovery; it does not mean "add nothing."
- All templates explicitly permit codemode. On compatible Pi hosts pi-subagents
  registers Pi's native codemode factory; no separate codemode provider-extension
  path is needed. Older hosts without that factory report the requested tool
  unavailable; ceilings can prevent registration. Verify the child, not just the
  parent. Repair an unsupported configuration; stop required child steps. Inline
  execution is allowed only where the upstream workflow permits it.
- Codemode grants no extra tools and loads no underlying providers. `tool_search`
  is separate and optional, not included in these fixed-toolset templates. Keep
  simple reads and authored edits direct. Host `codemode.mode` can affect direct
  declarations; profile allowlists do not override that presentation setting.
- Scripts use raw JavaScript and `tools.<name>(args)`. Await all calls;
  `Promise.allSettled` can preserve independent successes, but inspect rejections
  and each tool's errors/exit status. Fulfilled shell promises can still represent
  failure. Completed mutations are not rolled back when a later call fails;
  never blindly retry them. Parallelize only independent, non-conflicting work.
- `inheritSkills: false` keeps the inherited skills catalog out. Focused codemode
  guidance is in the profile body. Explicitly supply any additional skills/tools
  the assigned role needs; do not assume a generic profile provides them.
- No template pins a model or vendors upstream workflows. Each handoff supplies
  cwd/root, approved scope, current package-local role/workflow paths, output
  ownership, verification requirements and any scoped commit authorization.

## Explicit compatibility matrix

Keep ordinary platform CI independent of the optional owner. To repeat the separate
no-model compatibility gate against reviewed local inputs:

```text
npm run test:compatibility -- <trusted-owner-checkout> <exact-40-character-owner-commit> <Pi-SDK-package-root> [another-SDK-root...]
```

On Windows, omit `PI_GSD_MATRIX_PWSH` to test builtin PowerShell, or set it to the
reviewed pwsh provider entrypoint to test that integration. Omit the multi-edit
variable to test stock executor editing; set it to test the enhanced path. The
optional multi-edit and web environment variables below apply to every cell.
The runner checks the exact owner commit, records its source hash and dirty state,
and runs visible RPC plus all eighteen native-child cases per SDK. Patched source
is explicitly identified, not passed off as acceptance of the published version.
It performs no installs, credentialed model/web calls or global configuration writes.
Unpatched owners with broken runtime-only `get` deliberately fail; minimum-owner
acceptance remains separate. The Ubuntu/Pi 1.5.2 gate below covers only its actual
reviewed inputs, not every Unix platform or installed-owner version.

## No-model native startup probe

Run the optional source-snapshot probe against a trusted **TypeScript source
checkout** of pi-subagents (the optional package is not a pi-gsd dependency).
The installed compiled npm distribution is not a compatible source argument:

```text
npm run test:child-tools -- <pi-subagents-checkout> [trusted-pwsh-provider-entrypoint]
```

On Windows, omitting the PowerShell entrypoint argument selects the SDK's builtin
`powershell`; supplying it tests the explicit `pwsh` provider. The probe uses the
real owner's registration API and native child factory with this repo's Pi peers,
isolated temporary state, an in-memory empty credential store, and no model turns.
It launches the actual definitions returned by the owner's registry after pi-gsd's
public startup registration path, not independently reconstructed profiles. It
checks planner, executor, verifier, debugger, roadmapper, Nyquist auditor,
phase researcher, plan checker and pattern mapper tool
registries and direct/codemode GSD status, structured CLI success/failure and init
JSON plus separate registration evidence, package-local GSD CLI help and shell
calls in foreground sessions and separate processes: nine roles, eighteen cases,
plus owner policy narrowing. The executor additionally creates, reads and edits
scratch files with stock tools, or verifies anchored batch editing and rollback
when multi-edit is selected. A synthetic in-memory assistant tool-call fixture
supplies Pi's required nested-call context; it is not model output. The probe does
not modify the installed owner or validate a credentialed end-to-end assignment.
It requires corrected runtime-only `get` inspection for planning roles (unpatched
owners deliberately fail this gate). Optional environment variables configure
additional checks without changing installed settings:

- `PI_GSD_SMOKE_SDK_ROOT`: absolute Pi coding-agent package root for the host SDK to test;
  omitted uses repository peers. The probe reports the actual SDK version.
- `PI_GSD_SMOKE_MULTI_EDIT`: reviewed provider entrypoint; tests anchored reads,
  absent-file creation, atomic multi-file edits and rollback through the real tools.
- `PI_GSD_SMOKE_RESEARCH_WEB`: reviewed web provider entrypoint; checks all four
  bound tool registrations and schemas, without invoking web requests or models.

These paths affect only disposable probe configuration. Live web access and the
credentialed workflow require separate acceptance; startup alone does not prove them.

## Verify each capability class before assigning work

1. Reload after profile changes and verify the intended owner/adapter sources are
   loaded. Inspect `subagent({ action: "list", options: { capabilities: true } })`,
   using `options.search` on owner 0.88.0+ as described above. Check the selected
   source, tools, providers, exclusions and ceilings. User/project overrides and
   declined project trust can change the effective definition. A runtime/configured
   name collision is not ordinary project-over-user precedence.
2. Listing is configuration evidence, not provider-registration proof. With
   explicit authorization for a credential-bearing child canary, use a disposable
   workspace and test each intended foreground/background launch mode:
   - Operational: call `gsd({ action: "status" })` and a harmless bounded command
     through the platform shell directly, then exercise both through `codemode`.
     Inspect every result's errors, exit status and output without a parent relay.
   - Inspection-only: read a supplied fixture directly and through `codemode`.
     Check that `gsd`, shells, write tools and nested launch tools are absent from
     the child's effective callable inventory, including codemode discovery. Do
     not test absence by invoking destructive operations.
   - Authoring: read an anchored fixture, create a new disposable file and perform
     an atomic multi-file edit using the selected provider. Confirm a failed edit
     leaves all targets unchanged; do not use shell writes as an editing substitute.
   - Research: verify the required search/fetch/source-inspection tool names and
     providers survive policy filtering. With separate approval for live access,
     exercise bounded search, fetch and source inspection. Provider registration
     is not proof of credentials, connectivity or usable research evidence.
   - Required explicit tools whose providers fail to register should produce
     pi-subagents' unavailable-tool diagnostic before the first model turn.
     Neither a successful model route nor an incomplete canary proves readiness.
3. Immediately before each authorized assignment, resolve the **exact upstream
   role**, not the runtime profile name. Examples:
   `gsd({ action: "resolve-model", agent: "gsd-planner", taskId: "one-plan" })`,
   `gsd({ action: "resolve-model", agent: "gsd-verifier", taskId: "one-check" })`,
   or the actual review/research role supplied by the upstream workflow. Do not
   route every operational child as `gsd-executor`. Prefer the matching canonical
   runtime role. Select a custom operator/inspector variant only with explicit
   approval and when the workflow permits it. For `pass-model`,
   pass the exact returned suffixed model; for `omit-model`, omit it; for
   `resolve-first`, do not launch. IDs are correlation, not extra launch parameters
   or permission grants. The advisory may not associate custom profile launches;
   it must not be treated as capability or per-child routing proof.
4. Preserve upstream steps, one-writer boundaries, approvals, verification and
   independent acceptance. Operational permission is not permission to change
   scope, coordinate a phase or spawn more agents. Parent coordination remains
   separate unless independently authorized and explicitly configured.
5. If required capabilities are missing or unknown, stop the required child step.
   Keep work inline only where upstream permits inline execution; never silently
   replace independent roles, use a parent command-running relay, or skip required
   operations. A custom profile named `pi-gsd-executor` from an earlier setup may
   remain installed: no rename is automatic or required. Reinspect its actual
   capabilities rather than assuming it acquired these changes.

The optional/custom templates and checklist are not proof of a credential-bearing
child canary. pi-gsd remains usable without pi-subagents; the runtime integration
uses the event contract without importing that optional package, installing it or
modifying local profile files.

## Optional managed jobs

Managed jobs are not a baseline requirement for planning, execution, verification
or review. If project policy requires them, agree on that mode explicitly; do not
bypass it with foreground commands. Supply the extra tools and providers:

| Child platform | Tool/provider contract |
| --- | --- |
| Unix/WSL | Optional pi-processes `process`, allowlisted with its processes extension loaded. |
| Native Windows | `pwsh` with `run_in_background: true`, managed through allowlisted `pwsh_job`, with the PowerShell provider loaded. Never require POSIX-only `process`. |

Registration alone is not a lifetime guarantee. Verify that a finite job
outlasting the initial turn keeps its owning child alive, wakes it on completion,
lets it inspect results, and is cleaned up on cancellation/shutdown. Windows
notifications remain metadata-only; retrieve output explicitly with `pwsh_job`.
Do not invent a GSD polling scheduler to cover a provider/subagent lifetime gap.
If the mode cannot be verified, stop any assignment that requires it. Use bounded
foreground validation only when project policy permits it, and inline execution
only when the upstream workflow permits it. Neither is an automatic fallback.

### Local repair verification — 2026-11-13

The patched local owner 0.88.1 and adapter source passed 190 adapter tests,
owner typechecking/package build, and eighteen no-model child cases each on
repository Pi 1.3.0 (baseline) and installed Pi 1.5.2 (explicit providers), on Windows.
The Pi 1.5.2 run exercised real anchored read/edit, absent-file creation, multi-file
updates and failed-batch rollback for the researcher, planner and pattern mapper
in both modes. Researcher web registration/schema checks passed without web calls.
Runtime-only planning-role `get` passed; unpatched 0.88.1 failed that same gate.
A fresh Pi 1.5.2 RPC process in geopack, explicitly loading the selected local
sources/providers with project approval, displayed registered/equipped bindings
in `/gsd-doctor` (78 GSD commands). This does not establish that an existing
interactive session reloaded, nor test ambient package discovery. Reload that
session before use. Credentialed web/model workflow acceptance, minimum owner
0.86.0 and Unix/WSL coverage remained pending at this checkpoint. Subsequent Ubuntu
coverage is recorded below. No release or commit was made.

### CLI runtime identity and filesystem installation reports

pi-gsd launches its package-local Core CLI with subprocess-local `GSD_RUNTIME=pi`.
The normal Pi executor uses a constant Node bootstrap and separate argv entries;
the Windows shim/fallback spawn sets the child environment directly. Neither path
changes the parent environment, `.planning/config.json`, or global defaults.
This host identity takes precedence over conflicting runtime settings for these
adapter invocations only. Direct/global CLI calls are outside this contract.

Core's `agents_installed`, `missing_agents` and required-agent variants describe
physical files, not runtime profiles. They remain unchanged. Initialization calls
(`query init.*` and legacy `init ...`) append a separate **Pi initialization
context** and registration report; tool details expose `piRuntimeAgents` with its
source, requested cwd, registration cwd/status and unverified child readiness.
Status/doctor use the same scoped evidence. A request for a different cwd does not
reuse the current project's registered-role list. Restricted children cannot
claim their parent's registry, and a reload/shutdown replaces or clears evidence.

Check the exact required runtime role through pi-subagents, its provider bindings,
exclusions and policy ceilings before assigning work. A disk warning alone is not
a missing runtime profile, and an on-disk file is not proof of an effective profile.
Stop required child steps when availability or required capabilities are unknown.
Do not manufacture an all-roles-ready flag, install duplicates, or ignore unrelated
upstream prerequisites. Empty model fields with `resolve_model_ids=omit` remain
intentional; Pi model routing is separate. Core's global-defaults warning is not
suppressed or rewritten by the adapter.

Follow-up verification: 197 tests, typechecking, build and release-metadata checks
passed. Live RPC checks on Pi 1.3.0 and 1.5.2 verified visible doctor/init reports
without model turns, including unavailable-owner reporting. A fresh Pi 1.5.2
process in geopack with the explicit reviewed owner/providers showed
`agent_runtime: pi`, the Pi agents directory, unchanged `agents_installed: false`,
and separate `registration: registered` evidence scoped to geopack. The eighteen
configured-provider child cases also passed on Pi 1.5.2. The native spawn and normal
host executor were both tested against the real Core CLI main entrypoint; shared
config files and the parent runtime environment remained unchanged. Ubuntu execution
was untested at that checkpoint; see the subsequent acceptance below. Credentialed
workflow acceptance remains untested. Those adapter changes are included in
`1.19.0-pi.3`; select that release before reloading/restarting an idle session.
Owner-source changes require separate approval and a full restart, as described
in the repair guide.

### Subsequent Ubuntu WSL acceptance

Ubuntu 24.04.5 WSL2 with native Linux Node 24.14.0 and Pi 1.5.2 passed 228 tests,
typechecks/build/release checks, visible doctor/init RPC and eighteen equipped
native-child cases against the patched owner 0.88.1 source. Both native modes
verified Bash/gsd/codemode, leaf-provider paths and guidelines, anchored authoring
and atomic edit rollback. Web-provider checks were registry/schema-only.
`npm run test:unix` additionally verified actual SIGTERM-resistant child termination
via SIGKILL and the real host-executor CLI identity path. See
[the review's Ubuntu evidence](PACKAGE-DESIGN-REVIEW.md#ubuntu-wsl-acceptance) for
source hashes, provider versions, isolation details and the portability fix.
No installed profiles/settings were changed; this is not ambient deployment,
minimum-owner or credentialed workflow acceptance.

### Stock/editor enhancement follow-up

Native Windows acceptance passed with the reviewed patched owner 0.88.1 on Pi
1.3.0 and 1.5.2: **72 native-child cases** (nine roles × two execution modes ×
two SDKs × stock/enhanced tooling). The stock cells used builtin `powershell`,
no editor/shell provider extensions, and executor read/write/edit across separate
scratch files. The enhanced cells used the approved `pwsh` and multi-edit providers,
including executor creation, anchored multi-file changes and failed-batch rollback.
Every cell exercised `gsd` and its shell directly and through `codemode`, preserving
exclusions and capability ceilings. Web checks remained schema/registration-only.

The full Windows suite passed **244 tests**, typechecks, build and release checks;
**36 profile/guidance regressions** passed under native Ubuntu Node. A fresh offline
Pi 1.5.2 parent session also selected builtin PowerShell from real host metadata and
reported registered roles in visible doctor output without a model turn.
These checks do not claim stock unpatched-owner acceptance, credentialed workflow
execution, or rollout to existing sessions. The adapter source must be selected
before reload/restart can expose these changes; todotxt.net's stopped plan and
shared settings were not changed.
