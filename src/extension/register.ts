import {
  createGsdDispatcher,
  type GsdAction,
  type GsdDispatcher,
  type GsdExecutionContext,
  type GsdParams,
  type PiExec,
  resolveCwd,
  type TextTruncator,
} from "./dispatcher.ts";
import { detectCapabilities, type Capabilities, type ExistsProbe } from "./capabilities.ts";
import {
  discoverGsdCoreCommands,
  expandGsdCoreCommandPrompt,
  type GsdCoreCommand,
} from "./gsd-core-commands.ts";
import { findPiModel, resolveModelRouting, type ModelRoutingContext } from "./model-routing.ts";

type TextContent = {
  type: "text";
  text: string;
};

export type PiToolResult = {
  content: TextContent[];
  details: {
    caps: Capabilities;
  };
};

export type RegisterablePiApi = {
  registerTool?: (tool: Record<string, unknown>) => void;
  registerCommand?: (name: string, command: Record<string, unknown>) => void;
  getAllTools?: () => Array<{ name?: string }>;
  getThinkingLevel?: () => "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  setThinkingLevel?: (level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh") => void;
  setModel?: (model: unknown) => Promise<boolean>;
  sendUserMessage?: (message: string, options?: { deliverAs?: "steer" | "followUp" }) => void;
  exec?: PiExec;
};

export type RegisterPiGsdOptions = {
  parameters: unknown;
  dispatcher?: GsdDispatcher;
  exists?: ExistsProbe;
  packageRoot?: string;
  gsdToolsCommand?: string;
  truncateOutput?: TextTruncator;
  detect?: (cwd: string) => Capabilities;
  defaultCwd?: string;
  gsdCoreCommands?: GsdCoreCommand[];
};

function toToolResult(text: string, details: PiToolResult["details"]): PiToolResult {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

function activeToolNames(pi: RegisterablePiApi): string[] {
  try {
    return pi.getAllTools?.().map((tool) => tool.name).filter((name): name is string => Boolean(name)) ?? [];
  } catch {
    return [];
  }
}

function modelContext(
  cwd: string,
  ctx?: GsdExecutionContext,
  pi?: RegisterablePiApi,
  sessionModelOverrides?: Map<string, string>,
): ModelRoutingContext {
  return {
    cwd,
    model: ctx?.model,
    modelRegistry: ctx?.modelRegistry,
    thinkingLevel: pi?.getThinkingLevel?.(),
    sessionModelOverrides: sessionModelOverrides ? Object.fromEntries(sessionModelOverrides) : undefined,
  };
}

function createRuntimeAwareDetector(
  pi: RegisterablePiApi,
  options: { exists?: ExistsProbe; packageRoot?: string },
): (cwd: string) => Capabilities {
  return (cwd: string) =>
    detectCapabilities({
      cwd,
      exists: options.exists,
      packageRoot: options.packageRoot,
      activeToolNames: activeToolNames(pi),
    });
}

async function executeGsd(
  dispatcher: GsdDispatcher,
  params: GsdParams = {},
  signal?: AbortSignal,
  ctx?: GsdExecutionContext,
  defaultCwd?: string,
  pi?: RegisterablePiApi,
  sessionModelOverrides?: Map<string, string>,
): Promise<PiToolResult> {
  const action = params.action ?? "status";
  const cwd = resolveCwd(params, ctx, defaultCwd);
  const args = Array.isArray(params.args) ? params.args : [];
  const routingContext = modelContext(cwd, ctx, pi, sessionModelOverrides);

  const result =
    action === "status"
      ? await dispatcher.status(cwd, routingContext)
      : action === "doctor"
        ? await dispatcher.doctor(cwd, routingContext)
        : action === "resolve-model"
          ? await dispatcher.resolveModel(params, cwd, routingContext)
          : await dispatcher.run(args, cwd, signal);

  return toToolResult(result.text, result.details);
}

export function parseCommandArgs(input: string): string[] {
  const args: string[] = [];
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
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaping) current += "\\";
  if (current) args.push(current);
  return args;
}

function commandHandler(
  dispatcher: GsdDispatcher,
  action: GsdAction,
  defaultCwd?: string,
  pi?: RegisterablePiApi,
  sessionModelOverrides?: Map<string, string>,
) {
  return async (argsOrCtx: unknown, maybeCtx?: GsdExecutionContext) => {
    const ctx = (maybeCtx ?? argsOrCtx) as GsdExecutionContext | undefined;
    const args = typeof argsOrCtx === "string" && action === "run" ? parseCommandArgs(argsOrCtx) : [];
    const result = await executeGsd(dispatcher, { action, args }, undefined, ctx, defaultCwd, pi, sessionModelOverrides);
    const text = result.content[0]?.text ?? "";

    return { text };
  };
}

function parseGsdModelTarget(input: unknown): GsdParams {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return { action: "resolve-model", agent: "gsd-planner" };
  const [kind, ...rest] = raw.split(/\s+/);
  const value = rest.join(" ").trim();
  if ((kind === "agent" || kind === "skill" || kind === "command") && value) {
    return { action: "resolve-model", [kind]: value } as GsdParams;
  }
  return { action: "resolve-model", target: raw };
}

function availableModelRefs(ctx?: GsdExecutionContext): string[] {
  const registry = ctx?.modelRegistry;
  let models: unknown[] = [];
  try {
    models = registry?.getAvailable?.() ?? [];
  } catch {
    models = [];
  }
  if (models.length === 0) {
    try {
      models = registry?.getAll?.() ?? [];
    } catch {
      models = [];
    }
  }
  return models
    .map((model) => {
      if (!model || typeof model !== "object") return null;
      const candidate = model as { provider?: string; id?: string; name?: string };
      if (!candidate.id) return null;
      return candidate.provider ? `${candidate.provider}/${candidate.id}` : candidate.id;
    })
    .filter((ref): ref is string => Boolean(ref));
}

async function promptForFallbackModel(ctx: GsdExecutionContext | undefined, title: string): Promise<string | undefined> {
  if (!ctx?.hasUI && !ctx?.ui?.select) return undefined;
  const refs = availableModelRefs(ctx);
  if (refs.length === 0 || !ctx?.ui?.select) return undefined;
  const inherited = ctx.model ? `Inherit current model (${ctx.model.provider ? `${ctx.model.provider}/` : ""}${ctx.model.id ?? "unknown"})` : "Inherit current model";
  const choice = await ctx.ui.select(title, [inherited, ...refs, "Cancel"]);
  if (!choice || choice === "Cancel" || choice.startsWith("Inherit current model")) return undefined;
  return choice;
}

function gsdCoreCommandHandler(command: GsdCoreCommand, pi: RegisterablePiApi) {
  return async (argsOrCtx: unknown, maybeCtx?: GsdExecutionContext & { isIdle?: () => boolean; ui?: { notify?: (message: string, level?: "info" | "warning" | "error") => void } }) => {
    const args = typeof argsOrCtx === "string" ? argsOrCtx : "";
    const ctx = (maybeCtx ?? argsOrCtx) as (GsdExecutionContext & { isIdle?: () => boolean; ui?: { notify?: (message: string, level?: "info" | "warning" | "error") => void } }) | undefined;

    if (!pi.sendUserMessage) {
      return { text: `pi-gsd could not dispatch /${command.slashName}; this Pi runtime does not expose sendUserMessage().` };
    }

    if (ctx?.isIdle && !ctx.isIdle()) {
      ctx.ui?.notify?.(`Agent is busy. Try /${command.slashName} again when the current turn finishes.`, "warning");
      return;
    }

    pi.sendUserMessage(expandGsdCoreCommandPrompt(command, args));
  };
}

function gsdModelCommandHandler(defaultCwd: string | undefined, pi: RegisterablePiApi, sessionModelOverrides: Map<string, string>) {
  return async (argsOrCtx: unknown, maybeCtx?: GsdExecutionContext) => {
    const ctx = (maybeCtx ?? argsOrCtx) as GsdExecutionContext | undefined;
    const cwd = resolveCwd({}, ctx, defaultCwd);
    const params = parseGsdModelTarget(argsOrCtx);
    const routingContext = modelContext(cwd, ctx, pi, sessionModelOverrides);
    const resolved = resolveModelRouting(params, routingContext);
    const lines = [
      `Resolved ${resolved.target} (${resolved.targetType}) -> model ${resolved.model ?? "<inherit/omit>"}, thinking ${resolved.thinking}`,
    ];

    if (resolved.warnings.length > 0) lines.push(...resolved.warnings.map((warning) => `Warning: ${warning}`));

    if (resolved.error) return { text: [...lines, `Error: ${resolved.error}`].join("\n") };

    let modelSwitchFailed = false;
    if (resolved.recommendedAction.mode === "prompt-user") {
      const choice = await promptForFallbackModel(ctx, `Choose fallback model for ${resolved.target}`);
      if (choice && ctx?.modelRegistry && pi.setModel) {
        const found = findPiModel(choice, ctx.modelRegistry);
        if (!found) return { text: [...lines, `Error: selected model ${choice} is no longer available.`].join("\n") };
        const switched = await pi.setModel(found);
        if (switched) sessionModelOverrides.set(resolved.target, choice);
        modelSwitchFailed = !switched;
        lines.push(switched ? `Switched Pi model to ${choice}. Remembered for ${resolved.target} in this session.` : `Could not switch to ${choice}; Pi reported missing auth or unavailable model.`);
      } else {
        lines.push("Model left unchanged; prompt was unavailable, cancelled, or user chose inherit.");
      }
    } else if (resolved.recommendedAction.mode === "use-explicit" && resolved.model && ctx?.modelRegistry && pi.setModel) {
      const found = findPiModel(resolved.model, ctx.modelRegistry);
      if (!found) return { text: [...lines, `Error: resolved model ${resolved.model} is no longer available.`].join("\n") };
      const switched = await pi.setModel(found);
      if (switched) sessionModelOverrides.set(resolved.target, resolved.model);
      modelSwitchFailed = !switched;
      lines.push(switched ? `Switched Pi model to ${resolved.model}. Remembered for ${resolved.target} in this session.` : `Could not switch to ${resolved.model}; Pi reported missing auth or unavailable model.`);
    } else {
      lines.push("Model left unchanged; this route inherits/omits the model.");
    }

    if (resolved.thinking !== "inherit" && pi.setThinkingLevel && !modelSwitchFailed) {
      pi.setThinkingLevel(resolved.thinking);
      lines.push(`Set Pi thinking level to ${resolved.thinking}.`);
    } else if (resolved.thinking !== "inherit" && modelSwitchFailed) {
      lines.push(`Thinking level left unchanged because model switch failed.`);
    }

    return { text: lines.join("\n") };
  };
}

export function registerPiGsdCore(pi: RegisterablePiApi, options: RegisterPiGsdOptions): void {
  const detect =
    options.detect ??
    ((cwd: string) =>
      createRuntimeAwareDetector(pi, {
        exists: options.exists,
        packageRoot: options.packageRoot,
      })(cwd));
  const sessionModelOverrides = new Map<string, string>();
  const gsdCoreCommands = options.gsdCoreCommands ?? discoverGsdCoreCommands({ packageRoot: options.packageRoot, exists: options.exists });
  const dispatcher =
    options.dispatcher ??
    createGsdDispatcher({
      exec: pi.exec?.bind(pi),
      exists: options.exists,
      packageRoot: options.packageRoot,
      gsdToolsCommand: options.gsdToolsCommand,
      truncateOutput: options.truncateOutput,
      detect,
    });

  pi.registerTool?.({
    name: "gsd",
    label: "GSD",
    description:
      "Thin Pi wrapper around upstream GSD Core. Use status/doctor first; use run for gsd-tools CLI calls when available.",
    promptSnippet: "Inspect and call upstream GSD Core through the pi-gsd adapter.",
    promptGuidelines: [
      "Use pi-gsd as a thin wrapper over upstream GSD Core; do not duplicate GSD workflow semantics.",
      "Use `.planning/` only for normal GSD-compatible project records.",
      "Use context-mode `ctx_*` tools only for bulky or transient context when available.",
      "Use `gsd` action `resolve-model` to resolve Pi-native model/thinking guidance for GSD agents, skills, or commands.",
      "When pi-subagents is available, consume the shared pi-gsd model-routing result and pass its explicit `subagent.model` only when present; otherwise omit model to inherit/default.",
      "Use pi-subagents directly for large planning/execution/review when available; do not expect the `gsd` tool to orchestrate subagents internally.",
    ],
    parameters: options.parameters,
    execute: (
      _toolCallId: string,
      params: GsdParams = {},
      signal?: AbortSignal,
      _onUpdate?: unknown,
      ctx?: GsdExecutionContext,
    ) => executeGsd(dispatcher, params, signal, ctx, options.defaultCwd, pi, sessionModelOverrides),
  });

  pi.registerCommand?.("gsd-status", {
    description: "Show pi-gsd status and optional integration detection.",
    handler: commandHandler(dispatcher, "status", options.defaultCwd, pi, sessionModelOverrides),
  });

  pi.registerCommand?.("gsd-doctor", {
    description: "Show pi-gsd diagnostics and integration guidance.",
    handler: commandHandler(dispatcher, "doctor", options.defaultCwd, pi, sessionModelOverrides),
  });

  pi.registerCommand?.("gsd-run", {
    description: "Run gsd-tools through the thin wrapper: /gsd-run <args>",
    handler: commandHandler(dispatcher, "run", options.defaultCwd, pi, sessionModelOverrides),
  });

  pi.registerCommand?.("gsd-model", {
    description: "Resolve and explicitly switch to the Pi model/thinking level configured for a GSD agent, skill, or command.",
    handler: gsdModelCommandHandler(options.defaultCwd, pi, sessionModelOverrides),
  });

  for (const command of gsdCoreCommands) {
    pi.registerCommand?.(command.slashName, {
      description: command.argumentHint
        ? `${command.argumentHint} — ${command.description}`
        : command.description,
      handler: gsdCoreCommandHandler(command, pi),
    });
  }
}
