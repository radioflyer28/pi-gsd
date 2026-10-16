import type { ModelRoute, ModelRoutingConfig, ResolveModelRoutingRequest, RoutingTargetType, RoutingTier } from "./model-routing.ts";

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
    const canonicalNames = new Set<string>();
    for (const [name, entry] of Object.entries(map)) {
      const canonical = name.replace(/^\//, "");
      if (canonicalNames.has(canonical)) throw new Error(`${section} contains ambiguous target aliases`);
      canonicalNames.add(canonical);
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
    if (section === "virtualModels" && settings.enabled === true) throw new Error("virtualModels is not implemented yet; keep enabled false until its implementation slice is available");
    if (section === "taskOverrides" && settings.enabled === true && settings.allowedTiers === undefined) {
      throw new Error("Enabling taskOverrides requires an explicit allowedTiers list");
    }
  }
}

function own<T>(map: Record<string, T> | undefined, key: string): T | undefined {
  return map && Object.hasOwn(map, key) ? map[key] : undefined;
}

export const TASK_ID_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$";

/** Validate again at the resolver boundary; programmatic callers may skip tool schemas. */
export function taskRoutingRequestError(request: ResolveModelRoutingRequest): string | undefined {
  if (request.taskId !== undefined && (typeof request.taskId !== "string" || !new RegExp(TASK_ID_PATTERN).test(request.taskId))) {
    return "taskId must be a 1–128 character label using letters, digits, dots, underscores, colons or hyphens, starting with a letter or digit.";
  }
  if (request.tier !== undefined) {
    if (!TIERS.has(request.tier)) return "Requested tier must be heavy, standard or light.";
    if (!request.taskId) return "A tier override requires a taskId for this bounded assignment.";
    const targets = [request.agent, request.skill, request.command, request.target].filter((target) => target !== undefined);
    if (targets.length !== 1 || typeof targets[0] !== "string" || !targets[0].trim()) {
      return "A tier override requires exactly one explicit agent, skill, command or target.";
    }
  }
  return undefined;
}

/** Pure route precedence. Physical availability is checked by the Pi adapter. */
export function selectModelRoutingPolicy(
  config: ModelRoutingConfig,
  input: { target: string; targetType: RoutingTargetType; defaultTier?: RoutingTier; sessionModel?: string; requestedTier?: RoutingTier },
): { route: ModelRoute; tier: RoutingTier | null; source: string; pinned: boolean; error?: string } {
  const map = input.targetType === "agent" ? config.agents : input.targetType === "skill" ? config.skills : config.commands;
  const canonical = input.target.replace(/^\//, "");
  const explicit = own(map, input.target) ?? own(map, canonical) ?? own(map, `/${canonical}`);
  const tier = explicit?.tier ?? input.defaultTier ?? null;
  const tierRoute = tier ? config.tiers?.[tier] : undefined;
  const route = { ...config.default, ...tierRoute, ...explicit, ...(input.sessionModel ? { model: input.sessionModel } : {}) };
  const explicitModel = explicit?.model && explicit.model !== "inherit" && explicit.model !== "omit";
  const pinned = Boolean(input.sessionModel || route.locked === true || (explicitModel && !(config.version === 2 && explicit?.locked === false)));
  const source = input.sessionModel ? `session.${input.target}` : explicit ? `${input.targetType}s.${input.target}` : tier ? `tiers.${tier}` : "default";
  if (input.requestedTier !== undefined) {
    const error = config.version !== 2 || config.taskOverrides?.enabled !== true
      ? "Task tier overrides require version 2 and taskOverrides.enabled=true."
      : !config.taskOverrides.allowedTiers?.includes(input.requestedTier)
        ? "The requested task tier is not permitted by taskOverrides.allowedTiers."
        : pinned
          ? "This route is locked or pinned by an explicit role model or operator/session selection; a task override is forbidden. Resolve without a tier override or ask the operator to change policy."
          : undefined;
    if (error) return { route: Object.freeze(route), tier, source, pinned, error };
    return {
      route: Object.freeze({ ...config.default, ...config.tiers?.[input.requestedTier] }),
      tier: input.requestedTier, source: `task.tiers.${input.requestedTier}`, pinned: false,
    };
  }
  return { route: Object.freeze(route), tier, source, pinned };
}
