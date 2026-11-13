import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
export const MAX_INLINE_BYTES = 64 * 1024;
export type PiExecResult = {
  stdout?: string; stderr?: string; exitCode?: number | null; code?: number | null;
  killed?: boolean; truncated?: boolean; signal?: string | null;
  cancelled?: boolean; timedOut?: boolean; outputLimit?: boolean; launchError?: string;
  stdoutIncomplete?: boolean; stderrIncomplete?: boolean; terminationUnconfirmed?: boolean;
};
export type PiExec = (command: string, args?: string[], options?: {
  cwd?: string; signal?: AbortSignal; timeout?: number; maxBuffer?: number;
}) => Promise<PiExecResult | string>;
export type CoreExecution = {
  outcome: "success" | "failed" | "cancelled" | "timed-out" | "terminated" | "output-limit" | "incomplete-output" | "launch-error" | "unknown";
  exitCode: number | null; signal: string | null;
  stdout: string; stderr: string; truncated: boolean; stdoutTruncated: boolean; stderrTruncated: boolean;
  captureIncomplete: boolean;
  terminationUnconfirmed: boolean;
  fullOutput?: { stdout?: string; stderr?: string; complete: boolean };
  recoveryError?: string; json?: unknown;
};

/** Saved output is private, bounded scratch data retained for subsequent reads
 * until OS/operator cleanup. It is not durable GSD state. */
export function normalizeExecution(raw: PiExecResult | string): CoreExecution {
  const result = typeof raw === "string" ? { stdout: raw } : raw;
  const code = result.exitCode ?? result.code;
  const exitCode = typeof code === "number" && Number.isInteger(code) ? code : null;
  const limited = result.outputLimit === true || result.truncated === true;
  const captureIncomplete = limited || result.stdoutIncomplete === true || result.stderrIncomplete === true;
  const outcome: CoreExecution["outcome"] = result.cancelled ? "cancelled" : result.timedOut ? "timed-out"
    : result.launchError ? "launch-error" : limited ? "output-limit" : result.killed || result.signal ? "terminated"
    : result.terminationUnconfirmed ? "unknown" : exitCode === 0 ? (captureIncomplete ? "incomplete-output" : "success")
    : exitCode === null ? "unknown" : "failed";
  const execution: CoreExecution = { outcome, exitCode, signal: result.signal ?? null,
    stdout: "", stderr: "", truncated: captureIncomplete,
    stdoutTruncated: limited || result.stdoutIncomplete === true, stderrTruncated: limited || result.stderrIncomplete === true,
    captureIncomplete, terminationUnconfirmed: result.terminationUnconfirmed === true };
  let directory: string | undefined;
  for (const stream of ["stdout", "stderr"] as const) {
    const bytes = Buffer.from(result[stream] ?? (stream === "stderr" ? result.launchError ?? "" : ""), "utf8");
    const saved = bytes.subarray(0, MAX_CAPTURE_BYTES);
    const clipped = bytes.length > MAX_INLINE_BYTES;
    execution[stream] = (clipped ? saved.subarray(Math.max(0, saved.length - MAX_INLINE_BYTES)) : saved).toString("utf8");
    execution[`${stream}Truncated`] ||= clipped;
    execution.truncated ||= clipped;
    if (bytes.length > MAX_CAPTURE_BYTES) {
      execution.captureIncomplete = true;
      if (!result.cancelled && !result.timedOut) execution.outcome = "output-limit";
    }
    if (clipped) {
      try {
        directory ??= fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-output-"));
        fs.chmodSync(directory, 0o700);
        const file = path.join(directory, `${stream}.txt`);
        fs.writeFileSync(file, saved, { mode: 0o600, flag: "wx" });
        execution.fullOutput ??= { complete: !execution.captureIncomplete && !execution.recoveryError };
        execution.fullOutput[stream] = file;
        execution.fullOutput.complete &&= bytes.length <= MAX_CAPTURE_BYTES;
      } catch (error) {
        const message = `Could not retain ${stream}: ${error instanceof Error ? error.message : String(error)}`;
        execution.recoveryError = [execution.recoveryError, message].filter(Boolean).join("; ");
        execution.fullOutput ??= { complete: false };
        execution.fullOutput.complete = false;
      }
    }
  }
  if (execution.fullOutput && execution.captureIncomplete) execution.fullOutput.complete = false;
  if (execution.outcome === "success" && !execution.stdoutTruncated) {
    try { execution.json = JSON.parse(execution.stdout); } catch { /* Plain output is valid too. */ }
  }
  return execution;
}
export function formatExecution(result: CoreExecution): string {
  const heading = result.outcome === "success" || result.outcome === "failed" ? `gsd-tools exited with ${result.exitCode}`
    : `gsd-tools ${result.outcome} (exit code ${result.exitCode ?? "unavailable"})`;
  return [heading, "", result.stdout, ...(result.stderr ? ["[stderr]", result.stderr] : []),
    ...(result.truncated ? ["[Output truncated; inspect execution completeness and recovery paths before using it.]"] : []),
    ...(result.fullOutput ? [`Saved output: ${JSON.stringify(result.fullOutput)}`] : []),
    ...(result.recoveryError ? [result.recoveryError] : [])].join("\n").trimEnd();
}
function entrypoint(command: string): string | null {
  const root = path.resolve(path.dirname(command), "..", "@opengsd", "gsd-core");
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const file = manifest.bin?.["gsd-tools"];
    if (typeof file !== "string") return null;
    const resolved = path.resolve(root, file);
    return fs.statSync(resolved).isFile() ? resolved : null;
  } catch { return null; }
}
export function selectCoreExecutor(command: string, host?: PiExec): PiExec {
  const main = entrypoint(command);
  if (!host || (/\.(cmd|bat|ps1)$/i.test(command) && main)) return execWithNodeSpawn;
  if (!main) return host;
  return (_command, args, options) => host(process.execPath, [
    "--import", 'data:text/javascript,process.env.GSD_RUNTIME="pi"', main, ...(args ?? []),
  ], { ...options, maxBuffer: MAX_CAPTURE_BYTES });
}
class Capture {
  private readonly chunks: Buffer[] = [];
  private size = 0;
  limited = false;
  append(chunk: Buffer) {
    const remaining = MAX_CAPTURE_BYTES - this.size;
    if (chunk.length > remaining) this.limited = true;
    const kept = chunk.subarray(0, remaining);
    if (kept.length) { this.chunks.push(kept); this.size += kept.length; }
  }
  text() { return Buffer.concat(this.chunks, this.size).toString("utf8"); }
}
// These are transport cleanup bounds, not workflow or descendant-lifetime policy.
export const OUTPUT_DRAIN_MS = 200;
export const TERMINATION_GRACE_MS = 250;
export const TERMINATION_CONFIRM_MS = 1_000;

export const execWithNodeSpawn: PiExec = (command, args = [], options) => new Promise((resolve, reject) => {
  if (options?.signal?.aborted) {
    resolve({ stdout: "", stderr: "Cancelled before starting.", exitCode: null, cancelled: true });
    return;
  }
  const main = /\.(cmd|bat|ps1)$/i.test(command) ? entrypoint(command) : null;
  const child = spawn(main ? process.execPath : command, main ? [main, ...args] : args, {
    cwd: options?.cwd, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GSD_RUNTIME: "pi" },
  });
  const stdout = new Capture(), stderr = new Capture();
  let cancelled = false, timedOut = false, error: Error | undefined;
  let settled = false, exited = false, stopping = false;
  let exitCode: number | null = null, signal: string | null = null;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let escalation: ReturnType<typeof setTimeout> | undefined;
  let confirmation: ReturnType<typeof setTimeout> | undefined;
  let drain: ReturnType<typeof setTimeout> | undefined;
  const clearProcessTimers = () => {
    clearTimeout(deadline); clearTimeout(escalation); clearTimeout(confirmation);
  };
  const finish = () => {
    if (settled) return;
    settled = true;
    clearProcessTimers(); clearTimeout(drain);
    options?.signal?.removeEventListener("abort", abort);
    const stdoutIncomplete = !child.stdout!.readableEnded;
    const stderrIncomplete = !child.stderr!.readableEnded;
    child.stdout!.destroy(); child.stderr!.destroy();
    // Do not retain the session forever if the OS never confirms termination.
    // Never claim such a process stopped, and do not kill unrelated descendants.
    const terminationUnconfirmed = !exited && child.pid !== undefined;
    if (terminationUnconfirmed) child.unref();
    if (error && !stopping) { reject(error); return; }
    resolve({ stdout: stdout.text(), stderr: stderr.text() || (cancelled ? "Cancelled while running." : ""),
      exitCode, signal, cancelled, timedOut, stdoutIncomplete, stderrIncomplete, terminationUnconfirmed,
      outputLimit: stdout.limited || stderr.limited });
  };
  const kill = (requested: NodeJS.Signals) => {
    try { child.kill(requested); } catch (value) { error = value instanceof Error ? value : new Error(String(value)); }
  };
  const stop = (reason: "cancelled" | "timed-out" | "output-limit") => {
    if (settled || stopping) return;
    if (exited) { finish(); return; }
    stopping = true;
    cancelled = reason === "cancelled";
    timedOut = reason === "timed-out";
    clearTimeout(deadline);
    kill("SIGTERM");
    escalation = setTimeout(() => {
      if (exited || settled) return;
      kill("SIGKILL");
      confirmation = setTimeout(finish, TERMINATION_CONFIRM_MS);
    }, TERMINATION_GRACE_MS);
  };
  const abort = () => stop("cancelled");
  const receive = (capture: Capture, chunk: Buffer) => {
    if (settled) return;
    capture.append(chunk);
    if (capture.limited) stop("output-limit");
  };
  child.stdout!.on("data", (chunk: Buffer) => receive(stdout, chunk));
  child.stderr!.on("data", (chunk: Buffer) => receive(stderr, chunk));
  child.on("error", (value) => { error = value; if (!stopping) finish(); });
  child.on("exit", (code, exitedSignal) => {
    if (settled) return;
    exited = true; exitCode = code; signal = exitedSignal;
    clearProcessTimers();
    // Descendants can retain inherited pipes after the command has exited.
    // Drain briefly, then disclose incomplete capture instead of waiting forever.
    drain = setTimeout(finish, OUTPUT_DRAIN_MS);
  });
  child.on("close", (code, exitedSignal) => {
    if (!exited) { exitCode = code; signal = exitedSignal; exited = child.pid !== undefined; }
    finish();
  });
  options?.signal?.addEventListener("abort", abort, { once: true });
  if (options?.timeout && options.timeout > 0) deadline = setTimeout(() => stop("timed-out"), options.timeout);
  if (options?.signal?.aborted) abort();
});