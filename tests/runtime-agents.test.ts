import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";

import { buildGsdRuntimeAgents, formatGsdRuntimeAgentStatus, declaredRoleTools, GSD_RUNTIME_ROLES, registerGsdRuntimeAgents, RUNTIME_AGENT_EVENT } from "../src/extension/runtime-agents.ts";
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
  const start = async (cwd = process.cwd(), projectTrusted = true) => {
    for (const handler of base.handlers.get("session_start") ?? []) await handler({}, { cwd, isProjectTrusted: () => projectTrusted });
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
    if (declared.includes("Bash")) assert.match(definition.subagentOnlyExtensions[0], /src[\\/]extension[\\/]leaf\.ts$/);
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
  const provider = path.resolve("tests/test-utils.ts");
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


test("explicit child providers equip planning authors and executor, with web only for the researcher", () => {
  const multiEdit = path.resolve("tests/test-utils.ts");
  const researchWeb = path.resolve("src/extension/index.ts");
  const tools = [
    ...["read", "edit"].map((name) => ({ name, sourceInfo: { path: multiEdit } })),
    ...["web_search", "fetch_content", "get_search_content", "source_check"].map((name) => ({ name, sourceInfo: { path: researchWeb } })),
  ];
  const roles = buildGsdRuntimeAgents({ platform: "linux", tools, childProviders: { multiEdit, researchWeb } });
  const baseline = buildGsdRuntimeAgents({ platform: "linux" });
  for (const { name, definition } of roles) {
    const author = ["gsd-phase-researcher", "gsd-planner", "gsd-pattern-mapper", "gsd-executor"].includes(name);
    if (!author) assert.deepEqual(definition, baseline.find((role) => role.name === name)!.definition, name);
    else {
      assert.ok(definition.subagentOnlyExtensions.includes(multiEdit));
      assert.ok(definition.tools.includes("edit"));
      assert.ok(!definition.tools.includes("write"));
      assert.match(definition.systemPrompt, /creates or overwrites a whole file/);
    }
    assert.equal(definition.tools.includes("web_search"), name === "gsd-phase-researcher");
    assert.deepEqual(definition.extensions, []);
    assert.equal(definition.allowNestedSubagents, false);
    assert.ok(!("model" in definition));
  }
  const researcher = roles.find((role) => role.name === "gsd-phase-researcher")!.definition;
  assert.match(researcher.systemPrompt, /Translate upstream WebSearch to web_search/);
  assert.ok(researcher.tools.includes("source_check"));
});

test("child provider paths alone cannot load arbitrary or hidden project extensions", () => {
  const multiEdit = path.resolve("tests/test-utils.ts");
  const tools = ["read", "edit"].map((name) => ({ name, sourceInfo: { path: multiEdit } }));
  const build = (inventory: typeof tools, entry = multiEdit) => buildGsdRuntimeAgents({ platform: "linux", tools: inventory, childProviders: { multiEdit: entry } });
  assert.throws(() => build([]), /registered, nonhidden parent read provider/);
  assert.throws(() => build(tools, "relative.ts"), /existing absolute entrypoint/);
  assert.throws(() => build([tools[0]]), /parent edit provider/);
  assert.throws(() => build([tools[0], { name: "edit", sourceInfo: { path: path.resolve("src/extension/index.ts") } }]), /parent edit provider/);
  assert.throws(() => buildGsdRuntimeAgents({ platform: "linux", tools: [{ ...tools[0], exposure: "hidden" }, tools[1]], childProviders: { multiEdit } }), /parent read provider/);
  assert.throws(() => buildGsdRuntimeAgents({ platform: "linux", tools, childProviders: { researchWeb: multiEdit } }), /parent web_search provider/);
});

test("startup reads opt-in provider configuration and fails closed on malformed configuration", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "pi-gsd-child-providers-"));
  const provider = path.resolve("src/extension/index.ts");
  try {
    mkdirSync(path.join(root, ".pi-gsd"));
    const config = path.join(root, ".pi-gsd/config.json");
    writeFileSync(config, JSON.stringify({ childProviders: { multiEdit: provider, researchWeb: provider } }));
    const h = host();
    h.pi.getAllTools = () => ["pwsh", "read", "edit", "web_search", "fetch_content", "get_search_content", "source_check"].map((name) => ({ name, sourceInfo: { path: provider } }));
    const status = registerGsdRuntimeAgents(h.pi);
    await h.start(root);
    assert.equal(status().state, "registered");
    assert.ok(h.registered.find((role) => role.name === "gsd-phase-researcher").definition.tools.includes("web_search"));
    await h.stop();
    const untrusted = host();
    untrusted.pi.getAllTools = h.pi.getAllTools;
    const denied = registerGsdRuntimeAgents(untrusted.pi);
    await untrusted.start(root, false);
    assert.equal(denied().state, "unavailable");
    assert.match(denied().reason!, /positively trusted project/);
    assert.equal(untrusted.registered.length, 0);
    for (const invalid of [{ multiEdit: true }, { arbitraryExtension: provider }, []]) {
      writeFileSync(config, JSON.stringify({ childProviders: invalid }));
      const bad = host();
      bad.pi.getAllTools = h.pi.getAllTools;
      const failure = registerGsdRuntimeAgents(bad.pi);
      await bad.start(root);
      assert.equal(failure().state, "unavailable");
      assert.match(failure().reason!, /childProviders/);
      assert.equal(bad.registered.length, 0);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("an invalid optional provider omits only dependent roles and never silently downgrades them", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "pi-gsd-partial-providers-"));
  const provider = path.resolve("src/extension/index.ts");
  try {
    mkdirSync(path.join(root, ".pi-gsd"));
    writeFileSync(path.join(root, ".pi-gsd/config.json"), JSON.stringify({ childProviders: { multiEdit: provider, researchWeb: provider } }));
    const h = host();
    h.pi.getAllTools = () => ["pwsh", "read", "edit"].map((name) => ({ name, sourceInfo: { path: provider } }));
    const status = registerGsdRuntimeAgents(h.pi);
    await h.start(root);
    assert.equal(status().state, "partial");
    assert.deepEqual(Object.keys(status().unavailableRoles!), ["gsd-phase-researcher"]);
    assert.ok(!status().roles.includes("gsd-phase-researcher"));
    assert.ok(status().roles.includes("gsd-planner"));
    assert.ok(status().roles.includes("gsd-plan-checker"));
    const text = formatGsdRuntimeAgentStatus(status());
    assert.match(text, /unavailable gsd-phase-researcher: researchWeb:/);
    assert.match(text, /equipped gsd-planner: tools/);
    assert.ok(text.includes(provider));
    const planner = h.registered.find((role) => role.name === "gsd-planner").definition;
    assert.equal(planner.subagentOnlyExtensions.length, new Set(planner.subagentOnlyExtensions).size);
    h.pi.getAllTools = () => ["pwsh", "read", "edit", "web_search", "fetch_content", "get_search_content", "source_check"].map((name) => ({ name, sourceInfo: { path: provider } }));
    await h.start(root);
    assert.equal(status().state, "registered");
    assert.deepEqual(status().unavailableRoles, {});
    assert.equal(status().roles.length, GSD_RUNTIME_ROLES.length);
    await h.stop();
    assert.equal(status().bindings, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("missing edit binding preserves unrelated roles across platforms; stale and hidden web tools fail closed", () => {
  const provider = path.resolve("src/extension/index.ts");
  for (const platform of ["linux", "win32"] as const) {
    const unavailable: Record<string, string> = {};
    const roles = buildGsdRuntimeAgents({ platform, tools: [{ name: "pwsh", sourceInfo: { path: provider } }],
      childProviders: { multiEdit: path.resolve("missing-provider.ts") },
      onUnavailable: (role, reason) => { unavailable[role] = reason; },
    });
    assert.deepEqual(Object.keys(unavailable).sort(), ["gsd-executor", "gsd-pattern-mapper", "gsd-phase-researcher", "gsd-planner"]);
    assert.ok(roles.some(({ name }) => name === "gsd-plan-checker"));
    assert.deepEqual(roles.find(({ name }) => name === "gsd-user-profiler")!.definition.tools, ["read", "codemode", "contact_supervisor"]);
  }
  const tools = ["web_search", "fetch_content", "get_search_content", "source_check"].map((name) => ({ name, sourceInfo: { path: provider } }));
  for (const last of [{ ...tools[3], exposure: "hidden" }, { name: "source_check", sourceInfo: { path: path.resolve("missing-provider.ts") } }]) {
    assert.throws(() => buildGsdRuntimeAgents({ platform: "linux", tools: [...tools.slice(0, 3), last], childProviders: { researchWeb: provider } }));
  }
});


test("init results keep Core filesystem facts separate from scoped registration, including failures and reload", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "pi-gsd-init-scope-"));
  const other = path.join(root, "other-project");
  const h = host();
  const core = JSON.stringify({ agent_runtime: "pi", agents_installed: false, missing_agents: ["gsd-planner"], researcher_model: "" });
  let exitCode = 0;
  h.pi.exec = async () => ({ stdout: core, stderr: exitCode ? "upstream failure" : "", exitCode });
  h.pi.getAllTools = () => [{ name: "pwsh", sourceInfo: { path: path.resolve("src/extension/index.ts") } }];
  registerPiGsdCore(h.pi, { parameters: {}, detect: () => capabilities("delegated"), gsdCoreCommands: [] });
  const run = (cwd = root, args = ["query", "init.plan-phase", "6"]) =>
    h.tools[0].execute("init", { action: "run", args }, undefined, undefined, { cwd });
  try {
    assert.equal((await run()).details.piRuntimeAgents.status.state, "pending");
    await h.start(root);
    for (const args of [["query", "init.plan-phase", "6"], ["init", "plan-phase", "6", "--raw"]]) {
      const result = await run(root, args);
      assert.ok(result.content[0].text.startsWith(`gsd-tools exited with 0\n\n${core}`));
      assert.match(result.content[0].text, /## Pi initialization context/);
      assert.match(result.content[0].text, /physical agent files, not pi-subagents runtime registration/);
      assert.match(result.content[0].text, /Stop the required child step/);
      const evidence = result.details.piRuntimeAgents;
      assert.equal(evidence.runtime, "pi");
      assert.equal(evidence.source, "session-registration");
      assert.equal(evidence.requestedCwd, root);
      assert.equal(evidence.status.cwd, root);
      assert.equal(evidence.status.state, "registered");
      assert.equal(evidence.childReadiness, "unverified");
      assert.ok(evidence.status.roles.includes("gsd-planner"));
      assert.ok(!evidence.status.roles.includes("gsd-dom-verifier"));
      assert.match(result.content[0].text, /excluded roles:.*gsd-dom-verifier/);
    }
    const foreign = await run(other);
    assert.equal(foreign.details.piRuntimeAgents.status.state, "unavailable");
    assert.deepEqual(foreign.details.piRuntimeAgents.status.roles, []);
    assert.match(foreign.content[0].text, /different project\/session cwd/);
    assert.doesNotMatch(foreign.content[0].text, /native role profiles:/);
    for (const action of ["status", "doctor"]) {
      const result = await h.tools[0].execute(action, { action }, undefined, undefined, { cwd: other });
      assert.equal(result.details.piRuntimeAgents.status.state, "unavailable");
    }
    assert.equal((await run(root, ["query", "config-get", "runtime"])).details.piRuntimeAgents, undefined);
    exitCode = 7;
    assert.match((await run()).content[0].text, /gsd-tools exited with 7[\s\S]*upstream failure/);
    await h.start(other);
    assert.equal((await run(other)).details.piRuntimeAgents.status.state, "registered");
    assert.equal((await run(root)).details.piRuntimeAgents.status.state, "unavailable");
    await h.stop();
    assert.deepEqual((await run(other)).details.piRuntimeAgents.status.roles, []);
    assert.equal((await run(other)).details.piRuntimeAgents.status.state, "disabled");
  } finally { await h.stop(); rmSync(root, { recursive: true, force: true }); }
});

for (const scenario of ["owner-absent", "restricted-child", "disabled", "partial"] as const) {
  test(`init registration report does not hide ${scenario} availability`, async () => {
    const root = mkdtempSync(path.join(tmpdir(), "pi-gsd-init-availability-"));
    const h = host();
    h.pi.exec = async () => ({ stdout: '{"agents_installed":true}', exitCode: 0 });
    h.pi.getAllTools = () => [{ name: "pwsh", sourceInfo: { path: path.resolve("src/extension/index.ts") } }];
    if (scenario === "owner-absent") h.pi.events.emit = () => {};
    if (scenario === "restricted-child") h.pi.getActiveTools = () => ["read", "gsd"];
    try {
      if (scenario === "disabled" || scenario === "partial") {
        mkdirSync(path.join(root, ".pi-gsd"));
        writeFileSync(path.join(root, ".pi-gsd", "config.json"), JSON.stringify(scenario === "disabled"
          ? { integrations: { subagents: "off" } }
          : { childProviders: { researchWeb: path.resolve("tests/test-utils.ts") } }));
      }
      registerPiGsdCore(h.pi, { parameters: {}, detect: () => capabilities("delegated"), gsdCoreCommands: [] });
      await h.start(root);
      const result = await h.tools[0].execute("init", { action: "run", args: ["query", "init.plan-phase", "6"] }, undefined, undefined, { cwd: root });
      assert.match(result.content[0].text, /"agents_installed":true/);
      const evidence = result.details.piRuntimeAgents;
      assert.equal(evidence.childReadiness, "unverified");
      assert.equal(evidence.status.state, scenario === "partial" ? "partial" : scenario === "disabled" ? "disabled" : "unavailable");
      assert.ok(!evidence.status.roles.includes("gsd-phase-researcher"));
      if (scenario === "partial") {
        assert.ok(evidence.status.roles.includes("gsd-planner"));
        assert.match(evidence.status.unavailableRoles["gsd-phase-researcher"], /researchWeb/);
      } else assert.deepEqual(evidence.status.roles, []);
    } finally { await h.stop(); rmSync(root, { recursive: true, force: true }); }
  });
}

const stockPowerShell = { name: "powershell", sourceInfo: { path: "builtin:powershell", source: "builtin" } };

test("Windows stock shell needs no extension provider and keeps native authoring plus codemode", () => {
  const roles = buildGsdRuntimeAgents({ platform: "win32", tools: [stockPowerShell] });
  const baseline = buildGsdRuntimeAgents({ platform: "linux" });
  for (const { name, definition } of roles) {
    const unix = baseline.find((role) => role.name === name)!.definition;
    assert.deepEqual(definition.tools, unix.tools.map((tool) => tool === "bash" ? "powershell" : tool));
    assert.deepEqual(definition.subagentOnlyExtensions, unix.subagentOnlyExtensions);
    assert.ok(definition.tools.includes("codemode"));
    assert.ok(!definition.tools.includes("pwsh"));
    assert.ok(!definition.tools.includes("bash"));
  }
  const executor = roles.find((role) => role.name === "gsd-executor")!.definition;
  for (const name of ["read", "edit", "write", "powershell", "gsd", "codemode"]) assert.ok(executor.tools.includes(name));
  assert.match(executor.systemPrompt, /Stock Pi editing is sufficient/);
  assert.match(executor.systemPrompt, /Separate file edits are valid/);
  assert.doesNotMatch(executor.systemPrompt, /selected multi-edit provider/);
});

test("Windows prefers a valid pwsh integration and never bypasses hidden or broken providers", () => {
  const provider = path.resolve("tests/test-utils.ts");
  const selected = buildGsdRuntimeAgents({ platform: "win32", tools: [stockPowerShell, { name: "pwsh", sourceInfo: { path: provider } }] });
  assert.ok(selected.find((role) => role.name === "gsd-executor")!.definition.tools.includes("pwsh"));
  for (const broken of [{ name: "pwsh" }, { name: "pwsh", exposure: "hidden", sourceInfo: { path: provider } }]) {
    assert.throws(() => buildGsdRuntimeAgents({ platform: "win32", tools: [stockPowerShell, broken] }), /instead of falling back/);
  }
  for (const unverified of [
    { name: "powershell" }, { ...stockPowerShell, exposure: "hidden" },
    { name: "powershell", sourceInfo: { path: provider, source: "extension" } },
    { name: "powershell", sourceInfo: { path: "builtin:powershell", source: "sdk" } },
  ]) assert.throws(() => buildGsdRuntimeAgents({ platform: "win32", tools: [unverified] }), /builtin powershell/);
});

test("executor editor enhancement remains explicit and works with either Windows shell", () => {
  const provider = path.resolve("tests/test-utils.ts");
  for (const shell of [stockPowerShell, { name: "pwsh", sourceInfo: { path: provider } }]) {
    const tools = [shell, ...["read", "edit"].map((name) => ({ name, sourceInfo: { path: provider } }))];
    const build = (enhanced: boolean) => buildGsdRuntimeAgents({ platform: "win32", tools,
      ...(enhanced ? { childProviders: { multiEdit: provider } } : {}),
    }).find((role) => role.name === "gsd-executor")!.definition;
    const stock = build(false);
    assert.ok(stock.tools.includes("write"), "loaded parent editing provider alone must not opt children in");
    assert.match(stock.systemPrompt, /Stock Pi editing is sufficient/);
    const enhanced = build(true);
    for (const tool of ["read", "edit", "codemode", "gsd", shell.name]) assert.ok(enhanced.tools.includes(tool));
    assert.ok(!enhanced.tools.includes("write"));
    assert.ok(enhanced.subagentOnlyExtensions.includes(provider));
    assert.match(enhanced.systemPrompt, /matched read\/edit pair/);
    assert.doesNotMatch(enhanced.systemPrompt, /Stock Pi editing is sufficient/);
    assert.deepEqual(enhanced.extensions, []);
    assert.equal(new Set(enhanced.subagentOnlyExtensions).size, enhanced.subagentOnlyExtensions.length);
  }
});

test("startup reports stock PowerShell separately from optional provider bindings", async () => {
  const h = host();
  h.pi.getAllTools = () => [stockPowerShell];
  const status = registerGsdRuntimeAgents(h.pi, { platform: "win32" });
  await h.start();
  assert.equal(status().state, "registered");
  assert.equal(status().shellTool, "powershell");
  assert.deepEqual(status().bindings, []);
  assert.match(formatGsdRuntimeAgentStatus(status()), /registered child shell: powershell/);
  await h.stop();
  assert.equal(status().shellTool, undefined);
});
