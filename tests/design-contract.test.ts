import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Value } from "typebox/value";
import { normalizeExecution, execWithNodeSpawn, MAX_CAPTURE_BYTES, type PiExecResult } from "../src/extension/core-execution.ts";
import { createGsdDispatcher } from "../src/extension/dispatcher.ts";
import { GSD_OUTPUT_SCHEMA, toGsdToolResult } from "../src/extension/tool-result.ts";
import { detectCapabilities } from "../src/extension/capabilities.ts";
import { registerPiGsdCore } from "../src/extension/register.ts";
import { buildGsdRuntimeAgents, registerGsdRuntimeAgents } from "../src/extension/runtime-agents.ts";
import { piExecutionGuidance } from "../src/extension/gsd-core-commands.ts";
import { capabilities, mockPi } from "./test-utils.ts";

for (const [raw, outcome] of [
  [{ exitCode: 0 }, "success"], [{ exitCode: 7 }, "failed"],
  [{ code: 0, killed: true }, "terminated"], [{ exitCode: null, signal: "SIGTERM" }, "terminated"],
  [{ cancelled: true }, "cancelled"], [{ timedOut: true }, "timed-out"],
  [{ exitCode: 0, truncated: true }, "output-limit"], [{ launchError: "spawn failed" }, "launch-error"],
  [{}, "unknown"], ["legacy text", "unknown"],
] as Array<[PiExecResult | string, string]>) {
  test(`execution contract: ${JSON.stringify(raw)} is ${outcome}`, () => {
    const execution = normalizeExecution(typeof raw === "string" ? raw : { stdout: '{"value":1}', ...raw });
    const result = toGsdToolResult("run", { text: "presentation is not status", details: { caps: capabilities("inline"), execution } });
    assert.equal(execution.outcome, outcome);
    assert.equal(result.structuredContent.ok, outcome === "success");
    assert.equal(result.isError, outcome !== "success");
    assert.equal(Value.Check(GSD_OUTPUT_SCHEMA, result.structuredContent), true);
    if (outcome !== "success") assert.equal(execution.json, undefined);
    if (typeof raw !== "string" && raw.exitCode === undefined && raw.code === undefined) assert.equal(execution.exitCode, null);
  });
}

test("complete JSON remains structured when human display loses its beginning", async () => {
  const json = { values: Array.from({ length: 6000 }, (_, i) => i) };
  const stdout = JSON.stringify(json, null, 1);
  const dispatcher = createGsdDispatcher({ detect: () => capabilities("inline"), exec: async () => ({ stdout, exitCode: 0 }) });
  const result = toGsdToolResult("run", await dispatcher.run(["query", "fixture"], process.cwd()));
  assert.match(result.structuredContent.text, /truncated/);
  assert.deepEqual(result.structuredContent.execution?.json, json);
  assert.equal(result.structuredContent.execution?.stdout, stdout);
  assert.equal(result.structuredContent.execution?.truncated, false);
});

test("large output has bounded inline text, private recovery, and no partial JSON", () => {
  const stdout = JSON.stringify({ value: "x".repeat(100_000) });
  const result = normalizeExecution({ stdout, exitCode: 0 });
  try {
    assert.equal(result.outcome, "success");
    assert.equal(result.stdoutTruncated, true);
    assert.equal(result.json, undefined);
    assert.equal(result.fullOutput?.complete, true);
    assert.ok(Buffer.byteLength(result.stdout) <= 64 * 1024);
    assert.equal(fs.readFileSync(result.fullOutput!.stdout!, "utf8"), stdout);
    if (process.platform !== "win32") assert.equal(fs.statSync(result.fullOutput!.stdout!).mode & 0o777, 0o600);
    assert.ok(!result.fullOutput!.stdout!.includes(".planning"));
  } finally { if (result.fullOutput?.stdout) fs.rmSync(path.dirname(result.fullOutput.stdout), { recursive: true, force: true }); }
});

test("capture overflow terminates the native process and marks recovery incomplete", async () => {
  const raw = await execWithNodeSpawn(process.execPath, ["-e", `process.stdout.write('x'.repeat(${MAX_CAPTURE_BYTES + 1024 * 1024})); setInterval(()=>{},1000)`], { timeout: 10_000 });
  assert.notEqual(typeof raw, "string");
  const result = normalizeExecution(raw);
  try {
    assert.equal(result.outcome, "output-limit");
    assert.equal(result.fullOutput?.complete, false);
    assert.ok(fs.statSync(result.fullOutput!.stdout!).size <= MAX_CAPTURE_BYTES);
    assert.equal(result.json, undefined);
  } finally { if (result.fullOutput?.stdout) fs.rmSync(path.dirname(result.fullOutput.stdout), { recursive: true, force: true }); }
});

test("native timeout and missing executable never report success", async () => {
  const timed = normalizeExecution(await execWithNodeSpawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeout: 100 }));
  assert.equal(timed.outcome, "timed-out");
  const dispatcher = createGsdDispatcher({ detect: () => capabilities("inline"), gsdToolsCommand: path.join(os.tmpdir(), "pi-gsd-nonexistent-executable") });
  const failed = await dispatcher.run([], process.cwd());
  assert.equal(failed.ok, false);
  assert.equal(failed.details.execution?.outcome, "launch-error");
});

test("owner activation and loaded provenance remain separate from installed candidates", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-contract-"));
  try {
    const installed = path.join(root, "installed", "package.json");
    fs.mkdirSync(path.dirname(installed));
    fs.writeFileSync(installed, JSON.stringify({ version: "0.88.1" }));
    const loaded = path.join(root, "reviewed-checkout", "index.ts");
    const options = { cwd: root, candidatePaths: { subagents: [path.dirname(installed)], contextMode: [] },
      registeredToolNames: ["subagent", "subagents_enable"],
      registeredTools: [{ name: "subagent", sourceInfo: { path: loaded } }], activeToolNames: ["subagents_enable"] };
    const caps = detectCapabilities(options);
    assert.equal(caps.subagentState, "activation-available");
    assert.equal(caps.subagents, false);
    const lazyOnly = detectCapabilities({ cwd: root, activeToolNames: ["subagents_enable"], registeredToolNames: [], candidatePaths: { subagents: [] } });
    assert.equal(lazyOnly.subagentState, "activation-available");
    assert.equal(lazyOnly.detected.subagents, true);
    assert.equal(lazyOnly.provenance.subagents, "activation-tool");
    assert.equal(lazyOnly.subagents, false);
    assert.equal(caps.integrationPackages.subagents?.version, "0.88.1");
    assert.equal(caps.loadedProviders?.subagents?.[0].path, loaded);
    const doctor = await createGsdDispatcher({ detect: () => caps, exec: async () => ({ exitCode: 0 }), externalGsdSkillPaths: () => [] }).doctor(root);
    assert.match(doctor.text, /call subagents_enable/);
    assert.match(doctor.text, /not loaded-source proof/);
    assert.doesNotMatch(doctor.text, /Reload Pi after installing or enabling/);
    assert.equal(detectCapabilities({ ...options, activeToolNames: ["subagent"] }).subagentState, "active");
    assert.equal(detectCapabilities({ ...options, activeToolNames: [] }).subagentState, "inactive");
    assert.equal(detectCapabilities({ cwd: root, activeToolNames: [], candidatePaths: { subagents: [] } }).subagentState, "absent");
    fs.mkdirSync(path.join(root, ".pi-gsd"));
    fs.writeFileSync(path.join(root, ".pi-gsd/config.json"), JSON.stringify({ integrations: { subagents: "off" } }));
    assert.equal(detectCapabilities(options).subagentState, "disabled");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Windows missing shell preserves file-only roles, lifecycle disposal and collision rollback", async () => {
  const failures: Record<string, string> = {};
  const roles = buildGsdRuntimeAgents({ platform: "win32", onUnavailable: (role, reason) => { failures[role] = reason; } });
  assert.ok(roles.some(({ name }) => name === "gsd-user-profiler"));
  assert.ok(roles.every(({ definition }) => !definition.tools.includes("gsd") && !definition.tools.includes("pwsh")));
  assert.match(failures["gsd-planner"], /pwsh/);
  for (const reject of [false, true]) {
    const host = mockPi(undefined, [{ name: "subagents_enable" }]);
    let disposed = 0, count = 0;
    const status = registerGsdRuntimeAgents({ ...host.api, events: { emit(_event: string, request: any) {
      request.result = reject && count++ === 1 ? { ok: false, error: new Error("collision") }
        : { ok: true, registration: { dispose() { disposed++; } } };
    } } }, { platform: "win32" });
    for (const handler of host.handlers.get("session_start") ?? []) await handler({}, { cwd: os.tmpdir() });
    assert.equal(status().state, reject ? "unavailable" : "partial");
    if (reject) { assert.equal(disposed, 1); assert.deepEqual(status().roles, []); }
    else {
      assert.deepEqual(status().roles, roles.map(({ name }) => name));
      for (const handler of host.handlers.get("session_shutdown") ?? []) await handler({}, {});
      assert.equal(disposed, roles.length);
    }
  }
});

test("leaf guidance does not instruct role selection or delegation", () => {
  const leaf = piExecutionGuidance("leaf").join("\n");
  assert.match(leaf, /contact_supervisor/);
  assert.match(leaf, /version-1/);
  assert.doesNotMatch(leaf, /subagent\(\{|action.*resolve-model|Before selecting/);
  assert.match(piExecutionGuidance().join("\n"), /resolve-model/);
});

test("public tool declares output schema and exposes routing and scoped registration as data", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-schema-"));
  try {
    const host = mockPi(async () => ({ stdout: '{"agent_runtime":"pi","agents_installed":false}', exitCode: 0 }));
    registerPiGsdCore(host.api, { parameters: {}, detect: () => capabilities("inline"), defaultCwd: cwd, gsdCoreCommands: [] });
    const tool = host.tools[0];
    assert.equal(tool.outputSchema, GSD_OUTPUT_SCHEMA);
    const init = await tool.execute("init", { action: "run", args: ["query", "init.plan-phase", "6"] });
    assert.equal(Value.Check(GSD_OUTPUT_SCHEMA, init.structuredContent), true);
    assert.equal(init.structuredContent.execution.json.agents_installed, false);
    assert.equal(init.structuredContent.runtimeAgents.requestedCwd, cwd);
    assert.equal(init.structuredContent.runtimeAgents.childReadiness, "unverified");
    const route = await tool.execute("route", { action: "resolve-model", agent: "gsd-planner" });
    assert.equal(route.structuredContent.modelRouting.target, "gsd-planner");
    assert.equal(Value.Check(GSD_OUTPUT_SCHEMA, route.structuredContent), true);
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test("doctor does not infer healthy execution from a legacy text-only executor", async () => {
  const result = await createGsdDispatcher({ detect: () => capabilities("inline"), exec: async () => "help", externalGsdSkillPaths: () => [] }).doctor(process.cwd());
  assert.equal(result.ok, false);
  assert.equal(result.details.core?.binaryProbe?.status, "failed");
  assert.equal(result.details.core?.binaryProbe?.exitCode, undefined);
});
