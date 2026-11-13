import { execWithNodeSpawn, selectCoreExecutor, normalizeExecution, formatExecution, type CoreExecution, type PiExec, type PiExecResult } from "./core-execution.ts";
export type { PiExec, PiExecResult } from "./core-execution.ts";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { type Capabilities, defaultPackageRoot, detectCapabilities, type ExistsProbe } from "./capabilities.ts";
import { DEFAULT_PI_GSD_CONFIG, getPiGsdConfigPath } from "./config.ts";
import { getPiGsdDiagnosticSummary, type PiGsdDiagnosticSummary } from "./diagnostics.ts";
import { CHILD_TOOL_READINESS, SUBAGENT_CAPABILITY_GUIDELINES } from "./subagent-guidance.ts";
import type { GsdRuntimeAgentStatus } from "./runtime-agents.ts";
import { formatOwnerCompatibility } from "./subagent-compatibility.ts";
import { inspectGsdCoreCommands, type GsdCoreCommandInspection } from "./gsd-core-commands.ts";
import {
  DEFAULT_MODEL_ROUTING_CONFIG,
  formatModelRoutingAudit,
  formatResolvedModelRouting,
  getModelRoutingConfigPath,
  modelRef,
  resolveModelRouting,
  type ModelRoutingContext,
  type PiModelLike,
  type PiModelRegistryLike,
  type ResolveModelRoutingRequest,
  type ResolvedModelRouting,
} from "./model-routing.ts";



export type GsdAction = "status" | "doctor" | "run" | "resolve-model" | "init-config";

export type GsdParams = ResolveModelRoutingRequest & {
  action?: GsdAction;
  args?: string[];
  cwd?: string;
  force?: boolean;
};

export type GsdExecutionContext = {
  cwd?: string;
  hasUI?: boolean;
  ui?: {
    notify?: (message: string, level?: "info" | "warning" | "error") => void;
    select?: (title: string, options: string[]) => Promise<string | undefined>;
    confirm?: (title: string, message: string) => Promise<boolean>;
    input?: (title: string, placeholder?: string) => Promise<string | undefined>;
  };
  model?: PiModelLike;
  modelRegistry?: PiModelRegistryLike;
};

export type GsdCoreDiagnostics = {
  version?: string;
  adapterVersion?: string;
  piSdkVersion?: string;
  commandInspection: GsdCoreCommandInspection;
  binaryProbe?: {
    status: "healthy" | "failed" | "not-detected";
    exitCode?: number;
    message: string;
  };
};

export type GsdDispatchResult = {
  text: string;
  ok?: boolean;
  details: {
    execution?: CoreExecution;
    caps: Capabilities;
    core?: GsdCoreDiagnostics;
    modelRouting?: ResolvedModelRouting;
    piRuntimeAgents?: {
      runtime: "pi";
      source: "session-registration";
      requestedCwd: string;
      status: GsdRuntimeAgentStatus;
      childReadiness: "unverified";
    };
  };
};

export type TextTruncator = (text: string) => string;

export type GsdDispatcher = {
  status(cwd: string, modelContext?: ModelRoutingContext): Promise<GsdDispatchResult>;
  doctor(cwd: string, modelContext?: ModelRoutingContext): Promise<GsdDispatchResult>;
  run(args: string[], cwd: string, signal?: AbortSignal): Promise<GsdDispatchResult>;
  resolveModel(request: ResolveModelRoutingRequest, cwd: string, modelContext?: ModelRoutingContext): Promise<GsdDispatchResult>;
  initConfig(cwd: string, force?: boolean): Promise<GsdDispatchResult>;
};

export type GsdDispatcherOptions = {
  exec?: PiExec;
  exists?: ExistsProbe;
  packageRoot?: string;
  gsdToolsCommand?: string;
  truncateOutput?: TextTruncator;
  detect?: (cwd: string) => Capabilities;
  externalGsdSkillPaths?: () => string[];
};

export const DEFAULT_MAX_OUTPUT_CHARS = 50_000;
export const DEFAULT_MAX_OUTPUT_LINES = 2_000;

export function resolveCwd(
  params: GsdParams,
  ctx?: GsdExecutionContext,
  defaultCwd = process.cwd(),
): string {
  return path.resolve(params.cwd || ctx?.cwd || defaultCwd);
}

export function truncateTailText(
  text: string,
  maxChars = DEFAULT_MAX_OUTPUT_CHARS,
  maxLines = DEFAULT_MAX_OUTPUT_LINES,
): string {
  const originalChars = text.length;
  const lines = text.split(/\r?\n/);
  const originalLines = lines.length;
  let output = originalLines > maxLines ? lines.slice(-maxLines).join("\n") : text;

  if (output.length > maxChars) {
    output = output.slice(output.length - maxChars);
  }

  if (output.length === originalChars && output.split(/\r?\n/).length === originalLines) {
    return output;
  }

  return [
    `[output truncated: showing last ${output.length}/${originalChars} chars, up to ${Math.min(
      originalLines,
      maxLines,
    )}/${originalLines} lines]`,
    output,
  ].join("\n");
}

export function findExternalGsdSkillPaths(homeDir = os.homedir()): string[] {
  const skillRoots = [
    path.join(homeDir, ".pi", "agent", "skills"),
    path.join(homeDir, ".agents", "skills"),
  ];
  const paths: string[] = [];
  for (const skillsDir of skillRoots) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    } catch {
      continue;
    }
    paths.push(...entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => name.startsWith("gsd-") && name !== "pi-gsd")
      .map((name) => path.join(skillsDir, name, "SKILL.md"))
      .filter((candidate) => fs.existsSync(candidate)));
  }
  return [...new Set(paths)].sort();
}

function formatIntegrationStatus(
  name: "subagents" | "contextMode",
  caps: Capabilities,
): string {
  const provenance = caps.provenance[name];
  const detected =
    provenance === "activation-tool" ? "loaded; activation available through subagents_enable (execution tools inactive)"
    : provenance === "active-tool"
      ? "detected via active tool"
      : provenance === "registered-tool-inactive"
        ? "loaded but inactive (public tool is registered but not active)"
        : provenance === "filesystem"
          ? "detected via filesystem fallback"
          : provenance === "filesystem-inactive"
            ? "installed on disk but inactive (public tool is not active)"
            : "not detected";
  const packageInfo = caps.integrationPackages[name];
  const packageSuffix = packageInfo
    ? `; installed candidate ${packageInfo.version ? `v${packageInfo.version} ` : ""}at ${packageInfo.path} (not loaded-source proof)`
    : "";
  if (caps.integrationSettings[name] === "off") {
    return caps.detected[name]
      ? `${detected}, disabled by ${caps.configPath}${packageSuffix}`
      : `disabled by ${caps.configPath}${packageSuffix}`;
  }
  return caps[name] || caps.detected[name] ? `${detected}${packageSuffix}` : "not detected";
}

export function formatCapabilities(
  cwd: string,
  caps: Capabilities,
  exists: ExistsProbe = fs.existsSync,
  modelContext?: ModelRoutingContext,
  core?: GsdCoreDiagnostics,
  diagnostics?: PiGsdDiagnosticSummary,
): string {
  const planningDir = path.join(cwd, ".planning");
  const currentModel = modelRef(modelContext?.model);
  const upstreamPlugin = caps.upstreamPiPlugin;
  const upstreamStatus = upstreamPlugin.activeTool || upstreamPlugin.activeCommand
    ? [
        ...(upstreamPlugin.activeCommand ? ["active `/gsd` command"] : []),
        ...(upstreamPlugin.activeTool ? ["active `gsd_invoke` tool"] : []),
      ].join("; ")
    : upstreamPlugin.paths.length > 0
      ? `possible plugin file: ${upstreamPlugin.paths.join(", ")}`
      : "not detected";
  return [
    "# pi-gsd status",
    "",
    `- CWD: \`${cwd}\``,
    `- pi-gsd version: ${core?.adapterVersion ?? "unknown"}`,
    `- Pi SDK compatibility version: ${core?.piSdkVersion ?? "unknown"}`,
    `- .planning present: ${exists(planningDir) ? "yes" : "no"}`,
    `- mode: \`${caps.mode}\``,
    `- active Pi tool inventory: ${caps.activeToolInventoryAvailable ? "available" : "unavailable; using filesystem fallbacks"}`,
    `- package-local @opengsd/gsd-core / gsd-tools: ${caps.gsdCore ? "detected" : "not detected"}`,
    `- gsd-core version: ${core?.version ?? "unknown"}`,
    `- upstream command files: ${core ? `${core.commandInspection.commands.length}${core.commandInspection.warnings.length > 0 ? ` (${core.commandInspection.warnings.length} warning${core.commandInspection.warnings.length === 1 ? "" : "s"})` : ""}` : "unknown"}`,
    `- gsd-tools path: ${caps.paths.gsdTools ?? "not detected"}`,
    `- pi-subagents: ${formatIntegrationStatus("subagents", caps)}`,
    `- pi-subagents activation: ${caps.subagentState ?? (caps.subagents ? "active" : "unknown")}`,
    ...Object.entries(caps.loadedProviders ?? {}).flatMap(([name, providers]) => (providers ?? []).map((provider) => `- loaded ${name} provider: ${provider.tool} from ${provider.path}`)),
    ...formatOwnerCompatibility(caps.subagentCompatibility),
    "- integration scope: current Pi session only",
    `- child tool readiness: ${CHILD_TOOL_READINESS}`,
    `- context-mode: ${formatIntegrationStatus("contextMode", caps)}`,
    `- upstream GSD Pi plugin: ${upstreamStatus}`,
    `- upstream safety guards: ${caps.safetySettings.upstreamGuards === "on" ? "enabled" : "off"}`,
    `- diagnostics log: ${diagnostics?.enabled ? `${diagnostics.entries} entr${diagnostics.entries === 1 ? "y" : "ies"} at ${diagnostics.path}` : "off"}`,
    `- current Pi model: ${currentModel ?? "unknown"}`,
    `- current Pi thinking: ${modelContext?.thinkingLevel ?? "unknown"}`,
    ...caps.configWarnings.map((warning) => `- config warning: ${warning}`),
    ...(core?.commandInspection.warnings.map((warning) => `- command discovery warning: ${warning}`) ?? []),
  ].join("\n");
}

function readManifestVersion(manifestPath: string, exists: ExistsProbe): string | undefined {
  try {
    if (!exists(manifestPath)) return undefined;
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

function inspectGsdCore(packageRoot: string, exists: ExistsProbe): GsdCoreDiagnostics {
  const version = readManifestVersion(path.join(packageRoot, "node_modules", "@opengsd", "gsd-core", "package.json"), exists);
  const adapterVersion = readManifestVersion(path.join(packageRoot, "package.json"), exists);
  const piSdkVersion = readManifestVersion(path.join(packageRoot, "node_modules", "@earendil-works", "pi-coding-agent", "package.json"), exists);
  return {
    ...(version ? { version } : {}),
    ...(adapterVersion ? { adapterVersion } : {}),
    ...(piSdkVersion ? { piSdkVersion } : {}),
    commandInspection: inspectGsdCoreCommands({ packageRoot, exists }),
  };
}

async function probeGsdTools(
  exec: PiExec,
  command: string | null,
  cwd: string,
): Promise<NonNullable<GsdCoreDiagnostics["binaryProbe"]>> {
  if (!command) return { status: "not-detected", message: "Package-local gsd-tools binary was not detected." };

  try {
    const result = await exec(command, ["--help"], { cwd, timeout: 5_000 });
    if (typeof result === "string") return { status: "failed", message: "Package-local gsd-tools --help returned text without an exit status; health is unknown." };
    const execution = normalizeExecution(result);
    const exitCode = execution.exitCode ?? undefined;
    if (result.killed || execution.outcome === "cancelled" || execution.outcome === "timed-out") {
      return { status: "failed", exitCode, message: "Package-local gsd-tools --help was cancelled or timed out." };
    }
    return execution.outcome === "success"
      ? { status: "healthy", exitCode, message: "Package-local gsd-tools --help completed." }
      : { status: "failed", exitCode, message: `Package-local gsd-tools --help outcome: ${execution.outcome}; exit code: ${exitCode ?? "unknown"}.` };
  } catch (error) {
    return {
      status: "failed",
      message: `Could not launch package-local gsd-tools: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function formatExternalGsdSkillWarning(externalSkillPaths: string[]): string[] {
  if (externalSkillPaths.length === 0) return [];

  const shown = externalSkillPaths.slice(0, 10).map((skillPath) => `- ${skillPath}`);
  const remaining = externalSkillPaths.length - shown.length;
  return [
    "",
    "## External GSD skill warning",
    "",
    `${externalSkillPaths.length} global \`gsd-*\` skill(s) were found outside pi-gsd. These skills can appear as slash commands and may bypass the thin pi-gsd adapter path.`,
    "",
    ...shown,
    ...(remaining > 0 ? [`- ...and ${remaining} more`] : []),
    "",
    "If you want pi-gsd-only behavior, remove or disable those global skills and run `/reload`.",
  ];
}

function formatUpstreamPiPluginWarning(caps: Capabilities): string[] {
  if (!caps.upstreamPiPlugin.activeTool && !caps.upstreamPiPlugin.activeCommand && caps.upstreamPiPlugin.paths.length === 0) return [];

  return [
    "",
    "## Upstream Pi plugin coexistence warning",
    "",
    "The upstream GSD Pi plugin may also be active. Do not load it alongside pi-gsd: it exposes `/gsd`, `gsd_invoke`, lifecycle hooks, and independent model steering.",
    ...(caps.upstreamPiPlugin.activeCommand ? ["- active upstream surface: `/gsd`"] : []),
    ...(caps.upstreamPiPlugin.activeTool ? ["- active upstream surface: `gsd_invoke`"] : []),
    ...caps.upstreamPiPlugin.paths.map((pluginPath) => `- possible plugin file: ${pluginPath}`),
    "- Choose one integration, then reload Pi before relying on GSD commands.",
  ];
}

function formatLifecycleCompatibility(): string[] {
  return [
    "## Lifecycle compatibility",
    "",
    "- upstream canonical-path hook: intentionally not bridged; it repairs Claude marketplace `CLAUDE_PLUGIN_ROOT` installs and is a no-op for Pi package installs",
    "- upstream context-monitor hook: intentionally not bridged; it reads Claude statusline temp files and emits only for PostToolUse/AfterTool, not Pi pre-compaction",
    "- upstream workflow/tool hook placeholders: advisory and post-use bridges remain intentionally disabled until upstream provides a verified Pi event contract",
    "- opt-in upstream hard guards: set `safety.upstreamGuards` to `on` to bridge only package-local write-shrink and GSD-worktree path blocks; adapter failures allow execution",
    "- Pi-native lifecycle behavior: context-mode guardrails and the warn-only GSD subagent routing validator remain active without loading the official GSD Pi plugin",
  ];
}

function formatDoctor(
  cwd: string,
  caps: Capabilities,
  exists: ExistsProbe,
  externalSkillPaths: string[],
  core: GsdCoreDiagnostics,
  diagnostics: PiGsdDiagnosticSummary,
  modelContext?: ModelRoutingContext,
): string {
  const integrationGuidance = [
    ...(caps.subagents
      ? [
          ...SUBAGENT_CAPABILITY_GUIDELINES.map((line) => `- ${line}`),
          "- Resolve each bounded GSD assignment with its exact agent and taskId. Opt-in version-2 policy may allow a task tier; pass the exact physical consumer `model` per child for `pass-model`, including suffixed inherited snapshots.",
          "- The routing guard is advisory: task/script association may be unavailable. Decision IDs are correlation, not permissions or extra subagent parameters; no top-level workflow default proves per-child routing.",
          "- Do not make the `gsd` tool call `subagent` internally in v1.",
          "- Do not run nested subagents unless the selected subagent is explicitly intended to orchestrate.",
        ]
      : []),
    ...(caps.subagentState === "activation-available" ? ["- pi-subagents is loaded with activation available. When delegation is authorized or existing runs need management, call subagents_enable, then inspect subagent tools on the next model request. Activation is not delegation authorization or child readiness; no reload is required solely for lazy activation."] : []),
    ...(caps.subagentState !== "activation-available" && caps.detected.subagents && !caps.subagents && caps.integrationSettings.subagents !== "off"
      ? [
          "- pi-subagents appears installed or loaded, but its public `subagent` tool is inactive in this session. Run `/reload` or restart Pi and confirm the package/tool is enabled before delegating.",
        ]
      : []),
    ...(caps.contextMode
      ? [
          "- Use `ctx_execute`, `ctx_execute_file`, `ctx_search`, or indexing only for bulky or transient context when context-mode is detected.",
          "- context-mode caches should support investigations, not replace durable artifacts.",
        ]
      : []),
    ...(caps.subagents && caps.contextMode
      ? ["- In combined mode, let the parent GSD flow use `subagent`; child agents may use `ctx_*` tools only when their own tool policy permits them and their child session loads the provider."]
      : []),
  ];

  return [
    formatCapabilities(cwd, caps, exists, modelContext, core, diagnostics),
    ...formatExternalGsdSkillWarning(externalSkillPaths),
    ...formatUpstreamPiPluginWarning(caps),
    "",
    "## Compatibility probe",
    "",
    `- ${core.binaryProbe?.message ?? "Package-local gsd-tools was not probed."}`,
    ...(core.commandInspection.warnings.length > 0 ? core.commandInspection.warnings.map((warning) => `- command discovery: ${warning}`) : []),
    "",
    formatModelRoutingAudit({ cwd, ...modelContext }),
    "",
    ...formatLifecycleCompatibility(),
    "",
    "## Integration guidance",
    "",
    "- Use upstream `gsd-core` behavior through `gsd-tools`; do not fork or duplicate GSD Core semantics.",
    "- Resolve `gsd-tools` from this Pi package's installed `@opengsd/gsd-core` dependency; do not use system-wide GSD installs for Pi execution.",
    "- If `gsd-core` needs a better machine-readable dispatcher for Pi, contribute that seam upstream and swap only the pi-gsd dispatcher adapter.",
    "- Immediately before each bounded GSD assignment, use `gsd({ action: \"resolve-model\", agent: \"<exact-agent-name>\", taskId: \"<assignment-label>\" })` and obey its consumer action. Add an allowed `tier` only when version-2 taskOverrides is enabled.",
    "- `/gsd-model` changes only the current Pi session; `/gsd-model-config` persists tier routes in `.pi-gsd/model-routing.json`.",
    "- Keep GSD Core `resolve_model_ids` omitted/inherited under Pi unless you intentionally configured a non-Pi GSD runtime.",
    ...integrationGuidance,
    "- Treat `.planning/` as the project-local GSD record-keeping directory.",
    "- Do not put Pi-wrapper-specific material in `.planning/`; only write GSD-compatible records there.",
    "- Do not create a Pi-wrapper project-state directory by default.",
    "- Reserve `.pi-gsd/` for documented project-local adapter configuration and opt-in diagnostics that cannot be represented as GSD-compatible `.planning/` records.",
    "- Do not create or assume `.gsd/`; avoid colliding with other GSD-family tools.",
  ].join("\n");
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeDefaultFile(filePath: string, content: string, force: boolean): "created" | "unchanged" | "overwritten" {
  if (fs.existsSync(filePath) && !force) return "unchanged";
  const existed = fs.existsSync(filePath);
  fs.writeFileSync(filePath, content, "utf8");
  return existed ? "overwritten" : "created";
}

function initPiGsdConfigFiles(cwd: string, force = false): string {
  const dir = path.join(cwd, ".pi-gsd");
  fs.mkdirSync(dir, { recursive: true });

  const configPath = getPiGsdConfigPath(cwd);
  const routingPath = getModelRoutingConfigPath(cwd);
  const configStatus = writeDefaultFile(configPath, stableJson(DEFAULT_PI_GSD_CONFIG), force);
  const routingStatus = writeDefaultFile(routingPath, stableJson(DEFAULT_MODEL_ROUTING_CONFIG), force);

  return [
    "# pi-gsd config initialized",
    "",
    `- directory: \`${dir}\``,
    `- ${configStatus}: \`${configPath}\``,
    `- ${routingStatus}: \`${routingPath}\``,
    force ? "- force: existing files were overwritten" : "- existing files were left unchanged; pass `force: true` to overwrite defaults",
  ].join("\n");
}

export function createGsdDispatcher(options: GsdDispatcherOptions = {}): GsdDispatcher {
  const exists = options.exists ?? fs.existsSync;
  const packageRoot = options.packageRoot ?? defaultPackageRoot(exists);
  const truncateOutput = options.truncateOutput ?? truncateTailText;
  const detect = options.detect ?? ((cwd: string) => detectCapabilities({ cwd, packageRoot, exists }));

  function details(cwd: string): { caps: Capabilities } {
    return { caps: detect(cwd) };
  }

  function coreDiagnostics(): GsdCoreDiagnostics {
    return inspectGsdCore(packageRoot, exists);
  }

  return {
    async status(cwd, modelContext) {
      const resultDetails = details(cwd);
      const core = coreDiagnostics();
      const diagnostics = getPiGsdDiagnosticSummary(cwd);
      return {
        text: formatCapabilities(cwd, resultDetails.caps, exists, modelContext, core, diagnostics),
        details: { ...resultDetails, core },
      };
    },

    async doctor(cwd, modelContext) {
      const resultDetails = details(cwd);
      const core = coreDiagnostics();
      const command = options.gsdToolsCommand ?? resultDetails.caps.paths.gsdTools;
      core.binaryProbe = await probeGsdTools(command ? selectCoreExecutor(command, options.exec) : execWithNodeSpawn, command, cwd);
      const externalSkillPaths = (options.externalGsdSkillPaths ?? findExternalGsdSkillPaths)();
      const diagnostics = getPiGsdDiagnosticSummary(cwd);
      return {
        ok: core.binaryProbe.status === "healthy",
        text: formatDoctor(cwd, resultDetails.caps, exists, externalSkillPaths, core, diagnostics, modelContext),
        details: { ...resultDetails, core },
      };
    },

    async resolveModel(request, cwd, modelContext) {
      const resultDetails = details(cwd);
      const resolved = resolveModelRouting(request, { packageRoot, ...modelContext, cwd });
      return {
        ok: !resolved.error && resolved.subagent.action !== "resolve-first",
        text: formatResolvedModelRouting(resolved),
        details: { ...resultDetails, modelRouting: resolved },
      };
    },

    async initConfig(cwd, force) {
      try {
        const text = initPiGsdConfigFiles(cwd, force);
        return {
          text,
          details: details(cwd),
        };
      } catch (error) {
        return {
          ok: false,
          text: `pi-gsd could not initialize project configuration: ${error instanceof Error ? error.message : String(error)}`,
          details: details(cwd),
        };
      }
    },

    async run(args, cwd, signal) {
      const resultDetails = details(cwd);
      if (signal?.aborted) {
        return {
          text: "Cancelled before starting.",
          ok: false,
          details: { ...resultDetails, execution: normalizeExecution({ cancelled: true }) },
        };
      }

      const command = options.gsdToolsCommand ?? resultDetails.caps.paths.gsdTools;
      if (!command) {
        return {
          text: [
            "pi-gsd cannot run GSD commands because its package-local `gsd-tools` binary was not detected.",
            "Install or repair the `@opengsd/gsd-core` dependency for this pi-gsd package; do not rely on a system-wide GSD install.",
          ].join("\n"),
          ok: false,
          details: { ...resultDetails, execution: normalizeExecution({ launchError: "Package-local gsd-tools missing." }) },
        };
      }

      const exec = selectCoreExecutor(command, options.exec);
      try {
        const result = await exec(command, args, { cwd, signal });
        const execution = normalizeExecution(signal?.aborted && (typeof result === "string" || result.cancelled === undefined) ? { ...(typeof result === "string" ? { stdout: result } : result), cancelled: true } : result);
        return {
          ok: execution.outcome === "success",
          text: truncateOutput(typeof result === "string" ? result : formatExecution(execution)),
          details: { ...resultDetails, execution },
        };
      } catch (error) {
        return {
          text: [
            "pi-gsd could not launch its package-local `gsd-tools` binary.",
            error instanceof Error ? error.message : String(error),
            "Repair the `@opengsd/gsd-core` dependency for this pi-gsd package; do not fall back to a system-wide GSD install.",
          ].join("\n"),
          ok: false,
          details: { ...resultDetails, execution: normalizeExecution({ cancelled: signal?.aborted, launchError: error instanceof Error ? error.message : String(error) }) },
        };
      }
    },
  };
}
