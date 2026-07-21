import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { type Capabilities, defaultPackageRoot, detectCapabilities, type ExistsProbe } from "./capabilities.ts";
import { DEFAULT_PI_GSD_CONFIG, getPiGsdConfigPath } from "./config.ts";
import { getPiGsdDiagnosticSummary, type PiGsdDiagnosticSummary } from "./diagnostics.ts";
import { inspectGsdCoreCommands, type GsdCoreCommandInspection } from "./gsd-core-commands.ts";
import {
  DEFAULT_MODEL_ROUTING_CONFIG,
  formatResolvedModelRouting,
  getModelRoutingConfigPath,
  modelRef,
  resolveModelRouting,
  type ModelRoutingContext,
  type PiModelLike,
  type PiModelRegistryLike,
  type ResolveModelRoutingRequest,
} from "./model-routing.ts";

export type PiExecResult = {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  code?: number;
  killed?: boolean;
};

export type PiExec = (
  command: string,
  args?: string[],
  options?: { cwd?: string; signal?: AbortSignal; timeout?: number },
) => Promise<PiExecResult | string>;

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
  };
  model?: PiModelLike;
  modelRegistry?: PiModelRegistryLike;
};

export type GsdCoreDiagnostics = {
  version?: string;
  commandInspection: GsdCoreCommandInspection;
  binaryProbe?: {
    status: "healthy" | "failed" | "not-detected";
    exitCode?: number;
    message: string;
  };
};

export type GsdDispatchResult = {
  text: string;
  details: {
    caps: Capabilities;
    core?: GsdCoreDiagnostics;
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
  const skillsDir = path.join(homeDir, ".pi", "agent", "skills");
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith("gsd-") && name !== "pi-gsd")
    .map((name) => path.join(skillsDir, name, "SKILL.md"))
    .filter((candidate) => fs.existsSync(candidate))
    .sort();
}

function formatIntegrationStatus(
  name: "subagents" | "contextMode",
  caps: Capabilities,
): string {
  const provenance = caps.provenance[name];
  const detected = provenance === "active-tool" ? "detected via active tool" : provenance === "filesystem" ? "detected via filesystem fallback" : "not detected";
  if (caps.integrationSettings[name] === "off") {
    return caps.detected[name]
      ? `${detected}, disabled by ${caps.configPath}`
      : `disabled by ${caps.configPath}`;
  }
  return caps[name] ? detected : "not detected";
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
    `- .planning present: ${exists(planningDir) ? "yes" : "no"}`,
    `- mode: \`${caps.mode}\``,
    `- active Pi tool inventory: ${caps.activeToolInventoryAvailable ? "available" : "unavailable; using filesystem fallbacks"}`,
    `- package-local @opengsd/gsd-core / gsd-tools: ${caps.gsdCore ? "detected" : "not detected"}`,
    `- gsd-core version: ${core?.version ?? "unknown"}`,
    `- upstream command files: ${core ? `${core.commandInspection.commands.length}${core.commandInspection.warnings.length > 0 ? ` (${core.commandInspection.warnings.length} warning${core.commandInspection.warnings.length === 1 ? "" : "s"})` : ""}` : "unknown"}`,
    `- gsd-tools path: ${caps.paths.gsdTools ?? "not detected"}`,
    `- pi-subagents: ${formatIntegrationStatus("subagents", caps)}`,
    `- context-mode: ${formatIntegrationStatus("contextMode", caps)}`,
    `- upstream GSD Pi plugin: ${upstreamStatus}`,
    `- diagnostics log: ${diagnostics?.enabled ? `${diagnostics.entries} entr${diagnostics.entries === 1 ? "y" : "ies"} at ${diagnostics.path}` : "off"}`,
    `- current Pi model: ${currentModel ?? "unknown"}`,
    `- current Pi thinking: ${modelContext?.thinkingLevel ?? "unknown"}`,
    ...caps.configWarnings.map((warning) => `- config warning: ${warning}`),
    ...(core?.commandInspection.warnings.map((warning) => `- command discovery warning: ${warning}`) ?? []),
  ].join("\n");
}

function inspectGsdCore(packageRoot: string, exists: ExistsProbe): GsdCoreDiagnostics {
  const manifestPath = path.join(packageRoot, "node_modules", "@opengsd", "gsd-core", "package.json");
  let version: string | undefined;
  try {
    if (exists(manifestPath)) {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { version?: unknown };
      if (typeof parsed.version === "string") version = parsed.version;
    }
  } catch {
    // Discovery warnings are deliberately bounded; package metadata is optional diagnostic detail.
  }

  return {
    ...(version ? { version } : {}),
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
    if (typeof result === "string") return { status: "healthy", exitCode: 0, message: "Package-local gsd-tools --help completed." };
    const exitCode = result.exitCode ?? result.code ?? 0;
    if (result.killed) {
      return { status: "failed", exitCode, message: "Package-local gsd-tools --help was cancelled or timed out." };
    }
    return exitCode === 0
      ? { status: "healthy", exitCode, message: "Package-local gsd-tools --help completed." }
      : { status: "failed", exitCode, message: `Package-local gsd-tools --help exited with ${exitCode}.` };
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
          "- Use `subagent({ action: \"list\" })` before selecting pi-subagents agents or chains.",
          "- Use the shared pi-gsd model-routing result as the model input for `subagent` when pi-subagents is detected and an explicit model is available.",
          "- Do not make the `gsd` tool call `subagent` internally in v1.",
          "- Do not run nested subagents unless the selected subagent is explicitly intended to orchestrate.",
        ]
      : []),
    ...(caps.contextMode
      ? [
          "- Use `ctx_execute`, `ctx_execute_file`, `ctx_search`, or indexing only for bulky or transient context when context-mode is detected.",
          "- context-mode caches should support investigations, not replace durable artifacts.",
        ]
      : []),
    ...(caps.subagents && caps.contextMode
      ? ["- In combined mode, let the parent GSD flow use `subagent`; child agents may use `ctx_*` tools when context-mode is loaded."]
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
    "## Integration guidance",
    "",
    "- Use upstream `gsd-core` behavior through `gsd-tools`; do not fork or duplicate GSD Core semantics.",
    "- Resolve `gsd-tools` from this Pi package's installed `@opengsd/gsd-core` dependency; do not use system-wide GSD installs for Pi execution.",
    "- If `gsd-core` needs a better machine-readable dispatcher for Pi, contribute that seam upstream and swap only the pi-gsd dispatcher adapter.",
    "- Use `gsd({ action: \"resolve-model\", agent: \"gsd-planner\" })` before choosing a model for GSD-specific work.",
    "- Keep GSD Core `resolve_model_ids` omitted/inherited under Pi unless you intentionally configured a non-Pi GSD runtime.",
    ...integrationGuidance,
    "- Treat `.planning/` as the project-local GSD record-keeping directory.",
    "- Do not put Pi-wrapper-specific material in `.planning/`; only write GSD-compatible records there.",
    "- Do not create a Pi-wrapper project-state directory by default.",
    "- Reserve `.pi-gsd/` only for future documented project-local adapter metadata that cannot be represented as a GSD-compatible `.planning/` record.",
    "- Do not create or assume `.gsd/`; avoid colliding with other GSD-family tools.",
  ].join("\n");
}

function formatExecResult(result: PiExecResult | string): string {
  if (typeof result === "string") return result;

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const exitCode = result.exitCode ?? result.code ?? 0;
  const output = [stdout, stderr ? `\n[stderr]\n${stderr}` : ""].join("").trim();
  return [`gsd-tools exited with ${exitCode}`, output ? `\n${output}` : ""].join("\n");
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

class StreamingTextTail {
  private chunks: string[] = [];
  private retainedChars = 0;
  private totalChars = 0;
  private readonly maxChars: number;

  constructor(maxChars: number) {
    this.maxChars = maxChars;
  }

  append(chunk: string): void {
    if (!chunk) return;
    this.totalChars += chunk.length;
    this.chunks.push(chunk);
    this.retainedChars += chunk.length;

    while (this.retainedChars > this.maxChars && this.chunks.length > 0) {
      const overflow = this.retainedChars - this.maxChars;
      const first = this.chunks[0];
      if (first.length <= overflow) {
        this.chunks.shift();
        this.retainedChars -= first.length;
      } else {
        this.chunks[0] = first.slice(overflow);
        this.retainedChars -= overflow;
      }
    }
  }

  text(): string {
    const tail = this.chunks.join("");
    if (this.totalChars <= this.retainedChars) return tail;
    return [
      `[stream output truncated before process close: showing last ${this.retainedChars}/${this.totalChars} chars]`,
      tail,
    ].join("\n");
  }
}

function packageLocalGsdToolsEntrypoint(command: string): string | null {
  const commandDir = path.dirname(command);
  const packageDir = path.resolve(commandDir, "..", "@opengsd", "gsd-core");
  const manifestPath = path.join(packageDir, "package.json");
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { bin?: Record<string, unknown> };
    const entrypoint = manifest.bin?.["gsd-tools"];
    if (typeof entrypoint !== "string") return null;
    const candidate = path.resolve(packageDir, entrypoint);
    return fs.existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function resolveSpawnInvocation(command: string, args: string[]): { command: string; args: string[] } {
  if (/\.(cmd|bat|ps1)$/i.test(command)) {
    const entrypoint = packageLocalGsdToolsEntrypoint(command);
    if (entrypoint) return { command: process.execPath, args: [entrypoint, ...args] };
  }

  return { command, args };
}

async function execWithNodeSpawn(
  command: string,
  args?: string[],
  options?: { cwd?: string; signal?: AbortSignal; timeout?: number },
): Promise<PiExecResult> {
  const cwd = options?.cwd ?? process.cwd();
  return new Promise((resolve, reject) => {
    const invocation = resolveSpawnInvocation(command, args ?? []);
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      shell: false,
      windowsHide: true,
      signal: options?.signal,
    });
    let timedOut = false;
    const timeout = options?.timeout
      ? setTimeout(() => {
          timedOut = true;
          child.kill();
        }, options.timeout)
      : undefined;
    const streamTailChars = Math.floor(DEFAULT_MAX_OUTPUT_CHARS / 3);
    const stdout = new StreamingTextTail(streamTailChars);
    const stderr = new StreamingTextTail(streamTailChars);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout.append(String(chunk));
    });
    child.stderr?.on("data", (chunk) => {
      stderr.append(String(chunk));
    });
    child.on("error", (error) => {
      if (timeout) clearTimeout(timeout);
      if (options?.signal?.aborted) {
        resolve({ stdout: stdout.text(), stderr: stderr.text() || "Cancelled while running.", exitCode: 130 });
        return;
      }
      reject(error);
    });
    child.on("close", (exitCode) => {
      if (timeout) clearTimeout(timeout);
      resolve({
        stdout: stdout.text(),
        stderr: stderr.text() || (timedOut ? `Timed out after ${options?.timeout}ms.` : ""),
        exitCode: timedOut ? 124 : exitCode ?? 0,
      });
    });
  });
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
      core.binaryProbe = await probeGsdTools(options.exec ?? execWithNodeSpawn, command, cwd);
      const externalSkillPaths = (options.externalGsdSkillPaths ?? findExternalGsdSkillPaths)();
      const diagnostics = getPiGsdDiagnosticSummary(cwd);
      return {
        text: formatDoctor(cwd, resultDetails.caps, exists, externalSkillPaths, core, diagnostics, modelContext),
        details: { ...resultDetails, core },
      };
    },

    async resolveModel(request, cwd, modelContext) {
      const resultDetails = details(cwd);
      const resolved = resolveModelRouting(request, { cwd, ...modelContext });
      return {
        text: formatResolvedModelRouting(resolved),
        details: resultDetails,
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
          details: resultDetails,
        };
      }

      const command = options.gsdToolsCommand ?? resultDetails.caps.paths.gsdTools;
      if (!command) {
        return {
          text: [
            "pi-gsd cannot run GSD commands because its package-local `gsd-tools` binary was not detected.",
            "Install or repair the `@opengsd/gsd-core` dependency for this pi-gsd package; do not rely on a system-wide GSD install.",
          ].join("\n"),
          details: resultDetails,
        };
      }

      const exec = options.exec ?? execWithNodeSpawn;
      try {
        const result = await exec(command, args, { cwd, signal });
        return {
          text: truncateOutput(formatExecResult(result)),
          details: resultDetails,
        };
      } catch (error) {
        return {
          text: [
            "pi-gsd could not launch its package-local `gsd-tools` binary.",
            error instanceof Error ? error.message : String(error),
            "Repair the `@opengsd/gsd-core` dependency for this pi-gsd package; do not fall back to a system-wide GSD install.",
          ].join("\n"),
          details: resultDetails,
        };
      }
    },
  };
}
