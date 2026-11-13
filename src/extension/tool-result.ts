import { Type, type Static } from "typebox";
import type { GsdAction, GsdDispatchResult } from "./dispatcher.ts";

export const GSD_OUTPUT_SCHEMA = Type.Object({
  version: Type.Literal(1), action: Type.Union([Type.Literal("status"), Type.Literal("doctor"), Type.Literal("run"), Type.Literal("resolve-model"), Type.Literal("init-config")]), ok: Type.Boolean(), text: Type.String(),
  execution: Type.Optional(Type.Object({
    outcome: Type.Union([Type.Literal("success"), Type.Literal("failed"), Type.Literal("cancelled"), Type.Literal("timed-out"), Type.Literal("terminated"), Type.Literal("output-limit"), Type.Literal("incomplete-output"), Type.Literal("launch-error"), Type.Literal("unknown")]), exitCode: Type.Union([Type.Integer(), Type.Null()]), signal: Type.Union([Type.String(), Type.Null()]),
    stdout: Type.String(), stderr: Type.String(), truncated: Type.Boolean(), stdoutTruncated: Type.Boolean(), stderrTruncated: Type.Boolean(),
    captureIncomplete: Type.Boolean(), terminationUnconfirmed: Type.Boolean(),
    json: Type.Optional(Type.Unknown()),
    fullOutput: Type.Optional(Type.Object({ stdout: Type.Optional(Type.String()), stderr: Type.Optional(Type.String()), complete: Type.Boolean() })),
    recoveryError: Type.Optional(Type.String()),
  })),
  capabilities: Type.Object({ subagents: Type.Boolean(), contextMode: Type.Boolean(), mode: Type.String(),
    subagentCompatibility: Type.Optional(Type.Object({
      state: Type.Union([Type.Literal("known-unpatched-source"), Type.Literal("known-patched-source"), Type.Literal("unknown"), Type.Literal("not-loaded"), Type.Literal("disabled")]),
      evidence: Type.Union([Type.Literal("loaded-provider-files-on-disk"), Type.Literal("none")]),
      runtimeVerified: Type.Literal(false), nextAction: Type.Union([Type.Literal("ask-user"), Type.Literal("inspect"), Type.Literal("none")]),
      reason: Type.String(), repairGuide: Type.String(), providerPath: Type.Optional(Type.String()), packageRoot: Type.Optional(Type.String()), version: Type.Optional(Type.String()),
      entrySha256: Type.Optional(Type.String()), lookupPath: Type.Optional(Type.String()), lookupSha256: Type.Optional(Type.String()),
    })),
    subagentState: Type.Optional(Type.String()), loadedProviders: Type.Optional(Type.Record(Type.String(), Type.Array(Type.Object({ tool: Type.String(), path: Type.String() })))),
  }, { additionalProperties: true }),
  modelRouting: Type.Optional(Type.Object({ target: Type.String(), subagent: Type.Object({ action: Type.String(), model: Type.Optional(Type.String()) }, { additionalProperties: true }) }, { additionalProperties: true })),
  runtimeAgents: Type.Optional(Type.Object({ runtime: Type.Literal("pi"), source: Type.Literal("session-registration"), requestedCwd: Type.String(),
    status: Type.Object({ state: Type.String(), roles: Type.Array(Type.String()), cwd: Type.Optional(Type.String()), reason: Type.Optional(Type.String()) }, { additionalProperties: true }),
    childReadiness: Type.Literal("unverified"),
  })),
}, { additionalProperties: false });

export type GsdStructuredResult = Static<typeof GSD_OUTPUT_SCHEMA>;

export function toGsdToolResult(action: GsdAction, result: GsdDispatchResult) {
  const ok = result.ok ?? (result.details.execution ? result.details.execution.outcome === "success" : action !== "run");
  const structuredContent: GsdStructuredResult = JSON.parse(JSON.stringify({
    version: 1, action, ok, text: result.text, execution: result.details.execution,
    capabilities: result.details.caps, modelRouting: result.details.modelRouting, runtimeAgents: result.details.piRuntimeAgents,
  }));
  return { content: [{ type: "text" as const, text: result.text }], details: result.details, isError: !ok, structuredContent };
}
