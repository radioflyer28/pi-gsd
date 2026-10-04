# Upstream GSD Core proposals for Pi integration

These are contribution candidates for `open-gsd/gsd-core`, not behavior that `pi-gsd` should emulate or patch locally.

## 1. Publish a stable host-integration SDK export

Expose the negotiated host-integration SDK through a documented package export instead of an internal `gsd-core/bin/lib` path. Include the protocol version, serialized handshake helpers, and an explicit compatibility policy.

**Why:** Pi adapters can report negotiated degradation safely without layout-sensitive deep imports.

## 2. Add a Pi-plugin conformance fixture

Provide a black-box test covering installation location, `/gsd` quote-aware dispatch, `gsd_invoke` validation, completion data, provider-request fail-open behavior, and every declared lifecycle bridge.

**Why:** The plugin currently carries event/model assumptions that cannot be proved by package-shape tests alone.

## 3. Make native Pi model and hook behavior configurable

Support explicit, documented opt-outs for native model steering and lifecycle hooks, and expose their effective state in a read-only diagnostic command.

**Why:** Provider-neutral adapters need a safe migration path without running competing model policies or duplicate GSD surfaces.

## 4. Expose read-only capability introspection

Add an engine command that reports the versioned, negotiated host capability profile and intentional degradation. It should not perform installation, mutate workflow state, or prescribe a host-specific policy.

**Why:** Thin adapters can surface accurate doctor output while GSD Core remains the owner of workflow semantics.

## 5. Bind live host dispatch capabilities to workflow isolation

Provide a supported, scoped registration/transport contract for a host adapter to supply verified isolation/capacity and an external child lifecycle. CLI isolation inspection and execution must consume the same binding, preserving run/plan/worktree identities, fail-closed validation and upstream completion reconciliation.

**Why:** the public SDK handshake currently returns negotiated data, but the CLI resolves isolation from the installed runtime registry. Pi's entry declares `none`, even when an optional extension can run children in externally owned worktrees. Merely forcing a label does not supply a backend. Avoid requiring adapters to edit installed registry files or masquerade as another runtime. See the [reproducible compatibility spike](ROUTING-COMPATIBILITY-SPIKE.md).

## 6. Export agent routing-tier metadata

Expose a versioned, read-only agent catalog containing `routingTier` (`heavy`, `standard`, `light`) through a public SDK export or query. Keep it distinct from effective model-profile tiers returned by `resolve-model --pick tier`.

**Why:** provider-neutral hosts can follow new upstream roles without copying the roster or depending on the private shared-catalog layout.

## Non-goals

`pi-gsd` should not fork upstream command prompts, add another native `/gsd` or `gsd_invoke`, simulate a GSD subagent loop, or write workflow state outside `.planning/`.
