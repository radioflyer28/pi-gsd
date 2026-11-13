# Package design review and implementation contract

## Purpose and scope

This review is for maintainers deciding how to improve pi-gsd without taking over
GSD Core workflows or pi-subagents execution. It covers the local working tree,
including the runtime-profile, provider-binding and CLI-identity repairs. It is
not a comprehensive security audit or a credentialed workflow acceptance report.

## Assessment

Keep the architecture. GSD Core owns workflow and artifact semantics; pi-gsd owns
Pi adaptation; pi-subagents owns child execution and launch policy; context-mode
owns optional context processing. Thin ownership should not mean weak interfaces.
Do not add a second orchestrator, duplicate profile registry, copied workflow
engine, ambient tool inheritance, or another public tool merely to rename `gsd`.

## Findings captured before implementation

1. **High — unreliable execution outcomes.** A CLI exit code of 7 was returned as
   ordinary text without structured failure information. A host result with
   `code: 0, killed: true` was rendered as successful exit. Execution state must
   not be inferred from prose or default a missing exit code to success.
2. **High — codemode receives prose instead of a stable result.** The tool had no
   output schema/structured content; useful `details` were not the codemode return
   value. A roughly 20 KB JSON response lost its opening bytes through truncation.
   Separate machine results from display text, expose completeness, and provide
   bounded temporary-file recovery for oversized output.
3. **Medium — lazy owner activation is misdiagnosed.** With `subagents_enable`
   active and `subagent` registered but inactive, profiles registered successfully
   while doctor reported inline mode and recommended reload. Report activation
   availability explicitly; never activate delegation without authorization.
4. **Medium — mandatory shell failure is too broad.** Windows PowerShell validation
   happened before individual role compilation, rejecting file-only roles too.
   Missing providers should omit only roles that require them. Registry collisions
   and malformed owner acknowledgements should still roll back the batch.
5. **Medium — disk metadata is not loaded-owner provenance.** An active tool and
   a package found in a conventional installation directory can belong to different
   sources. Label loaded provider evidence separately from installed candidates;
   neither a version nor registration alone proves inspection/startup compatibility.

The existing 197 tests passed during review. Focused probes reproduced these gaps;
passing baseline tests did not establish the missing contracts.

## Implementation decisions

- Keep the single `gsd` tool and existing actions. Introduce a versioned structured
  result with an explicit `ok` flag. Expected CLI failures resolve as data so
  codemode can inspect stderr and branch safely; invalid tool arguments still fail
  through Pi validation. Always inspect `ok` before using dependent results.
- Normalize success, failure, cancellation, termination, output-limit and unknown
  outcomes. Preserve nullable exit codes and signals. No missing status implies
  success. Parse JSON only from complete, valid, successful stdout.
- Bound captured output and inline machine output independently from display text.
  Oversized results may be recovered through private temporary files; record whether
  the saved output is complete. Never store execution transcripts in `.planning/`.
- Keep runtime identity subprocess-local. Keep canonical CLI JSON unchanged and
  runtime-registration evidence separate and cwd-scoped.
- Describe the optional owner as absent, inactive, activation-available, active or
  project-disabled. `activation-available` is not authorization or child readiness.
- Bind only approved provider sources. Shell-dependent roles can be unavailable
  without preventing file-only roles from registering.
- Give leaf children leaf execution guidance, not parent coordination instructions.
  Model routing, profile inspection and owner launch policy remain separate checks.
- Test structured results through real codemode, not just direct TypeScript calls.
  Keep ordinary cross-platform CI and an explicit, pinned optional-owner matrix;
  do not imply that an untested minimum version or live network workflow passed.

## Verification and rollout

Required checks: source/test typechecks, full tests, build, release metadata,
visible slash-command smoke tests, structured codemode success/failure/JSON probes,
owner registration/activation/provider-failure tests, and package dry-run.
Existing sessions require reload after their active work finishes. The structured
codemode result replaces the previous string result: update scripts to use `ok`,
`execution`, `modelRouting`, `runtimeAgents` and `text`, not prose parsing.

No commit, publication, global configuration change or project workflow execution
is authorized by this document. Record actual verification results below after
implementation; keep untested platforms, host versions and live workflows explicit.

## Implementation status

Implemented locally; not committed or published. The original findings above are
retained as the pre-change record.

- `src/extension/core-execution.ts` owns transport selection, subprocess-local Pi
  identity, normalized outcomes, bounded native capture and temporary recovery.
- `src/extension/tool-result.ts` declares the version-1 output schema and produces
  structured content alongside human text. Non-success execution sets both
  `ok: false` and the tool error flag; real codemode preserves the structured data.
- Capability reporting distinguishes lazy activation, execution availability,
  loaded provider paths and conventional installed candidates. The activation tool
  alone is sufficient evidence of activation availability, not execution authority.
- Missing Windows shell bindings preserve file-only profiles. Required unavailable
  roles remain explicit; registration collision rollback is unchanged.
- Runtime roles receive leaf-specific guidance. Tool guidance labels parent
  coordination separately. The adapter does not activate or launch children itself.
- `scripts/compatibility-matrix.mjs` provides an opt-in, exact-owner-commit gate
  across explicitly supplied SDK roots, without installing optional packages.

### Verification observed

On native Windows, Node **24.22.2**:

| Gate | Result |
| --- | --- |
| `npm run check` | Source and test typechecks passed |
| `npm test` | **216 passed, 0 failed** (197 baseline plus 19 contract regressions) |
| `npm run build` | Passed |
| `npm run release:check` | Passed; adapter remains `1.19.0-pi.2`, Core `1.19.0` |
| Visible RPC, Pi 1.3.0 and 1.5.2 | 78 commands; doctor/init reports visible; no model turns |
| Native-child matrix, Pi 1.3.0 and 1.5.2 | **18 cases per SDK, 36 total**, passed |
| `npm pack --dry-run --json` | 37 entries; both new runtime modules and this review included |
| `git diff --check` | Passed (Git emitted existing LF/CRLF conversion notices) |

The child matrix exercised structured success/failure/init JSON through real
codemode, runtime-only role inspection, both native modes, policy narrowing,
provider loading, and anchored multi-file edits with atomic failed-batch rollback.
The research provider check was registry/schema-only, not a network request.

Owner input was the reviewed local `pi-subagents-0.88.1` checkout at commit
`83cf25f86b6a70ab917a7e198d0153bc32309f29`, **with local inspection repairs**.
The matrix recorded source SHA-256
`6abfa5f19dcdc3a77a84062d110c991820fa1c00022781190c17061e598dccef`
and `dirty: true`. This is not a claim that stock npm 0.88.1 passed.

### Remaining boundaries

- Minimum-owner 0.86.0 acceptance, credentialed web/model workflows, ambient package
  discovery and existing-session reload remain unverified. Ubuntu WSL/Pi 1.5.2
  acceptance is recorded below; other Unix platforms and Linux Pi 1.3 remain unverified.
  Ordinary cross-platform CI remains unchanged; the optional-owner matrix is an
  explicit local/CI invocation, not an automatic download or dependency.
- Native capture is capped at 8 MiB per stream; inline machine streams at 64 KiB.
  Pi 1.5.2's host executor supports the requested combined capture cap. Pi 1.3.0's
  host executor does not enforce `maxBuffer`; normalization still bounds returned
  and saved output, but cannot retroactively bound that host's intermediate memory.
  Windows package-local shims use the bounded native transport.
- Recovery output is private OS scratch data retained for later reads until
  OS/operator cleanup. A recovery write failure is reported, never hidden behind a
  complete-output claim. Never treat a truncated stream as complete JSON.
- This changes codemode's old string return into an object. Update consumers before
  rollout and reload existing sessions only when their current work is idle.
- No commit, push, publication, shared configuration edits, model/web calls or
  resumption of geopack planning were performed for this change.

### Follow-up hardening

The follow-up review reproduced two missing cases: inherited pipes delayed a
200 ms timeout until a descendant exited, and failed stdout recovery followed by
successful stderr recovery incorrectly restored `fullOutput.complete: true`.
The follow-up changes separate process exit from bounded pipe draining, escalate
termination with an explicit unconfirmed flag, and keep recovery failure sticky
across both streams. Native leaf profiles now use `src/extension/leaf.ts`, which
shares the same tool implementation but omits parent-coordination tool guidelines
and child-profile registration. Manual leaf templates use that entrypoint too.
Follow-up verification passed on native Windows, Node 24.22.2:

- **227 tests passed**, including 11 additional cleanup/recovery/leaf regressions;
  source and test typechecks, build, and release metadata checks passed.
- The exact-owner-commit compatibility matrix passed again on Pi **1.3.0 and
  1.5.2**: **36 native child cases**, plus visible doctor/init RPC on both hosts.
  Each native child now checks the actual registered `gsd` provider path and tool
  guidelines: `leaf.ts` is loaded and parent-coordination guidelines are absent.
- Final focused cleanup/leaf tests passed **11/11**; package dry-run includes
  **38 entries**, including `leaf.ts`; `git diff --check` passed.

The earlier verification table records the preceding revision. Owner input and
platform/credentialed acceptance limitations remain as documented above. Forced
termination escalation and missing exit acknowledgements were exercised with
controlled process doubles; actual Windows inherited-pipe and normal cancellation
paths were exercised too. At that checkpoint actual POSIX signals were still
untested; the subsequent Ubuntu acceptance below closes that specific gap.

Process exit cancels the execution deadline immediately; inherited pipes get a
200 ms drain window. Cancellation, timeout and overflow request SIGTERM, escalate
to SIGKILL after 250 ms, and wait at most another 1,000 ms for exit confirmation.
`captureIncomplete` and `terminationUnconfirmed` disclose uncertainty separately.
A zero exit with incomplete capture produces `incomplete-output` and `ok: false`;
completed work is not mislabeled cancelled merely because an abort arrives while
draining pipes. No descendant lifetime policy or automatic retry was introduced.

Native runtime profiles select the leaf entrypoint automatically after reload.
Manually configured leaf profiles should replace the pi-gsd `index.ts` provider
with `leaf.ts`; parents keep `index.ts`. Load only one per session, and reload
only when active work is idle. No shared profile/configuration files were changed.

### Ubuntu WSL acceptance

**Passed on Ubuntu 24.04.5 LTS, WSL2, x86_64**, kernel
`6.6.87.1-microsoft-standard-WSL2`, native Linux Node **24.14.0**, Pi **1.5.2**.
This used Linux Node/Bash, not Windows execution through WSL interop.

| Gate | Observed result |
| --- | --- |
| Source/test typechecks, build, release metadata | Passed |
| Full Ubuntu test suite | **228 passed, 0 failed** |
| Actual POSIX cancellation, timeout and overflow | SIGTERM-resistant processes escalated to **SIGKILL**; exit/reaping confirmed |
| Actual Pi host executor | Separate Node argv, requested capture cap, successful Core CLI Pi identity despite inherited Claude runtime, parent env preserved |
| Visible offline RPC | **78 GSD commands**, doctor/init reports visible, no model turn |
| Equipped native-child matrix | **18 passed**: nine roles, foreground and detached modes, Bash and gsd direct/codemode, real leaf-provider metadata |
| Authoring/web providers | Anchored reads, creation, multi-file edits and rollback passed; web registry/schema checks only |
| Linux and Windows pack dry-runs | **38 entries**, leaf provider included |
| Windows regression after portability fix | **228 passed**, typechecks/build/release checks passed |

`scripts/unix-acceptance-smoke.mjs` / `npm run test:unix` is the repeatable real
signal/host-executor gate. It refuses Windows Node. The ordinary suite separately
covers inherited-pipe draining, recovery completeness, and unconfirmed termination.

The owner was a temporary Linux checkout at
`83cf25f86b6a70ab917a7e198d0153bc32309f29`, overlaid with the reviewed local source
repairs. Its source hash matched the earlier Windows run:
`6abfa5f19dcdc3a77a84062d110c991820fa1c00022781190c17061e598dccef`.
This is acceptance of the **patched 0.88.1 source**, not stock npm 0.88.1.
The Linux multi-edit entrypoint matched the reviewed Windows entrypoint ignoring
line endings; Linux `pi-web-access` was **0.47.0** (Windows previously used 0.46.0).
No credentialed web requests were made.

Acceptance used a private `/tmp` source snapshot, existing Linux SDK dependencies,
local copies of Core/TypeScript, and temporary HOME/agent state. No downloads,
package installations or shared configuration changes were needed. Windows Git
worktree pointers are not portable to Linux; a disposable checkout was used rather
than modifying the real worktree metadata. The source/scripts/tests/package files
matched the working tree with SHA-256
`80c33ee5d5ea73eaa0ff677cf70a012ab4da77a36cfae7f8b6d68e16f6523b8b`.
The temporary acceptance checkout/home/agent state was removed afterward.

**Defect found and fixed:** the first Linux suite passed 226/227 because the
context-mode guard treated the `/tmp` ancestor as making every source file
transient. `src/extension/context-mode-guard.ts` now classifies directories relative
to project cwd. A regression distinguishes source files from actual project
`tmp/` and `logs/` files under both `tmp` and `build` ancestors. The corrected suite
passed on Ubuntu and Windows.

Still outside this gate: stock/minimum owner acceptance, Linux Pi 1.3, macOS and
other Unix distributions, ambient installed-package discovery, existing-session
reload, managed-process-provider policies, and credentialed end-to-end workflows.
No commit, publication, profile activation or geopack workflow resumption occurred.

## Stock tools and optional executor editing

The follow-up extends explicit `childProviders.multiEdit` support to `gsd-executor`
without making that extension mandatory. With no binding, stock authoring remains
`read`/`edit`/`write`, using the child's actual schema and separate file calls.
An explicitly requested but unavailable provider still reports affected roles as
unavailable instead of silently dropping requested capabilities.

On Windows a registered valid `pwsh` provider retains precedence. If no such
integration is registered, verified host builtin `powershell` metadata enables
stock bounded foreground validation. Hidden/broken registered pwsh providers are
not bypassed; custom tools merely named powershell do not qualify as builtins.
No Windows Bash fallback or managed-process integration was added. All profiles
retain codemode without widening the owner tool policy.

Verification: **244 Windows tests**, typechecks/build/release checks, **36 Ubuntu
profile/guidance tests**, and **72 Windows native-child cases** across Pi 1.3.0 and
1.5.2, foreground/detached modes, stock/enhanced tools. Stock executor file creation,
reads and edits, enhanced batch atomicity/rollback, and GSD/shell direct/codemode
paths passed. An offline fresh Pi 1.5.2 parent verified actual builtin shell
provenance and registration. The matrix still used the reviewed patched 0.88.1
owner, not stock owner acceptance. No session source selection or settings were
changed and no stopped project workflow was resumed.
