import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";

import { createGsdDispatcher } from "../src/extension/dispatcher.ts";
import registerPiGsdExtension from "../src/extension/index.ts";
import { registerPiGsdCore } from "../src/extension/register.ts";
import { capabilities, mockPi, toolText } from "./test-utils.ts";

const models = ["heavy", "standard", "light"].map((id) => ({ provider: "fixture", id }));

async function fixture(fn: (cwd: string) => Promise<void>) {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-task-integration-"));
  mkdirSync(path.join(cwd, ".pi-gsd"));
  writeFileSync(path.join(cwd, ".pi-gsd/model-routing.json"), JSON.stringify({
    version: 2, taskOverrides: { enabled: true, allowedTiers: ["heavy", "standard", "light"] },
    tiers: Object.fromEntries(models.map((model) => [model.id, { model: `${model.provider}/${model.id}` }])),
  }));
  try { await fn(cwd); } finally { rmSync(cwd, { recursive: true, force: true }); }
}

function context(cwd: string) {
  return { cwd, model: models[0], modelRegistry: { getAvailable: () => models } };
}

test("public schema exposes bounded task identity and tier but not arbitrary physical overrides", () => {
  const pi = mockPi();
  registerPiGsdExtension(pi.api as any);
  const schema = pi.tools[0].parameters;
  assert.deepEqual(schema.properties.tier.enum, ["heavy", "standard", "light"]);
  assert.equal(schema.properties.taskId.maxLength, 128);
  assert.ok(schema.properties.taskId.pattern);
  assert.equal(schema.properties.model, undefined);
  assert.equal(schema.additionalProperties, false);
});

test("tool returns the dispatcher's single decision and preserves concurrent same-role assignments", async () => {
  await fixture(async (cwd) => {
    const pi = mockPi();
    const dispatcher = createGsdDispatcher({ detect: () => capabilities("delegated") });
    const captured: string[] = [];
    const actualResolve = dispatcher.resolveModel;
    dispatcher.resolveModel = async (...args) => {
      const result = await actualResolve(...args);
      captured.push(result.details.modelRouting!.decisionId);
      return result;
    };
    registerPiGsdCore(pi.api, { parameters: {}, dispatcher, detect: () => capabilities("delegated"), gsdCoreCommands: [] });
    const before = readFileSync(path.join(cwd, ".pi-gsd/model-routing.json"), "utf8");
    const results = await Promise.all(["light", "heavy"].map((tier) => pi.tools[0].execute(
      `resolve-${tier}`, { action: "resolve-model", agent: "gsd-executor", tier, taskId: "same-label" }, undefined, undefined, context(cwd),
    )));
    assert.equal(captured.length, 2);
    assert.notEqual(captured[0], captured[1]);
    for (const result of results) {
      assert.ok(captured.includes(result.details.modelRouting.decisionId));
      assert.ok(toolText(result).includes(result.details.modelRouting.decisionId));
    }
    assert.equal(results[0].details.modelRouting.subagent.model, "fixture/light:medium");
    assert.equal(results[1].details.modelRouting.subagent.model, "fixture/heavy:xhigh");
    const warnings: string[] = [];
    const handler = pi.handlers.get("tool_call")![0];
    for (const result of results) {
      assert.equal(await handler({ toolName: "subagent", input: { agent: "gsd-executor", model: result.details.modelRouting.subagent.model } }, {
        cwd, ui: { notify: (message: string) => warnings.push(message) },
      }), undefined);
    }
    assert.equal(warnings.length, 2);
    assert.ok(warnings.every((warning) => /unavailable.*2 matching decisions/.test(warning)));
    assert.equal(pi.selectedModel, undefined);
    assert.equal(pi.thinkingLevel, "medium");
    assert.equal(readFileSync(path.join(cwd, ".pi-gsd/model-routing.json"), "utf8"), before);
  });
});

test("task fields on non-resolution actions cannot silently dispatch upstream commands", async () => {
  await fixture(async (cwd) => {
    const pi = mockPi(async () => { throw new Error("Must not execute"); });
    registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), gsdCoreCommands: [] });
    await assert.rejects(pi.tools[0].execute("bad", { action: "run", args: ["anything"], tier: "light", taskId: "bounded" }, undefined, undefined, context(cwd)), /only valid for action=resolve-model/);
  });
});

test("turn, branch and session boundaries clear advisory records without switching models", async () => {
  await fixture(async (cwd) => {
    const pi = mockPi();
    registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("delegated"), gsdCoreCommands: [] });
    const handler = pi.handlers.get("tool_call")![0];
    for (const event of ["agent_end", "session_tree", "session_start", "session_shutdown"]) {
      await pi.tools[0].execute("old", { action: "resolve-model", agent: "gsd-executor", tier: "light", taskId: "old-branch" }, undefined, undefined, context(cwd));
      for (const callback of pi.handlers.get(event)!) await callback({}, context(cwd));
      const fresh = await pi.tools[0].execute("fresh", { action: "resolve-model", agent: "gsd-executor" }, undefined, undefined, context(cwd));
      const warnings: string[] = [];
      await handler({ toolName: "subagent", input: { agent: "gsd-executor", model: fresh.details.modelRouting.subagent.model } }, {
        cwd, ui: { notify: (message: string) => warnings.push(message) },
      });
      assert.deepEqual(warnings, [], event);
    }
    assert.equal(pi.selectedModel, undefined);
  });
});

test("a resolution finishing after branch navigation cannot repopulate the new branch's evidence", async () => {
  await fixture(async (cwd) => {
    const pi = mockPi();
    const dispatcher = createGsdDispatcher({ detect: () => capabilities("delegated") });
    const original = dispatcher.resolveModel;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    dispatcher.resolveModel = async (...args) => {
      const result = await original(...args);
      if (args[0].taskId) await gate;
      return result;
    };
    registerPiGsdCore(pi.api, { parameters: {}, dispatcher, detect: () => capabilities("delegated"), gsdCoreCommands: [] });
    const pending = pi.tools[0].execute("old", { action: "resolve-model", agent: "gsd-executor", taskId: "old" }, undefined, undefined, context(cwd));
    await pi.handlers.get("session_tree")![0]({}, context(cwd));
    release();
    await pending;
    const fresh = await pi.tools[0].execute("fresh", { action: "resolve-model", agent: "gsd-executor" }, undefined, undefined, context(cwd));
    const warnings: string[] = [];
    await pi.handlers.get("tool_call")![0]({ toolName: "subagent", input: { agent: "gsd-executor", model: fresh.details.modelRouting.subagent.model } }, {
      cwd, ui: { notify: (message: string) => warnings.push(message) },
    });
    assert.deepEqual(warnings, []);
  });
});
