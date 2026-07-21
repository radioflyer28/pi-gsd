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

## Non-goals

`pi-gsd` should not fork upstream command prompts, add another native `/gsd` or `gsd_invoke`, simulate a GSD subagent loop, or write workflow state outside `.planning/`.
