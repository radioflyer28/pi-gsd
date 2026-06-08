import * as fs from "node:fs";
import * as path from "node:path";

export type IntegrationMode = "auto" | "off";

export type PiGsdConfig = {
  integrations: {
    subagents: IntegrationMode;
    contextMode: IntegrationMode;
  };
};

export const DEFAULT_PI_GSD_CONFIG: PiGsdConfig = {
  integrations: {
    subagents: "auto",
    contextMode: "auto",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeIntegrationMode(value: unknown): IntegrationMode {
  return value === "off" ? "off" : "auto";
}

function normalizeConfig(value: unknown): PiGsdConfig {
  const integrations = isRecord(value) && isRecord(value.integrations) ? value.integrations : {};
  return {
    integrations: {
      subagents: normalizeIntegrationMode(integrations.subagents),
      contextMode: normalizeIntegrationMode(integrations.contextMode),
    },
  };
}

export function getPiGsdConfigPath(cwd: string): string {
  return path.join(cwd, ".pi-gsd", "config.json");
}

export function loadPiGsdConfig(cwd: string): { config: PiGsdConfig; path: string; warnings: string[] } {
  const configPath = getPiGsdConfigPath(cwd);
  const warnings: string[] = [];

  try {
    if (!fs.existsSync(configPath)) return { config: DEFAULT_PI_GSD_CONFIG, path: configPath, warnings };
    return { config: normalizeConfig(JSON.parse(fs.readFileSync(configPath, "utf8"))), path: configPath, warnings };
  } catch (error) {
    warnings.push(`Failed to read ${configPath}: ${error instanceof Error ? error.message : String(error)}. Using defaults.`);
    return { config: DEFAULT_PI_GSD_CONFIG, path: configPath, warnings };
  }
}
