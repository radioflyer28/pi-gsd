import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { type Capabilities, defaultPackageRoot, detectCapabilities, type ExistsProbe } from "./capabilities.ts";
import {
  formatResolvedModelRouting,
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
};

export type PiExec = (
  command: string,
  args?: string[],
  options?: { cwd?: string; signal?: AbortSignal },
) => Promise<PiExecResult | string>;

export type GsdAction = "status" | "doctor" | "run" | "resolve-model";

export type GsdParams = ResolveModelRoutingRequest & {
  action?: GsdAction;
  args?: string[];
  cwd?: string;
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

export type GsdDispatchResult = {
  text: string;
  details: {
    caps: Capabilities;
  };
};

export type TextTruncator = (text: string) => string;

export type GsdDispatcher = {
  status(cwd: string, modelContext?: ModelRoutingContext): Promise<GsdDispatchResult>;
  doctor(cwd: string, modelContext?: ModelRoutingContext): Promise<GsdDispatchResult>;
  run(args: string[], cwd: string, signal?: AbortSignal): Promise<GsdDispatchResult>;
  resolveModel(request: ResolveModelRoutingRequest, cwd: string, modelContext?: ModelRoutingContext): Promise<GsdDispatchResult>;
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

export function formatCapabilities(
  cwd: string,
  caps: Capabilities,
  exists: ExistsProbe = fs.existsSync,
  modelContext?: ModelRoutingContext,
): string {
  const planningDir = path.join(cwd, ".planning");
  const currentModel = modelRef(modelContext?.model);
  return [
    "# pi-gsd status",
    "",
    `- CWD: \`${cwd}\``,
    `- .planning present: ${exists(planningDir) ? "yes" : "no"}`,
    `- mode: \`${caps.mode}\``,
    `- package-local @opengsd/gsd-core / gsd-tools: ${caps.gsdCore ? "detected" : "not detected"}`,
    `- gsd-tools path: ${caps.paths.gsdTools ?? "not detected"}`,
    `- pi-subagents: ${caps.subagents ? "detected" : "not detected"}`,
    `- context-mode: ${caps.contextMode ? "detected" : "not detected"}`,
    `- current Pi model: ${currentModel ?? "unknown"}`,
    `- current Pi thinking: ${modelContext?.thinkingLevel ?? "unknown"}`,
  ].join("\n");
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

function formatDoctor(
  cwd: string,
  caps: Capabilities,
  exists: ExistsProbe,
  externalSkillPaths: string[],
  modelContext?: ModelRoutingContext,
): string {
  return [
    formatCapabilities(cwd, caps, exists, modelContext),
    ...formatExternalGsdSkillWarning(externalSkillPaths),
    "",
    "## Integration guidance",
    "",
    "- Use upstream `gsd-core` behavior through `gsd-tools`; do not fork or duplicate GSD Core semantics.",
    "- Resolve `gsd-tools` from this Pi package's installed `@opengsd/gsd-core` dependency; do not use system-wide GSD installs for Pi execution.",
    "- If `gsd-core` needs a better machine-readable dispatcher for Pi, contribute that seam upstream and swap only the pi-gsd dispatcher adapter.",
    "- Use `gsd({ action: \"resolve-model\", agent: \"gsd-planner\" })` before choosing a model for GSD-specific work.",
    "- Keep GSD Core `resolve_model_ids` omitted/inherited under Pi unless you intentionally configured a non-Pi GSD runtime.",
    "- Use `subagent({ action: \"list\" })` before selecting pi-subagents agents or chains.",
    "- Use the shared pi-gsd model-routing result as the model input for `subagent` when pi-subagents is detected and an explicit model is available.",
    "- Do not make the `gsd` tool call `subagent` internally in v1.",
    "- Use `ctx_execute`, `ctx_execute_file`, `ctx_search`, or indexing only for bulky or transient context when context-mode is detected.",
    "- In combined mode, let the parent GSD flow use `subagent`; child agents may use `ctx_*` tools when context-mode is loaded.",
    "- Do not run nested subagents unless the selected subagent is explicitly intended to orchestrate.",
    "- Treat `.planning/` as the project-local GSD record-keeping directory.",
    "- Do not put Pi-wrapper-specific material in `.planning/`; only write GSD-compatible records there.",
    "- Do not create a Pi-wrapper project-state directory by default.",
    "- Reserve `.pi-gsd/` only for future documented project-local adapter metadata that cannot be represented as a GSD-compatible `.planning/` record.",
    "- context-mode caches should support investigations, not replace durable artifacts.",
    "- Do not create or assume `.gsd/`; avoid colliding with other GSD-family tools.",
  ].join("\n");
}

function formatExecResult(result: PiExecResult | string): string {
  if (typeof result === "string") return result;

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const exitCode = result.exitCode ?? 0;
  const output = [stdout, stderr ? `\n[stderr]\n${stderr}` : ""].join("").trim();
  return [`gsd-tools exited with ${exitCode}`, output ? `\n${output}` : ""].join("\n");
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
  const candidate = path.resolve(commandDir, "..", "@opengsd", "gsd-core", "gsd-core", "bin", "gsd-tools.cjs");
  return fs.existsSync(candidate) ? candidate : null;
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
  args: string[],
  options: { cwd: string; signal?: AbortSignal },
): Promise<PiExecResult> {
  return new Promise((resolve, reject) => {
    const invocation = resolveSpawnInvocation(command, args);
    const child = spawn(invocation.command, invocation.args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      signal: options.signal,
    });
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
      if (options.signal?.aborted) {
        resolve({ stdout: stdout.text(), stderr: stderr.text() || "Cancelled while running.", exitCode: 130 });
        return;
      }
      reject(error);
    });
    child.on("close", (exitCode) => {
      resolve({ stdout: stdout.text(), stderr: stderr.text(), exitCode: exitCode ?? 0 });
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

  return {
    async status(cwd, modelContext) {
      const resultDetails = details(cwd);
      return {
        text: formatCapabilities(cwd, resultDetails.caps, exists, modelContext),
        details: resultDetails,
      };
    },

    async doctor(cwd, modelContext) {
      const resultDetails = details(cwd);
      const externalSkillPaths = (options.externalGsdSkillPaths ?? findExternalGsdSkillPaths)();
      return {
        text: formatDoctor(cwd, resultDetails.caps, exists, externalSkillPaths, modelContext),
        details: resultDetails,
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
      const result = await exec(command, args, { cwd, signal });
      return {
        text: truncateOutput(formatExecResult(result)),
        details: resultDetails,
      };
    },
  };
}
