import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";

import { resolveModelRouting, type ResolveModelRoutingRequest } from "../src/extension/model-routing.ts";
import { MAX_PENDING_ROUTES, ROUTING_ADVISORY_TTL_MS, RoutingAdvisory } from "../src/extension/routing-advisory.ts";

function fixture(fn: (cwd: string) => void) {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-routing-advisory-"));
  try { fn(cwd); } finally { rmSync(cwd, { recursive: true, force: true }); }
}

function decision(cwd: string, request: ResolveModelRoutingRequest) {
  return resolveModelRouting(request, { cwd, model: { provider: "fixture", id: "current" } });
}

test("advisory retains same-role task decisions and never associates by model or caller label", () => {
  fixture((cwd) => {
    const advisory = new RoutingAdvisory();
    const first = decision(cwd, { agent: "gsd-executor", taskId: "same-label" });
    const second = decision(cwd, { agent: "gsd-executor", taskId: "same-label" });
    advisory.record(cwd, first);
    advisory.record(cwd, second);
    for (const model of [first.subagent.model, second.subagent.model]) {
      assert.match(advisory.warning(cwd, { agent: "gsd-executor", model }) ?? "", /unavailable.*2 matching decisions/);
    }
    assert.ok(advisory.hasPending(cwd));
  });
});

test("only one exact legacy direct-role attempt is consumed; unrelated unresolved records survive", () => {
  fixture((cwd) => {
    const advisory = new RoutingAdvisory();
    const mapper = decision(cwd, { agent: "gsd-codebase-mapper" });
    const denied = decision(cwd, { agent: "gsd-planner", tier: "light", taskId: "disabled" });
    advisory.record(cwd, denied);
    advisory.record(cwd, mapper);
    assert.equal(advisory.warning(cwd, { agent: "gsd-codebase-mapper", model: mapper.subagent.model }), undefined);
    assert.ok(advisory.hasPending(cwd));
    assert.match(advisory.warning(cwd, { agent: "gsd-planner" }) ?? "", /unavailable.*1 matching decisions/);
    assert.match(advisory.warning(cwd, { agent: "gsd-codebase-mapper" }) ?? "", /unavailable.*0 matching decisions/);
  });
});

test("scripted, generic-worker and external-cwd launches are unavailable rather than guessed", () => {
  fixture((cwd) => {
    const advisory = new RoutingAdvisory();
    const route = decision(cwd, { agent: "gsd-executor" });
    advisory.record(cwd, route);
    for (const input of [
      { workflow: "named" }, { workflowScript: "throw new Error('must not execute')" },
      { workflowScriptPath: "never-read.js" }, { tasks: [] }, { chain: [] },
      { agent: "worker" }, { agent: "gsd-executor", cwd: "../worktree" },
    ]) {
      assert.match(advisory.warning(cwd, { ...input, model: route.subagent.model }) ?? "", /validation unavailable/);
      assert.ok(advisory.hasPending(cwd));
    }
    assert.equal(advisory.warning(cwd, { action: "status" }), undefined);
    assert.equal(advisory.warning(cwd, { agent: "gsd-executor", model: route.subagent.model, cwd }), undefined);
    assert.equal(advisory.hasPending(cwd), false);
  });
});

test("policy revision change invalidates an associated snapshot rather than rerouting it", () => {
  fixture((cwd) => {
    const advisory = new RoutingAdvisory();
    const route = decision(cwd, { agent: "gsd-executor" });
    advisory.record(cwd, route);
    mkdirSync(path.join(cwd, ".pi-gsd"));
    writeFileSync(path.join(cwd, ".pi-gsd/model-routing.json"), "{}");
    assert.match(advisory.warning(cwd, { agent: "gsd-executor", model: route.subagent.model }) ?? "", /stale/);
    assert.equal(route.subagent.model, "fixture/current:high");
  });
});

test("associated legacy error and omit guidance are checked without becoming launch authority", () => {
  fixture((cwd) => {
    mkdirSync(path.join(cwd, ".pi-gsd"));
    const file = path.join(cwd, ".pi-gsd/model-routing.json");
    const advisory = new RoutingAdvisory();
    writeFileSync(file, JSON.stringify({ agents: { "gsd-executor": { model: "fixture/missing", fallback: "error" } } }));
    advisory.record(cwd, decision(cwd, { agent: "gsd-executor" }));
    assert.match(advisory.warning(cwd, { agent: "gsd-executor" }) ?? "", /unresolved route/);
    writeFileSync(file, JSON.stringify({ agents: { "gsd-executor": { model: "omit" } } }));
    advisory.record(cwd, decision(cwd, { agent: "gsd-executor" }));
    assert.match(advisory.warning(cwd, { agent: "gsd-executor", model: "fixture/current" }) ?? "", /says to omit/);
    advisory.record(cwd, decision(cwd, { agent: "gsd-executor" }));
    assert.equal(advisory.warning(cwd, { agent: "gsd-executor" }), undefined);
  });
});

test("advisory records are bounded, expiring, cwd-scoped and explicitly clearable", () => {
  fixture((cwd) => {
    let now = 0;
    const advisory = new RoutingAdvisory(() => now);
    for (let index = 0; index <= MAX_PENDING_ROUTES; index++) {
      advisory.record(cwd, decision(cwd, { agent: `gsd-fixture-${index}` }));
    }
    assert.match(advisory.warning(cwd, { agent: "gsd-fixture-0" }) ?? "", /0 matching decisions/);
    assert.equal(advisory.hasPending(path.join(cwd, "another")), false);
    assert.match(advisory.warning(path.join(cwd, "another"), { agent: "gsd-fixture-1" }) ?? "", /no recorded model route/);
    now = ROUTING_ADVISORY_TTL_MS;
    assert.equal(advisory.hasPending(cwd), false);
    advisory.record(cwd, decision(cwd, { agent: "gsd-executor" }));
    assert.ok(advisory.hasPending(cwd));
    advisory.clear();
    assert.equal(advisory.hasPending(cwd), false);
  });
});
