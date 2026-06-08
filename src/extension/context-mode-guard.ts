import * as fs from "node:fs";
import * as path from "node:path";

type ToolCallEvent = {
  toolName?: string;
  input?: Record<string, unknown>;
};

type ToolCallContext = {
  cwd?: string;
  hasUI?: boolean;
  ui?: {
    notify?: (message: string, level?: "info" | "warning" | "error") => void;
  };
  sessionManager?: {
    getBranch?: () => unknown[];
    getEntries?: () => unknown[];
  };
};

type PiWithEvents = {
  on?: (eventName: "tool_call", handler: (event: ToolCallEvent, ctx: ToolCallContext) => Promise<unknown> | unknown) => void;
};

type GuardDecision =
  | { action: "allow"; reason?: string }
  | { action: "warn"; reason: string }
  | { action: "block"; reason: string };

const CONTEXT_MODE_TOOLS = new Set([
  "ctx_execute",
  "ctx_execute_file",
  "ctx_batch_execute",
  "ctx_index",
  "ctx_fetch_and_index",
  "ctx_search",
  "ctx_stats",
  "ctx_doctor",
  "ctx_upgrade",
  "ctx_purge",
  "ctx_insight",
]);

const ALWAYS_ALLOW_TOOLS = new Set([
  "ctx_execute",
  "ctx_batch_execute",
  "ctx_fetch_and_index",
  "ctx_search",
  "ctx_stats",
  "ctx_doctor",
  "ctx_upgrade",
  "ctx_purge",
  "ctx_insight",
]);

const BULKY_OR_TRANSIENT_EXTENSIONS = new Set([
  ".log",
  ".out",
  ".err",
  ".trace",
  ".har",
  ".snap",
  ".jsonl",
  ".csv",
  ".tsv",
]);

const SMALL_FILE_READ_EDIT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".cs",
  ".rb",
  ".php",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".ps1",
  ".css",
  ".scss",
  ".html",
  ".vue",
  ".svelte",
]);

const SMALL_FILE_WARNING_BYTES = 8 * 1024;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeCandidate(candidate: string, cwd: string): string {
  return path.resolve(cwd, candidate);
}

function pathSegments(candidate: string): string[] {
  return path.normalize(candidate).split(path.sep).filter(Boolean);
}

function isPlanningPath(candidate: string): boolean {
  return pathSegments(candidate).some((segment) => segment.toLowerCase() === ".planning");
}

function isPlanningRoot(candidate: string): boolean {
  return path.basename(path.resolve(candidate)).toLowerCase() === ".planning";
}

function latestUserText(ctx?: ToolCallContext): string {
  const entries = ctx?.sessionManager?.getBranch?.() ?? ctx?.sessionManager?.getEntries?.() ?? [];
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i] as any;
    const message = entry?.message ?? entry;
    if (message?.role !== "user") continue;
    const content = message.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map((item) => (typeof item?.text === "string" ? item.text : "")).join("\n");
    }
  }
  return "";
}

function userExplicitlyRequestedPlanningIndex(ctx?: ToolCallContext): boolean {
  const text = latestUserText(ctx).toLowerCase();
  return /\b(index|cache|ingest|store)\b/.test(text) && /\.planning|planning directory|planning folder/.test(text);
}

function userExplicitlyRequestedComputedFileProcessing(ctx?: ToolCallContext): boolean {
  const text = latestUserText(ctx).toLowerCase();
  return /\b(count|parse|extract|summari[sz]e|filter|aggregate|derive|calculate|compute|grep|match|find occurrences)\b/.test(
    text,
  );
}

function safeStat(candidate: string): fs.Stats | null {
  try {
    return fs.statSync(candidate);
  } catch {
    return null;
  }
}

function safeRealpath(candidate: string): string | null {
  try {
    return fs.realpathSync(candidate);
  } catch {
    return null;
  }
}

function isBulkyOrTransientPath(candidate: string): boolean {
  const ext = path.extname(candidate).toLowerCase();
  if (BULKY_OR_TRANSIENT_EXTENSIONS.has(ext)) return true;
  return /(^|[\\/])(coverage|dist|build|tmp|temp|logs?|test-results?|reports?)([\\/]|$)/i.test(candidate);
}

function isSmallFileWhereReadEditIsUsuallyBetter(candidate: string): boolean {
  if (isPlanningPath(candidate)) return true;
  return SMALL_FILE_READ_EDIT_EXTENSIONS.has(path.extname(candidate).toLowerCase());
}

export function evaluateContextModeToolCall(
  event: ToolCallEvent,
  ctx?: ToolCallContext,
  options: { stat?: (candidate: string) => fs.Stats | null; realpath?: (candidate: string) => string | null } = {},
): GuardDecision {
  const toolName = event.toolName ?? "";
  if (!CONTEXT_MODE_TOOLS.has(toolName)) return { action: "allow" };
  if (ALWAYS_ALLOW_TOOLS.has(toolName)) return { action: "allow" };

  const cwd = path.resolve(ctx?.cwd ?? process.cwd());
  const stat = options.stat ?? safeStat;
  const realpath = options.realpath ?? safeRealpath;

  if (toolName === "ctx_index") {
    const rawPath = asString(event.input?.path);
    if (!rawPath) return { action: "allow" };

    const candidate = normalizeCandidate(rawPath, cwd);
    const canonical = realpath(candidate) ?? candidate;
    const planningPath = isPlanningPath(candidate) || isPlanningPath(canonical);
    const planningRoot = isPlanningRoot(candidate) || isPlanningRoot(canonical);
    const info = stat(candidate);
    if (planningPath && planningRoot && (!info || info.isDirectory())) {
      if (userExplicitlyRequestedPlanningIndex(ctx)) {
        return {
          action: "warn",
          reason:
            "Indexing the entire .planning directory was explicitly requested. Treat context-mode as a search cache only; durable GSD state remains .planning/.",
        };
      }
      return {
        action: "block",
        reason:
          "Blocked wholesale context-mode indexing of .planning/. Read relevant planning files directly or index only an explicitly requested large artifact.",
      };
    }

    if (planningPath) {
      return {
        action: "warn",
        reason:
          "Indexing a .planning artifact is usually unnecessary. Prefer direct reads for small durable GSD records; use context-mode only when the artifact is large or repeatedly searched.",
      };
    }
  }

  if (toolName === "ctx_execute_file") {
    const rawPath = asString(event.input?.path);
    if (!rawPath) return { action: "allow" };

    const candidate = normalizeCandidate(rawPath, cwd);
    const canonical = realpath(candidate) ?? candidate;
    if (isBulkyOrTransientPath(candidate)) return { action: "allow" };
    if (userExplicitlyRequestedComputedFileProcessing(ctx)) return { action: "allow" };
    if (!isSmallFileWhereReadEditIsUsuallyBetter(candidate) && !isPlanningPath(canonical)) return { action: "allow" };

    const info = stat(candidate);
    if (info?.isFile() && info.size > 0 && info.size <= SMALL_FILE_WARNING_BYTES) {
      return {
        action: "warn",
        reason: `Small source/planning file (${info.size} bytes). Prefer read/edit when exact file context or edits are likely; reserve context-mode for bulky/noisy or computed extraction tasks.`,
      };
    }
  }

  return { action: "allow" };
}

export function registerContextModeGuard(pi: PiWithEvents): void {
  pi.on?.("tool_call", async (event, ctx) => {
    const decision = evaluateContextModeToolCall(event, ctx);
    if (decision.action === "allow") return undefined;

    if (ctx?.hasUI && typeof ctx.ui?.notify === "function") {
      ctx.ui.notify(decision.reason, decision.action === "block" ? "error" : "warning");
    }

    if (decision.action === "block") {
      return { block: true, reason: decision.reason };
    }

    return undefined;
  });
}
