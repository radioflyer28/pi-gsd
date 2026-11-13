# Approval-gated repair of pi-subagents runtime-only lookup

For a **parent agent** helping an operator restore inspection of registered GSD
roles. This is a narrow owner repair, not a pi-gsd installer or an authorization
to delegate. pi-gsd's nondelegated operations do not require this patch.

## 1. Establish evidence before recommending changes

Run `gsd({action:"doctor"})`. Inspect
`capabilities.subagentCompatibility` in structured output (or `details.caps`):

| State | Meaning / next step |
| --- | --- |
| `known-unpatched-source` | Exact reviewed 0.88.1 entrypoint and lookup file hashes match on disk at the registered tool provider. Explain the defect and offer the bounded repair below. |
| `known-patched-source` | Reviewed source patch is present on disk; do not reapply it. Verify the running owner separately. |
| `unknown` | Missing metadata, conflicting providers, changed files, unsupported layout/version or unreadable files. Investigate; do not infer a defect or apply this patch from version alone. |
| `not-loaded` / `disabled` | No applicable loaded owner evidence, or integration explicitly off. Do not install, activate or repair automatically. |

Detection is read-only. It follows registered `subagent` / `subagents_enable`
`sourceInfo.path`, not an arbitrary installed package candidate. Reads are bounded;
no owner modules are imported or executed. Fingerprints normalize CRLF to LF and
cover reviewed TypeScript, emitted JavaScript and npm bundle layouts. They do not
prove which bytes are cached in the current process, verify the entire import
graph, or certify every owner capability. `runtimeVerified` remains false.

The parent receives one advisory per source/project per extension lifecycle on a
natural model turn. Detection does not start a model turn or solicit approval
through a fabricated user message. Status/doctor remain available for inspection.

When inspection is authorized and the owner tools are active, compare:

```javascript
subagent({action:"list", options:{capabilities:true, search:"gsd-phase-researcher"}})
subagent({action:"get", agent:"gsd-phase-researcher"})
```

Choose an actually registered exact role if the researcher is unavailable. A
listed **runtime-only** role followed by `get` reporting not found is the known
symptom; an unfiltered list is capped and is not a reliable absence check.
Investigate scope/collisions if the role is not registered. Lazy activation still
requires its own authorization. A lookup defect is not proof of launch failure.

## 2. Ask the user and wait

Explain the evidence, affected provider/version, local checkout destination,
proposed source diff, verification commands and rollback. Prefer an approved,
verified upstream fixed release when one is available; do not claim a later
release is fixed without checking. This runbook's local fallback is only reviewed
for **0.88.1**, base commit
`83cf25f86b6a70ab917a7e198d0153bc32309f29`.

Use the host's question tool if available; otherwise ask in text and wait. Offer:

- **Prepare local repair:** create or use a specifically approved separate source
  checkout, patch and run local tests; leave active source selection unchanged.
- **Defer:** change nothing. Keep only the required child steps whose capabilities
  cannot be established paused; unrelated or upstream-permitted inline work may
  continue. Respect earlier refusals; do not repeatedly ask on each tool call.

Approval must name the scope. Preparing a checkout does **not** approve package
installation, downloads, settings edits, delegation, credentialed model/web calls,
publication or activation. If prerequisites need downloads, disclose the source
and obtain approval; preserve the operator's release-age and trust policies.
Cancellation, lack of an answer and noninteractive execution mean no permission.
A leaf agent escalates to its supervisor instead of repairing the owner.

**Completion:** an explicit user decision exists before the first mutation.

## 3. Prepare a reversible source-only repair

After approval, record the currently loaded provider and effective package
selection. Preserve unrelated settings, integration masks, tool ceilings, excludes,
trust policy, provider bindings and existing local changes. Use a separate checkout
rather than editing installed `node_modules` or compiled bundles in place.
Do not copy GSD role files, widen generic workers or install another orchestrator.

Verify the source checkout's origin and exact base commit above. Check that its
`src/agents/agent-management.ts` LF-normalized SHA-256 is:

```text
efc2b3c9ce51c2ba9b0ecfbffe48d90251aa7367baa6679a859a7f5be34a8926
```

An already-patched file instead hashes to:

```text
25c6f5df5d8bc6f7e94e293654324b07ebee7bd8baec6dfa62ec17d176e529b6
```

For that hash, skip patching and proceed to verification. For any other hash,
stop and review the differences; no fuzzy application or automatic downgrade.
The bundled [two-call patch](patches/pi-subagents-0.88.1-runtime-get.patch) passes
`ctx.runtimeAgentOwner` and `ctx.model?.provider` to both
`findAgentsInDiscovery` and `availableAgentNamesFromDiscovery` inside `handleGet`.
Existing helpers retain scope, collisions, exclusions and immutability semantics.

From the approved source checkout, substitute the absolute bundled patch path:

```text
git apply --check <absolute-patch-path>
git apply <absolute-patch-path>
```

Use the host's anchored edit tool for the same two replacements if required by
its editing policy. Recheck the original hash immediately before editing. The
result must match the patched hash above and contain only those two source changes.
Keep the patch available for reversal; do not reset or clean unrelated changes.

**Completion:** the exact patched source hash and narrow diff are recorded.

## 4. Validate before activation

Use the checkout's existing approved dependencies and scripts; a missing dependency
is a setup blocker, not permission to install. At this base, run:

```text
npm run typecheck
node --experimental-strip-types --import ./test/support/isolated-temp-root.mjs --test test/unit/runtime-agent-registration.test.ts
npm run build:pkg
```

The original owner tests alone do not prove this fix. Add/run a focused regression
in the isolated checkout: register a runtime-only sentinel via the supported
owner API, inspect canonical name and alias in both/user/project scopes, check
provider-specific model resolution, unknown-name listing, cross-owner isolation,
configured collisions, and rejection of runtime-profile mutation. Test-only
internal instrumentation is not a production integration interface.

Also run pi-gsd's no-model compatibility matrix from a maintained pi-gsd source
checkout with the approved SDK/provider inputs (scripts are not shipped in the
installed package):

```text
npm run test:compatibility -- <owner-source-root> 83cf25f86b6a70ab917a7e198d0153bc32309f29 <sdk-root>
```

See [profile validation](SUBAGENT-PROFILES.md) for platform provider environment
variables and gates. Record actual exit statuses, source identity and limits.
If the matrix or prerequisites are unavailable, say verification is incomplete;
do not advertise the repair as accepted or switch the active source.

## 5. Obtain activation approval, restart and verify

Show the exact source-selection change and rollback before asking separately to
activate. Select **one** owner source with the host's documented package/extension
configuration, preserving unrelated settings. Do not load stock and patched owners
together. Use a full idle-time Pi **restart**: Node may cache owner modules across
`/reload`, so reload alone is not proof that the patch is active.

In the fresh session, inspect loaded provider provenance, run doctor and exact-role
`list`/`get`, then verify required child tools/provider schemas in the intended
execution mode. Source hashes, registration, lookup, child startup and assignment
readiness are separate evidence. Credentialed workflow validation needs approval.

If activation or verification fails, restore only the approved source-selection
change from the recorded previous state and restart. Keep the isolated checkout
for diagnosis or remove it only with approval. To reverse the two source changes,
first check the patched hash and use `git apply --reverse --check`, then reverse
the same patch (or use anchored edits); preserve later unrelated changes.

**Completion:** report whether the repair is merely prepared/tested or actually
active and verified. No commit, push, publication or workflow resumption is implied.
