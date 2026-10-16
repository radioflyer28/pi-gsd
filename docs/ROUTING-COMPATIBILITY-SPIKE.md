# Routing compatibility spike: findings and decisions

Status: completed bounded investigation; not a claim of working wave execution.

## Reproduction and evidence

Run from this repository with Node >=24 and installed package dependencies:

```text
node --experimental-strip-types scripts/routing-compatibility-spike.mjs
node --experimental-strip-types scripts/routing-compatibility-spike.mjs <trusted-pi-subagents-package-root>
```

The optional argument copies the trusted fork's source and manifest into the temporary fixture, links that snapshot to this repository's installed peers, and imports the snapshot's child-factory implementation. The report includes the fork version, child-factory source SHA-256 and explicit dependency context; the installed fork is never changed. It is a diagnostic probe only, not a production dependency. The script creates and removes a temporary Git repository and a worktree; no Git mutation targets the user's checkout. It never calls a model or starts a real child. Child-factory probes use an injected SDK and stop before session creation.

Historical baseline: GSD Core 1.15.0, local Pi dependencies 1.0.1 and the then-installed `v0.71.0-child-profiles.1` fork (package version 0.71.0). The virtual-registration failure below is historical, not an assertion about newer fork source:

| Probe | Observed result | What it establishes |
| --- | --- | --- |
| Public SDK handshake with a proposed host descriptor | `orchestrator-worktree`, concurrency 2 | SDK accepts those declared capabilities as data; not proof the host implements them |
| Actual package-local `query inspect-dispatch-isolation --json` after handshake | Pi, `none`, no exec descriptor/flag | SDK handshake does not register the proposed descriptor with CLI workflow dispatch |
| Read-only query filesystem check | Temporary checkout remains clean | Probe uses the inspect verb, not the sentinel-writing dispatch query |
| Physical child factory given an external worktree cwd | Same cwd reaches settings, loader, storage and session creation | Low-level cwd forwarding works with an injected SDK; not a full launch/profile/permission test |
| Pending virtual definition at child startup | Not registered when launch model is resolved | Reproduces the queue-ordering concern with an injected SDK; no real-Pi child inference was tested |

Source inspection explains the CLI result: the dispatch resolver reads the installed runtime capability registry. The public SDK handshake is pure and returns a negotiated value; it does not bind a live dispatch backend or persist a runtime override. Pi's descriptor declares isolation `none`. Forcing an isolation label would not supply the missing backend and is not an acceptable integration.

## Pi 1.3.0 / GSD Core 1.17.0 probe contract

The refreshed probe retains the real CLI isolation check (`pi`, `none`) independently of SDK negotiation. The current optional source snapshot is expected to register and drain the queued virtual definition, refresh with `allowNetwork: false`, resolve the exact virtual model, and reach the session-creation boundary in that order. It still stops before creating a session. Missing registration now fails the probe rather than being its expected outcome.

A missing `typebox` in the installed fork's resolution context motivated the snapshot's explicit repository-peer binding. Passing this test does not repair or validate that installed context. Consult the generated report's version/hash rather than assuming a historical fork tag describes today's independently changed source. Real-Pi virtual dispatch, credentials, child profiles/permissions, live inference and two-plan overlap remain unverified and independently gated.

Observed with the refreshed probe against Pi 1.3.0 / GSD Core 1.17.0 and the independently updated installed fork, package version `0.78.0-child-profiles.1`:

- External worktree cwd reached settings, resource loading, storage and session-creation boundary unchanged.
- Virtual registration, offline refresh, resolution and session-creation boundary occurred in that order; the queue was drained and the exact virtual model reached the boundary.
- Child-factory source SHA-256: `6d2e3e9e9303fa6a844b9774e3d54bd6a1b852d20576fa363a7a7b0acb1ca049`.
- The original fork's manifest and child-factory hashes were identical before and after the probe. No live child or model request was made.

## Between-wave host operations

The fork documents a public `registerWorkflowResource` seam. A trusted loaded extension can register a named workflow with exact finite host-command grants. Raw inline workflow scripts receive no such authority. Resource resolution must be synchronous and free of I/O, and grants do not provide a general Pi tool callback.

This is a candidate transport for bounded between-wave commands, not a ready-made GSD scheduler. Do not generate a second workflow engine or shell-interpolate task prompts/paths to exploit it. Implementing a resource requires a separately reviewed, bounded upstream operation contract, extension lifecycle cleanup, and optional-package module-resolution verification. No resource was registered during this spike.

## Decision

1. **Proceed with physical model routing and upstream tier metadata.** These do not require the missing wave backend or virtual-child registration fix.
2. **Do not advertise parallel writing support yet.** Prefer GSD-owned worktrees and externally bound child cwd, but require a supported live capability/dispatch seam that connects the CLI isolation decision, child identities and upstream reconciliation. See the upstream proposals document.
3. **Keep physical child model references as the consumer default.** Virtual children remain independently gated even when the injected queue-ordering probe passes. Do not patch the installed fork implicitly.
4. **Keep one lifecycle owner.** Do not combine GSD branch/manifest cleanup with pi-subagents' managed-worktree patch capture and automatic cleanup.
5. **Do not pretend the two-plan overlap test passed.** It remains slice 6's acceptance gate; this spike intentionally stops at the missing host contract rather than fabricating a scheduler to demonstrate concurrency.

## Configuration and evidence contract

- The initial child launch always carries the parent's resolved, provider-qualified physical model and thinking. A missing child-local routing file must not silently replace that decision.
- Routing policy is read from the explicit Pi execution cwd. This first slice does not search parent directories, silently follow another worktree's config, or copy ignored files. Worktree-aware policy lookup is a separate verified integration.
- Record the resolved config path and a content revision on each decision. This is provenance, not authentication. The child profile and model scope retain their own authority.
- Valid version-1/unversioned configuration retains legacy routing behavior. Version 2 uses strict validation and fail-closed resolution. Unreadable, malformed JSON and non-object roots fail closed for either format: a corrupt version marker cannot safely identify a legacy policy. Missing files still use defaults. New coordinator overrides remain disabled unless explicitly configured and supported by the tool contract.
- Slice 1 implemented physical policy loading, provenance, upstream catalog tiers and pin metadata with disabled future-feature switches. Slice 2 now enables task overrides only with explicit version-2 opt-in and an allowed-tier list; virtual routing still fails closed when enabled.
- Existing explicit role-model assignments are pins by default. A future version-2 rule may set `locked: false` to make one overridable. `locked: true` freezes the effective route even when expressed as a tier. A task tier replaces the whole role default model/thinking selection; it is not a shallow merge with a leftover role model.
- The task override surface accepts configured tier names, not arbitrary coordinator-supplied model IDs. Requested overrides that violate pins or policy return `resolve-first`. Each immutable result has a fresh decision ID even when task labels repeat; the dispatcher returns this same snapshot to the caller and advisory. Provider-effective thinking is not claimed by resolution.
- The subagent tool has no native GSD decision association. Slice 2's bounded, turn/session/branch/cwd-scoped advisory does not parse scripts/prompts or invent extra launch fields. Only a unique legacy direct-role attempt is consumed; task-scoped, generic-worker, scripted and differing-cwd launches remain explicitly unverified, with unrelated decisions retained.
- Distinguish launched, running, terminal, artifact-complete, integrated and verified evidence. Those are observations of upstream/child records, not a new durable GSD state machine. A launch receipt is not completion; a final message is not artifact verification; artifact completion is not integration.
- Keep release gates independent: physical routing, virtual selection/dispatch, virtual child launch, and wave-parallel writing. A blocked later gate must not be advertised as supported by earlier tests.

## Remaining external contracts

GSD needs a supported way to bind a live host's verified isolation/capacity and external child lifecycle to the CLI workflow's dispatch/reconciliation decisions. The contract must preserve fail-closed behavior, scoped identity, and recovery without editing the installed registry or spoofing another runtime. A tier-catalog query/export would also remove the need for a narrowly isolated read-only catalog adapter.

The current fork's virtual queue flush is exercised with an injected SDK; a real SDK/child launch regression remains a separate gate. The spike deliberately does not claim that foreground/background/profile-isolated virtual launches work or fail identically.

See [implementation plan](MODEL-ROUTING-PLAN.md) and [upstream proposals](UPSTREAM-PROPOSALS.md).
