import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { loadPiGsdConfig, type IntegrationMode } from "./config.ts";

export type CapabilityName = "gsdCore" | "gsdTools" | "subagents" | "contextMode";

export type GsdMode = "inline" | "ctx-inline" | "delegated" | "delegated-ctx";

export type CapabilityPaths = Record<CapabilityName, string | null>;
export type IntegrationProvenance =
  | "active-tool"
  | "registered-tool-inactive"
  | "filesystem"
  | "filesystem-inactive"
  | "not-detected";

export type Capabilities = {
  gsdCore: boolean;
  subagents: boolean;
  contextMode: boolean;
  mode: GsdMode;
  paths: CapabilityPaths;
  detected: {
    subagents: boolean;
    contextMode: boolean;
  };
  provenance: {
    subagents: IntegrationProvenance;
    contextMode: IntegrationProvenance;
  };
  activeToolInventoryAvailable: boolean;
  upstreamPiPlugin: {
    activeTool: boolean;
    activeCommand: boolean;
    paths: string[];
  };
  integrationSettings: {
    subagents: IntegrationMode;
    contextMode: IntegrationMode;
  };
  configPath: string;
  configWarnings: string[];
};

export type ExistsProbe = (candidate: string) => boolean;

export type CapabilityDetectionOptions = {
  cwd?: string;
  homeDir?: string;
  packageRoot?: string;
  exists?: ExistsProbe;
  candidatePaths?: Partial<Record<CapabilityName, string[]>>;
  activeToolNames?: string[];
  activeToolInventoryAvailable?: boolean;
  registeredToolNames?: string[];
  registeredToolInventoryAvailable?: boolean;
  activeCommandNames?: string[];
  activeCommandInventoryAvailable?: boolean;
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

function upstreamPiPluginCandidates(homeDir: string, cwd: string): string[] {
  return [
    path.join(cwd, ".pi", "extensions", "gsd.js"),
    path.join(cwd, ".pi", "extensions", "gsd.cjs"),
    path.join(homeDir, ".pi", "agent", "extensions", "gsd.js"),
    path.join(homeDir, ".pi", "agent", "extensions", "gsd.cjs"),
  ];
}

function defaultCandidatePaths(
  homeDir: string,
  packageRoot: string,
  cwd: string,
): Record<CapabilityName, string[]> {
  const packageLocalGsdTools = packageLocalGsdToolsCandidates(packageRoot);
  return {
    gsdCore: packageLocalGsdCoreCandidates(packageRoot),
    gsdTools: packageLocalGsdTools,
    subagents: [
      path.join(cwd, ".pi", "npm", "node_modules", "pi-subagents"),
      path.join(cwd, ".pi", "extensions", "subagent"),
      path.join(cwd, ".pi", "extensions", "pi-subagents"),
      path.join(homeDir, ".pi", "agent", "npm", "node_modules", "pi-subagents"),
      path.join(homeDir, ".pi", "agent", "extensions", "subagent"),
      path.join(homeDir, ".pi", "agent", "extensions", "pi-subagents"),
    ],
    contextMode: [
      path.join(cwd, ".pi", "npm", "node_modules", "context-mode"),
      path.join(cwd, ".pi", "extensions", "context-mode"),
      path.join(homeDir, ".pi", "agent", "npm", "node_modules", "context-mode"),
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

function firstActiveTool(activeToolNames: Set<string>, names: string[]): string | null {
  return names.find((name) => activeToolNames.has(name)) ?? null;
}

function detectOptionalIntegration(
  activeToolNames: Set<string>,
  activeToolInventoryAvailable: boolean,
  registeredToolNames: Set<string>,
  registeredToolInventoryAvailable: boolean,
  publicToolNames: string[],
  candidates: string[],
  exists: ExistsProbe,
): { path: string | null; provenance: IntegrationProvenance; available: boolean } {
  const pathOnDisk = firstExisting(candidates, exists);
  if (activeToolInventoryAvailable) {
    const activeToolName = firstActiveTool(activeToolNames, publicToolNames);
    if (activeToolName) {
      return { path: `<active-tool:${activeToolName}>`, provenance: "active-tool", available: true };
    }

    const registeredToolName = registeredToolInventoryAvailable
      ? firstActiveTool(registeredToolNames, publicToolNames)
      : null;
    if (registeredToolName) {
      return {
        path: `<registered-tool:${registeredToolName}>`,
        provenance: "registered-tool-inactive",
        available: false,
      };
    }

    return pathOnDisk
      ? { path: pathOnDisk, provenance: "filesystem-inactive", available: false }
      : { path: null, provenance: "not-detected", available: false };
  }

  return pathOnDisk
    ? { path: pathOnDisk, provenance: "filesystem", available: true }
    : { path: null, provenance: "not-detected", available: false };
}

export function detectCapabilities(options: CapabilityDetectionOptions = {}): Capabilities {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const homeDir = options.homeDir ?? os.homedir();
  const exists = options.exists ?? fs.existsSync;
  const packageRoot = path.resolve(options.packageRoot ?? defaultPackageRoot(exists));
  const defaults = defaultCandidatePaths(homeDir, packageRoot, cwd);
  const candidates = {
    gsdCore: options.candidatePaths?.gsdCore ?? defaults.gsdCore,
    gsdTools: options.candidatePaths?.gsdTools ?? defaults.gsdTools,
    subagents: options.candidatePaths?.subagents ?? defaults.subagents,
    contextMode: options.candidatePaths?.contextMode ?? defaults.contextMode,
  };

  const loadedConfig = loadPiGsdConfig(cwd);
  const integrationSettings = loadedConfig.config.integrations;
  const activeToolNames = new Set(options.activeToolNames ?? []);
  const activeToolInventoryAvailable = options.activeToolInventoryAvailable ?? options.activeToolNames !== undefined;
  const registeredToolNames = new Set(options.registeredToolNames ?? []);
  const registeredToolInventoryAvailable =
    options.registeredToolInventoryAvailable ?? options.registeredToolNames !== undefined;
  const activeCommandNames = new Set(options.activeCommandNames ?? []);
  const activeCommandInventoryAvailable = options.activeCommandInventoryAvailable ?? options.activeCommandNames !== undefined;
  const subagents = detectOptionalIntegration(
    activeToolNames,
    activeToolInventoryAvailable,
    registeredToolNames,
    registeredToolInventoryAvailable,
    ["subagent"],
    candidates.subagents,
    exists,
  );
  const contextMode = detectOptionalIntegration(
    activeToolNames,
    activeToolInventoryAvailable,
    registeredToolNames,
    registeredToolInventoryAvailable,
    ["ctx_execute", "ctx_execute_file", "ctx_search", "ctx_index", "ctx_batch_execute"],
    candidates.contextMode,
    exists,
  );

  const paths: CapabilityPaths = {
    gsdCore: firstExisting(candidates.gsdCore, exists),
    gsdTools: firstExisting(candidates.gsdTools, exists),
    subagents: subagents.path,
    contextMode: contextMode.path,
  };

  const detectedSubagents = Boolean(paths.subagents);
  const detectedContextMode = Boolean(paths.contextMode);
  const hasSubagents = integrationSettings.subagents !== "off" && subagents.available;
  const hasContextMode = integrationSettings.contextMode !== "off" && contextMode.available;
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
    detected: {
      subagents: detectedSubagents,
      contextMode: detectedContextMode,
    },
    provenance: {
      subagents: subagents.provenance,
      contextMode: contextMode.provenance,
    },
    activeToolInventoryAvailable,
    upstreamPiPlugin: {
      activeTool: activeToolInventoryAvailable && activeToolNames.has("gsd_invoke"),
      activeCommand: activeCommandInventoryAvailable && activeCommandNames.has("gsd"),
      paths: upstreamPiPluginCandidates(homeDir, cwd).filter((candidate) => exists(candidate)),
    },
    integrationSettings,
    configPath: loadedConfig.path,
    configWarnings: loadedConfig.warnings,
  };
}
