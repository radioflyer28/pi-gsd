import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";

import { formatModelRoutingAudit, formatResolvedModelRouting, resolveModelRouting } from "../src/extension/model-routing.ts";

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
    assert.equal(resolved.subagent.action, "pass-model");
    assert.equal(resolved.subagent.model, "openai/current:xhigh");
    assert.equal("thinking" in resolved.subagent, false);
  });
});

test("model routing makes mapper thinking explicit in the pi-subagents model suffix", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-model-routing-"));
  try {
    const resolved = resolveModelRouting(
      { agent: "gsd-codebase-mapper" },
      { cwd, model: { provider: "openai-codex", id: "gpt-5.6-sol" }, thinkingLevel: "high" },
    );

    assert.equal(resolved.tier, "light");
    assert.equal(resolved.model, "openai-codex/gpt-5.6-sol");
    assert.equal(resolved.thinking, "medium");
    assert.equal(resolved.subagent.model, "openai-codex/gpt-5.6-sol:medium");
    assert.match(resolved.subagent.note, /suffix makes the routed thinking level explicit and visible/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
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
      assert.equal(resolved.subagent.action, "resolve-first");
      assert.equal(resolved.subagent.model, undefined);
      assert.match(resolved.subagent.note, /Do not delegate/);
      assert.doesNotMatch(formatResolvedModelRouting(resolved), /omit model/i);
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
      assert.equal(resolved.subagent.action, "omit-model");
      assert.equal(resolved.subagent.model, undefined);
      assert.match(resolved.warnings.join("\n"), /omitting model/);
    },
  );
});

test("model routing blocks child launch until prompt fallback is selected", () => {
  withRoutingConfig(
    {
      fallback: "prompt",
      agents: { "gsd-planner": { model: "openai/missing", thinking: "high" } },
    },
    (cwd) => {
      const resolved = resolveModelRouting(
        { agent: "gsd-planner" },
        { cwd, model: { provider: "openai", id: "current" }, modelRegistry: { getAvailable: () => [] } },
      );
      assert.equal(resolved.recommendedAction.mode, "prompt-user");
      assert.equal(resolved.subagent.action, "resolve-first");
      assert.match(resolved.subagent.note, /Do not delegate/);
      assert.match(resolved.subagent.note, /\/gsd-model/);
    },
  );
});

test("empty available model inventory is authoritative over catalog and find", () => {
  withRoutingConfig(
    { agents: { "gsd-planner": { model: "openai/catalog-only" } } },
    (cwd) => {
      const catalogOnly = { provider: "openai", id: "catalog-only" };
      const resolved = resolveModelRouting(
        { agent: "gsd-planner" },
        {
          cwd,
          model: { provider: "openai", id: "current" },
          modelRegistry: {
            getAvailable: () => [],
            getAll: () => [catalogOnly],
            find: () => catalogOnly,
          },
        },
      );
      assert.equal(resolved.recommendedAction.mode, "inherit-current");
      assert.equal(resolved.model, "openai/current");
      assert.match(resolved.warnings.join("\n"), /not available/);
    },
  );
});

test("missing available-model inventory treats configured child model as unverified", () => {
  withRoutingConfig(
    { agents: { "gsd-planner": { model: "openai/catalog", fallback: "inherit" } } },
    (cwd) => {
      const resolved = resolveModelRouting(
        { agent: "gsd-planner" },
        {
          cwd,
          model: { provider: "openai", id: "current" },
          modelRegistry: { getAll: () => [{ provider: "openai", id: "catalog" }] },
        },
      );
      assert.equal(resolved.model, "openai/current");
      assert.equal(resolved.subagent.model, "openai/current:xhigh");
      assert.match(resolved.warnings.join("\n"), /treated as unverified/);
    },
  );
});

test("inherit fallback stops child launch when there is no current Pi model", () => {
  withRoutingConfig(
    { agents: { "gsd-planner": { model: "openai/missing", fallback: "inherit" } } },
    (cwd) => {
      const resolved = resolveModelRouting(
        { agent: "gsd-planner" },
        { cwd, modelRegistry: { getAvailable: () => [] } },
      );
      assert.equal(resolved.recommendedAction.mode, "error");
      assert.equal(resolved.subagent.action, "resolve-first");
      assert.match(resolved.error ?? "", /no current Pi model/);
    },
  );
});

test("configured model suffix is normalized into the route thinking field", () => {
  withRoutingConfig(
    { agents: { "gsd-planner": { model: "openai/planner:max" } } },
    (cwd) => {
      const resolved = resolveModelRouting(
        { agent: "gsd-planner" },
        { cwd, modelRegistry: { getAvailable: () => [{ provider: "openai", id: "planner" }] } },
      );
      assert.equal(resolved.model, "openai/planner");
      assert.equal(resolved.thinking, "max");
      assert.equal(resolved.subagent.model, "openai/planner:max");
    },
  );
});

test("model routing audit names configured targets outside representative tiers", () => {
  withRoutingConfig(
    { agents: { "gsd-custom-reviewer": { model: "openai/missing", thinking: "low", fallback: "error" } } },
    (cwd) => {
      const audit = formatModelRoutingAudit({ cwd, modelRegistry: { getAvailable: () => [] } });
      assert.match(audit, /configured target routes/);
      assert.match(audit, /gsd-custom-reviewer/);
      assert.match(audit, /resolve-first/);
    },
  );
});

test("model routing treats ambiguous model names as unavailable", () => {
  withRoutingConfig(
    {
      fallback: "error",
      agents: { "gsd-planner": { model: "shared-name" } },
    },
    (cwd) => {
      const resolved = resolveModelRouting(
        { agent: "gsd-planner" },
        {
          cwd,
          modelRegistry: {
            getAvailable: () => [
              { provider: "a", id: "one", name: "shared-name" },
              { provider: "b", id: "two", name: "shared-name" },
            ],
          },
        },
      );

      assert.equal(resolved.model, null);
      assert.equal(resolved.recommendedAction.mode, "error");
      assert.match(resolved.error ?? "", /shared-name/);
    },
  );
});

test("model routing infers unknown gsd-hyphen targets as skills and bare targets as commands", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-model-routing-"));
  try {
    assert.equal(resolveModelRouting({ target: "gsd-custom-flow" }, { cwd }).targetType, "skill");
    assert.equal(resolveModelRouting({ target: "custom-flow" }, { cwd }).targetType, "command");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
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
      assert.equal(resolved.subagent.model, "openai/session:high");
    },
  );
});
