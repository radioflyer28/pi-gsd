import { CHILD_TOOL_READINESS } from "./subagent-guidance.ts";
import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { loadAgentRoutingCatalog, type AgentRoutingCatalog } from "./agent-routing-catalog.ts";
import { selectModelRoutingPolicy, taskRoutingRequestError, validateModelRoutingPolicy } from "./model-routing-policy.ts";

export type ThinkingLevel = "inherit" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ModelFallback = "inherit" | "omit" | "error" | "prompt";
export type RoutingTier = "heavy" | "standard" | "light";
export type RoutingTargetType = "agent" | "skill" | "command";

export type ModelRoute = {
  model?: string;
  thinking?: ThinkingLevel;
  tier?: RoutingTier;
  fallback?: ModelFallback;
  locked?: boolean;
};

export type ModelRoutingConfig = {
  version?: 1 | 2;
  fallback?: ModelFallback;
  default?: ModelRoute;
  tiers?: Partial<Record<RoutingTier, ModelRoute>>;
  agents?: Record<string, ModelRoute>;
  skills?: Record<string, ModelRoute>;
  commands?: Record<string, ModelRoute>;
  coordinator?: ModelRoute;
  taskOverrides?: { enabled?: boolean; allowedTiers?: RoutingTier[] };
  virtualModels?: { enabled?: boolean };
};

export type PiModelLike = {
  provider?: string;
  id?: string;
  name?: string;
  api?: string;
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
  /** Adapter package root, not the project cwd; injectable for compatibility tests. */
  packageRoot?: string;
};

export type ResolveModelRoutingRequest = {
  target?: string;
  agent?: string;
  skill?: string;
  command?: string;
  tier?: RoutingTier;
  taskId?: string;
};

export type ResolvedModelRouting = Readonly<{
  decisionId: string;
  taskId: string | null;
  requestedTier: RoutingTier | null;
  /** Provider-effective thinking is not observed during resolution. */
  effectiveThinking: null;
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
  pinned: boolean;
  provenance: Readonly<{
    configPath: string;
    configRevision: string | null;
    configVersion: 1 | 2 | null;
    configStatus: "loaded" | "default" | "invalid";
    catalogPath: string;
    catalogVersion: string | null;
    catalogStatus: AgentRoutingCatalog["status"];
  }>;
  warnings: readonly string[];
  error?: string;
  subagent: Readonly<{
    model?: string;
    action: "pass-model" | "omit-model" | "resolve-first";
    note: string;
  }>;
  recommendedAction: Readonly<{
    mode: "use-explicit" | "inherit-current" | "omit-model" | "prompt-user" | "error";
    model?: string;
    thinking?: ThinkingLevel;
    message: string;
  }>;
}>;

export const DEFAULT_MODEL_ROUTING_CONFIG: ModelRoutingConfig = {
  fallback: "inherit",
  default: { model: "inherit", thinking: "inherit" },
  tiers: {
    heavy: { model: "inherit", thinking: "xhigh" },
    standard: { model: "inherit", thinking: "high" },
    light: { model: "inherit", thinking: "medium" },
  },
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
  return value === "inherit" || value === "off" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh" || value === "max"
    ? value
    : undefined;
}

function normalizeTier(value: unknown): RoutingTier | undefined {
  return value === "heavy" || value === "standard" || value === "light" ? value : undefined;
}

function splitModelThinkingSuffix(model: string): { model: string; thinking?: Exclude<ThinkingLevel, "inherit"> } {
  const match = model.match(/^(.*):(off|minimal|low|medium|high|xhigh|max)$/);
  if (!match?.[1]) return { model };
  return { model: match[1], thinking: match[2] as Exclude<ThinkingLevel, "inherit"> };
}

function normalizeRoute(value: unknown): ModelRoute {
  if (!isRecord(value)) return {};
  const route: ModelRoute = {};
  const suffixed = typeof value.model === "string" ? splitModelThinkingSuffix(value.model) : undefined;
  if (suffixed) route.model = suffixed.model;
  const thinking = normalizeThinking(value.thinking) ?? suffixed?.thinking;
  if (thinking) route.thinking = thinking;
  const tier = normalizeTier(value.tier);
  if (tier) route.tier = tier;
  const fallback = normalizeFallback(value.fallback);
  if (fallback) route.fallback = fallback;
  if (typeof value.locked === "boolean") route.locked = value.locked;
  return route;
}

function normalizeRouteMap(value: unknown): Record<string, ModelRoute> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, ModelRoute> = Object.create(null);
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
    version: value.version === 2 ? 2 : 1,
    fallback: normalizeFallback(value.fallback),
    default: normalizeRoute(value.default),
    tiers: normalizeTierMap(value.tiers),
    agents: normalizeRouteMap(value.agents),
    skills: normalizeRouteMap(value.skills),
    commands: normalizeRouteMap(value.commands),
    coordinator: value.coordinator === undefined ? undefined : normalizeRoute(value.coordinator),
    taskOverrides: value.taskOverrides as ModelRoutingConfig["taskOverrides"],
    virtualModels: value.virtualModels as ModelRoutingConfig["virtualModels"],
  };
}

function mergeRoute(base?: ModelRoute, override?: ModelRoute): ModelRoute {
  return { ...(base ?? {}), ...(override ?? {}) };
}

export function getModelRoutingConfigPath(cwd: string): string {
  return path.resolve(cwd, ".pi-gsd", "model-routing.json");
}

export function loadModelRoutingConfig(cwd: string): { config: ModelRoutingConfig; path: string; revision: string | null; warnings: string[]; error?: string } {
  const configPath = getModelRoutingConfigPath(cwd);
  const warnings: string[] = [];
  let userConfig: ModelRoutingConfig = {};
  let error: string | undefined;
  let revision: string | null = null;

  try {
    if (fs.statSync(configPath).size > 256 * 1024) throw new Error("routing policy exceeds 256 KiB");
    const text = fs.readFileSync(configPath, "utf8");
    revision = createHash("sha256").update(text).digest("hex");
    const parsed: unknown = JSON.parse(text);
    validateModelRoutingPolicy(parsed);
    userConfig = normalizeConfig(parsed);
    if (userConfig.coordinator) warnings.push("The coordinator policy is stored for a later slice; it does not switch the current Pi session or register a virtual model.");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") {
      error = `Failed to read ${configPath}: ${cause instanceof SyntaxError ? "invalid JSON" : cause instanceof Error ? cause.message : "invalid policy"}. Correct the routing policy before delegation.`;
      warnings.push(error);
    }
  }

  const config: ModelRoutingConfig = {
    version: userConfig.version ?? 1,
    fallback: userConfig.fallback ?? (userConfig.version === 2 ? "error" : DEFAULT_MODEL_ROUTING_CONFIG.fallback),
    default: mergeRoute(DEFAULT_MODEL_ROUTING_CONFIG.default, userConfig.default),
    tiers: {
      heavy: mergeRoute(DEFAULT_MODEL_ROUTING_CONFIG.tiers?.heavy, userConfig.tiers?.heavy),
      standard: mergeRoute(DEFAULT_MODEL_ROUTING_CONFIG.tiers?.standard, userConfig.tiers?.standard),
      light: mergeRoute(DEFAULT_MODEL_ROUTING_CONFIG.tiers?.light, userConfig.tiers?.light),
    },
    agents: { ...(userConfig.agents ?? {}) },
    skills: { ...(userConfig.skills ?? {}) },
    commands: { ...(userConfig.commands ?? {}) },
    coordinator: userConfig.coordinator,
    taskOverrides: userConfig.taskOverrides,
    virtualModels: userConfig.virtualModels,
  };

  return { config, path: configPath, revision, warnings, error };
}

export function writeModelTierRoute(
  cwd: string,
  tier: RoutingTier,
  route: ModelRoute,
): string {
  const configPath = getModelRoutingConfigPath(cwd);
  let raw: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (!isRecord(parsed)) throw new Error("configuration root must be a JSON object");
      raw = parsed;
    }
  } catch (error) {
    throw new Error(`Cannot update ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const tiers = isRecord(raw.tiers) ? { ...raw.tiers } : {};
  const existingRoute = isRecord(tiers[tier]) ? tiers[tier] : {};
  tiers[tier] = { ...existingRoute, ...route };
  const next = { ...raw, tiers };
  validateModelRoutingPolicy(next);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const temporaryPath = `${configPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, configPath);
  return configPath;
}

export function modelRef(model?: PiModelLike | null): string | null {
  if (!model?.id) return null;
  return model.provider ? `${model.provider}/${model.id}` : model.id;
}

function availableModels(registry?: PiModelRegistryLike): PiModelLike[] {
  if (registry?.getAvailable) {
    try {
      return registry.getAvailable() ?? [];
    } catch {
      // Model switching may still use the full catalogue and let Pi verify auth.
    }
  }
  try {
    return registry?.getAll?.() ?? [];
  } catch {
    return [];
  }
}

function findVerifiedAvailablePiModel(
  model: string,
  registry?: PiModelRegistryLike,
  exactReference = false,
): { model?: PiModelLike; inventoryAvailable: boolean } {
  if (!registry?.getAvailable) return { inventoryAvailable: false };
  let models: PiModelLike[];
  try {
    models = registry.getAvailable() ?? [];
  } catch {
    return { inventoryAvailable: false };
  }
  const candidates = models.filter((candidate) => {
    const ref = modelRef(candidate);
    return exactReference ? ref === model : candidate.id === model || candidate.name === model || ref === model;
  });
  return { model: candidates.length === 1 ? candidates[0] : undefined, inventoryAvailable: true };
}

export function findPiModel(model: string, registry?: PiModelRegistryLike): PiModelLike | undefined {
  const candidates = availableModels(registry).filter((candidate) => {
    const ref = modelRef(candidate);
    return candidate.id === model || candidate.name === model || ref === model;
  });

  return candidates.length === 1 ? candidates[0] : undefined;
}

function isAgentTarget(target: string, catalog: AgentRoutingCatalog, config: ModelRoutingConfig): boolean {
  const canonical = target.replace(/^\//, "");
  return Object.hasOwn(catalog.tiers, canonical) || [target, canonical, `/${canonical}`].some((key) => Object.hasOwn(config.agents ?? {}, key));
}

function inferRequest(request: ResolveModelRoutingRequest, catalog: AgentRoutingCatalog, config: ModelRoutingConfig): { target: string; targetType: RoutingTargetType } {
  if (typeof request.agent === "string" && request.agent) return { target: request.agent, targetType: "agent" };
  if (typeof request.skill === "string" && request.skill) return { target: request.skill, targetType: "skill" };
  if (typeof request.command === "string" && request.command) return { target: request.command, targetType: "command" };

  const target = typeof request.target === "string" && request.target ? request.target : "default";
  if (isAgentTarget(target, catalog, config)) return { target, targetType: "agent" };
  if (target.startsWith("gsd:") || Object.hasOwn(DEFAULT_SKILL_TIERS, target)) return { target, targetType: "skill" };
  if (target.startsWith("/gsd") || target.startsWith("gsd-")) {
    return { target, targetType: "skill" };
  }
  return { target, targetType: "command" };
}

function defaultTierFor(target: string, targetType: RoutingTargetType, catalog: AgentRoutingCatalog): RoutingTier | undefined {
  if (targetType === "agent") return catalog.tiers[target.replace(/^\//, "")];
  const name = target.replace(/^\//, "");
  return Object.hasOwn(DEFAULT_SKILL_TIERS, name) ? DEFAULT_SKILL_TIERS[name] : undefined;
}

export function resolveModelRouting(
  request: ResolveModelRoutingRequest,
  context: ModelRoutingContext,
): ResolvedModelRouting {
  const requestError = taskRoutingRequestError(request);
  const requestedTier = normalizeTier(request.tier) ?? null;
  const loaded = loadModelRoutingConfig(context.cwd);
  const catalog = loadAgentRoutingCatalog(context.packageRoot);
  const warnings = [...loaded.warnings, ...catalog.warnings];
  const { target, targetType } = inferRequest(request, catalog, loaded.config);
  const targetKindError = requestedTier && targetType !== "agent" && isAgentTarget(target, catalog, loaded.config)
    ? "This target is a known/configured agent. Resolve it as an agent, not a skill or command; target-kind changes cannot bypass agent pins."
    : undefined;
  if (targetType === "agent" && !Object.hasOwn(catalog.tiers, target.replace(/^\//, ""))) {
    warnings.push(`No upstream routing tier is known for agent ${target}; using only configured/default routing.`);
  }
  const canonicalTarget = target.replace(/^\//, "");
  const rememberedKey = [target, canonicalTarget, `/${canonicalTarget}`].find((key) => Object.hasOwn(context.sessionModelOverrides ?? {}, key));
  const rememberedModel = rememberedKey ? context.sessionModelOverrides?.[rememberedKey] : undefined;
  const { route, tier, source, pinned, error: policyError } = selectModelRoutingPolicy(loaded.config, {
    target, targetType, defaultTier: defaultTierFor(target, targetType, catalog), sessionModel: rememberedModel,
    requestedTier: requestedTier ?? undefined,
  });
  const fallback = route.fallback ?? loaded.config.fallback ?? "inherit";
  const requestedModel = route.model ?? "inherit";
  const requestedThinking = route.thinking ?? "inherit";
  const inheritedModel = modelRef(context.model);
  const inheritedThinking = context.thinkingLevel ?? "inherit";

  let model: string | null = null;
  let available = false;
  let mode: ResolvedModelRouting["recommendedAction"]["mode"] = "inherit-current";
  let error: string | undefined = loaded.error ?? requestError ?? targetKindError ?? policyError;

  if (error) {
    mode = "error";
    if (!warnings.includes(error)) warnings.push(error);
  } else if (requestedModel === "omit") {
    mode = "omit-model";
    model = null;
    available = true;
  } else if (requestedModel === "inherit") {
    mode = "inherit-current";
    model = inheritedModel;
    available = Boolean(inheritedModel);
    if (!inheritedModel) warnings.push("No current Pi model is available to inherit.");
  } else {
    const lookup = findVerifiedAvailablePiModel(requestedModel, context.modelRegistry, loaded.config.version === 2);
    if (!lookup.inventoryAvailable) {
      warnings.push("Pi's available-model inventory is unavailable; configured child models are treated as unverified and fallback policy applies.");
    }
    if (lookup.model) {
      mode = "use-explicit";
      model = modelRef(lookup.model) ?? requestedModel;
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
    } else if (inheritedModel) {
      mode = "inherit-current";
      model = inheritedModel;
      available = false;
      warnings.push(`Configured model ${requestedModel} is not available in Pi; inheriting current Pi model ${inheritedModel}.`);
    } else {
      mode = "error";
      model = null;
      available = false;
      error = `Configured model ${requestedModel} is not available in Pi and no current Pi model is available to inherit.`;
      warnings.push(error);
    }
  }

  // Until virtual-child support is verified, v2 decisions must identify one
  // currently available physical target. Omission cannot prove eligibility.
  if (loaded.config.version === 2 && mode !== "error" && mode !== "prompt-user") {
    const verified = model ? findVerifiedAvailablePiModel(model, context.modelRegistry, true).model : undefined;
    if (!verified || !verified.provider || !verified.id || verified.api === "pi-virtual") {
      mode = "error";
      model = null;
      available = false;
      error = "Version-2 child routing requires a verified provider-qualified physical model; virtual aliases, omitted defaults and unverified inherited targets are not supported yet.";
      warnings.push(error);
    }
  }

  const thinking = requestedThinking === "inherit" ? inheritedThinking : requestedThinking;
  const canLaunch = mode !== "error" && mode !== "prompt-user";
  const routedSubagentModel = canLaunch && mode !== "omit-model" && model
    ? `${model}${thinking !== "inherit" ? `:${thinking}` : ""}`
    : undefined;
  const subagent: ResolvedModelRouting["subagent"] = mode === "error"
    ? {
        action: "resolve-first",
        note: "Do not delegate this target until its task request, routing policy and physical model eligibility are corrected.",
      }
    : mode === "prompt-user"
      ? {
          action: "resolve-first",
          note: "Do not delegate this target yet. Run `/gsd-model` for it and choose an available fallback model first.",
        }
      : routedSubagentModel
        ? {
            action: "pass-model",
            model: routedSubagentModel,
            note: "Pass `model` exactly as shown to pi-subagents. Its suffix makes the routed thinking level explicit and visible in subagent status.",
          }
        : {
            action: "omit-model",
            note: "Omit `model` when delegating. pi-subagents cannot apply a per-run thinking level without a model override; use its `defaultThinking` or agent override if thinking must be pinned.",
          };

  return Object.freeze({
    decisionId: `gsd-route-${randomUUID()}`,
    taskId: requestError ? null : request.taskId ?? null,
    requestedTier,
    effectiveThinking: null,
    target,
    targetType,
    tier,
    requestedModel,
    requestedThinking,
    model,
    thinking,
    available,
    fallback,
    source,
    pinned,
    provenance: Object.freeze({
      configPath: loaded.path,
      configRevision: loaded.revision,
      configVersion: loaded.error ? null : loaded.config.version ?? 1,
      configStatus: loaded.error ? "invalid" : loaded.revision ? "loaded" : "default",
      catalogPath: catalog.path,
      catalogVersion: catalog.version ?? null,
      catalogStatus: catalog.status,
    }),
    warnings: Object.freeze(warnings),
    error,
    subagent: Object.freeze(subagent),
    recommendedAction: Object.freeze({
      mode,
      ...(model ? { model } : {}),
      thinking,
      message: error ?? (warnings[0] ?? (mode === "use-explicit" ? `Use ${model}.` : "Inherit the current Pi model.")),
    }),
  });
}

const MODEL_ROUTING_AUDIT_TARGETS: Array<{ tier: RoutingTier; agent: string }> = [
  { tier: "heavy", agent: "gsd-planner" },
  { tier: "standard", agent: "gsd-executor" },
  { tier: "light", agent: "gsd-codebase-mapper" },
];

export function formatModelRoutingAudit(context: ModelRoutingContext): string {
  const loaded = loadModelRoutingConfig(context.cwd);
  const results = MODEL_ROUTING_AUDIT_TARGETS.map(({ tier, agent }) => ({
    tier,
    result: resolveModelRouting({ agent }, context),
  }));
  const configuredRequests: ResolveModelRoutingRequest[] = [
    ...Object.keys(loaded.config.agents ?? {}).map((agent) => ({ agent })),
    ...Object.keys(loaded.config.skills ?? {}).map((skill) => ({ skill })),
    ...Object.keys(loaded.config.commands ?? {}).map((command) => ({ command })),
  ];
  const configuredResults = configuredRequests.slice(0, 25).map((request) => resolveModelRouting(request, context));
  const configuredCount = configuredRequests.length;
  const warnings = [...new Set([
    ...loaded.warnings,
    ...results.flatMap(({ result }) => result.warnings),
    ...configuredResults.flatMap((result) => result.warnings),
  ])];
  const lines = [
    "## Model routing audit",
    "",
    `- config: \`${loaded.path}\` (${fs.existsSync(loaded.path) ? "present" : "defaults only"})`,
    `- policy: ${results[0].result.provenance.configStatus}, version ${results[0].result.provenance.configVersion ?? "invalid"}, revision ${loaded.revision ?? "none"}`,
    `- agent catalog: ${results[0].result.provenance.catalogStatus}, GSD Core ${results[0].result.provenance.catalogVersion ?? "unknown"}`,
    `- catalog source: \`${results[0].result.provenance.catalogPath}\` (read-only package-local adapter)`,
    `- task overrides: ${loaded.config.taskOverrides?.enabled === true ? "enabled" : "disabled"}; allowed tiers: ${loaded.config.taskOverrides?.allowedTiers?.join(", ") ?? "none"}`,
    `- configured target overrides: ${configuredCount}`,
    ...results.map(({ tier, result }) => {
      const consumer = result.subagent.model
        ? `pass \`${result.subagent.model}\``
        : result.subagent.action;
      return `- ${tier} (${result.target}): Pi \`${result.model ?? "<none>"}\`, thinking \`${result.thinking}\`, child ${consumer}`;
    }),
    ...(configuredResults.length > 0 ? ["- configured target routes:"] : []),
    ...configuredResults.map((result) => `  - ${result.target} (${result.targetType}): ${result.subagent.model ? `pass \`${result.subagent.model}\`` : result.subagent.action}`),
    ...(configuredCount > configuredResults.length ? [`  - ...${configuredCount - configuredResults.length} additional route(s) omitted`] : []),
  ];
  if (warnings.length > 0) lines.push(...warnings.map((warning) => `- warning: ${warning}`));
  return lines.join("\n");
}

export function formatResolvedModelRouting(result: ResolvedModelRouting): string {
  const lines = [
    "# pi-gsd model routing",
    "",
    `- target: \`${result.target}\` (${result.targetType})`,
    `- decision: ${result.decisionId}`,
    `- task: ${result.taskId ?? "legacy/unscoped"} (correlation only, not authority)`,
    `- requested tier: ${result.requestedTier ?? "none"}`,
    `- tier: ${result.tier ?? "none"}`,
    `- source: ${result.source}`,
    `- pinned: ${result.pinned ? "yes" : "no"}`,
    `- policy: \`${result.provenance.configPath}\` (${result.provenance.configStatus}, version ${result.provenance.configVersion ?? "invalid"})`,
    `- policy revision: ${result.provenance.configRevision ?? "none"}`,
    `- agent catalog: ${result.provenance.catalogStatus}, GSD Core ${result.provenance.catalogVersion ?? "unknown"}`,
    `- catalog source: \`${result.provenance.catalogPath}\``,
    `- requested model: ${result.requestedModel ?? "none"}`,
    `- resolved model: ${result.model ?? "<omit/inherit>"}`,
    `- requested thinking: ${result.requestedThinking}`,
    `- launch thinking request: ${result.thinking}`,
    "- provider-effective thinking: unobserved (Pi/provider may clamp it)",
    `- fallback: ${result.fallback}`,
    `- available: ${result.available ? "yes" : "no"}`,
    `- Pi session action: ${result.recommendedAction.mode}`,
  ];

  lines.push("", "## pi-subagents consumer", "", `- action: ${result.subagent.action}`);
  if (result.subagent.model) lines.push(`- pass model: \`${result.subagent.model}\``);
  lines.push(`- note: ${result.subagent.note}`);
  lines.push(`- child tool readiness: ${CHILD_TOOL_READINESS}`);

  if (result.warnings.length > 0) {
    lines.push("", "## Warnings", "", ...result.warnings.map((warning) => `- ${warning}`));
  }

  if (result.error) lines.push("", `Error: ${result.error}`);
  return lines.join("\n");
}
