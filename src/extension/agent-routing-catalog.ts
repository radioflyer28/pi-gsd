import * as fs from "node:fs";
import * as path from "node:path";

import { defaultPackageRoot } from "./capabilities.ts";
import type { RoutingTier } from "./model-routing.ts";

export type AgentRoutingCatalog = {
  tiers: Readonly<Record<string, RoutingTier>>;
  path: string;
  version?: string;
  status: "loaded" | "unavailable";
  warnings: string[];
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJson(file: string): unknown {
  if (fs.statSync(file).size > 256 * 1024) throw new Error("catalog metadata exceeds 256 KiB");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * One isolated, read-only adapter for GSD Core's private catalog layout.
 * The public SDK does not yet export routing tiers. Never consult a global GSD
 * installation, derive these tiers from model-profile aliases, or copy the roster.
 */
export function loadAgentRoutingCatalog(packageRoot = defaultPackageRoot()): AgentRoutingCatalog {
  const coreRoot = path.join(packageRoot, "node_modules", "@opengsd", "gsd-core");
  const catalogPath = path.join(coreRoot, "gsd-core", "bin", "shared", "model-catalog.json");
  let version: string | undefined;
  try {
    const manifest = readJson(path.join(coreRoot, "package.json"));
    if (!record(manifest) || manifest.name !== "@opengsd/gsd-core" || typeof manifest.version !== "string" || !manifest.version.trim()) {
      throw new Error("invalid package-local GSD Core identity/version");
    }
    version = manifest.version;
    const catalog = readJson(catalogPath);
    if (!record(catalog) || !record(catalog.agents)) throw new Error("missing agent catalog");
    const entries = Object.entries(catalog.agents);
    if (entries.length === 0 || entries.length > 1024) throw new Error("invalid agent catalog size");
    const tiers: Record<string, RoutingTier> = Object.create(null);
    for (const [name, metadata] of entries) {
      if (!/^gsd-[a-z0-9][a-z0-9-]{0,120}$/.test(name) || !record(metadata)) {
        throw new Error("invalid agent catalog entry");
      }
      const tier = metadata.routingTier;
      if (tier !== "heavy" && tier !== "standard" && tier !== "light") throw new Error(`invalid routing tier for ${name}`);
      tiers[name] = tier;
    }
    return { tiers: Object.freeze(tiers), path: catalogPath, version, status: "loaded", warnings: [] };
  } catch (error) {
    return {
      tiers: Object.freeze(Object.create(null) as Record<string, RoutingTier>),
      path: catalogPath, version, status: "unavailable",
      warnings: [`Upstream agent routing catalog unavailable at ${catalogPath}: ${error instanceof Error ? error.message : String(error)}. Agent tiers are unknown; only explicit/default routes can be used.`],
    };
  }
}
