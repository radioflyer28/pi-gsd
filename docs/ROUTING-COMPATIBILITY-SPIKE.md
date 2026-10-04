# Routing compatibility spike: findings and decisions

Status: completed bounded investigation; not a claim of working wave execution.

## Reproduction and evidence

Run from this repository with Node >=24 and installed package dependencies:

```text
node --experimental-strip-types scripts/routing-compatibility-spike.mjs
node --experimental-strip-types scripts/routing-compatibility-spike.mjs <trusted-pi-subagents-package-root>
```

The optional argument imports the trusted fork's child-factory implementation into a separate process. It is a diagnostic probe only, not a production dependency. The script creates and removes a temporary Git repository and a worktree; no Git mutation targets the user's checkout. It never calls a model or starts a real child. Child-factory probes use an injected SDK and stop before session creation.

Observed against GSD Core 1.15.0, local Pi dependencies 1.0.1 and the unchanged `v0.71.0-child-profiles.1` fork (its package version is 0.71.0):

| Probe | Observed result | What it establishes |
| --- | --- | --- |
| Public SDK handshake with a proposed host descriptor | `orchestrator-worktree`, concurrency 2 | SDK accepts those declared capabilities as data; not proof the host implements them |
| Actual package-local `query inspect-dispatch-isolation --json` after handshake | Pi, `none`, no exec descriptor/flag | SDK handshake does not register the proposed descriptor with CLI workflow dispatch |
| Read-only query filesystem check | Temporary checkout remains clean | Probe uses the inspect verb, not the sentinel-writing dispatch query |
| Physical child factory given an external worktree cwd | Same cwd reaches settings, loader, storage and session creation | Low-level cwd forwarding works with an injected SDK; not a full launch/profile/permission test |
| Pending virtual definition at child startup | Not registered when launch model is resolved | Reproduces the queue-ordering concern with an injected SDK; no real-Pi child inference was tested |

Source inspection explains the CLI result: the dispatch resolver reads the installed runtime capability registry. The public SDK handshake is pure and returns a negotiated value; it does not bind a live dispatch backend or persist a runtime override. Pi's descriptor declares isolation `none`. Forcing an isolation label would not supply the missing backend and is not an acceptable integration.

## Between-wave host operations

The fork documents a public `registerWorkflowResource` seam. A trusted loaded extension can register a named workflow with exact finite host-command grants. Raw inline workflow scripts receive no such authority. Resource resolution must be synchronous and free of I/O, and grants do not provide a general Pi tool callback.

This is a candidate transport for bounded between-wave commands, not a ready-made GSD scheduler. Do not generate a second workflow engine or shell-interpolate task prompts/paths to exploit it. Implementing a resource requires a separately reviewed, bounded upstream operation contract, extension lifecycle cleanup, and optional-package module-resolution verification. No resource was registered during this spike.

## Decision

1. **Proceed with physical model routing and upstream tier metadata.** These do not require the missing wave backend or virtual-child registration fix.
2. **Do not advertise parallel writing support yet.** Prefer GSD-owned worktrees and externally bound child cwd, but require a supported live capability/dispatch seam that connects the CLI isolation decision, child identities and upstream reconciliation. See the upstream proposals document.
3. **Keep physical child model references as the consumer default.** Virtual registration remains independently gated against the unchanged fork. Do not patch the installed fork implicitly.
4. **Keep one lifecycle owner.** Do not combine GSD branch/manifest cleanup with pi-subagents' managed-worktree patch capture and automatic cleanup.
5. **Do not pretend the two-plan overlap test passed.** It remains slice 6's acceptance gate; this spike intentionally stops at the missing host contract rather than fabricating a scheduler to demonstrate concurrency.

## Configuration and evidence contract

- The initial child launch always carries the parent's resolved, provider-qualified physical model and thinking. A missing child-local routing file must not silently replace that decision.
- Routing policy is read from the explicit Pi execution cwd. This first slice does not search parent directories, silently follow another worktree's config, or copy ignored files. Worktree-aware policy lookup is a separate verified integration.
- Record the resolved config path and a content revision on each decision. This is provenance, not authentication. The child profile and model scope retain their own authority.
- Valid version-1/unversioned configuration retains legacy routing behavior. Version 2 uses strict validation and fail-closed resolution. Unreadable, malformed JSON and non-object roots fail closed for either format: a corrupt version marker cannot safely identify a legacy policy. Missing files still use defaults. New coordinator overrides remain disabled unless explicitly configured and supported by the tool contract.
- Slice 1 implements physical policy loading, provenance, upstream catalog tiers and pin metadata only. Version-2 fields for later features may be stored in their disabled form, but enabling task overrides or virtual routing before those slices exist must produce an actionable `resolve-first`, not silently accept an inert switch.
- Existing explicit role-model assignments are pins by default. A future version-2 rule may set `locked: false` to make one overridable. `locked: true` freezes the effective route even when expressed as a tier. A task tier replaces the whole role default model/thinking selection; it is not a shallow merge with a leftover role model.
- The initial task override surface accepts configured tier names, not arbitrary coordinator-supplied model IDs. Requested overrides that violate pins or policy return `resolve-first`.
- Distinguish launched, running, terminal, artifact-complete, integrated and verified evidence. Those are observations of upstream/child records, not a new durable GSD state machine. A launch receipt is not completion; a final message is not artifact verification; artifact completion is not integration.
- Keep release gates independent: physical routing, virtual selection/dispatch, virtual child launch, and wave-parallel writing. A blocked later gate must not be advertised as supported by earlier tests.

## Remaining external contracts

GSD needs a supported way to bind a live host's verified isolation/capacity and external child lifecycle to the CLI workflow's dispatch/reconciliation decisions. The contract must preserve fail-closed behavior, scoped identity, and recovery without editing the installed registry or spoofing another runtime. A tier-catalog query/export would also remove the need for a narrowly isolated read-only catalog adapter.

The fork's virtual model queue handling needs a real SDK regression test and, if confirmed, a separately authorized compatibility fix. The current spike is deliberately not a claim that all foreground/background/profile-isolated virtual launches fail identically.

See [implementation plan](MODEL-ROUTING-PLAN.md) and [upstream proposals](UPSTREAM-PROPOSALS.md).
