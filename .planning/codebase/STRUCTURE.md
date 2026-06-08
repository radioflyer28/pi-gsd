# Codebase Structure

**Analysis Date:** 2026-06-08

## Directory Layout

```text
pi-gsd/
├── src/                         # TypeScript extension implementation
│   ├── extension/               # Pi extension entry, registration, dispatcher, capability, routing, and guard modules
│   └── types/                   # Local Pi SDK declaration shim
├── tests/                       # Node built-in test runner tests for extension behavior
├── docs/                        # Maintainer and user documentation
├── skills/                      # Pi skill resources exposed by package metadata
│   └── pi-gsd/                  # Skill guidance for agents using GSD from Pi
├── prompts/                     # Pi prompt resources exposed by package metadata
├── .planning/codebase/          # GSD codebase map documents
├── package.json                 # npm metadata, scripts, dependency boundaries, and Pi resource declarations
├── extension-manifest.json      # Public Pi package manifest with tool/command exposure
└── tsconfig.json                # TypeScript compiler settings
```

## Directory Purposes

**`src/`:**
- Purpose: All TypeScript source for the Pi adapter.
- Contains: Extension modules and type declarations.
- Key files: `src/extension/index.ts`, `src/extension/register.ts`, `src/extension/dispatcher.ts`, `src/extension/capabilities.ts`, `src/extension/gsd-core-commands.ts`, `src/extension/model-routing.ts`, `src/extension/context-mode-guard.ts`, `src/types/pi-sdk.d.ts`.

**`src/extension/`:**
- Purpose: Runtime implementation of the `pi-gsd` Pi package.
- Contains: Pi extension entry point, registration layer, dispatcher, capability detector, upstream command discovery, model routing, and context-mode guard.
- Key files: `src/extension/index.ts` for package entry, `src/extension/register.ts` for tool/command registration, `src/extension/dispatcher.ts` for GSD execution, `src/extension/capabilities.ts` for mode detection.

**`src/types/`:**
- Purpose: Local type declarations for Pi SDK surfaces used by this package.
- Contains: Declaration files only.
- Key files: `src/types/pi-sdk.d.ts`.

**`tests/`:**
- Purpose: Behavioral test suite for the adapter modules.
- Contains: Node `test` files using TypeScript stripping.
- Key files: `tests/register.test.ts`, `tests/dispatcher.test.ts`, `tests/capabilities.test.ts`, `tests/context-mode-guard.test.ts`, `tests/metadata.test.ts`, `tests/smoke.test.ts`, `tests/test-utils.ts`.

**`docs/`:**
- Purpose: Human-facing design and usage guidance for maintainers and users.
- Contains: Markdown documents.
- Key files: `docs/DESIGN.md`, `docs/USAGE.md`.

**`skills/`:**
- Purpose: Pi skill resources declared in `package.json` under `pi.skills`.
- Contains: Skill directories with `SKILL.md` files.
- Key files: `skills/pi-gsd/SKILL.md`.

**`prompts/`:**
- Purpose: Pi prompt resources declared in `package.json` under `pi.prompts`.
- Contains: Prompt markdown files.
- Key files: `prompts/gsd-review-loop.md`.

**`.planning/codebase/`:**
- Purpose: GSD-compatible codebase map artifacts for planner/executor reference.
- Contains: Generated mapping documents.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

## Key File Locations

**Entry Points:**
- `src/extension/index.ts`: Default Pi extension export. Defines `TOOL_PARAMS`, configures output truncation, calls `registerPiGsdCore`, and registers the context-mode guard.
- `package.json`: Declares `./src/extension/index.ts` as the Pi extension entry and exposes `./skills` and `./prompts` as package resources.
- `extension-manifest.json`: Advertises public tool `gsd` and commands `gsd-status`, `gsd-doctor`, `gsd-run`, `gsd-model`, and `gsd-*`.

**Configuration:**
- `package.json`: npm metadata, scripts, Node engine, peer dependency boundaries, package-local `@opengsd/gsd-core` dependency, and Pi resource declarations.
- `tsconfig.json`: Strict NodeNext TypeScript config with `allowImportingTsExtensions` and `noEmit`.
- `.pi-gsd/model-routing.json`: Optional project-local adapter-private model routing config read by `src/extension/model-routing.ts` when present.
- `.planning/`: GSD project record directory reported by status/doctor; do not store Pi-wrapper-specific config here.

**Core Logic:**
- `src/extension/register.ts`: Central file for `gsd` tool registration, static `/gsd-*` commands, dynamic upstream slash commands, argument parsing, and model command behavior.
- `src/extension/dispatcher.ts`: Central file for `status`, `doctor`, `run`, and `resolve-model` dispatcher operations.
- `src/extension/capabilities.ts`: Central file for package-local GSD Core, `gsd-tools`, `context-mode`, and `pi-subagents` detection.
- `src/extension/gsd-core-commands.ts`: Central file for discovering package-local upstream GSD command markdown and expanding command prompts.
- `src/extension/model-routing.ts`: Central file for defaults, tiers, `.pi-gsd/model-routing.json`, model availability checks, and subagent routing output.
- `src/extension/context-mode-guard.ts`: Central file for context-mode `tool_call` policy and registration.

**Testing:**
- `tests/register.test.ts`: Covers Pi-facing tool/command registration, argument parsing, dynamic upstream command exposure, active tool detection, and `/gsd-model` behavior.
- `tests/dispatcher.test.ts`: Covers CWD resolution, status/doctor output, external GSD skill warnings, command execution, truncation, and refusal to use system-wide `gsd-tools`.
- `tests/capabilities.test.ts`: Covers optional integration modes, package-local GSD detection, project/user optional package paths, and active tool inventory precedence.
- `tests/context-mode-guard.test.ts`: Covers `.planning/` indexing blocks/warnings and small-file context-mode guard behavior.
- `tests/metadata.test.ts`: Covers package and extension manifest resource exposure.
- `tests/smoke.test.ts`: Covers dispatcher smoke behavior against installed package dependencies.
- `tests/test-utils.ts`: Provides mock Pi API and shared capability fixtures.

**Documentation:**
- `README.md`: Project overview, install instructions, public surfaces, optional integration behavior, and development commands.
- `docs/DESIGN.md`: Maintainer architecture, boundaries, dispatcher model, capability model, and state boundaries.
- `docs/USAGE.md`: User guide for slash commands, `gsd` tool actions, context-mode usage, model routing, and pi-subagents usage.
- `skills/pi-gsd/SKILL.md`: Agent-facing rules for using the `gsd` tool and respecting state boundaries.

## Naming Conventions

**Files:**
- Use kebab-case for multiword TypeScript modules: `src/extension/gsd-core-commands.ts`, `src/extension/model-routing.ts`, `src/extension/context-mode-guard.ts`.
- Use concise role names for primary modules: `src/extension/index.ts`, `src/extension/register.ts`, `src/extension/dispatcher.ts`, `src/extension/capabilities.ts`.
- Use `.test.ts` suffix for tests: `tests/register.test.ts`, `tests/dispatcher.test.ts`.
- Use uppercase markdown names for generated codebase maps: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

**Directories:**
- Use role-based top-level directories: `src/`, `tests/`, `docs/`, `skills/`, `prompts/`.
- Keep Pi skill content under `skills/<skill-name>/SKILL.md`, as in `skills/pi-gsd/SKILL.md`.
- Keep implementation code under `src/extension/`; do not create parallel implementation directories for GSD semantics.

## Where to Add New Code

**New Pi Tool or Slash Command Behavior:**
- Primary code: `src/extension/register.ts`
- Supporting dispatcher behavior: `src/extension/dispatcher.ts`
- Tests: `tests/register.test.ts` for registration/handler behavior and `tests/dispatcher.test.ts` for execution/diagnostic behavior.
- Metadata: `extension-manifest.json` and `package.json` only when the public package surface changes.

**New Dispatcher Operation:**
- Primary code: `src/extension/dispatcher.ts`
- Invocation wiring: `src/extension/register.ts`
- Tool schema: `src/extension/index.ts`
- Tests: `tests/dispatcher.test.ts` and `tests/register.test.ts`.

**New Capability Detection:**
- Primary code: `src/extension/capabilities.ts`
- User-visible status/doctor formatting: `src/extension/dispatcher.ts`
- Tests: `tests/capabilities.test.ts` and status/doctor assertions in `tests/dispatcher.test.ts`.
- Use active Pi tool inventory where possible before adding filesystem probes.

**New Upstream GSD Command Exposure Logic:**
- Primary code: `src/extension/gsd-core-commands.ts`
- Registration wiring: `src/extension/register.ts`
- Tests: `tests/register.test.ts`.
- Keep command bodies in upstream `@opengsd/gsd-core`; do not copy workflow markdown into this repository.

**New Model Routing Behavior:**
- Primary code: `src/extension/model-routing.ts`
- `/gsd-model` application behavior: `src/extension/register.ts`
- Tool formatting behavior: `src/extension/dispatcher.ts`
- Tests: `tests/register.test.ts` for Pi command/tool behavior and a dedicated model-routing test file if pure routing cases grow.
- Store adapter-private project config in `.pi-gsd/model-routing.json`, not `.planning/`.

**New Context-mode Guard Policy:**
- Primary code: `src/extension/context-mode-guard.ts`
- Entry wiring: `src/extension/index.ts`
- Tests: `tests/context-mode-guard.test.ts`.
- Use `warn` for plausible legitimate intent and reserve `block` for high-risk accidental patterns such as wholesale `.planning/` indexing.

**New Component/Module:**
- Implementation: `src/extension/<descriptive-kebab-name>.ts`
- Tests: `tests/<descriptive-kebab-name>.test.ts` or the closest behavior-focused existing test file.
- Imports: Use explicit `.ts` extensions in local imports, matching `src/extension/register.ts` and `tsconfig.json`.

**Utilities:**
- Shared test helpers: `tests/test-utils.ts`
- Runtime helpers used by one layer: keep private in the owning module, e.g. parsing helpers in `src/extension/register.ts` and normalization helpers in `src/extension/model-routing.ts`.
- Runtime helpers used across layers: extract to a named `src/extension/<topic>.ts` module and import from higher-level layers only.

**Documentation:**
- Maintainer design rules: `docs/DESIGN.md`
- User-facing command/tool instructions: `docs/USAGE.md`
- Agent behavior guidance: `skills/pi-gsd/SKILL.md`
- Quick project overview: `README.md`

## Special Directories

**`node_modules/`:**
- Purpose: npm dependencies including package-local `@opengsd/gsd-core` and `.bin/gsd-tools`.
- Generated: Yes
- Committed: No

**`.git/`:**
- Purpose: Git repository metadata.
- Generated: Yes
- Committed: No

**`.planning/`:**
- Purpose: Canonical GSD project records and codebase maps.
- Generated: Partly; GSD commands and mapper tasks write artifacts here.
- Committed: Project-dependent; codebase maps are intended as durable GSD reference artifacts.

**`.pi-gsd/`:**
- Purpose: Adapter-private project metadata, currently optional `model-routing.json`.
- Generated: No automatic creation by core extension code.
- Committed: Project-dependent; use only for explicit adapter-private configuration.

**`skills/pi-gsd/`:**
- Purpose: Pi skill packaged with this adapter.
- Generated: No
- Committed: Yes

**`prompts/`:**
- Purpose: Pi prompt resources packaged with this adapter.
- Generated: No
- Committed: Yes

## File Placement Rules

**Keep Pi-facing registration centralized:**
- Put `registerTool` and `registerCommand` calls in `src/extension/register.ts`.
- Keep only package-entry setup in `src/extension/index.ts`.

**Keep upstream GSD boundaries explicit:**
- Put command discovery/expansion code in `src/extension/gsd-core-commands.ts`.
- Put `gsd-tools` execution code in `src/extension/dispatcher.ts`.
- Do not add GSD workflow behavior under `skills/`, `prompts/`, or `src/extension/` when it belongs upstream.

**Keep optional integration handling decoupled:**
- Put detection in `src/extension/capabilities.ts`.
- Put context-mode guard policy in `src/extension/context-mode-guard.ts`.
- Do not import optional packages such as `context-mode` or `pi-subagents` from runtime source.

**Keep tests behavior-focused:**
- Use `tests/register.test.ts` for public Pi surface behavior.
- Use `tests/dispatcher.test.ts` for dispatcher execution and diagnostics.
- Use `tests/capabilities.test.ts` for detection paths and mode computation.
- Use `tests/metadata.test.ts` when `package.json` or `extension-manifest.json` changes.

---

*Structure analysis: 2026-06-08*
