import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";

import { buildGsdRuntimeAgents, declaredRoleTools, GSD_RUNTIME_ROLES, registerGsdRuntimeAgents, RUNTIME_AGENT_EVENT } from "../src/extension/runtime-agents.ts";
import { registerPiGsdCore } from "../src/extension/register.ts";
import { parseFrontmatter } from "../src/extension/gsd-core-commands.ts";
import { capabilities, mockPi } from "./test-utils.ts";

function host(rejectAt = -1) {
  const base = mockPi(undefined, [{ name: "subagents_enable" }]);
  const registered: any[] = [];
  let disposals = 0;
  const events = { emit(name: string, request: any) {
    assert.equal(name, RUNTIME_AGENT_EVENT);
    if (registered.length === rejectAt) { request.result = { ok: false, error: new Error("collision") }; return; }
    registered.push(request);
    request.result = { ok: true, registration: { dispose() { disposals++; } } };
  } };
  const pi = { ...base.api, events };
  const start = async (cwd = process.cwd()) => {
    for (const handler of base.handlers.get("session_start") ?? []) await handler({}, { cwd });
  };
  const stop = async () => {
    for (const handler of base.handlers.get("session_shutdown") ?? []) await handler({}, {});
  };
  return { ...base, pi, registered, start, stop, get disposals() { return disposals; } };
}

test("real runtime definitions load current package-local role bodies and explicitly equip each native role", () => {
  const roles = buildGsdRuntimeAgents({ platform: "linux" });
  assert.deepEqual(roles.map(({ name }) => name), [...GSD_RUNTIME_ROLES]);
  for (const { name, definition } of roles) {
    const markdown = readFileSync(path.resolve("node_modules/@opengsd/gsd-core/agents", `${name}.md`), "utf8");
    const declared = declaredRoleTools(markdown);
    for (const required of ["codemode", "read", "contact_supervisor"]) assert.ok(definition.tools.includes(required), `${name}: ${required}`);
    assert.equal(definition.tools.includes("bash"), declared.includes("Bash"), name);
    assert.equal(definition.tools.includes("gsd"), declared.includes("Bash"), name);
    assert.equal(definition.tools.includes("write"), declared.includes("Write"), name);
    assert.equal(definition.tools.includes("edit"), declared.includes("Edit"), name);
    assert.deepEqual(definition.extensions, [], "ambient extensions are disabled for both native modes");
    if (declared.includes("Bash")) assert.match(definition.subagentOnlyExtensions[0], /src[\\/]extension[\\/]index\.ts$/);
    else assert.deepEqual(definition.subagentOnlyExtensions, []);
    assert.match(definition.systemPrompt, new RegExp(`Current upstream role: .*${name}\\.md`));
    assert.match(definition.systemPrompt, /<role>/);
    const core = path.resolve("node_modules/@opengsd/gsd-core");
    const { body } = parseFrontmatter(readFileSync(path.join(core, "agents", `${name}.md`), "utf8"));
    const expected = body.replace(/(@?)(?:~|\$HOME)\/\.claude\/gsd-core\//g, (_match, include: string) => `${include}${path.join(core, "gsd-core")}${path.sep}`);
    assert.ok(definition.systemPrompt.includes(expected.trim()), `${name}: current upstream body, not a stale copy`);
    assert.match(definition.systemPrompt, /Pi execution contract/);
    assert.doesNotMatch(definition.systemPrompt, /~\/\.claude\/gsd-core\//);
    assert.equal(definition.allowNestedSubagents, false);
    assert.equal(definition.inheritSkills, false);
    assert.equal(definition.inheritGlobalContext, false);
    assert.equal(definition.acceptanceRole, name === "gsd-user-profiler" ? "read-only" : "writer");
    assert.equal(definition.runner.type, "pi");
    assert.ok(!definition.tools.includes("subagent"));
    assert.ok(!("model" in definition));
  }
  assert.ok(roles.find(({ name }) => name === "gsd-executor")!.definition.tools.includes("edit"));
  assert.ok(!roles.find(({ name }) => name === "gsd-plan-checker")!.definition.tools.includes("write"));
});

test("Windows definitions bind the registered shell's real provider instead of guessing paths or using bash", () => {
  assert.throws(() => buildGsdRuntimeAgents({ platform: "win32" }), /pwsh tool/);
  const provider = path.resolve("src/extension/index.ts");
  for (const { definition } of buildGsdRuntimeAgents({ platform: "win32", tools: [{ name: "pwsh", sourceInfo: { path: provider } }] })) {
    assert.ok(!definition.tools.includes("bash"));
    if (definition.tools.includes("gsd")) {
      assert.ok(definition.tools.includes("pwsh"));
      assert.equal(definition.subagentOnlyExtensions.length, 2);
      assert.equal(path.resolve(definition.subagentOnlyExtensions[1]), provider);
    } else {
      assert.ok(!definition.tools.includes("pwsh"));
      assert.deepEqual(definition.subagentOnlyExtensions, []);
    }
  }
  assert.throws(() => buildGsdRuntimeAgents({ platform: "win32", tools: [{ name: "pwsh", exposure: "hidden", sourceInfo: { path: provider } }] }), /pwsh tool/);
});

test("startup registers profiles through the optional owner's event API and disposes them on reload/shutdown", async () => {
  const h = host();
  const status = registerGsdRuntimeAgents(h.pi, { platform: "linux" });
  assert.equal(h.registered.length, 0);
  await h.start();
  assert.equal(status().state, "registered");
  assert.deepEqual(h.registered.map(({ name }) => name), [...GSD_RUNTIME_ROLES]);
  await h.start();
  assert.equal(h.disposals, GSD_RUNTIME_ROLES.length);
  await h.stop();
  assert.equal(h.disposals, GSD_RUNTIME_ROLES.length * 2);
  assert.equal(status().state, "disabled");
});

test("partial registration rolls back and unsupported owners fail visibly without changing generic workers", async () => {
  const h = host(2);
  const status = registerGsdRuntimeAgents(h.pi, { platform: "linux" });
  await h.start();
  assert.equal(status().state, "unavailable");
  assert.match(status().reason!, /collision/);
  assert.equal(h.disposals, 2);
  assert.deepEqual(status().roles, []);
  const absent = host();
  absent.pi.events.emit = () => {};
  const unavailable = registerGsdRuntimeAgents(absent.pi, { platform: "linux" });
  await absent.start();
  assert.match(unavailable().reason!, /does not support runtime agent registration/);
  assert.ok(h.registered.every(({ name }) => name !== "worker"));
});

test("disabled integrations and restricted child sessions register no runtime profiles", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "pi-gsd-runtime-off-"));
  try {
    mkdirSync(path.join(root, ".pi-gsd"));
    writeFileSync(path.join(root, ".pi-gsd/config.json"), JSON.stringify({ integrations: { subagents: "off" } }));
    const h = host();
    const status = registerGsdRuntimeAgents(h.pi, { platform: "linux" });
    await h.start(root);
    assert.equal(status().state, "disabled");
    assert.equal(h.registered.length, 0);
    const child = host();
    child.pi.getActiveTools = () => ["read", "gsd"];
    registerGsdRuntimeAgents(child.pi, { platform: "linux" });
    await child.start();
    assert.equal(child.registered.length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("public extension startup wires runtime registration and exposes failure separately from child readiness", async () => {
  const h = host();
  h.pi.events.emit = () => {};
  // Use a real source binding in Windows hosts, but no shell is launched here.
  h.pi.getAllTools = () => [{ name: "pwsh", sourceInfo: { path: path.resolve("src/extension/index.ts") } }];
  registerPiGsdCore(h.pi, { parameters: {}, detect: () => capabilities("delegated"), gsdCoreCommands: [] });
  await h.start();
  const result = await h.tools[0].execute("test", { action: "status" }, undefined, undefined, { cwd: process.cwd() });
  const text = result.content[0].text;
  assert.match(text, /## GSD runtime agents/);
  assert.match(text, /registration: unavailable/);
  assert.match(text, /child tool readiness: unverified/);
});

test("role tool parsing handles block lists without treating body text as grants", () => {
  assert.deepEqual(declaredRoleTools("---\nname: fixture\ntools:\n  - Read\n  - Write\n  - Edit\ncolor: red\n---\ntools: Bash"), ["Read", "Write", "Edit"]);
  assert.deepEqual(declaredRoleTools("---\ntools: Read, Bash\n---\n"), ["Read", "Bash"]);
  assert.throws(() => declaredRoleTools("---\nname: missing\n---\ntools: Bash"), /no tools declaration/);
  assert.throws(() => declaredRoleTools("---\ntools: [Read, Bash]\n---"), /Unsupported/);
  const roles = buildGsdRuntimeAgents({ platform: "linux" });
  assert.ok(roles.find(({ name }) => name === "gsd-nyquist-auditor")!.definition.tools.includes("edit"));
  assert.ok(!roles.find(({ name }) => name === "gsd-security-auditor")!.definition.tools.includes("write"));
  const profiler = roles.find(({ name }) => name === "gsd-user-profiler")!.definition;
  assert.deepEqual(profiler.tools, ["read", "codemode", "contact_supervisor"]);
  assert.deepEqual(profiler.subagentOnlyExtensions, []);
});
