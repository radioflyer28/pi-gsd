import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";

import { resolveModelRouting, type ModelRoutingConfig, type ResolveModelRoutingRequest } from "../src/extension/model-routing.ts";

const models = ["coordinator", "heavy", "standard", "light", "role"].map((id) => ({ provider: "fixture", id }));
const policy: ModelRoutingConfig = {
  version: 2,
  taskOverrides: { enabled: true, allowedTiers: ["heavy", "standard", "light"] },
  tiers: {
    heavy: { model: "fixture/heavy", thinking: "xhigh" },
    standard: { model: "fixture/standard", thinking: "high" },
    light: { model: "fixture/light", thinking: "low" },
  },
};

function fixture(fn: (cwd: string, file: string) => void) {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-task-routing-"));
  const file = path.join(cwd, ".pi-gsd/model-routing.json");
  mkdirSync(path.dirname(file));
  writeFileSync(file, JSON.stringify(policy));
  try { fn(cwd, file); } finally { rmSync(cwd, { recursive: true, force: true }); }
}

function context(cwd: string) {
  return { cwd, model: models[0], modelRegistry: { getAvailable: () => models }, thinkingLevel: "high" as const };
}

test("coordinator can choose light planning and heavy execution without changing parent or policy", () => {
  fixture((cwd, file) => {
    const before = readFileSync(file, "utf8");
    const ctx = context(cwd);
    const light = resolveModelRouting({ agent: "gsd-planner", tier: "light", taskId: "update-references" }, ctx);
    const heavy = resolveModelRouting({ agent: "gsd-executor", tier: "heavy", taskId: "repair-invariant" }, ctx);
    assert.equal(light.subagent.model, "fixture/light:low");
    assert.equal(light.requestedTier, "light");
    assert.equal(light.tier, "light");
    assert.equal(light.source, "task.tiers.light");
    assert.equal(light.taskId, "update-references");
    assert.equal(heavy.subagent.model, "fixture/heavy:xhigh");
    assert.equal(ctx.model.id, "coordinator");
    assert.equal(ctx.thinkingLevel, "high");
    assert.equal(readFileSync(file, "utf8"), before);
  });
});

test("same-role assignments and reused task labels get independent immutable decisions", () => {
  fixture((cwd) => {
    const one = resolveModelRouting({ agent: "gsd-executor", tier: "light", taskId: "same-label" }, context(cwd));
    const two = resolveModelRouting({ agent: "gsd-executor", tier: "heavy", taskId: "same-label" }, context(cwd));
    assert.notEqual(one.decisionId, two.decisionId);
    assert.equal(one.subagent.model, "fixture/light:low");
    assert.equal(two.subagent.model, "fixture/heavy:xhigh");
    for (const value of [one, one.subagent, one.provenance, one.recommendedAction, one.warnings]) assert.ok(Object.isFrozen(value));
    assert.equal(one.effectiveThinking, null);
  });
});

test("explicit unlock replaces the complete role model/thinking/fallback with the chosen tier", () => {
  fixture((cwd, file) => {
    writeFileSync(file, JSON.stringify({ ...policy, agents: {
      "gsd-planner": { model: "fixture/role", thinking: "max", fallback: "omit", locked: false },
    } }));
    const result = resolveModelRouting({ agent: "gsd-planner", tier: "light", taskId: "references" }, context(cwd));
    assert.equal(result.subagent.model, "fixture/light:low");
    assert.equal(result.fallback, "error");
    assert.equal(result.pinned, false);
  });
});

test("locked roles and operator pins reject even same-tier overrides rather than silently ignore them", () => {
  fixture((cwd, file) => {
    const request = { agent: "gsd-executor", tier: "light", taskId: "bounded" } as const;
    for (const route of [{ model: "fixture/role" }, { tier: "light", locked: true }, { model: "fixture/role", locked: true }]) {
      writeFileSync(file, JSON.stringify({ ...policy, agents: { "gsd-executor": route } }));
      const result = resolveModelRouting(request, context(cwd));
      assert.equal(result.subagent.action, "resolve-first");
      assert.match(result.error ?? "", /locked or pinned/);
      assert.equal(result.model, null);
    }
    writeFileSync(file, JSON.stringify(policy));
    const session = resolveModelRouting(request, { ...context(cwd), sessionModelOverrides: { "gsd-executor": "fixture/coordinator" } });
    assert.equal(session.subagent.action, "resolve-first");
    assert.equal(session.source, "session.gsd-executor");
    const alias = resolveModelRouting({ target: "/gsd-executor", tier: "light", taskId: "bounded" }, {
      ...context(cwd), sessionModelOverrides: { "gsd-executor": "fixture/coordinator" },
    });
    assert.equal(alias.subagent.action, "resolve-first");
  });
});

test("disabled overrides, legacy policy and disallowed tiers fail closed", () => {
  fixture((cwd, file) => {
    for (const settings of [
      { ...policy, version: 1, taskOverrides: undefined },
      { ...policy, taskOverrides: undefined },
      { ...policy, taskOverrides: { enabled: false, allowedTiers: ["light"] } },
      { ...policy, taskOverrides: { enabled: true, allowedTiers: ["heavy"] } },
    ]) {
      writeFileSync(file, JSON.stringify(settings));
      const result = resolveModelRouting({ agent: "gsd-executor", tier: "light", taskId: "bounded" }, context(cwd));
      assert.equal(result.subagent.action, "resolve-first");
      assert.equal(result.model, null);
      assert.ok(result.error);
    }
  });
});

test("task request boundaries reject malformed, path-like or unscoped override input", () => {
  fixture((cwd) => {
    const requests: unknown[] = [
      { agent: "gsd-executor", tier: "light" },
      { agent: "gsd-executor", tier: "cheap", taskId: "bounded" },
      { agent: "gsd-executor", tier: null, taskId: "bounded" },
      { tier: "light", taskId: "bounded" },
      { agent: "gsd-executor", skill: "gsd-plan-phase", tier: "light", taskId: "bounded" },
      ...["", "../task", "a/b", "task\nsecret", "x".repeat(129), 42].map((taskId) => ({ agent: "gsd-executor", tier: "light", taskId })),
    ];
    for (const request of requests) {
      const result = resolveModelRouting(request as ResolveModelRoutingRequest, context(cwd));
      assert.equal(result.subagent.action, "resolve-first", JSON.stringify(request));
      assert.equal(result.model, null);
    }
    assert.equal(resolveModelRouting({ agent: "gsd-executor", tier: "light", taskId: "x".repeat(128) }, context(cwd)).subagent.action, "pass-model");
  });
});

test("task routes recheck physical availability and policy on each resolution without mutating past decisions", () => {
  fixture((cwd, file) => {
    const request = { agent: "gsd-executor", tier: "light", taskId: "bounded" } as const;
    const first = resolveModelRouting(request, context(cwd));
    for (const inventory of [[], [{ provider: "fixture", id: "light", api: "pi-virtual" }]]) {
      const denied = resolveModelRouting(request, { ...context(cwd), modelRegistry: { getAvailable: () => inventory } });
      assert.equal(denied.subagent.action, "resolve-first");
    }
    writeFileSync(file, JSON.stringify({ ...policy, taskOverrides: { enabled: false } }));
    assert.equal(resolveModelRouting(request, context(cwd)).subagent.action, "resolve-first");
    assert.equal(first.subagent.model, "fixture/light:low");
    assert.equal(first.requestedTier, "light");
  });
});

test("task labels without overrides preserve ordinary routes; explicit unknown-role assignment stays visible", () => {
  fixture((cwd) => {
    assert.equal(resolveModelRouting({ agent: "gsd-executor", taskId: "no-override" }, context(cwd)).subagent.model, "fixture/standard:high");
    const unknown = resolveModelRouting({ agent: "gsd-future-role", tier: "light", taskId: "explicit" }, context(cwd));
    assert.equal(unknown.subagent.model, "fixture/light:low");
    assert.match(unknown.warnings.join("\n"), /No upstream routing tier/);
    for (const request of [{ skill: "gsd-plan-phase" }, { command: "gsd:plan-phase" }]) {
      assert.equal(resolveModelRouting({ ...request, tier: "light", taskId: "helper" }, context(cwd)).subagent.model, "fixture/light:low");
    }
  });
});

test("known and configured agent pins cannot be bypassed through generic targets or a different target kind", () => {
  fixture((cwd, file) => {
    writeFileSync(file, JSON.stringify({ ...policy, agents: {
      "gsd-executor": { model: "fixture/role" },
      "gsd-new-custom": { model: "fixture/role" },
      "/gsd-slash-custom": { model: "fixture/role" },
    } }));
    for (const target of ["gsd-executor", "/gsd-executor", "gsd-new-custom", "gsd-slash-custom"]) {
      for (const field of ["target", "skill", "command"] as const) {
        const result = resolveModelRouting({ [field]: target, tier: "light", taskId: "bounded" }, context(cwd));
        assert.equal(result.subagent.action, "resolve-first", `${field}=${target}`);
      }
    }
  });
});
