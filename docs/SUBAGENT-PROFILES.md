# Configure GSD-capable subagents

This guide is for operators assigning approved GSD planning, execution,
verification, review or research work to pi-subagents children. Configure tools by
the assignment's operations, not just its upstream role name. These are local
configuration templates for additional/custom profiles. Core operational roles are
now registered automatically at runtime as described below; no local profile files
are installed or overwritten.

## Automatic core role startup

At parent `session_start`, pi-gsd uses the supported
`pi-subagents:runtime-agent-register:v1` event to register `gsd-planner`,
`gsd-executor`, `gsd-verifier`, `gsd-plan-checker` and `gsd-code-reviewer` with the
installed optional pi-subagents owner. Select these exact agent names directly.
Their prompts are read from the current package-local GSD Core agent files, not
vendored or rewritten workflows. Resolve each role's model immediately before
launch; runtime definitions do not pin models or authorize delegation.

Each definition explicitly permits `gsd`, native `codemode`, read/search tools,
`contact_supervisor` and the platform shell. `write`/`edit` follow the upstream
role's declared file tools. Both native foreground and background children load
pi-gsd through `subagentOnlyExtensions`; `extensions: []` disables ambient discovery.
Windows adds the provider entrypoint from the registered parent `pwsh` tool's
`sourceInfo.path`, not an assumed install directory. Missing source metadata or a
hidden/missing PowerShell tool prevents registration rather than falling back to
bash. On Unix/WSL the baseline shell is native `bash`.

These are **write-capable operational agents**, including checker/reviewer roles:
`gsd` and the shell are not read-only grants. Use the inspector template below for
strictly tool-minimized evidence inspection. No runtime definitions modify builtin
workers, grant nested orchestration, inherit a skills catalog or supply conditional
web/MCP tools. Additional upstream requirements still need explicit setup.

`/gsd-status` and `/gsd-doctor` show registration separately from unverified child
health. An unsupported/absent owner or a collision produces an unavailable state
and rolls back partial registration. Existing owner collision rules, exclusions,
trust and capability ceilings remain authoritative at launch. Disable integration
with `integrations.subagents: off` and reload to remove these registrations.
Owned registrations are disposed on parent shutdown/reload; loading pi-gsd in a
restricted child without a parent subagent interface does not register more roles.
Do not substitute a generic worker if registration fails: keep the assignment
inline until configuration is repaired.

## Three independent contracts

Each assignment needs current package-local upstream role/workflow instructions,
a runtime profile with the required tools **and their providers**, and the model
returned by `gsd` action `resolve-model`. None supplies the others. For example,
resolve upstream `gsd-planner` but select the operator-defined runtime profile
`pi-gsd-operator` when the authorized planning assignment needs GSD operations.
The same runtime profile can serve a different upstream role in a separate run;
its generic name does not replace that role's instructions or model route.

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
and obtain authorization for an equipped profile or keep the work inline. Do not
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
inheritSkills: false
defaultContext: fresh
tools: read, grep, find, ls, bash, edit, write, gsd, codemode, contact_supervisor
subagentOnlyExtensions:
  - /ABSOLUTE/pi-gsd/src/extension/index.ts
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
inheritSkills: false
defaultContext: fresh
tools: read, grep, find, ls, pwsh, edit, write, gsd, codemode, contact_supervisor
subagentOnlyExtensions:
  - C:/ABSOLUTE/pi-gsd/src/extension/index.ts
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
provider/runtime or stay inline. Its fallback does not satisfy the explicit
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
inheritSkills: false
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
  parent. Repair an unsupported configuration or stay inline.
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

## No-model native startup probe

Run the optional source-snapshot probe against a trusted installed pi-subagents
checkout (the optional package is not a pi-gsd dependency):

```text
npm run test:child-tools -- <pi-subagents-checkout> [trusted-pwsh-provider-entrypoint]
```

Windows requires the trusted PowerShell entrypoint argument. The probe uses the
real owner's registration API and native child factory with this repo's Pi peers,
isolated temporary state, an in-memory empty credential store, and no model turns.
It launches the actual definitions returned by the owner's registry after pi-gsd's
public startup registration path, not independently reconstructed profiles. It
checks planner/executor/verifier tool registries and direct/codemode GSD status,
package-local GSD CLI help and shell calls in foreground sessions and separate processes, plus owner policy
narrowing. A synthetic in-memory assistant tool-call fixture supplies Pi's required
nested-call context; it is not model output. The probe does not modify the
installed owner or validate a credentialed end-to-end model assignment. Run the authorized canary below separately when needed.

## Verify each capability class before assigning work

1. Reload after profile changes. Inspect
   `subagent({ action: "list", options: { capabilities: true } })`, including the
   selected source, tools, providers, exclusions and ceilings. User/project
   overrides and declined project trust can change which definition wins.
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
   - Required explicit tools whose providers fail to register should produce
     pi-subagents' unavailable-tool diagnostic before the first model turn.
     Neither a successful model route nor an incomplete canary proves readiness.
3. Immediately before each authorized assignment, resolve the **exact upstream
   role**, not the runtime profile name. Examples:
   `gsd({ action: "resolve-model", agent: "gsd-planner", taskId: "one-plan" })`,
   `gsd({ action: "resolve-model", agent: "gsd-verifier", taskId: "one-check" })`,
   or the actual review/research role supplied by the upstream workflow. Do not
   route every operational child as `gsd-executor`. Select `pi-gsd-operator` or
   `pi-gsd-inspector` separately based on required capabilities. For `pass-model`,
   pass the exact returned suffixed model; for `omit-model`, omit it; for
   `resolve-first`, do not launch. IDs are correlation, not extra launch parameters
   or permission grants. The advisory may not associate custom profile launches;
   it must not be treated as capability or per-child routing proof.
4. Preserve upstream steps, one-writer boundaries, approvals, verification and
   independent acceptance. Operational permission is not permission to change
   scope, coordinate a phase or spawn more agents. Parent coordination remains
   separate unless independently authorized and explicitly configured.
5. If required capabilities are missing or unknown, keep the assignment inline;
   do not silently substitute a parent command-running relay or skip required
   upstream operations. A custom profile named `pi-gsd-executor` from an earlier
   setup may remain installed: no rename is automatic or required. Reinspect its
   actual capabilities rather than assuming it acquired these changes.

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
If the mode cannot be verified, use agreed bounded foreground validation or stay
inline.
