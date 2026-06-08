import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type CapabilityName = "gsdCore" | "gsdTools" | "subagents" | "contextMode";

export type GsdMode = "inline" | "ctx-inline" | "delegated" | "delegated-ctx";

export type CapabilityPaths = Record<CapabilityName, string | null>;

export type Capabilities = {
  gsdCore: boolean;
  subagents: boolean;
  contextMode: boolean;
  mode: GsdMode;
  paths: CapabilityPaths;
};

export type ExistsProbe = (candidate: string) => boolean;

export type CapabilityDetectionOptions = {
  cwd?: string;
  homeDir?: string;
  packageRoot?: string;
  exists?: ExistsProbe;
  candidatePaths?: Partial<Record<CapabilityName, string[]>>;
};

function gsdToolCommandNames(): string[] {
  if (process.platform === "win32") {
    return ["gsd-tools.cmd", "gsd-tools.ps1", "gsd-tools.exe", "gsd-tools"];
  }
  return ["gsd-tools"];
}

export function gsdToolsCommandNames(): string[] {
  return gsdToolCommandNames();
}

function findPackageRoot(startDir: string, exists: ExistsProbe): string {
  let current = path.resolve(startDir);
  while (true) {
    if (exists(path.join(current, "package.json"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startDir);
    current = parent;
  }
}

export function defaultPackageRoot(exists: ExistsProbe = fs.existsSync): string {
  return findPackageRoot(path.dirname(fileURLToPath(import.meta.url)), exists);
}

function packageLocalGsdCoreCandidates(packageRoot: string): string[] {
  return [path.join(packageRoot, "node_modules", "@opengsd", "gsd-core", "package.json")];
}

function packageLocalGsdToolsCandidates(packageRoot: string): string[] {
  const gsdTools = gsdToolCommandNames();
  return gsdTools.map((command) => path.join(packageRoot, "node_modules", ".bin", command));
}

function defaultCandidatePaths(homeDir: string, packageRoot: string): Record<CapabilityName, string[]> {
  const packageLocalGsdTools = packageLocalGsdToolsCandidates(packageRoot);
  return {
    gsdCore: packageLocalGsdCoreCandidates(packageRoot),
    gsdTools: packageLocalGsdTools,
    subagents: [
      path.join(homeDir, ".pi", "agent", "npm", "node_modules", "pi-subagents"),
      path.join(homeDir, ".pi", "agent", "extensions", "subagent"),
      path.join(homeDir, ".pi", "agent", "extensions", "pi-subagents"),
    ],
    contextMode: [
      path.join(homeDir, ".pi", "agent", "npm", "node_modules", "context-mode"),
      path.join(homeDir, ".pi", "extensions", "context-mode"),
      path.join(homeDir, ".pi", "agent", "extensions", "context-mode"),
    ],
  };
}

function firstExisting(candidates: string[], exists: ExistsProbe): string | null {
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

export function detectCapabilities(options: CapabilityDetectionOptions = {}): Capabilities {
  const homeDir = options.homeDir ?? os.homedir();
  const exists = options.exists ?? fs.existsSync;
  const packageRoot = path.resolve(options.packageRoot ?? defaultPackageRoot(exists));
  const defaults = defaultCandidatePaths(homeDir, packageRoot);
  const candidates = {
    gsdCore: options.candidatePaths?.gsdCore ?? defaults.gsdCore,
    gsdTools: options.candidatePaths?.gsdTools ?? defaults.gsdTools,
    subagents: options.candidatePaths?.subagents ?? defaults.subagents,
    contextMode: options.candidatePaths?.contextMode ?? defaults.contextMode,
  };

  const paths: CapabilityPaths = {
    gsdCore: firstExisting(candidates.gsdCore, exists),
    gsdTools: firstExisting(candidates.gsdTools, exists),
    subagents: firstExisting(candidates.subagents, exists),
    contextMode: firstExisting(candidates.contextMode, exists),
  };

  const hasSubagents = Boolean(paths.subagents);
  const hasContextMode = Boolean(paths.contextMode);
  const mode: GsdMode =
    hasSubagents && hasContextMode
      ? "delegated-ctx"
      : hasSubagents
        ? "delegated"
        : hasContextMode
          ? "ctx-inline"
          : "inline";

  return {
    gsdCore: Boolean(paths.gsdCore || paths.gsdTools),
    subagents: hasSubagents,
    contextMode: hasContextMode,
    mode,
    paths,
  };
}
