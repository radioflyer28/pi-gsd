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
import { type Capabilities, type ExistsProbe } from "./capabilities.ts";

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
};

function toToolResult(text: string, details: PiToolResult["details"]): PiToolResult {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

async function executeGsd(
  dispatcher: GsdDispatcher,
  params: GsdParams = {},
  signal?: AbortSignal,
  ctx?: GsdExecutionContext,
  defaultCwd?: string,
): Promise<PiToolResult> {
  const action = params.action ?? "status";
  const cwd = resolveCwd(params, ctx, defaultCwd);
  const args = Array.isArray(params.args) ? params.args : [];

  const result =
    action === "status"
      ? await dispatcher.status(cwd)
      : action === "doctor"
        ? await dispatcher.doctor(cwd)
        : await dispatcher.run(args, cwd, signal);

  return toToolResult(result.text, result.details);
}

function commandHandler(dispatcher: GsdDispatcher, action: GsdAction, defaultCwd?: string) {
  return async (argsOrCtx: unknown, maybeCtx?: GsdExecutionContext) => {
    const ctx = (maybeCtx ?? argsOrCtx) as GsdExecutionContext | undefined;
    const args =
      typeof argsOrCtx === "string" && action === "run"
        ? argsOrCtx.split(/\s+/).filter(Boolean)
        : [];
    const result = await executeGsd(dispatcher, { action, args }, undefined, ctx, defaultCwd);
    const text = result.content[0]?.text ?? "";

    if (ctx?.hasUI && typeof ctx.ui?.notify === "function") {
      ctx.ui.notify(text, "info");
      return undefined;
    }

    return { text };
  };
}

export function registerPiGsdCore(pi: RegisterablePiApi, options: RegisterPiGsdOptions): void {
  const dispatcher =
    options.dispatcher ??
    createGsdDispatcher({
      exec: pi.exec?.bind(pi),
      exists: options.exists,
      packageRoot: options.packageRoot,
      gsdToolsCommand: options.gsdToolsCommand,
      truncateOutput: options.truncateOutput,
      detect: options.detect,
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
      "Use pi-subagents directly for large planning/execution/review when available; do not expect the `gsd` tool to orchestrate subagents internally.",
    ],
    parameters: options.parameters,
    execute: (
      _toolCallId: string,
      params: GsdParams = {},
      signal?: AbortSignal,
      _onUpdate?: unknown,
      ctx?: GsdExecutionContext,
    ) => executeGsd(dispatcher, params, signal, ctx, options.defaultCwd),
  });

  pi.registerCommand?.("gsd-status", {
    description: "Show pi-gsd status and optional integration detection.",
    handler: commandHandler(dispatcher, "status", options.defaultCwd),
  });

  pi.registerCommand?.("gsd-doctor", {
    description: "Show pi-gsd diagnostics and integration guidance.",
    handler: commandHandler(dispatcher, "doctor", options.defaultCwd),
  });

  pi.registerCommand?.("gsd-run", {
    description: "Run gsd-tools through the thin wrapper: /gsd-run <args>",
    handler: commandHandler(dispatcher, "run", options.defaultCwd),
  });
}
