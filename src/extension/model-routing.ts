import * as fs from "node:fs";
import * as path from "node:path";

export type ThinkingLevel = "inherit" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type ModelFallback = "inherit" | "omit" | "error" | "prompt";
export type RoutingTier = "heavy" | "standard" | "light";
export type RoutingTargetType = "agent" | "skill" | "command";

export type ModelRoute = {
  model?: string;
  thinking?: ThinkingLevel;
  tier?: RoutingTier;
  fallback?: ModelFallback;
};

export type ModelRoutingConfig = {
  fallback?: ModelFallback;
  default?: ModelRoute;
  tiers?: Partial<Record<RoutingTier, ModelRoute>>;
  agents?: Record<string, ModelRoute>;
  skills?: Record<string, ModelRoute>;
  commands?: Record<string, ModelRoute>;
};

export type PiModelLike = {
  provider?: string;
  id?: string;
  name?: string;
};

export type PiModelRegistryLike = {
  getAvailable?: () => PiModelLike[];
  getAll?: () => PiModelLike[];
  find?: (provider: string, modelId: string) => PiModelLike | undefined;
};

export type ModelRoutingContext = {
  cwd: string;
  model?: PiModelLike;
  modelRegistry?: PiModelRegistryLike;
  thinkingLevel?: Exclude<ThinkingLevel, "inherit">;
  sessionModelOverrides?: Record<string, string>;
};

export type ResolveModelRoutingRequest = {
  target?: string;
  agent?: string;
  skill?: string;
  command?: string;
};

export type ResolvedModelRouting = {
  target: string;
  targetType: RoutingTargetType;
  tier: RoutingTier | null;
  requestedModel: string | null;
  requestedThinking: ThinkingLevel;
  model: string | null;
  thinking: ThinkingLevel;
  available: boolean;
  fallback: ModelFallback;
  source: string;
  warnings: string[];
  error?: string;
  subagent: {
    model?: string;
    thinking?: Exclude<ThinkingLevel, "inherit">;
    note: string;
  };
  recommendedAction: {
    mode: "use-explicit" | "inherit-current" | "omit-model" | "prompt-user" | "error";
    model?: string;
    thinking?: ThinkingLevel;
    message: string;
  };
};

const DEFAULT_CONFIG: ModelRoutingConfig = {
  fallback: "inherit",
  default: { model: "inherit", thinking: "inherit" },
  tiers: {
    heavy: { model: "inherit", thinking: "xhigh" },
    standard: { model: "inherit", thinking: "high" },
    light: { model: "inherit", thinking: "medium" },
  },
};

const DEFAULT_AGENT_TIERS: Record<string, RoutingTier> = {
  "gsd-planner": "heavy",
  "gsd-roadmapper": "heavy",
  "gsd-eval-planner": "heavy",
  "gsd-framework-selector": "heavy",
  "gsd-debugger": "heavy",
  "gsd-debug-session-manager": "heavy",
  "gsd-security-auditor": "heavy",
  "gsd-user-profiler": "heavy",
  "gsd-assumptions-analyzer": "heavy",

  "gsd-executor": "standard",
  "gsd-code-fixer": "standard",
  "gsd-code-reviewer": "standard",
  "gsd-verifier": "standard",
  "gsd-phase-researcher": "standard",
  "gsd-project-researcher": "standard",
  "gsd-ui-researcher": "standard",
  "gsd-advisor-researcher": "standard",
  "gsd-ai-researcher": "standard",
  "gsd-doc-writer": "standard",
  "gsd-doc-synthesizer": "standard",
  "gsd-domain-researcher": "standard",
  "gsd-eval-auditor": "standard",

  "gsd-plan-checker": "light",
  "gsd-integration-checker": "light",
  "gsd-nyquist-auditor": "light",
  "gsd-pattern-mapper": "light",
  "gsd-ui-checker": "light",
  "gsd-ui-auditor": "light",
  "gsd-doc-verifier": "light",
  "gsd-doc-classifier": "light",
  "gsd-codebase-mapper": "light",
  "gsd-intel-updater": "light",
  "gsd-research-synthesizer": "light",
};

const DEFAULT_SKILL_TIERS: Record<string, RoutingTier> = {
  "gsd-plan-phase": "heavy",
  "gsd:plan-phase": "heavy",
  "gsd-ultraplan-phase": "heavy",
  "gsd:ultraplan-phase": "heavy",
  "gsd-new-project": "heavy",
  "gsd:new-project": "heavy",
  "gsd-new-milestone": "heavy",
  "gsd:new-milestone": "heavy",
  "gsd-execute-phase": "standard",
  "gsd:execute-phase": "standard",
  "gsd-verify-work": "standard",
  "gsd:verify-work": "standard",
  "gsd-code-review": "standard",
  "gsd:code-review": "standard",
  "gsd-quick": "standard",
  "gsd:quick": "standard",
  "gsd-review": "standard",
  "gsd:review": "standard",
  "gsd-health": "light",
  "gsd:health": "light",
  "gsd-progress": "light",
  "gsd:progress": "light",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeFallback(value: unknown): ModelFallback | undefined {
  return value === "inherit" || value === "omit" || value === "error" || value === "prompt" ? value : undefined;
}

function normalizeThinking(value: unknown): ThinkingLevel | undefined {
  return value === "inherit" || value === "off" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh"
    ? value
    : undefined;
}

function normalizeTier(value: unknown): RoutingTier | undefined {
  return value === "heavy" || value === "standard" || value === "light" ? value : undefined;
}

function normalizeRoute(value: unknown): ModelRoute {
  if (!isRecord(value)) return {};
  const route: ModelRoute = {};
  if (typeof value.model === "string") route.model = value.model;
  const thinking = normalizeThinking(value.thinking);
  if (thinking) route.thinking = thinking;
  const tier = normalizeTier(value.tier);
  if (tier) route.tier = tier;
  const fallback = normalizeFallback(value.fallback);
  if (fallback) route.fallback = fallback;
  return route;
}

function normalizeRouteMap(value: unknown): Record<string, ModelRoute> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, ModelRoute> = {};
  for (const [key, route] of Object.entries(value)) out[key] = normalizeRoute(route);
  return out;
}

function normalizeTierMap(value: unknown): Partial<Record<RoutingTier, ModelRoute>> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Partial<Record<RoutingTier, ModelRoute>> = {};
  for (const tier of ["heavy", "standard", "light"] as const) {
    if (Object.hasOwn(value, tier)) out[tier] = normalizeRoute(value[tier]);
  }
  return out;
}

function normalizeConfig(value: unknown): ModelRoutingConfig {
  if (!isRecord(value)) return {};
  return {
    fallback: normalizeFallback(value.fallback),
    default: normalizeRoute(value.default),
    tiers: normalizeTierMap(value.tiers),
    agents: normalizeRouteMap(value.agents),
    skills: normalizeRouteMap(value.skills),
    commands: normalizeRouteMap(value.commands),
  };
}

function mergeRoute(base?: ModelRoute, override?: ModelRoute): ModelRoute {
  return { ...(base ?? {}), ...(override ?? {}) };
}

export function getModelRoutingConfigPath(cwd: string): string {
  return path.join(cwd, ".pi-gsd", "model-routing.json");
}

export function loadModelRoutingConfig(cwd: string): { config: ModelRoutingConfig; path: string; warnings: string[] } {
  const configPath = getModelRoutingConfigPath(cwd);
  const warnings: string[] = [];
  let userConfig: ModelRoutingConfig = {};

  try {
    if (fs.existsSync(configPath)) {
      userConfig = normalizeConfig(JSON.parse(fs.readFileSync(configPath, "utf8")));
    }
  } catch (error) {
    warnings.push(`Failed to read ${configPath}: ${error instanceof Error ? error.message : String(error)}. Using defaults.`);
  }

  const config: ModelRoutingConfig = {
    fallback: userConfig.fallback ?? DEFAULT_CONFIG.fallback,
    default: mergeRoute(DEFAULT_CONFIG.default, userConfig.default),
    tiers: {
      heavy: mergeRoute(DEFAULT_CONFIG.tiers?.heavy, userConfig.tiers?.heavy),
      standard: mergeRoute(DEFAULT_CONFIG.tiers?.standard, userConfig.tiers?.standard),
      light: mergeRoute(DEFAULT_CONFIG.tiers?.light, userConfig.tiers?.light),
    },
    agents: { ...(userConfig.agents ?? {}) },
    skills: { ...(userConfig.skills ?? {}) },
    commands: { ...(userConfig.commands ?? {}) },
  };

  return { config, path: configPath, warnings };
}

export function modelRef(model?: PiModelLike | null): string | null {
  if (!model?.id) return null;
  return model.provider ? `${model.provider}/${model.id}` : model.id;
}

function availableModels(registry?: PiModelRegistryLike): PiModelLike[] {
  try {
    const available = registry?.getAvailable?.();
    if (available && available.length > 0) return available;
  } catch {
    // Fall back to all models below.
  }
  try {
    return registry?.getAll?.() ?? [];
  } catch {
    return [];
  }
}

export function findPiModel(model: string, registry?: PiModelRegistryLike): PiModelLike | undefined {
  const slash = model.indexOf("/");
  if (slash > 0) {
    const provider = model.slice(0, slash);
    const id = model.slice(slash + 1);
    const found = registry?.find?.(provider, id);
    if (found) return found;
  }

  const candidates = availableModels(registry).filter((candidate) => {
    const ref = modelRef(candidate);
    return candidate.id === model || candidate.name === model || ref === model;
  });

  return candidates.length === 1 ? candidates[0] : undefined;
}

function inferRequest(request: ResolveModelRoutingRequest): { target: string; targetType: RoutingTargetType } {
  if (request.agent) return { target: request.agent, targetType: "agent" };
  if (request.skill) return { target: request.skill, targetType: "skill" };
  if (request.command) return { target: request.command, targetType: "command" };

  const target = request.target || "default";
  if (target.startsWith("gsd:") || DEFAULT_SKILL_TIERS[target]) return { target, targetType: "skill" };
  if (target.startsWith("/gsd") || target.startsWith("gsd-")) {
    // `gsd-planner` is an agent; `gsd-plan-phase` is a command/skill. Prefer known agent map.
    if (DEFAULT_AGENT_TIERS[target]) return { target, targetType: "agent" };
    return { target, targetType: "skill" };
  }
  return { target, targetType: "command" };
}

function defaultTierFor(target: string, targetType: RoutingTargetType): RoutingTier | undefined {
  if (targetType === "agent") return DEFAULT_AGENT_TIERS[target];
  if (targetType === "skill") return DEFAULT_SKILL_TIERS[target] ?? DEFAULT_SKILL_TIERS[target.replace(/^\//, "")];
  return DEFAULT_SKILL_TIERS[target] ?? DEFAULT_SKILL_TIERS[target.replace(/^\//, "")];
}

function configuredRoute(config: ModelRoutingConfig, target: string, targetType: RoutingTargetType): { route: ModelRoute; source: string } {
  const map = targetType === "agent" ? config.agents : targetType === "skill" ? config.skills : config.commands;
  const explicit = map?.[target] ?? map?.[target.replace(/^\//, "")];
  if (explicit) return { route: explicit, source: `${targetType}s.${target}` };
  return { route: {}, source: "default" };
}

export function resolveModelRouting(
  request: ResolveModelRoutingRequest,
  context: ModelRoutingContext,
): ResolvedModelRouting {
  const loaded = loadModelRoutingConfig(context.cwd);
  const warnings = [...loaded.warnings];
  const { target, targetType } = inferRequest(request);
  const configured = configuredRoute(loaded.config, target, targetType);
  const rememberedModel = context.sessionModelOverrides?.[target];
  const tier = configured.route.tier ?? defaultTierFor(target, targetType) ?? null;
  const tierRoute = tier ? loaded.config.tiers?.[tier] : undefined;
  const route = mergeRoute(mergeRoute(mergeRoute(loaded.config.default, tierRoute), configured.route), rememberedModel ? { model: rememberedModel } : undefined);
  const fallback = route.fallback ?? loaded.config.fallback ?? "inherit";
  const requestedModel = route.model ?? "inherit";
  const requestedThinking = route.thinking ?? "inherit";
  const inheritedModel = modelRef(context.model);
  const inheritedThinking = context.thinkingLevel ?? "inherit";

  let model: string | null = null;
  let available = false;
  let mode: ResolvedModelRouting["recommendedAction"]["mode"] = "inherit-current";
  let error: string | undefined;

  if (requestedModel === "omit") {
    mode = "omit-model";
    model = null;
    available = true;
  } else if (requestedModel === "inherit") {
    mode = "inherit-current";
    model = inheritedModel;
    available = Boolean(inheritedModel);
    if (!inheritedModel) warnings.push("No current Pi model is available to inherit.");
  } else {
    const found = findPiModel(requestedModel, context.modelRegistry);
    if (found) {
      mode = "use-explicit";
      model = modelRef(found) ?? requestedModel;
      available = true;
    } else if (fallback === "omit") {
      mode = "omit-model";
      model = null;
      available = false;
      warnings.push(`Configured model ${requestedModel} is not available in Pi; omitting model so the runtime can inherit/default.`);
    } else if (fallback === "error") {
      mode = "error";
      model = null;
      available = false;
      error = `Configured model ${requestedModel} is not available in Pi.`;
      warnings.push(error);
    } else if (fallback === "prompt") {
      mode = "prompt-user";
      model = null;
      available = false;
      warnings.push(`Configured model ${requestedModel} is not available in Pi; prompt the user to choose a fallback model.`);
    } else {
      mode = "inherit-current";
      model = inheritedModel;
      available = false;
      warnings.push(
        inheritedModel
          ? `Configured model ${requestedModel} is not available in Pi; inheriting current Pi model ${inheritedModel}.`
          : `Configured model ${requestedModel} is not available in Pi and no current Pi model is available to inherit.`,
      );
    }
  }

  const thinking = requestedThinking === "inherit" ? inheritedThinking : requestedThinking;
  const subagent: ResolvedModelRouting["subagent"] = {
    note: mode === "use-explicit"
      ? "Pass `model` to the pi-subagents tool when delegating this target. Thinking is advisory unless the selected subagent/runtime exposes a thinking control."
      : "Omit `model` when delegating so pi-subagents inherits/defaults naturally. Thinking is advisory unless the selected subagent/runtime exposes a thinking control.",
  };
  if (mode === "use-explicit" && model) subagent.model = model;
  if (thinking !== "inherit") subagent.thinking = thinking;

  return {
    target,
    targetType,
    tier,
    requestedModel: requestedModel === "inherit" || requestedModel === "omit" ? requestedModel : requestedModel,
    requestedThinking,
    model,
    thinking,
    available,
    fallback,
    source: rememberedModel ? `session.${target}` : configured.source === "default" && tier ? `tiers.${tier}` : configured.source,
    warnings,
    error,
    subagent,
    recommendedAction: {
      mode,
      ...(model ? { model } : {}),
      thinking,
      message: error ?? (warnings[0] ?? (mode === "use-explicit" ? `Use ${model}.` : "Inherit the current Pi model.")),
    },
  };
}

export function formatResolvedModelRouting(result: ResolvedModelRouting): string {
  const lines = [
    "# pi-gsd model routing",
    "",
    `- target: \`${result.target}\` (${result.targetType})`,
    `- tier: ${result.tier ?? "none"}`,
    `- source: ${result.source}`,
    `- requested model: ${result.requestedModel ?? "none"}`,
    `- resolved model: ${result.model ?? "<omit/inherit>"}`,
    `- requested thinking: ${result.requestedThinking}`,
    `- resolved thinking: ${result.thinking}`,
    `- fallback: ${result.fallback}`,
    `- available: ${result.available ? "yes" : "no"}`,
    `- recommended action: ${result.recommendedAction.mode}`,
  ];

  if (result.subagent.model || result.subagent.thinking) {
    lines.push("", "## pi-subagents consumer", "");
    if (result.subagent.model) lines.push(`- pass model: \`${result.subagent.model}\``);
    else lines.push("- omit model to inherit/default");
    if (result.subagent.thinking) lines.push(`- requested thinking: \`${result.subagent.thinking}\``);
    lines.push(`- note: ${result.subagent.note}`);
  }

  if (result.warnings.length > 0) {
    lines.push("", "## Warnings", "", ...result.warnings.map((warning) => `- ${warning}`));
  }

  if (result.error) lines.push("", `Error: ${result.error}`);
  return lines.join("\n");
}
