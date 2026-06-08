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

export function discoverGsdCoreCommands(options: GsdCoreCommandDiscoveryOptions = {}): GsdCoreCommand[] {
  const exists = options.exists ?? fs.existsSync;
  const packageRoot = options.packageRoot ?? defaultPackageRoot(exists);
  const commandsDir = options.commandsDir ?? gsdCoreCommandsDir(packageRoot);
  if (!exists(commandsDir)) return [];

  const readFile = options.readFile ?? ((filePath: string) => fs.readFileSync(filePath, "utf8"));
  const readdir = options.readdir ?? ((dirPath: string) => fs.readdirSync(dirPath));

  return readdir(commandsDir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.join(commandsDir, entry))
    .map((filePath) => {
      const markdown = readFile(filePath);
      const { fields, body } = parseFrontmatter(markdown);
      const names = commandNameFromFile(filePath, fields);
      return {
        ...names,
        description: fields.description || `Run upstream GSD Core command ${names.coreName}`,
        argumentHint: fields["argument-hint"],
        path: filePath,
        body,
      };
    })
    .sort((a, b) => a.slashName.localeCompare(b.slashName));
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

function piConfigCommandGuidance(command: GsdCoreCommand): string[] {
  if (command.coreName !== "gsd:config" && command.coreName !== "gsd:settings") return [];

  return [
    "",
    "## Pi runtime requirements for GSD config/settings",
    "",
    "This is a Pi runtime, so preserve the upstream GSD-visible result rather than Claude-specific mechanics:",
    "",
    "- Update GSD Core config in `.planning/config.json`, or `.planning/workstreams/<slug>/config.json` when GSD Core reports an active workstream.",
    "- Use the pi-gsd tool for every `gsd-tools` operation: `gsd({ action: \"run\", args: [\"query\", ...] })`. Do not rely on `command -v gsd-tools`, global installs, or `~/.claude` paths.",
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
  body = body.replace(/@~\/\.claude\/gsd-core\//g, `@${coreRoot}${path.sep}`);

  return [
    `Execute upstream GSD Core command \`${command.coreName}\` via pi-gsd.`,
    args ? `Arguments: ${args}` : "Arguments: <none>",
    `Package-local GSD Core root: ${coreRoot}`,
    ...piConfigCommandGuidance(command),
    "",
    body.trim(),
  ].join("\n");
}
