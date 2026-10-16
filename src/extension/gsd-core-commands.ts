import * as fs from "node:fs";
import * as path from "node:path";

import { defaultPackageRoot, type ExistsProbe } from "./capabilities.ts";

export type GsdCoreCommand = {
  slashName: string;
  coreName: string;
  description: string;
  argumentHint?: string;
  path: string;
  body: string;
};

export type GsdCoreCommandDiscoveryOptions = {
  packageRoot?: string;
  commandsDir?: string;
  exists?: ExistsProbe;
  readFile?: (filePath: string) => string;
  readdir?: (dirPath: string) => string[];
};

export type GsdCoreCommandInspection = {
  commands: GsdCoreCommand[];
  commandsDir: string;
  warnings: string[];
};

function parseFrontmatter(markdown: string): { fields: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/m.exec(markdown);
  if (!match) return { fields: {}, body: markdown };

  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^(name|description|argument-hint):\s*(.*)\s*$/.exec(line);
    if (!field) continue;
    fields[field[1]] = field[2].replace(/^['"]|['"]$/g, "");
  }

  return { fields, body: match[2] };
}

function commandNameFromFile(filePath: string, fields: Record<string, string>): { slashName: string; coreName: string } {
  const base = path.basename(filePath, ".md");
  const coreName = fields.name || `gsd:${base}`;
  const normalized = coreName.startsWith("gsd:") ? coreName.slice("gsd:".length) : base;
  return {
    slashName: `gsd-${normalized.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase()}`,
    coreName,
  };
}

export function gsdCoreCommandsDir(packageRoot: string): string {
  return path.join(packageRoot, "node_modules", "@opengsd", "gsd-core", "commands", "gsd");
}

export function inspectGsdCoreCommands(options: GsdCoreCommandDiscoveryOptions = {}): GsdCoreCommandInspection {
  const exists = options.exists ?? fs.existsSync;
  const packageRoot = options.packageRoot ?? defaultPackageRoot(exists);
  const commandsDir = options.commandsDir ?? gsdCoreCommandsDir(packageRoot);
  const warnings: string[] = [];
  if (!exists(commandsDir)) {
    warnings.push(`Upstream GSD command directory was not found: ${commandsDir}`);
    return { commands: [], commandsDir, warnings };
  }

  const readFile = options.readFile ?? ((filePath: string) => fs.readFileSync(filePath, "utf8"));
  const readdir = options.readdir ?? ((dirPath: string) => fs.readdirSync(dirPath));
  let entries: string[];
  try {
    entries = readdir(commandsDir);
  } catch (error) {
    warnings.push(`Could not read upstream GSD command directory: ${error instanceof Error ? error.message : String(error)}`);
    return { commands: [], commandsDir, warnings };
  }

  const commands: GsdCoreCommand[] = [];
  for (const entry of entries.filter((candidate) => candidate.endsWith(".md")).sort()) {
    const filePath = path.join(commandsDir, entry);
    try {
      const markdown = readFile(filePath);
      const { fields, body } = parseFrontmatter(markdown);
      const names = commandNameFromFile(filePath, fields);
      commands.push({
        ...names,
        description: fields.description || `Run upstream GSD Core command ${names.coreName}`,
        argumentHint: fields["argument-hint"],
        path: filePath,
        body,
      });
    } catch (error) {
      warnings.push(`Skipped unreadable upstream GSD command ${entry}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { commands: commands.sort((a, b) => a.slashName.localeCompare(b.slashName)), commandsDir, warnings };
}

export function discoverGsdCoreCommands(options: GsdCoreCommandDiscoveryOptions = {}): GsdCoreCommand[] {
  return inspectGsdCoreCommands(options).commands;
}

function shellWords(input: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char;
      continue;
    }
    if (/\s/.test(char) && !quote) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaping) current += "\\";
  if (current) words.push(current);
  return words;
}

function packageLocalGsdCoreRoot(commandPath: string): string {
  return path.resolve(path.dirname(commandPath), "..", "..", "gsd-core");
}

function piExecutionGuidance(): string[] {
  return [
    "",
    "## Pi execution contract",
    "",
    "- Run every upstream GSD CLI operation (`gsd-tools`, `gsd_run`, or direct `node .../gsd-tools.cjs`) through pi-gsd: `gsd({ action: \"run\", args: [...] })` or `/gsd-run <args>`.",
    "- Never execute a bare `gsd-tools`/`gsd_run`, `command -v gsd-tools`, a global GSD install, a direct `node .../gsd-tools.cjs` command, or a runtime-home launch shim. Translate the upstream CLI example to its argument array while preserving its GSD semantics.",
    "- Use Pi chat/UI for upstream interactive prompts and call pi-subagents directly only when the parent agent independently chooses delegation.",
    "- Before each bounded upstream GSD child assignment, call `gsd({ action: \"resolve-model\", agent: \"<exact-gsd-agent-name>\", taskId: \"<bounded-assignment-label>\" })`. If version-2 policy allows, add `tier: \"heavy\"`, `\"standard\"` or `\"light\"` for that assignment. Obey its consumer action: `pass-model` means pass the exact suffixed physical model, `omit-model` means omit it, and `resolve-first` means do not delegate yet.",
    "- Keep tiny work inline when delegation would cost more. Preserve upstream role instructions and authorization; bound each helper's inputs, output ownership and verification expectations. Do not invent extra workflow steps to create cheap work.",
    "- Task/decision IDs are correlation only, not launch-tool parameters. Pass each model per child; scripted/task-scoped launch association is not verified by the advisory guard and a workflow's top-level model is not per-child evidence.",
  ];
}

function piConfigCommandGuidance(command: GsdCoreCommand): string[] {
  if (command.coreName !== "gsd:config" && command.coreName !== "gsd:settings") return [];

  return [
    "",
    "## Pi runtime requirements for GSD config/settings",
    "",
    "This is a Pi runtime, so preserve the upstream GSD-visible result rather than Claude-specific mechanics:",
    "",
    "- Update GSD Core config in `.planning/config.json`, or `.planning/workstreams/<slug>/config.json` when GSD Core reports an active workstream.",
    "- Use upstream GSD Core query names and semantics such as `config-ensure-section`, `config-path`, `config-get`, `config-set`, and `config-set-model-profile`; do not hand-edit unrelated config keys.",
    "- If the upstream workflow asks for `AskUserQuestion`, ask the user naturally in Pi chat/UI and then write the selected values with GSD Core `config-set` queries.",
    "- Treat `.pi-gsd/` as pi-gsd wrapper-private config only; `/gsd-config` and `/gsd-settings` configure upstream GSD under `.planning/`.",
  ];
}

export function expandGsdCoreCommandPrompt(command: GsdCoreCommand, rawArgs: string): string {
  const args = rawArgs.trim();
  const words = shellWords(args);
  const coreRoot = packageLocalGsdCoreRoot(command.path);
  let body = command.body.replace(/\$ARGUMENTS|\$@/g, args);
  body = body.replace(/\$(\d+)/g, (_match, index: string) => words[Number(index) - 1] ?? "");
  body = body.replace(/(@?)(?:~|\$HOME)\/\.claude\/gsd-core\//g, (_match, include: string) => `${include}${coreRoot}${path.sep}`);

  const content = [
    `Execute upstream GSD Core command \`${command.coreName}\` via pi-gsd.`,
    args ? `Arguments: ${args}` : "Arguments: <none>",
    `Package-local GSD Core root: ${coreRoot}`,
    ...piExecutionGuidance(),
    ...piConfigCommandGuidance(command),
    "",
    body.trim(),
  ].join("\n");

  // Use Pi's native skill-block envelope so the expanded command stays collapsed
  // in chat until the user toggles tool output expansion (Ctrl+O by default).
  return `<skill name="${command.slashName}" location="${command.path}">\n${content}\n</skill>`;
}
