# Coordinator-directed model routing: implementation plan

Status: slices 0–2 complete (compatibility investigation, physical routing foundation and task-scoped coordinator overrides). Virtual routing and wave-parallel writing remain unimplemented.

This plan is for maintainers implementing task-sensitive model allocation and safe wave-parallel execution in pi-gsd. It incorporates the design audit, the Pi 1.0 compatibility refresh, and the worktree integration review. Complete the slices in order. Only implemented slice contracts are supported; remaining proposed configuration, aliases and tool examples must not be treated as enabled features.

## 1. Outcome and ownership

Keep a capable coordinator on an operator-selected model (initial candidate: `openai/gpt-6.1-sol`). Throughout this plan, **Sol** means exactly that provider/model pair, not an OpenAI Codex model or another Sol version. Let it choose cheaper or stronger models for bounded GSD tasks, even inside the same workflow. For example, planning may combine Flash document maintenance, GLM investigation, and Sol synthesis. Tier choice considers ambiguity, consequence, and verification requirements, not just task length.

The coordinator should use tools directly for tiny mechanical operations when delegation overhead would exceed the benefit. Model allocation must not create new workflow steps merely to justify a worker.

| Owner | Responsibility |
| --- | --- |
| GSD Core | Workflow instructions, agent responsibilities, sequencing, artifacts, completion and verification contracts |
| Coordinator | Follow upstream instructions, identify bounded assignments, request a model tier, integrate and verify results |
| pi-gsd | Read model policy, resolve eligible physical models, expose optional virtual selections, adapt verified host capabilities and explain decisions |
| Pi | Model registry/auth, physical dispatch, thinking clamping, session history, compaction and provider retries |
| pi-subagents | Optional child launches, child lifecycle, model-scope enforcement and results; managed worktrees only when it is the explicitly selected isolation owner |

Do not copy upstream prompts, implement a phase state machine, introduce an internal child launcher, or infer implementation from the first file edit. A planner writes files too. Helpers must not independently advance GSD state or redefine an upstream role's completion.

## 2. Verified compatibility baseline

Release 0.3.0 uses locked Pi **1.3.0** and GSD Core **1.17.0** (`^1.17.0` dependency floor), retaining Pi peers **>=1.0.0** and Node.js **>=24.0.0**. Source/test typechecks, **149 tests**, build, no-key Pi RPC smoke (**78** GSD commands), release validation and zero-vulnerability audit passed on the refreshed baseline. An isolated Pi **1.0.0** install also passed checks, 149 tests, build, RPC smoke and release validation. See [current compatibility evidence](ROUTING-COMPATIBILITY-SPIKE.md) for the optional source-snapshot probe and its remaining gates.

### Historical Pi 1.0 foundation refresh

The npm `latest` tags checked during this refresh were GSD Core **1.15.0** and Pi **1.0.1**. GSD Core was already current, so its `^1.15.0` declaration is unchanged. Node.js **>=24.0.0** remains required.

Pi coding-agent and pi-ai are now peer dependencies with **>=1.0.0** requirements; the development lockfile resolves **1.0.1**. They are not bundled runtime dependencies. Pi's package manager suppresses automatic peer installation, so peer metadata is a compatibility declaration, not a runtime capability guard.

Upgrade evidence on Windows / Node 24.13.0:

| Check | Pi 1.0.0 | Pi 1.0.1 |
| --- | --- | --- |
| Source and test typechecks | Passed | Passed |
| Unit/integration suite | 110 passed | 110 passed |
| Build | Passed | Passed |
| No-key Pi RPC smoke | 78 GSD commands; doctor handled | 78 GSD commands; doctor handled |

That foundation install reported zero npm audit vulnerabilities and passed release metadata validation. At that point the package version remained 0.2.0 with changes recorded as unreleased. The global Pi installation was not upgraded.

The then-installed `radioflyer28/pi-subagents@v0.71.0-child-profiles.1` fork was deliberately unchanged by that refresh. It remains an optional, separately installed Pi package. Neither credentialed child execution nor Sol/VT-ARC endpoint behavior was verified in this refresh. Current smoke results do not prove future virtual-model routing.

### Updated API facts that constrain the design

- Pi 1.0 exposes `registerVirtualModel()`. Its router returns a **physical** model and thinking level; virtual-to-virtual routing is invalid.
- Virtual selection and physical dispatch are distinct. `ctx.model` represents selection; assistant messages record physical dispatch. Pi already displays the routed model and accounts for physical-model usage.
- Router input has `user`, `continuation`, `retry`, and `direct` reasons, but no GSD task-class field. Parent router state is not a child assignment channel.
- Router state follows a session branch and survives compaction. It is persisted before dispatch, including when the request later fails. Direct requests have no router state.
- GSD Core 1.15.0 ships agent `routingTier` metadata and a protocol-versioned host integration SDK. The inspected SDK does not expose that catalog directly; its passive model adapter resolves model IDs, not this metadata.
- The supported `query resolve-model <agent> --pick tier` operation reports effective profile tiers such as `sonnet` (observed for the executor), not catalog `heavy/standard/light`. Preserve this distinction.
- The installed child factory flushes provider registrations before resolving the launch model; equivalent early virtual registration was not found in the inspected function. This is a source-level concern, not a reproduced failure.
- Existing pi-gsd launch validation is advisory. Existing pi-subagents model-scope checks inspect the selected model reference; allowing a virtual alias alone does not prove its physical dispatch is within scope.
- GSD Core's execute-phase workflow runs waves in sequence and eligible plans within each wave in parallel when enabled, subject to dependency, isolation, checkpoint and verification gates. Multiple plans do not imply that all are runnable concurrently.
- GSD Core 1.15.0's Pi capability descriptor declares `dispatch.isolation: "none"`, background dispatch disabled, and subagent toolkit/concurrency undocumented. It does not automatically reflect the optional pi-subagents extension. This mismatch is not a proven diagnosis of a past single-child run.
- GSD Core owns worktree manifests, completion reconciliation, merge-back and cleanup in its isolated execution paths. The installed pi-subagents managed-worktree mode instead captures patches/handoffs and may remove successfully captured worktrees and branches. Enabling both lifecycles independently would leave conflicting ownership.
- The current pi-gsd worktree-path guard is an optional, fail-open safety bridge, not a worktree allocator, OS sandbox, or proof that wave-parallel execution is integrated.

## 3. Scope and non-goals

Deliver:

1. Deterministic physical-model defaults, using upstream agent metadata where feasible.
2. Opt-in coordinator tier overrides for individual bounded assignments.
3. A thin optional virtual-model surface using the same physical policy.
4. A verified adapter for upstream wave-parallel plan execution with one worktree lifecycle owner.
5. Honest diagnostics, compatibility checks, and evaluation evidence.

For these GSD implementation slices, defer classifier-driven GSD selection, automatic cross-provider retry fallback, automatic escalation on failed tests, automatic parent downgrades, personal/global config layering, and a generic `gsd/task` assignment protocol. Do not upgrade or modify the installed pi-subagents fork as part of this plan without a separate decision.

The [standalone virtual-model design](VIRTUAL-MODEL-MVP-RESEARCH.md) separately makes automatic semantic selection a first-class goal, using classifier-shaped `state`/`questions` requests and `namespace/role:effort` choices. It proposes a reusable library plus an optional Pi extension so consumers do not reimplement routing machinery. This is a future dependency/integration direction, not an implemented package or an expansion of the current GSD feature gates.

## 4. Policy contract

Retain `.pi-gsd/model-routing.json` and the existing `heavy`, `standard`, and `light` vocabulary. Models remain operator configuration, not package-coded vendor choices. Credentials and endpoint definitions stay in Pi's provider configuration.

Target additive configuration contract (fields become usable only as their slices implement them):

```json
{
  "version": 2,
  "fallback": "error",
  "coordinator": {
    "model": "<provider>/<coordinator-model>",
    "thinking": "high"
  },
  "tiers": {
    "heavy": { "model": "<provider>/<reasoning-model>", "thinking": "high" },
    "standard": { "model": "<provider>/<implementation-model>", "thinking": "medium" },
    "light": { "model": "<provider>/<utility-model>", "thinking": "low" }
  },
  "taskOverrides": { "enabled": true, "allowedTiers": ["heavy", "standard", "light"] },
  "virtualModels": { "enabled": true },
  "agents": {
    "gsd-security-auditor": { "tier": "heavy", "locked": true },
    "gsd-doc-writer": { "tier": "standard" }
  }
}
```

The placeholders are intentional: select exact available provider/model IDs and verify endpoint behavior before enabling a preset. Sol, VT-ARC GLM-5.3, and VT-ARC DeepSeek-V4.1-Flash are evaluation candidates, not capability guarantees. Verify Pi thinking settings versus explicit VT-ARC thinking-variant IDs.

### Precedence and eligibility

Hard eligibility is checked after choosing a candidate, including every inherited or fallback candidate. It includes physical model type, configured auth, required inputs, and applicable model/provider restrictions. A virtual model being visible in `/model` does not prove its targets are usable.

Within those constraints:

1. Explicit operator/session pin, including a `locked` role rule.
2. Permitted coordinator assignment override.
3. Configured exact agent/skill/command default.
4. Upstream role routing tier.
5. Project default / explicit inherit behavior.

Rules finalized by slice 0, with policy foundations in slice 1 and task overrides in slice 2:

- A locked rule freezes the complete effective model/thinking route, not just its tier label. A forbidden override returns `resolve-first` with an explanation rather than silently disregarding the request.
- Task overrides are off when absent. Existing explicit physical role model assignments are pins by default; only a version-2 rule with explicit `locked: false` permits overriding that role's model. `locked: true` also protects tier-only rules. No automatic rewriting of existing config.
- A chosen task tier replaces default route selection coherently; do not retain an unrelated role-level physical model or thinking value from a shallow merge.
- Unknown roles are reported as unknown, then use a declared default/inherit route only if eligible. Never silently infer that new roles are cheap or adequately verified.
- Valid legacy configuration retains its unavailable-model fallback behavior. Version-2 policies default to error on ineligible routes. Unreadable files, malformed JSON and non-object roots fail closed in either format, because a corrupt version marker cannot safely establish legacy intent. Missing files still use defaults. A malformed policy must not silently enable a cheaper route.
- Slice 1 delivered physical policy loading, provenance, dynamic role tiers and pin metadata with future-feature gates. Slice 2 enables task overrides only with explicit version-2 opt-in and a nonempty allowed-tier list. Virtual-routing enablement remains rejected until implemented.
- Existing `prompt` fallback is resolved by an explicit interactive operator action. Routers and headless children never open selection dialogs.
- A virtual route must resolve to a physical model. Reject recursive aliases and ambiguous `inherit`; never inherit the selected virtual model back into itself. An explicit physical snapshot can support inheritance only when its provenance and eligibility are known.

## 5. Coordinator assignment and virtual selections

### Task-scoped physical resolution first

`resolve-model` now accepts an optional requested tier and task identity. Supported request after reloading the extension and explicitly enabling the policy:

```json
{
  "action": "resolve-model",
  "agent": "gsd-doc-writer",
  "taskId": "phase-3-reference-update",
  "tier": "light"
}
```

Task identity is caller-local correlation data, not authority. Bound its length and do not derive filesystem paths from it. An override request must identify its task; legacy requests remain valid.

Return an immutable decision identifying the requested/effective tier, source of policy, config path/content revision, physical target, requested thinking, launch action, warnings, and a decision ID. Distinguish requested thinking from observed effective thinking; the resolver must not claim provider behavior it has not measured.

The parent passes the exact returned physical model reference to pi-subagents. This does not change the parent's selected model, write project policy, or automatically launch anything. Two tasks for the same role may choose different tiers safely.

The advisory now stores up to 128 decision-keyed records with a five-minute lifetime, scoped to the current turn/session/branch and resolved cwd. Turn end, tree navigation and session start/shutdown clear evidence; late asynchronous resolutions cannot repopulate a different lifecycle scope. Repeated task labels receive distinct decision IDs. The dispatcher returns exactly the same immutable decision in text/details and to the advisory.

The optional child tool has no native GSD decision association. Only a unique legacy direct-role attempt is consumed; task-scoped, generic-worker, scripted and differing-cwd launches report validation unavailable rather than guessing. Unrelated decisions survive launch attempts; policy revision changes require fresh resolution, never silent rerouting. No prompt/script parsing or invented launch fields are used. A decision ID is not a security token, and a warning is not enforcement.

### Reusable routing dependency direction

A future pi-gsd adapter should reuse the standalone package's catalog validation, decision construction, selector answer validation and physical resolution rather than build a second generic router. GSD retains role precedence, pins, task boundaries, allowed assignments and workflow ownership. Apply these restrictions before offering choices, and validate the selected physical assignment again before use. Explicit operator/role pins take precedence over automatic selection.

The shared contract supports an existing coordinating LLM, a dedicated LLM selector or a classifier such as Jev. Confidence is optional classifier metadata, not a required LLM output. Explicit variants bypass selection; `virt/auto` chooses role and effort, while `virt/auto:low` or `virt/auto:high` constrains effort exactly. Abstention or an unavailable permitted target returns an actionable failure, not silent escalation.

Library imports must be side-effect-free and accept explicit policy/inventory inputs. Importing it must not activate the standalone Pi extension, read unrelated global config or change the parent selection. Assign one owner for native alias registration. The concrete package dependency, GSD tier-to-variant mapping and bare-auto versus explicit-effort native UI semantics require implementation decisions and tests; no current routing config is migrated by this proposal.

### Thin virtual surface

The initial deterministic GSD aliases remain compatible resource policies, distinct from the generic package's future automatic selections:

| Selection | Physical policy |
| --- | --- |
| `gsd/coordinator` | Explicit coordinator route |
| `gsd/heavy` | Heavy tier |
| `gsd/standard` | Standard tier |
| `gsd/light` | Light tier |

These are resource policies, not GSD phases. They do not infer task difficulty or choose a different tier behind the coordinator's back. No `gsd/task` alias is needed to transport hidden assignment state.

Virtual tier selections alone carry no agent identity. Consequently, they cannot enforce role-specific pins or restrictions. Child consumer guidance stays physical by default; any future virtual child mode must either prove equivalent policy enforcement or continue using physical launches for role-constrained tasks.

Registration must be available before model selection, including CLI startup. Virtual routing is disabled when its enablement setting is absent. Establish a trusted startup project-context lookup for registering enabled aliases, and require reload for enablement changes; do not register only on `session_start`, after startup selection. Resolve request-time policy from the routing context, not an unsafe process-global cwd cache. Loading an extension must not create project config or select a new model automatically.

### Request lifecycle

- Initial request: resolve the selected policy and validate the physical target.
- Continuation: preserve the current assignment's physical model/thinking, not an unrelated prior response from before a virtual selection or branch change. Record minimal versioned assignment state when needed.
- Retry: retain the failed assignment; let Pi own retry counts and delays. No hidden provider switching or task relaunch.
- New user/steering input: not inherently a new task. Keep the assignment unless an explicit selection/task boundary changes it. Test transitions rather than equating all `user` reasons to new GSD work.
- Direct request: use the alias's explicitly configured physical policy without mutating task state. Do not automatically downgrade compaction to Flash.
- Revalidate auth and hard eligibility for sticky targets. Policy revocation blocks with a diagnostic; it does not silently pick a replacement. Define config reload and policy revision behavior in tests.
- Let Pi manage context compaction. Do not advertise the largest candidate's context window as a shared guarantee. Refuse image-dependent routing to text-only models rather than treating placeholders as equivalent input.

## 6. Wave and worktree integration contract

Model choice and scheduling are separate. GSD determines runnable plans, wave barriers and completion gates; the coordinator assigns a model to each eligible plan; pi-subagents supplies the child execution mechanism. Preserve upstream semantics rather than adding a scheduler inside the model router or the `gsd` tool.

A phase can have multiple executor children of the same role with different physical models. Launch the eligible group before awaiting its completion, bounded by configured capacity and provider limits. One top-level pi-subagents workflow may contain several children; report actual child concurrency rather than counting top-level tool calls. The workflow sandbox is not a general GSD tool runner: use documented coordinator/tool boundaries or an explicitly authorized host integration for between-wave gates, never assume an inline script can call arbitrary Pi tools.

### Preferred ownership to validate

Investigate **GSD-owned worktrees with pi-subagents children bound to the assigned cwd**:

1. Follow upstream readiness and isolation resolution through the package-local dispatcher.
2. Have upstream operations create and record per-plan worktrees against the validated wave base. Preserve required serialization of Git creation/merge operations; parallel child execution does not mean parallel Git bookkeeping.
3. Launch each executor in its recorded worktree, with its resolved physical model, upstream role instructions, plan and required context. Do not additionally enable pi-subagents-managed worktrees for that child.
4. Collect child outcomes and apply upstream artifact/commit reconciliation. A launch receipt or zero exit code alone is not completion evidence.
5. Integrate completed work through the upstream merge/verification sequence. Preserve failed or conflicted work and diagnostic artifacts; stop advancement when upstream gates require it.
6. Update shared planning state with the upstream-designated writer, perform manifest-scoped cleanup only when safe, then permit the next wave.

This is a design candidate, not an established supported backend. GSD's process-spawn path is not automatically equivalent to a pi-subagents tool launch. Establish a supported host-capability/dispatch mapping that preserves lifecycle records and recovery. Do not fabricate a harness flag, report isolation merely because the tool exists, spoof another runtime, bypass fail-closed gates, or launch a second executor through the process backend.

If the supported seams cannot express this arrangement, propose the narrow upstream capability/dispatch extension required. Keep parallel writing disabled until the integration is verified. A pi-subagents-owned alternative requires an explicit design decision and proof that patch handoffs satisfy GSD's integration and completion contracts; it is not an automatic fallback.

### Preconditions and safety

- Respect upstream `parallelization`, worktree opt-outs, plan dependencies, checkpoints, overlap/submodule rules and the actual child execution capacity. Do not silently edit these settings to obtain fan-out.
- Verify the selected checkout/base is suitable before allocation. Never auto-commit, auto-stash or discard existing user changes to make it clean.
- Preserve the distinction between an unresolved isolation capability and a deliberate sequential configuration. Fail closed according to upstream behavior; recommend an explicit supported sequential mode rather than silently dropping isolation.
- Pass and verify exact plan/run/worktree identities. Keep routing policy and child cwd correct across worktrees, including ignored or untracked planning/config files and required dependency setup. Do not copy credentials or unrelated local files into worktrees.
- Assign shared STATE/ROADMAP writes to the upstream-designated owner; parallel children must not race on shared tracking artifacts.
- Worktrees isolate Git checkouts, not ports, databases, external services or absolute-path writes. Define separate resources or serialize those operations where necessary. Read-only research/review need not allocate worktrees unless their workflow requires them.
- Recovery must reconcile persisted child and upstream lifecycle evidence before relaunch. Never dispatch the same recorded plan twice merely because the coordinator resumed or missed a completion notification.

## 7. Implementation slices

Slices 0–2 are complete; slices 3–7 are pending implementation. Keep them reviewable and independently verifiable. Physical wave execution does not depend on virtual-child support; the latter remains a separate gate.

### Slice 0 — Compatibility spike and contract decisions

**Status:** complete as a bounded investigation; see [findings and reproduction](ROUTING-COMPATIBILITY-SPIKE.md).

- The public GSD SDK accepts a declared worktree capability, but the real CLI still resolves Pi isolation to `none`; negotiation alone does not bind a dispatch backend.
- The unchanged fork forwards an external worktree cwd through its child factory, as verified with an injected SDK. Queued virtual definitions are not flushed before model resolution in that probe.
- A documented trusted workflow resource can grant finite host commands, but is not a general Pi tool callback or an already-integrated GSD scheduler.
- Proceed with physical routing. Keep parallel writing and virtual children gated on their missing contracts; no installed package is patched, no credentials are used, and no two-plan overlap claim is made.
- Finalized policy/provenance and child evidence contracts are recorded in the spike report and applied by subsequent slices.

### Slice 1 — Define policy and consume upstream role metadata

**Status:** complete. `agent-routing-catalog.ts` isolates catalog access; `model-routing-policy.ts` owns strict validation and pure route precedence; `model-routing.ts` adapts physical availability and reports provenance. New tests cover the current missing roles, synthetic catalog drift, exact provider/model matching, version-2 feature gates, pins and policy round trips. The one intentional legacy failure-mode change is fail-closed corrupt/unreadable configuration.

**Verification:** on the locked Pi 1.0.1 development install, source/test typechecks, all **123 tests**, build, no-key Pi RPC smoke (**78** GSD commands and doctor handling), release metadata validation and diff checks passed. The earlier Pi 1.0.0 matrix above applies to the dependency refresh, not a rerun of these new tests. No credentialed child/provider execution was performed.

**Depends on:** completed compatibility refresh and slice 0.

- Add validated, backward-compatible policy loading and a pure precedence resolver.
- Inspect the public host SDK/query contract first. If no suitable routing-tier surface exists, use one isolated, read-only package-catalog adapter with version/provenance reporting and a documented upstream API request. Do not import scattered private resolver internals.
- Discover agents dynamically; eliminate the duplicated agent roster as the authoritative source. Keep wrapper-specific command/skill defaults explicitly separate from upstream agent tiers.
- Retain conservative legacy fallback for missing catalog data with a visible warning; do not report it as upstream-derived.
- Cover catalog drift already observed: `gsd-dom-verifier` and `gsd-mempalace-curator`, plus a synthetic future role.

**Acceptance:** existing routing tests pass; malformed catalog/config, unknown roles, pins, defaults, disallowed tiers, and thinking precedence have deterministic tests. The doctor identifies catalog version/source and degraded operation.

### Slice 2 — Coordinator overrides with physical child guidance

**Status:** complete. The public tool accepts bounded `taskId` and canonical `tier` requests. Overrides require an explicit allowed-tier list, replace the whole role default selection, and reject role/session pins and target-kind/alias bypasses. Immutable decisions carry unique IDs, requested tier, physical launch guidance and unobserved provider-effective thinking. No parent model change, policy write or child launch occurs during resolution.

`routing-advisory.ts` replaces role-keyed pending state with bounded lifecycle/cwd-scoped evidence and explicitly unavailable association where the child API cannot prove it. Upstream role prompts remain intact; only Pi-specific allocation/handoff guidance changed.

**Verification:** source/test typechecks, **143 tests**, build, no-key Pi RPC smoke (**78** GSD commands and doctor handling), release validation, compatibility spike and diff checks passed on locked Pi 1.0.1. Concurrent same-role resolutions, repeated labels, pins/allowlists, physical eligibility, config revisions and lifecycle races are tested. This is not credentialed child execution or a parallel-wave claim. Live routing policy and the installed fork remain unchanged.

**Depends on:** slice 1.

- Extend the tool schema, dispatcher request types, resolver output, and guidance with task-scoped tier selection.
- Preserve upstream role prompts; add only Pi allocation instructions. Require bounded inputs, output ownership and verification expectations in helper handoffs.
- Keep ordinary tiny work inline and maintain upstream delegation/authorization boundaries.
- Make advisory validation task-aware without adding a launcher or enforcing a guessed association.

**Acceptance:** a light task inside planning resolves to the configured light physical model; a difficult execution task resolves heavy; locked or forbidden overrides stop resolution; two concurrent same-role assignments do not overwrite one another; resolving a child never switches the parent or persists policy.

### Slice 3 — Register and verify virtual policies

**Depends on:** slice 1; integrate with slice 2's shared resolver.

- Add a narrow virtual-model module using Pi's exported API types. Extend the registration facade only where necessary rather than weakening types with broad casts. Preserve a seam for the proposed reusable routing library; do not embed a separate classifier engine or require an unpublished dependency to complete these deterministic aliases.
- When explicitly enabled, register the four aliases at extension load with no automatic selection. Verify trusted startup-context lookup and reload semantics before coding the registration path. Use the same physical policy resolver; add no classifier or second precedence engine.
- Implement lifecycle rules above, branch-safe minimal state, config revision handling, and actionable unavailable/recursive-route errors.
- Use capability detection for optional APIs and clear unsupported-runtime diagnostics even though Pi >=1.0.0 is the declared minimum.

**Acceptance:** an in-process fake provider verifies physical dispatch without credentials on Pi 1.0.0 and 1.0.1. Cover every request reason, selection changes, resume/fork/compaction, missing credentials, input mismatch, revoked policy, and invalid virtual targets. A CLI/RPC smoke proves aliases are registered before startup model resolution.

### Slice 4 — Operator configuration and diagnostics

**Depends on:** slices 2–3.

- Extend the configuration UI for coordinator policy, override permission, role locks and virtual enablement; preserve unrelated config keys and cancellation behavior.
- Surface requested versus effective tier, policy provenance, virtual selection versus physical dispatch, thinking, and fallback reason through resolver/status/doctor output.
- Reuse Pi's native model display and usage accounting. Keep any optional diagnostic logs bounded and free of prompts, document contents, credentials and full task text.
- Document migrations and limitations. Do not automatically replace existing project routes with the suggested Sol/VT-ARC preset.

**Acceptance:** configuration round trips and cancel/no-UI paths pass; no secrets or task contents appear in diagnostics; docs distinguish resolver guidance from hard enforcement and planned child support from verified support.

### Slice 5 — Gate virtual children against the unchanged fork

**Depends on:** slices 2–4.

- Start with no-network fake-provider tests of child startup/model resolution, then exercise foreground/background, extension allowlists, resume, worktree cwd/config discovery, and profile-isolated children.
- Verify early virtual registration, not just visibility in the parent registry. An isolated child must receive the required trusted extension and configuration through documented mechanisms.
- Verify physical-target restrictions and thinking ceilings; a permissive virtual alias must not bypass the intended physical policy. Respect existing child profiles rather than broadening their extension allowlists silently.
- Keep physical consumer guidance as the default and fully supported outcome. If the fork cannot support virtual children, record a reproducible integration issue and a separate upstream/fork fix proposal; do not patch it in this work implicitly.
- Before reusing the credentialed probe, update/validate its installed-fork tool names, extension path discovery, Windows launch behavior, and status contract. The current probe must not be assumed current merely because it skips successfully.

**Acceptance:** a documented matrix establishes which launch modes actually work. Opt-in virtual child guidance is enabled only for verified modes with equivalent policy semantics. Otherwise the feature ships with physical child launches and an explicit limitation.

### Slice 6 — Bridge upstream wave execution and single-owner worktrees

**Depends on:** slice 2's physical task routing and the ownership/capability contract above. Use slice 4 diagnostics; do not require slice 5 virtual-child support.

- Establish an executable compatibility probe for GSD's Pi isolation declaration versus the active pi-subagents capability. Test absent, inactive, masked and profile-restricted integrations; installation or tool registration alone does not prove isolated execution support.
- Validate the preferred GSD-owned lifecycle using documented host negotiation and child cwd binding. Keep creation, manifests, integration and cleanup under one owner; do not rewrite the installed capability registry or fork to make a probe pass.
- Adapt upstream execution instructions at the host boundary so a missing Claude `Agent` tool does not incorrectly imply that verified Pi delegation is unavailable. Preserve all upstream readiness, isolation, checkpoint and completion gates.
- Carry each plan's task-scoped physical model and upstream instructions into the child. Apply concurrency limits independently of tier selection. Record run/plan/model/worktree identity without introducing a competing durable GSD state machine.
- Expose why a wave runs concurrently, is deliberately sequential, or is blocked. Distinguish launched children, completed children and integrated plans.
- Preserve lifecycle evidence across cancellation, crashes and coordinator resume. Do not change the installed pi-subagents fork; if a necessary seam is missing, record the blocking contract and a separate proposed change.

**Acceptance:** use disposable repositories and deterministic child/provider fixtures to demonstrate all of the following:

1. A phase fixture has two ready Wave 1 plans and one Wave 2 plan depending on both. Both Wave 1 executors become active before either finishes, in distinct validated worktrees with distinct model assignments. This proves actual overlap, not merely two resolution calls.
2. Wave 2 cannot launch until Wave 1 outcomes are reconciled, required changes integrated, and upstream gates pass. Launch receipts, incomplete summaries and zero exits without required artifacts cannot advance the barrier.
3. Git integration is serialized as required; model/task identities and shared planning-state ownership remain correct. Only the chosen lifecycle owner creates and cleans up worktrees.
4. Merge conflicts, out-of-contract writes and required gate failures produce the upstream-prescribed blocked/warning outcomes, preserve recoverable work, and prevent unsafe advancement. Do not silently promote an upstream advisory scope check into a hard gate.
5. Cancellation, partial child failure and coordinator restart reconcile existing runs without duplicate execution or deletion of unmerged changes.
6. Disabled parallelization, explicit sequential mode, unavailable isolation, dirty checkouts, overlapping scopes, submodule restrictions and capacity limits follow their respective upstream rules. No automatic stash/commit or silent isolation downgrade occurs.
7. Child cwd, role/context loading, routing config and dependency setup work across worktrees without broadening child-profile permissions or exposing credentials.

A failed isolation/ownership gate blocks the claim of parallel writing support, not the separately verified physical model-routing feature. Record the limitation and offer supported sequential operation; do not describe worktree execution as working on the strength of API availability alone.

### Slice 7 — Evaluate endpoints and release the opt-in features

**Depends on:** slices 2–6, with separate release gates for physical routing, virtual children and wave-parallel writing.

- With explicit credential/cost approval, evaluate Sol, GLM-5.3 and DeepSeek Flash on mechanical document updates, bounded implementation, ambiguous planning, and high-consequence review.
- Verify tool use, structured outputs, thinking behavior, context limits, inputs, and provider errors. No inference of serving health from catalog presence.
- Compare coordinator-directed allocation with static allocation using total tokens/cost, wall time, coordinator overhead, retries, and successful verified completion. For verified wave execution, also measure actual child overlap, capacity/provider contention, integration overhead and conflict recovery. Keep assignments bounded and run providers only where data policy permits.
- Record default recommendations as measured operator examples, not universal capability rankings. Do not claim cost savings if the evidence does not show them.

**Acceptance:** full regression/build/RPC suite passes, approved endpoint evidence is recorded (or explicitly deferred), optional integration limitations are published, and no routing is enabled without operator opt-in.

## 8. Verification and rollback

For each code slice: `npm run check`, `npm test`, `npm run build`, and `npm run release:check`. Run no-key live Pi tests for API-facing changes. Add a minimum/locked/latest Pi compatibility matrix and preserve package-local GSD command/guard smoke tests. No standalone linter is currently configured.

Mandatory routing cases: parallel same-role tasks; unknown upstream roles; locks versus coordinator overrides; unavailable inventory; missing credentials; recursive inherit/aliases; unsupported images; context compaction; config reload/revocation; branch resume; direct requests; and a disallowed physical model behind an allowed virtual alias.

Mandatory wave cases: actual same-wave child overlap with different model assignments; next-wave barriers; verified worktree capability and single lifecycle ownership; serialized merge/reconciliation; shared-state write ownership; conflict/cancellation/restart recovery; no duplicate plan launches; and safe refusal of dirty or unresolved-isolation execution. Use isolated test repositories, never the user's active working tree, for destructive lifecycle tests.

Rollback is operator-controlled: disable virtual selection and task overrides, select an explicit physical coordinator, and use legacy physical resolution. Keep configuration migration reversible and preserve unknown fields. Removing virtual registration may make Pi resume the last physical responder; document this behavior rather than claiming it restores the desired coordinator automatically.

For wave execution rollback, stop new dispatches and reconcile or retain all existing children/worktrees before changing execution mode. Disabling an integration must never imply deleting live or unmerged work. Select a supported sequential mode only through explicit upstream/operator configuration; leave recovery artifacts available.

Release gates do not require silently changing pi-subagents, adding a classifier service, or enabling cross-provider fallback. Unresolved integration gates must remain visible, not be reported as passed because tests were skipped.

## 9. Source references

- [Pi 1.0.0 release notes](https://github.com/earendil-works/pi/releases/tag/v1.0.0)
- [Pi 1.0.1 release notes](https://github.com/earendil-works/pi/releases/tag/v1.0.1), including the brace-expansion fix and removal of the published shrinkwrap
- [Pi 1.0.1 virtual-model contract](https://github.com/earendil-works/pi/blob/v1.0.1/packages/coding-agent/docs/virtual-models.md)
- [Pi 1.0.1 extension contract](https://github.com/earendil-works/pi/blob/v1.0.1/packages/coding-agent/docs/extensions.md)
- [Pi 1.0.1 router example](https://github.com/earendil-works/pi/blob/v1.0.1/packages/coding-agent/examples/extensions/jev-router.ts): useful API example, not GSD workflow policy
- GSD Core 1.15.0 installed package: shared model catalog, model resolver, public host-integration SDK and model adapter; inspected directly during the audit/refresh
- GSD Core 1.15.0 installed execute-phase workflow and executor-isolation-dispatch fragment: sequential waves, eligible within-wave parallelism, fail-closed isolation, worktree manifests and reconciliation; its capability registry Pi entry declares isolation `none`
- Installed pi-subagents child-profile fork: child-session factory, model-scope checks, model/extension-loading documentation, and workflow worktree lifecycle documentation; source inspection only, not completed virtual-child or GSD wave/worktree integration tests
- [Slice 0 compatibility findings and contract decisions](ROUTING-COMPATIBILITY-SPIKE.md)
- [Existing adapter boundaries](DESIGN.md) and [maintenance verification guidance](MAINTENANCE.md)
