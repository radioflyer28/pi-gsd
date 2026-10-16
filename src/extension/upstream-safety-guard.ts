import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { defaultPackageRoot, detectCapabilities } from "./capabilities.ts";
import { loadPiGsdConfig } from "./config.ts";

const MAX_HOOK_OUTPUT = 64 * 1024;
// GSD Core's blocking guards allow up to three 5s Git probes and use a
// 120s host budget. Do not cut off their containment decision after 4s.
export const UPSTREAM_GUARD_TIMEOUT_MS = 120_000;
const MAX_GUARD_DIAGNOSTIC = 2_048;

export type UpstreamGuardDiagnostic = {
  kind: "timeout" | "stderr" | "error" | "output-limit";
  script: string;
  message: string;
};

type GuardRunOptions = {
  /** A shorter bounded budget is useful for process-seam tests. */
  timeoutMs?: number;
  onDiagnostic?: (diagnostic: UpstreamGuardDiagnostic) => void;
};

export type UpstreamGuardResult = { block: true; reason: string } | undefined;
export type UpstreamGuardRunner = (
  scriptPath: string,
  payload: Record<string, unknown>,
  cwd: string,
  signal?: AbortSignal,
) => Promise<UpstreamGuardResult>;

type GuardPiApi = {
  on?: (eventName: string, handler: (event: any, ctx: any) => unknown) => void;
  getActiveTools?: () => string[];
  getCommands?: () => Array<{ name?: string }>;
};

type GuardRegistrationOptions = {
  packageRoot?: string;
  runner?: UpstreamGuardRunner;
  exists?: (candidate: string) => boolean;
};

function parseBlock(stdout: string): UpstreamGuardResult {
  if (!stdout || stdout.length > MAX_HOOK_OUTPUT) return undefined;
  try {
    const parsed = JSON.parse(stdout) as { decision?: unknown; reason?: unknown };
    return parsed.decision === "block" && typeof parsed.reason === "string" && parsed.reason.trim()
      ? { block: true, reason: parsed.reason.trim() }
      : undefined;
  } catch {
    return undefined;
  }
}

export function runUpstreamGuard(
  scriptPath: string,
  payload: Record<string, unknown>,
  cwd: string,
  signal?: AbortSignal,
  options: GuardRunOptions = {},
): Promise<UpstreamGuardResult> {
  if (signal?.aborted) return Promise.resolve(undefined);
  const requestedTimeout = options.timeoutMs ?? UPSTREAM_GUARD_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(requestedTimeout)
    ? Math.max(1, Math.min(requestedTimeout, UPSTREAM_GUARD_TIMEOUT_MS))
    : UPSTREAM_GUARD_TIMEOUT_MS;
  const diagnose = (kind: UpstreamGuardDiagnostic["kind"], message: string) => {
    const diagnostic = {
      kind,
      script: path.basename(scriptPath).replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").slice(0, 128),
      message: message.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").slice(0, MAX_GUARD_DIAGNOSTIC),
    };
    try {
      if (options.onDiagnostic) options.onDiagnostic(diagnostic);
      else console.warn(`[pi-gsd upstream guard] ${diagnostic.script} ${kind}: ${diagnostic.message}`);
    } catch {
      // Diagnostics must never change a guard decision or fail-open behavior.
    }
  };
  return new Promise((resolve) => {
    let settled = false;
    let terminated = false;
    let stdout = "";
    let stderr = "";
    const finish = (result?: UpstreamGuardResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      if (stderr.trim()) diagnose("stderr", stderr);
      resolve(result);
    };
    const child = spawn(process.execPath, [scriptPath], {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const abort = () => {
      if (settled || terminated) return;
      terminated = true;
      child.kill();
      // Resolve on close, not immediately after sending the signal: otherwise a
      // Windows child can still hold its cwd and pipes after this promise ends.
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      diagnose("timeout", `Exceeded ${timeoutMs}ms; allowing call because guard outcome is unknown.`);
      abort();
    }, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    child.once("error", (error) => {
      if (!settled) diagnose("error", error.message);
      finish(undefined);
    });
    child.stdin.on("error", () => abort());
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + String(chunk)).slice(0, MAX_GUARD_DIAGNOSTIC);
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (settled || terminated) return;
      stdout += String(chunk);
      if (stdout.length > MAX_HOOK_OUTPUT) {
        diagnose("output-limit", "Guard stdout exceeded 64 KiB; allowing call because guard outcome is unknown.");
        abort();
      }
    });
    child.once("close", () => finish(terminated ? undefined : parseBlock(stdout)));
    if (signal?.aborted) abort();
    else child.stdin.end(JSON.stringify(payload));
  });
}

function guardScripts(packageRoot: string): { write: string; worktree: string } {
  const hooks = path.join(packageRoot, "node_modules", "@opengsd", "gsd-core", "hooks");
  return {
    write: path.join(hooks, "gsd-write-guard.js"),
    worktree: path.join(hooks, "gsd-worktree-path-guard.js"),
  };
}

export function registerUpstreamSafetyGuard(
  pi: GuardPiApi,
  options: GuardRegistrationOptions = {},
): void {
  if (!pi.on) return;
  const exists = options.exists ?? fs.existsSync;
  const packageRoot = options.packageRoot ?? defaultPackageRoot(exists);
  const scripts = guardScripts(packageRoot);
  const runner = options.runner ?? runUpstreamGuard;

  pi.on("tool_call", async (event: { toolName?: string; input?: unknown }, ctx: { cwd?: string; signal?: AbortSignal }) => {
    try {
      const cwd = path.resolve(ctx.cwd ?? process.cwd());
      if (loadPiGsdConfig(cwd).config.safety.upstreamGuards !== "on") return;
      const caps = detectCapabilities({
        cwd,
        packageRoot,
        exists,
        activeToolNames: pi.getActiveTools?.() ?? [],
        activeCommandNames: pi.getCommands?.().map((command) => command.name).filter((name): name is string => Boolean(name)) ?? [],
      });
      if (caps.upstreamPiPlugin.activeTool || caps.upstreamPiPlugin.activeCommand) return;
      if (!event.input || typeof event.input !== "object") return;
      const input = event.input as { path?: unknown; content?: unknown };
      if (typeof input.path !== "string") return;

      if (event.toolName === "write" && exists(scripts.write) && typeof input.content === "string") {
        const result = await runner(scripts.write, {
          hook_event_name: "PreToolUse",
          tool_name: "Write",
          tool_input: { file_path: input.path, content: input.content },
          cwd,
        }, cwd, ctx.signal);
        if (result) return result;
      }

      if ((event.toolName === "write" || event.toolName === "edit") && exists(scripts.worktree)) {
        return await runner(scripts.worktree, {
          hook_event_name: "PreToolUse",
          tool_name: event.toolName === "write" ? "Write" : "Edit",
          tool_input: { file_path: input.path },
          cwd,
        }, cwd, ctx.signal);
      }
    } catch {
      // Upstream safety integration is opt-in but always fail-open on adapter failures.
    }
  });
}
