import * as fs from "node:fs";
import * as path from "node:path";

import { getPiGsdDiagnosticsPath, loadPiGsdConfig } from "./config.ts";

const MAX_DIAGNOSTIC_BYTES = 128 * 1024;
const RETAINED_DIAGNOSTIC_LINES = 200;
const MAX_DETAIL_LENGTH = 280;

export type PiGsdDiagnostic = {
  at: string;
  event: "tool" | "command";
  target: string;
  outcome: "ok" | "error" | "cancelled";
  detail?: string;
};

export type PiGsdDiagnosticSummary = {
  enabled: boolean;
  path: string;
  entries: number;
  lastEvent?: Pick<PiGsdDiagnostic, "at" | "event" | "target" | "outcome">;
};

function compactDetail(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  const normalized = detail.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, MAX_DETAIL_LENGTH) : undefined;
}

function sanitize(event: PiGsdDiagnostic): PiGsdDiagnostic {
  return {
    at: event.at,
    event: event.event,
    target: event.target.slice(0, 120),
    outcome: event.outcome,
    ...(compactDetail(event.detail) ? { detail: compactDetail(event.detail) } : {}),
  };
}

function trimLog(filePath: string): void {
  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size <= MAX_DIAGNOSTIC_BYTES) return;
    const retained = fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-RETAINED_DIAGNOSTIC_LINES)
      .join("\n");
    fs.writeFileSync(filePath, retained ? `${retained}\n` : "", "utf8");
  } catch {
    // Diagnostics are strictly best-effort and must never affect GSD execution.
  }
}

export function appendPiGsdDiagnostic(cwd: string, event: Omit<PiGsdDiagnostic, "at">): boolean {
  if (loadPiGsdConfig(cwd).config.diagnostics.sessionLog !== "on") return false;

  try {
    const filePath = getPiGsdDiagnosticsPath(cwd);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    trimLog(filePath);
    fs.appendFileSync(filePath, `${JSON.stringify(sanitize({ at: new Date().toISOString(), ...event }))}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

export function getPiGsdDiagnosticSummary(cwd: string): PiGsdDiagnosticSummary {
  const config = loadPiGsdConfig(cwd).config;
  const filePath = getPiGsdDiagnosticsPath(cwd);
  if (config.diagnostics.sessionLog !== "on") return { enabled: false, path: filePath, entries: 0 };

  try {
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
    const last = lines.length > 0 ? JSON.parse(lines[lines.length - 1]) as PiGsdDiagnostic : undefined;
    return {
      enabled: true,
      path: filePath,
      entries: lines.length,
      ...(last
        ? { lastEvent: { at: last.at, event: last.event, target: last.target, outcome: last.outcome } }
        : {}),
    };
  } catch {
    return { enabled: true, path: filePath, entries: 0 };
  }
}
