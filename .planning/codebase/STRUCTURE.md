# Codebase Structure

**Analysis Date:** 2026-06-08

## Directory Layout

```text
pi-gsd/
├── .github/                 # GitHub automation and CI workflows
│   └── workflows/           # Workflow YAML files
├── .pi/                     # Project-local Pi settings; no project skills detected here
├── .planning/               # Canonical GSD-compatible project records and generated maps
│   ├── codebase/            # Codebase map documents written by GSD mapping tasks
│   └── intel/               # GSD research/intelligence artifacts
├── docs/                    # Maintainer and user documentation
│   ├── DESIGN.md            # Architectural boundaries and implementation guidance
│   └── USAGE.md             # Usage-oriented documentation
├── prompts/                 # Pi prompt resources exported by the package
│   └── gsd-review-loop.md   # Review-loop prompt resource
├── scripts/                 # Developer/runtime smoke scripts
│   └── live-pi-rpc-smoke.mjs # Live Pi RPC extension registration smoke test
├── skills/                  # Pi skill resources exported by the package
│   └── pi-gsd/SKILL.md      # Agent guidance for using pi-gsd safely
├── src/                     # TypeScript extension source
│   ├── extension/           # Pi extension implementation modules
│   └── types/               # Ambient SDK declarations used by TypeScript
├── tests/                   # Node test-runner tests and test doubles
├── extension-manifest.json  # Pi package manifest metadata
├── package.json             # Node package metadata, scripts, Pi resource entries
├── package-lock.json        # npm lockfile
└── tsconfig.json            # TypeScript compiler settings
```

## Directory Purposes

**`src/extension/`:**
- Purpose: Contains all runtime code that Pi loads for the `pi-gsd` extension.
- Contains: Extension entry point, registration layer, dispatcher, capability discovery, upstream command discovery, model routing, and context-mode guardrails.
- Key files: `src/extension/index.ts`, `src/extension/register.ts`, `src/extension/dispatcher.ts`, `src/extension/capabilities.ts`, `src/extension/gsd-core-commands.ts`, `src/extension/model-routing.ts`, `src/extension/context-mode-guard.ts`.

**`src/types/`:**
- Purpose: Declares the small subset of Pi SDK and Pi AI API types consumed by this package.
- Contains: Ambient module declarations for `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai`.
- Key files: `src/types/pi-sdk.d.ts`.

**`tests/`:**
- Purpose: Unit and integration-style tests for extension modules using Node's built-in test runner.
- Contains: One test file per runtime module plus shared fake Pi helpers.
- Key files: `tests/register.test.ts`, `tests/dispatcher.test.ts`, `tests/capabilities.test.ts`, `tests/model-routing.test.ts`, `tests/context-mode-guard.test.ts`, `tests/gsd-core-commands.test.ts`, `tests/test-utils.ts`, `tests/smoke.test.ts`.

**`docs/`:**
- Purpose: Human-facing design and usage documentation for maintainers and users.
- Contains: Architecture boundary decisions, optional integration guidance, and usage examples.
- Key files: `docs/DESIGN.md`, `docs/USAGE.md`.

**`skills/`:**
- Purpose: Pi skill resources exported through the `pi.skills` entry in `package.json`.
- Contains: The `pi-gsd` skill used by agents when running GSD workflows through Pi.
- Key files: `skills/pi-gsd/SKILL.md`.

**`prompts/`:**
- Purpose: Pi prompt resources exported through the `pi.prompts` entry in `package.json`.
- Contains: Reusable prompt content for GSD review-loop workflows.
- Key files: `prompts/gsd-review-loop.md`.

**`scripts/`:**
- Purpose: Developer scripts that exercise runtime integration outside the unit test harness.
- Contains: Live Pi RPC smoke test.
- Key files: `scripts/live-pi-rpc-smoke.mjs`.

**`.planning/`:**
- Purpose: Canonical GSD project records and generated planning/codebase artifacts.
- Contains: Codebase maps, project configuration, and GSD intelligence artifacts.
- Key files: `.planning/config.json`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

**`.pi/`:**
- Purpose: Project-local Pi settings.
- Contains: Pi settings only in this repository; no `.pi/skills/` project-skill directory is present.
- Key files: `.pi/settings.json`.

## Key File Locations

**Entry Points:**
- `src/extension/index.ts`: Default Pi extension export; registers the `gsd` tool and context-mode guard.
- `package.json`: Declares the package as ESM, points Pi at `./src/extension/index.ts`, and exports `./skills` and `./prompts`.
- `extension-manifest.json`: Declares package metadata and provided public tools/commands for Pi packaging.
- `scripts/live-pi-rpc-smoke.mjs`: Live RPC smoke entry used by `npm run test:live-pi`.

**Configuration:**
- `package.json`: Defines scripts (`typecheck`, `build`, `test`, `test:live-pi`), dependencies, peer dependencies, Node engine, and Pi resource locations.
- `package-lock.json`: Locks npm dependency versions.
- `tsconfig.json`: Configures TypeScript compilation for source and ambient declarations.
- `.pi/settings.json`: Project-local Pi settings; do not treat it as extension source.
- Optional `.pi-gsd/model-routing.json`: Wrapper-private model routing config consumed by `src/extension/model-routing.ts` when present.
- `.planning/config.json`: GSD project configuration; keep normal GSD-compatible project records in `.planning/`.

**Core Logic:**
- `src/extension/register.ts`: Add or change Pi tool/command registration behavior here.
- `src/extension/dispatcher.ts`: Add or change status/doctor/run/resolve-model dispatch behavior here.
- `src/extension/capabilities.ts`: Add or change package-local or optional integration detection here.
- `src/extension/gsd-core-commands.ts`: Add or change upstream command markdown discovery and expansion here.
- `src/extension/model-routing.ts`: Add or change Pi-native model and thinking resolution here.
- `src/extension/context-mode-guard.ts`: Add or change context-mode guardrail decisions here.

**Testing:**
- `tests/test-utils.ts`: Add shared Pi API fakes and result helpers here.
- `tests/register.test.ts`: Test tool/command registration, command handlers, active tool inventory detection, and model-switch command behavior.
- `tests/dispatcher.test.ts`: Test cwd resolution, status/doctor formatting, `gsd-tools` dispatch, truncation, spawn fallback, and missing-tool handling.
- `tests/capabilities.test.ts`: Test capability path detection and optional integration mode computation.
- `tests/model-routing.test.ts`: Test routing defaults, target inference, config merging, availability checks, fallback policies, and formatted output.
- `tests/context-mode-guard.test.ts`: Test context-mode allow/warn/block decisions and Pi event hook integration.
- `tests/gsd-core-commands.test.ts`: Test upstream markdown command discovery and prompt expansion.
- `tests/smoke.test.ts`: Test package-level command availability assumptions.

**Documentation and Skills:**
- `README.md`: Keep public overview, installation, usage, and troubleshooting in sync with runtime behavior.
- `docs/DESIGN.md`: Keep architectural boundaries and maintainer guidance here.
- `docs/USAGE.md`: Keep detailed usage examples here.
- `skills/pi-gsd/SKILL.md`: Keep agent-facing Pi/GSD workflow guidance here.
- `prompts/gsd-review-loop.md`: Keep prompt-specific workflow content here.

## Naming Conventions

**Files:**
- Runtime modules use kebab-case descriptive names: `src/extension/model-routing.ts`, `src/extension/context-mode-guard.ts`, `src/extension/gsd-core-commands.ts`.
- The extension entry point is named `index.ts`: `src/extension/index.ts`.
- Ambient declarations use `.d.ts`: `src/types/pi-sdk.d.ts`.
- Tests mirror source module names with `.test.ts`: `tests/model-routing.test.ts`, `tests/context-mode-guard.test.ts`.
- Shared test helpers use descriptive utility names: `tests/test-utils.ts`.
- Documentation and GSD map files use uppercase names when they are durable reference artifacts: `README.md`, `docs/DESIGN.md`, `.planning/codebase/ARCHITECTURE.md`.

**Directories:**
- Runtime TypeScript belongs under `src/extension/`.
- Type declarations belong under `src/types/`.
- Tests belong under top-level `tests/` rather than co-located with source.
- Pi package resources belong under top-level `skills/` and `prompts/` and are referenced from `package.json`.
- GSD-compatible artifacts belong under `.planning/`.
- Wrapper-private project config belongs under `.pi-gsd/` only when needed; do not create `.gsd/`.

## Where to Add New Code

**New Pi Tool Parameter or Public Tool Behavior:**
- Primary code: `src/extension/index.ts` for schema additions; `src/extension/register.ts` for execution routing.
- Tests: `tests/register.test.ts` and, when schema/resources change, `tests/metadata.test.ts` or `tests/smoke.test.ts`.
- Guidance: Keep the public tool named `gsd`; add actions only when they remain thin adapter operations.

**New Fixed Slash Command:**
- Primary code: `src/extension/register.ts`.
- Tests: `tests/register.test.ts`.
- Documentation: `README.md`, `docs/USAGE.md`, and `extension-manifest.json` if the command is public.
- Guidance: Use `gsd-*` names; do not add broad commands such as `/status` or `/run`.

**New Upstream GSD Command Handling:**
- Primary code: Prefer no local code. Add or update command markdown upstream in `@opengsd/gsd-core` when semantics change.
- Local adapter code: `src/extension/gsd-core-commands.ts` only if discovery or prompt expansion behavior changes.
- Tests: `tests/gsd-core-commands.test.ts` and `tests/register.test.ts`.
- Guidance: Do not copy upstream command markdown into this repository.

**New Dispatcher Operation:**
- Primary code: `src/extension/dispatcher.ts` for dispatcher interface/implementation; `src/extension/register.ts` for mapping Pi calls to the new operation; `src/extension/index.ts` for action schema.
- Tests: `tests/dispatcher.test.ts`, `tests/register.test.ts`.
- Guidance: Use dependency injection for filesystem, execution, detection, and truncation seams.

**New Capability Detection:**
- Primary code: `src/extension/capabilities.ts`.
- Call site: `src/extension/register.ts` if active Pi tool inventory names need to be included.
- Tests: `tests/capabilities.test.ts`, with registration coverage in `tests/register.test.ts` when active tool detection matters.
- Guidance: Prefer active Pi tool inventory over filesystem probes.

**New Model Routing Rule or Fallback:**
- Primary code: `src/extension/model-routing.ts`.
- Command behavior: `src/extension/register.ts` for `/gsd-model` side effects.
- Tests: `tests/model-routing.test.ts`, `tests/register.test.ts`.
- Guidance: Keep default routes provider-agnostic by inheriting/omitting Pi model unless a project explicitly configures `.pi-gsd/model-routing.json`.

**New Context-Mode Guardrail:**
- Primary code: `src/extension/context-mode-guard.ts`.
- Tests: `tests/context-mode-guard.test.ts`.
- Guidance: Implement pure decision logic in `evaluateContextModeToolCall` first, then keep `registerContextModeGuard` as a thin Pi event adapter.

**New Runtime Documentation:**
- Public usage: `README.md` and `docs/USAGE.md`.
- Maintainer architecture: `docs/DESIGN.md`.
- Agent instructions: `skills/pi-gsd/SKILL.md`.
- Prompt resources: `prompts/gsd-review-loop.md`.

**New Tests:**
- Unit tests: Add `tests/<module>.test.ts` for a new source module.
- Shared fakes: Extend `tests/test-utils.ts` for reusable Pi runtime behavior.
- Live runtime check: Extend `scripts/live-pi-rpc-smoke.mjs` only for behavior that unit tests cannot validate.

**Utilities:**
- Shared runtime helpers that are part of one concern should stay in that module, such as `parseCommandArgs` in `src/extension/register.ts` and `shellWords` in `src/extension/gsd-core-commands.ts`.
- Create a new `src/extension/<concern>.ts` module when helper logic becomes reusable across multiple runtime modules.
- Keep test-only helpers in `tests/test-utils.ts`; do not import test helpers from `src/extension/`.

## Special Directories

**`node_modules/`:**
- Purpose: Installed npm dependencies, including package-local `@opengsd/gsd-core` and `node_modules/.bin/gsd-tools`.
- Generated: Yes.
- Committed: No.
- Guidance: Runtime detection may inspect this directory through `src/extension/capabilities.ts`; source code should not be added here.

**`.planning/`:**
- Purpose: Canonical GSD project-local records and generated planning/codebase documents.
- Generated: Partly; maintained by GSD workflows and mapping tasks.
- Committed: Project-dependent.
- Guidance: Write normal GSD-compatible artifacts here. Do not put Pi-wrapper private state here.

**`.pi/`:**
- Purpose: Project-local Pi settings.
- Generated: Yes, by Pi configuration/install workflows.
- Committed: Project-dependent.
- Guidance: Do not store runtime source here. No `.pi/skills/` directory is present in this repository.

**`.pi-gsd/`:**
- Purpose: Optional wrapper-private project metadata, currently model routing configuration.
- Generated: No by default.
- Committed: Project-dependent.
- Guidance: Create only when a documented project-local adapter setting is needed; expected key file is `.pi-gsd/model-routing.json`.

**`skills/`:**
- Purpose: Pi skills exported by this package.
- Generated: No.
- Committed: Yes.
- Guidance: Add package skills here and declare/keep `package.json` `pi.skills` pointing to `./skills`.

**`prompts/`:**
- Purpose: Pi prompt resources exported by this package.
- Generated: No.
- Committed: Yes.
- Guidance: Add prompt resources here and keep `package.json` `pi.prompts` pointing to `./prompts`.

**`.github/workflows/`:**
- Purpose: GitHub Actions automation.
- Generated: No.
- Committed: Yes.
- Guidance: Add CI workflows here; keep project test commands aligned with `package.json` scripts.

---

*Structure analysis: 2026-06-08*
