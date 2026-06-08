import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";

import { resolveModelRouting } from "../src/extension/model-routing.ts";

function withRoutingConfig(config: string | object, fn: (cwd: string) => void) {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-model-routing-"));
  mkdirSync(path.join(cwd, ".pi-gsd"));
  writeFileSync(
    path.join(cwd, ".pi-gsd", "model-routing.json"),
    typeof config === "string" ? config : JSON.stringify(config),
  );

  try {
    fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("model routing surfaces invalid project config and falls back to defaults", () => {
  withRoutingConfig("{not json", (cwd) => {
    const resolved = resolveModelRouting(
      { agent: "gsd-planner" },
      { cwd, model: { provider: "openai", id: "current" }, thinkingLevel: "medium" },
    );

    assert.match(resolved.warnings.join("\n"), /Failed to read .*model-routing\.json/);
    assert.equal(resolved.model, "openai/current");
    assert.equal(resolved.thinking, "xhigh");
    assert.equal(resolved.recommendedAction.mode, "inherit-current");
  });
});

test("model routing supports fallback error for unavailable configured models", () => {
  withRoutingConfig(
    {
      fallback: "error",
      agents: { "gsd-planner": { model: "openai/missing", thinking: "high" } },
    },
    (cwd) => {
      const resolved = resolveModelRouting(
        { agent: "gsd-planner" },
        { cwd, model: { provider: "openai", id: "current" }, modelRegistry: { getAvailable: () => [] } },
      );

      assert.equal(resolved.model, null);
      assert.equal(resolved.available, false);
      assert.equal(resolved.recommendedAction.mode, "error");
      assert.match(resolved.error ?? "", /openai\/missing/);
    },
  );
});

test("model routing supports fallback omit for unavailable configured models", () => {
  withRoutingConfig(
    {
      fallback: "omit",
      skills: { "gsd-plan-phase": { model: "openai/missing", thinking: "high" } },
    },
    (cwd) => {
      const resolved = resolveModelRouting(
        { skill: "gsd-plan-phase" },
        { cwd, model: { provider: "openai", id: "current" }, modelRegistry: { getAvailable: () => [] } },
      );

      assert.equal(resolved.model, null);
      assert.equal(resolved.available, false);
      assert.equal(resolved.recommendedAction.mode, "omit-model");
      assert.equal(resolved.subagent.model, undefined);
      assert.match(resolved.warnings.join("\n"), /omitting model/);
    },
  );
});

test("model routing lets session override take precedence over configured routes", () => {
  withRoutingConfig(
    {
      agents: { "gsd-planner": { model: "openai/configured", thinking: "high" } },
    },
    (cwd) => {
      const sessionModel = { provider: "openai", id: "session" };
      const resolved = resolveModelRouting(
        { agent: "gsd-planner" },
        {
          cwd,
          sessionModelOverrides: { "gsd-planner": "openai/session" },
          modelRegistry: {
            getAvailable: () => [{ provider: "openai", id: "configured" }, sessionModel],
            find: (provider, id) => (provider === "openai" && id === "session" ? sessionModel : undefined),
          },
        },
      );

      assert.equal(resolved.source, "session.gsd-planner");
      assert.equal(resolved.model, "openai/session");
      assert.equal(resolved.recommendedAction.mode, "use-explicit");
    },
  );
});
