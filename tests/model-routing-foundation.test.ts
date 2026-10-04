import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";

import { formatModelRoutingAudit, resolveModelRouting, writeModelTierRoute } from "../src/extension/model-routing.ts";

function fixture(fn: (cwd: string) => void) {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-routing-foundation-"));
  try { fn(cwd); } finally { rmSync(cwd, { recursive: true, force: true }); }
}

function config(cwd: string, value: unknown) {
  mkdirSync(path.join(cwd, ".pi-gsd"), { recursive: true });
  writeFileSync(path.join(cwd, ".pi-gsd/model-routing.json"), JSON.stringify(value));
}

const current = { provider: "fixture", id: "current" };

test("upstream catalog discovers roles absent from the old adapter roster", () => {
  fixture((cwd) => {
    for (const target of ["gsd-dom-verifier", "gsd-mempalace-curator"]) {
      const result = resolveModelRouting({ target }, { cwd, model: current });
      assert.equal(result.targetType, "agent");
      assert.equal(result.tier, "light");
      assert.equal(result.subagent.model, "fixture/current:medium");
    }
  });
});

test("version 2 defaults to an error rather than an unavailable-model downgrade", () => {
  fixture((cwd) => {
    config(cwd, { version: 2, agents: { "gsd-executor": { model: "fixture/missing" } } });
    const result = resolveModelRouting({ agent: "gsd-executor" }, {
      cwd, model: current, modelRegistry: { getAvailable: () => [current] },
    });
    assert.equal(result.fallback, "error");
    assert.equal(result.subagent.action, "resolve-first");
    assert.equal(result.model, null);
  });
});

test("invalid or premature policy enablement is rejected instead of normalized away", () => {
  const policies = [
    null, [], { version: 3 },
    { version: 2, fallbak: "error" },
    { version: 2, tiers: { heavy: { thinking: "unlimited" } } },
    { version: 2, agents: { "gsd-executor": { tier: "extreme" } } },
    { version: 2, taskOverrides: { allowedTiers: ["light", "light"] } },
    { version: 2, agents: { "gsd-executor": { model: "bare-id" } } },
    { version: 2, agents: { "gsd-executor": { locked: "true" } } },
    { version: 2, taskOverrides: { enabled: true } },
    { version: 2, virtualModels: { enabled: true } },
  ];
  fixture((cwd) => {
    for (const policy of policies) {
      config(cwd, policy);
      const result = resolveModelRouting({ agent: "gsd-executor" }, {
        cwd, model: current, modelRegistry: { getAvailable: () => [current] },
      });
      assert.equal(result.subagent.action, "resolve-first", JSON.stringify(policy));
      assert.equal(result.model, null);
      assert.ok(result.error);
    }
  });
});

test("decisions identify the exact cwd policy revision and upstream metadata provenance", () => {
  fixture((cwd) => {
    config(cwd, { version: 2 });
    const context = { cwd, model: current, modelRegistry: { getAvailable: () => [current] } };
    const first = resolveModelRouting({ agent: "gsd-executor" }, context);
    const same = resolveModelRouting({ agent: "gsd-executor" }, context);
    assert.equal(first.provenance.configPath, path.join(cwd, ".pi-gsd/model-routing.json"));
    assert.match(first.provenance.configRevision ?? "", /^[a-f0-9]{64}$/);
    assert.equal(first.provenance.configRevision, same.provenance.configRevision);
    assert.equal(first.provenance.catalogStatus, "loaded");
    assert.match(first.provenance.catalogVersion ?? "", /^\d+\.\d+\.\d+/);
    config(cwd, { version: 2, default: { thinking: "low" } });
    assert.notEqual(resolveModelRouting({ agent: "gsd-executor" }, context).provenance.configRevision, first.provenance.configRevision);
    assert.match(formatModelRoutingAudit(context), /catalog.*loaded/i);
  });
});

test("unknown or unavailable catalog metadata does not invent a light tier", () => {
  fixture((cwd) => {
    const result = resolveModelRouting({ agent: "gsd-future-role" }, { cwd, model: current, packageRoot: cwd });
    assert.equal(result.tier, null);
    assert.equal(result.model, "fixture/current");
    assert.equal(result.provenance.catalogStatus, "unavailable");
    assert.match(result.warnings.join("\n"), /catalog unavailable/);
    assert.match(result.warnings.join("\n"), /No upstream routing tier/);
  });
});

test("v2 cannot hand a virtual alias or implicit child default to physical-only dispatch", () => {
  fixture((cwd) => {
    const virtual = { provider: "gsd", id: "light", api: "pi-virtual" };
    for (const settings of [
      { default: { model: "gsd/light" } },
      { default: { model: "omit" } },
      { default: { model: "inherit" } },
      { default: { model: "fixture/missing" }, fallback: "inherit" },
      { default: { model: "fixture/missing" }, fallback: "omit" },
    ]) {
      config(cwd, { version: 2, ...settings });
      const result = resolveModelRouting({ agent: "gsd-executor" }, {
        cwd, model: virtual, modelRegistry: { getAvailable: () => [virtual] },
      });
      assert.equal(result.subagent.action, "resolve-first", JSON.stringify(settings));
      assert.equal(result.model, null);
      assert.match(result.error ?? "", /physical/i);
    }
  });
});

test("v2 no-current-model and unverifiable inherited model do not become omit-model", () => {
  fixture((cwd) => {
    config(cwd, { version: 2 });
    for (const context of [{ cwd }, { cwd, model: current }]) {
      const result = resolveModelRouting({ agent: "gsd-executor" }, context);
      assert.equal(result.subagent.action, "resolve-first");
    }
  });
});

test("role pins and explicit v2 unlocks are represented without rewriting legacy config", () => {
  fixture((cwd) => {
    for (const [version, rule, pinned] of [
      [undefined, { model: "fixture/current" }, true],
      [2, { model: "fixture/current" }, true],
      [2, { model: "fixture/current", locked: false }, false],
      [2, { tier: "light", locked: true }, true],
      [2, { tier: "light" }, false],
    ] as const) {
      config(cwd, { version, agents: { "gsd-executor": rule } });
      const file = path.join(cwd, ".pi-gsd/model-routing.json");
      const before = readFileSync(file, "utf8");
      const context = { cwd, model: current, modelRegistry: { getAvailable: () => [current] } };
      const result = resolveModelRouting({ agent: "gsd-executor" }, context);
      assert.equal(result.pinned, pinned);
      assert.equal(result.source, "agents.gsd-executor");
      assert.equal(resolveModelRouting({ agent: "gsd-executor" }, { ...context, sessionModelOverrides: { "gsd-executor": "fixture/current" } }).pinned, true);
      assert.equal(readFileSync(file, "utf8"), before);
    }
  });
});

test("tier updates preserve v2 fields and refuse to write an invalid policy", () => {
  fixture((cwd) => {
    config(cwd, { version: 2, coordinator: { model: "fixture/coordinator" }, taskOverrides: { enabled: false }, virtualModels: { enabled: false } });
    const file = writeModelTierRoute(cwd, "light", { model: "fixture/current", thinking: "low" });
    const before = readFileSync(file, "utf8");
    const saved = JSON.parse(before);
    assert.equal(saved.version, 2);
    assert.equal(saved.coordinator.model, "fixture/coordinator");
    assert.equal(saved.taskOverrides.enabled, false);
    assert.throws(() => writeModelTierRoute(cwd, "light", { model: "unqualified" }), /provider-qualified/);
    assert.equal(readFileSync(file, "utf8"), before);
  });
});

test("a newly installed catalog role controls inference and tier without a roster edit", () => {
  fixture((cwd) => {
    const core = path.join(cwd, "node_modules/@opengsd/gsd-core");
    mkdirSync(path.join(core, "gsd-core/bin/shared"), { recursive: true });
    writeFileSync(path.join(core, "package.json"), JSON.stringify({ name: "@opengsd/gsd-core", version: "99.0.0" }));
    const catalogFile = path.join(core, "gsd-core/bin/shared/model-catalog.json");
    writeFileSync(catalogFile, JSON.stringify({ agents: { "gsd-brand-new": { routingTier: "heavy" } } }));
    const request = { target: "gsd-brand-new" };
    const context = { cwd, model: current, packageRoot: cwd };
    const resolved = resolveModelRouting(request, context);
    assert.equal(resolved.targetType, "agent");
    assert.equal(resolved.tier, "heavy");
    assert.equal(resolved.provenance.catalogVersion, "99.0.0");
    writeFileSync(catalogFile, JSON.stringify({ agents: { "gsd-brand-new": { routingTier: "sonnet" } } }));
    const invalid = resolveModelRouting({ agent: "gsd-brand-new" }, context);
    assert.equal(invalid.tier, null);
    assert.equal(invalid.provenance.catalogStatus, "unavailable");
    assert.match(invalid.warnings.join("\n"), /invalid routing tier/);
  });
});

test("physical selection preserves explicit role, tier and operator precedence", () => {
  fixture((cwd) => {
    const models = [current, { provider: "fixture", id: "tier" }, { provider: "fixture", id: "role" }];
    config(cwd, {
      version: 2, tiers: { light: { model: "fixture/tier", thinking: "low" } },
      agents: { "gsd-executor": { tier: "light", model: "fixture/role", thinking: "medium" } },
    });
    const context = { cwd, modelRegistry: { getAvailable: () => models } };
    const role = resolveModelRouting({ agent: "gsd-executor" }, context);
    assert.equal(role.tier, "light");
    assert.equal(role.subagent.model, "fixture/role:medium");
    const operator = resolveModelRouting({ agent: "gsd-executor" }, { ...context, sessionModelOverrides: { "gsd-executor": "fixture/current" } });
    assert.equal(operator.subagent.model, "fixture/current:medium");
    assert.equal(operator.source, "session.gsd-executor");
    assert.equal(resolveModelRouting({ agent: "gsd-codebase-mapper" }, context).subagent.model, "fixture/tier:low");
  });
});

test("prototype names are never mistaken for routes or upstream tiers", () => {
  fixture((cwd) => {
    for (const target of ["constructor", "toString", "__proto__"]) {
      const result = resolveModelRouting({ target }, { cwd, model: current });
      assert.equal(result.targetType, "command");
      assert.equal(result.tier, null);
      assert.equal(result.source, "default");
    }
  });
});

test("v2 verifies exact provider/id rather than a colliding display name", () => {
  fixture((cwd) => {
    config(cwd, { version: 2, agents: { "gsd-executor": { model: "fixture/approved" } } });
    const impostor = { provider: "different", id: "model", name: "fixture/approved" };
    const approved = { provider: "fixture", id: "approved" };
    assert.equal(resolveModelRouting({ agent: "gsd-executor" }, {
      cwd, modelRegistry: { getAvailable: () => [impostor] },
    }).subagent.action, "resolve-first");
    assert.equal(resolveModelRouting({ agent: "gsd-executor" }, {
      cwd, modelRegistry: { getAvailable: () => [impostor, approved] },
    }).subagent.model, "fixture/approved:high");
  });
});
