import * as path from "node:path";

import { loadModelRoutingConfig, type ResolvedModelRouting } from "./model-routing.ts";

export const MAX_PENDING_ROUTES = 128;
export const ROUTING_ADVISORY_TTL_MS = 5 * 60 * 1000;

type PendingRoute = { cwd: string; decision: ResolvedModelRouting; expiresAt: number };

/**
 * Turn-local advisory evidence, not a launcher or permission boundary. The
 * optional subagent API has no native GSD decision-id association. Never infer
 * a task identity from its model, parse prompts/scripts, or invent tool fields.
 */
export class RoutingAdvisory {
  private readonly records = new Map<string, PendingRoute>();

  private readonly now: () => number;

  constructor(now: () => number = Date.now) { this.now = now; }

  private prune(): void {
    const now = this.now();
    for (const [id, entry] of this.records) if (entry.expiresAt <= now) this.records.delete(id);
  }

  record(cwd: string, decision: ResolvedModelRouting): void {
    this.prune();
    this.records.set(decision.decisionId, { cwd: path.resolve(cwd), decision, expiresAt: this.now() + ROUTING_ADVISORY_TTL_MS });
    while (this.records.size > MAX_PENDING_ROUTES) this.records.delete(this.records.keys().next().value!);
  }

  hasPending(cwd: string): boolean {
    this.prune();
    return [...this.records.values()].some((entry) => entry.cwd === path.resolve(cwd));
  }

  clear(): void {
    this.records.clear();
  }

  warning(cwd: string, input: unknown): string | undefined {
    if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
    const params = input as Record<string, unknown>;
    if ("action" in params) return undefined;
    const workflow = ["workflow", "workflowScript", "workflowScriptPath", "tasks", "chain"].some((key) => key in params);
    if (!workflow && typeof params.agent !== "string") return undefined;
    this.prune();
    const resolvedCwd = path.resolve(cwd);
    const records = [...this.records.values()].filter((entry) => entry.cwd === resolvedCwd);
    if (records.length === 0) return "GSD subagent launch has no recorded model route in this turn/cwd. Resolve each bounded assignment immediately before delegating.";
    if (workflow) return "GSD routing validation unavailable: a workflow's top-level model cannot verify per-child decisions. Pass each returned physical model explicitly; pending decisions were retained.";
    if (params.cwd !== undefined && (typeof params.cwd !== "string" || path.resolve(resolvedCwd, params.cwd) !== resolvedCwd)) {
      return "GSD routing validation unavailable: child cwd differs from the resolution cwd. Worktree policy propagation is not verified; pending decisions were retained.";
    }
    const matches = records.filter(({ decision }) => decision.targetType === "agent" && decision.target === params.agent);
    if (matches.length !== 1 || matches[0].decision.taskId !== null) {
      return `GSD routing validation unavailable: no unique legacy direct-role association (${matches.length} matching decisions). Task-scoped, reused-label and generic-worker launches expose no native GSD decision ID; pending decisions were retained. Do not add unsupported fields to subagent calls.`;
    }
    const { decision } = matches[0];
    // Only this unambiguously associated legacy attempt is consumed. Other
    // roles/tasks remain pending, even when they requested the same model.
    this.records.delete(decision.decisionId);
    const policy = loadModelRoutingConfig(resolvedCwd);
    if (policy.error || policy.revision !== decision.provenance.configRevision) {
      return "GSD routing decision is stale or its policy is invalid. Resolve again; no automatic rerouting was performed.";
    }
    if (decision.subagent.action === "resolve-first") return `GSD subagent launch has an unresolved route for ${decision.target}. Do not delegate until resolution succeeds.`;
    const supplied = typeof params.model === "string" ? params.model : undefined;
    if (decision.subagent.action === "omit-model") {
      return supplied !== undefined ? "GSD subagent launch supplied a model even though resolved child guidance says to omit it." : undefined;
    }
    if (supplied !== decision.subagent.model) return `GSD subagent launch expected exact model \`${decision.subagent.model}\`; its model is missing or different.`;
    return undefined;
  }
}
