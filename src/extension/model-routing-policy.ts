import type { ModelRoute, ModelRoutingConfig, RoutingTargetType, RoutingTier } from "./model-routing.ts";

const THINKING = new Set(["inherit", "off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const FALLBACK = new Set(["inherit", "omit", "error", "prompt"]);
const TIERS = new Set(["heavy", "standard", "light"]);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function object(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!record(value)) throw new Error(`${label} must be an object`);
}

function keys(value: Record<string, unknown>, allowed: string[], label: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(`${label} contains unsupported fields`);
}

function route(value: unknown, label: string): void {
  object(value, label);
  keys(value, ["model", "thinking", "tier", "fallback", "locked"], label);
  if (value.model !== undefined) {
    if (typeof value.model !== "string" || value.model.length > 256 || !value.model.length || /\s|[\x00-\x1f\x7f]/.test(value.model)) {
      throw new Error(`${label}.model must be a nonempty bounded model reference`);
    }
    if (value.model !== "inherit" && value.model !== "omit" && !/^[^/:]+\/.+/.test(value.model)) {
      throw new Error(`${label}.model must be provider-qualified or inherit/omit`);
    }
  }
  if (value.thinking !== undefined && !THINKING.has(value.thinking as string)) throw new Error(`${label}.thinking is invalid`);
  if (value.tier !== undefined && !TIERS.has(value.tier as string)) throw new Error(`${label}.tier is invalid`);
  if (value.fallback !== undefined && !FALLBACK.has(value.fallback as string)) throw new Error(`${label}.fallback is invalid`);
  if (value.locked !== undefined && typeof value.locked !== "boolean") throw new Error(`${label}.locked must be boolean`);
}

/** Valid v1 remains permissive; v2 is strict. Errors never include config values. */
export function validateModelRoutingPolicy(value: unknown): asserts value is Record<string, unknown> {
  object(value, "routing policy");
  if (value.version !== undefined && value.version !== 1 && value.version !== 2) throw new Error("Unsupported routing policy version");
  if (value.version !== 2) {
    // Never silently accept a v2 opt-in in a legacy file.
    for (const key of ["taskOverrides", "virtualModels", "coordinator"]) {
      if (Object.hasOwn(value, key)) throw new Error(`${key} requires routing policy version 2`);
    }
    for (const section of ["default", "tiers", "agents", "skills", "commands"]) {
      const sectionValue = value[section];
      if (!record(sectionValue)) continue;
      const routes = section === "default" ? [sectionValue] : Object.values(sectionValue);
      if (routes.some((entry) => record(entry) && Object.hasOwn(entry, "locked"))) {
        throw new Error("locked requires routing policy version 2");
      }
    }
    return;
  }
  keys(value, ["version", "fallback", "default", "tiers", "agents", "skills", "commands", "coordinator", "taskOverrides", "virtualModels"], "routing policy");
  if (value.fallback !== undefined && !FALLBACK.has(value.fallback as string)) throw new Error("routing policy fallback is invalid");
  for (const section of ["default", "coordinator"]) {
    if (value[section] !== undefined) route(value[section], section);
  }
  for (const section of ["tiers", "agents", "skills", "commands"]) {
    const map = value[section];
    if (map === undefined) continue;
    object(map, section);
    if (section === "tiers") keys(map, ["heavy", "standard", "light"], section);
    if (Object.keys(map).length > 256) throw new Error(`${section} exceeds 256 routes`);
    for (const [name, entry] of Object.entries(map)) {
      if (!name || name.length > 128 || /\s|[\x00-\x1f\x7f]/.test(name) || ["__proto__", "constructor", "prototype"].includes(name)) {
        throw new Error(`${section} contains an invalid target name`);
      }
      route(entry, `${section}.${name}`);
    }
  }
  for (const section of ["taskOverrides", "virtualModels"]) {
    const settings = value[section];
    if (settings === undefined) continue;
    object(settings, section);
    keys(settings, section === "taskOverrides" ? ["enabled", "allowedTiers"] : ["enabled"], section);
    if (settings.enabled !== undefined && typeof settings.enabled !== "boolean") throw new Error(`${section}.enabled must be boolean`);
    if (settings.allowedTiers !== undefined) {
      if (!Array.isArray(settings.allowedTiers) || settings.allowedTiers.length === 0 || settings.allowedTiers.length > 3 ||
          settings.allowedTiers.some((tier) => !TIERS.has(tier as string)) || new Set(settings.allowedTiers).size !== settings.allowedTiers.length) {
        throw new Error("taskOverrides.allowedTiers must contain distinct routing tiers");
      }
    }
    if (settings.enabled === true) throw new Error(`${section} is not implemented yet; keep enabled false until its implementation slice is available`);
  }
}

function own<T>(map: Record<string, T> | undefined, key: string): T | undefined {
  return map && Object.hasOwn(map, key) ? map[key] : undefined;
}

/** Pure route precedence. Physical availability is checked by the Pi adapter. */
export function selectModelRoutingPolicy(
  config: ModelRoutingConfig,
  input: { target: string; targetType: RoutingTargetType; defaultTier?: RoutingTier; sessionModel?: string },
): { route: ModelRoute; tier: RoutingTier | null; source: string; pinned: boolean } {
  const map = input.targetType === "agent" ? config.agents : input.targetType === "skill" ? config.skills : config.commands;
  const explicit = own(map, input.target) ?? own(map, input.target.replace(/^\//, ""));
  const tier = explicit?.tier ?? input.defaultTier ?? null;
  const tierRoute = tier ? config.tiers?.[tier] : undefined;
  const route = { ...config.default, ...tierRoute, ...explicit, ...(input.sessionModel ? { model: input.sessionModel } : {}) };
  const explicitModel = explicit?.model && explicit.model !== "inherit" && explicit.model !== "omit";
  const pinned = Boolean(input.sessionModel || route.locked === true || (explicitModel && !(config.version === 2 && explicit?.locked === false)));
  const source = input.sessionModel ? `session.${input.target}` : explicit ? `${input.targetType}s.${input.target}` : tier ? `tiers.${tier}` : "default";
  return { route: Object.freeze(route), tier, source, pinned };
}
