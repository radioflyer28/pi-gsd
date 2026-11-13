#!/usr/bin/env node
// Optional no-model probe of the installed owner's source snapshot and real Pi child factory.
// No installed files, credentials, model turns, or persistent project state are used.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
const sdkRoot = process.env.PI_GSD_SMOKE_SDK_ROOT;
const sdkPackageRoot = sdkRoot ? path.resolve(sdkRoot) : fileURLToPath(new URL("../node_modules/@earendil-works/pi-coding-agent/", import.meta.url));
const sdkManifest = JSON.parse(readFileSync(path.join(sdkPackageRoot, "package.json"), "utf8"));
const sdk = await import(pathToFileURL(path.resolve(sdkPackageRoot, sdkManifest.exports["."].import)).href);
const aiRoot = path.resolve(sdkPackageRoot, "../pi-ai");
const aiManifest = JSON.parse(readFileSync(path.join(aiRoot, "package.json"), "utf8"));
const { InMemoryCredentialStore } = await import(pathToFileURL(path.resolve(aiRoot, aiManifest.exports["."].import)).href);
import { registerPiGsdCore } from "../src/extension/register.ts";
import { GSD_RUNTIME_ROLES } from "../src/extension/runtime-agents.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const processMode = process.argv[2] === "--process-child";
const source = processMode ? process.argv[3] : process.argv[2];
const pwsh = processMode ? process.argv[5] : process.argv[3];
if (!source) throw new Error("Usage: npm run test:child-tools -- <pi-subagents-checkout> [trusted-pwsh-entrypoint]");
if (process.platform === "win32" && !pwsh && typeof sdk.createPowerShellTool !== "function") throw new Error("Selected SDK has no builtin PowerShell; supply a trusted pwsh provider or use a supported SDK.");
const tools = process.platform === "win32"
  ? [pwsh ? { name: "pwsh", sourceInfo: { path: path.resolve(pwsh) } }
    : { name: "powershell", sourceInfo: { path: "builtin:powershell", source: "builtin" } }]
  : [];
const roles = ["gsd-planner", "gsd-executor", "gsd-verifier", "gsd-debugger", "gsd-roadmapper", "gsd-nyquist-auditor", "gsd-phase-researcher", "gsd-plan-checker", "gsd-pattern-mapper"];
const childProviders = {};
if (process.env.PI_GSD_SMOKE_MULTI_EDIT) childProviders.multiEdit = path.resolve(process.env.PI_GSD_SMOKE_MULTI_EDIT);
if (process.env.PI_GSD_SMOKE_RESEARCH_WEB) childProviders.researchWeb = path.resolve(process.env.PI_GSD_SMOKE_RESEARCH_WEB);
for (const [provider, names] of [[childProviders.multiEdit, ["read", "edit"]], [childProviders.researchWeb, ["web_search", "fetch_content", "get_search_content", "source_check"]]]) {
  if (provider) tools.push(...names.map((name) => ({ name, sourceInfo: { path: provider } })));
}

async function verifyNativeChild(snapshot, definition, mode, root) {
  const role = definition.name;
  const { createDefaultChildSessionFactory } = await import(pathToFileURL(path.join(snapshot, "src/runs/shared/child-session.ts")).href);
  const { resolvePiLaunchToolPlan } = await import(pathToFileURL(path.join(snapshot, "src/api/child-tool-plan.ts")).href);
  const cwd = path.join(root, `${mode}-${role}`);
  mkdirSync(cwd, { recursive: true });
  const plan = resolvePiLaunchToolPlan({ ...definition, cwd, agentName: role });
  assert.equal(plan.disableAmbientExtensions, true);
  const shell = process.platform === "win32" ? (pwsh ? "pwsh" : "powershell") : "bash";
  for (const name of ["gsd", "codemode", shell]) assert.ok(plan.effectiveToolAllowlist.includes(name));
  for (const excluded of [shell, "edit"]) assert.ok(!resolvePiLaunchToolPlan({ ...definition, cwd, agentName: role, excludeTools: [excluded] }).effectiveToolAllowlist.includes(excluded));
  const restricted = resolvePiLaunchToolPlan({ ...definition, cwd, agentName: role, capabilityCeiling: { version: 1, allowedTools: ["read"], denyExtensions: true, sources: ["probe"] } });
  assert.ok(!restricted.effectiveToolAllowlist.includes("gsd"), "ceiling must not be widened");
  assert.ok(!restricted.extensionArgs.includes(definition.subagentOnlyExtensions[0]), "denied provider must not be re-added");
  assert.ok(!resolvePiLaunchToolPlan({ ...definition, cwd, agentName: role, excludeTools: ["gsd"] }).effectiveToolAllowlist.includes("gsd"));

  let actualSession;
  const errors = [];
  const factory = createDefaultChildSessionFactory({ loadPiCodingAgent: async () => ({
    ...sdk,
    ModelRuntime: { create: () => sdk.ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, allowModelNetwork: false, refreshOnCreate: false }) },
    async createAgentSession(options) {
      const created = await sdk.createAgentSession(options);
      actualSession = created.session;
      return created;
    },
  }) });
  let child;
  try {
    child = await factory.create({
      cwd, projectTrusted: true, storage: { kind: "memory" },
      tools: plan.effectiveToolAllowlist, excludeTools: plan.excludeTools,
      extensionPaths: plan.extensionArgs, ambientExtensions: false,
      hooks: [], noSkills: true, noContextFiles: true,
      systemPrompt: definition.systemPrompt,
      runtime: { agent: role, fanoutChild: false, depth: 1, fast: false, waitTool: { enabled: false } },
      onExtensionError(error) { errors.push(`${error.event}: ${error.error}`); },
    });
    assert.deepEqual(errors, [], "child extensions must load and start without errors");
    const declared = actualSession.getActiveToolNames();
    const callable = actualSession.getCallableToolNames();
    assert.ok(declared.includes("codemode"));
    if (shell === "powershell") {
      const source = actualSession.getAllTools().find((tool) => tool.name === shell)?.sourceInfo;
      assert.equal(source?.source, "builtin");
      assert.equal(source?.path, "builtin:powershell");
      assert.ok(!callable.includes("pwsh"));
      assert.ok(!callable.includes("bash"));
    }
    assert.ok(callable.includes("gsd"));
    assert.ok(callable.includes(shell));
    assert.ok(!declared.includes("subagent"));
    const gsdInfo = actualSession.getAllTools().find((tool) => tool.name === "gsd");
    const gsdGuidance = (gsdInfo?.promptGuidelines ?? []).join("\n");
    assert.match(gsdGuidance, /Leaf execution only/);
    assert.doesNotMatch(gsdGuidance, /Before each bounded GSD child assignment|Before selecting any GSD child|Parent coordinators/);
    assert.match(gsdInfo?.sourceInfo?.path ?? "", /[\\/]leaf\.ts$/);
    const available = actualSession.agent.state.tools;
    async function execute(name, args) {
      const tool = available.find((tool) => tool.name === name);
      assert.ok(tool, `missing declared tool ${name}`);
      const result = await tool.execute(`no-model-${name}`, args, new AbortController().signal);
      assert.ok(!result.isError, JSON.stringify(result));
      const text = result.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
      return text + "\n" + JSON.stringify(result.structuredContent ?? result.details ?? {});
    }
    if (childProviders.multiEdit && definition.subagentOnlyExtensions.includes(childProviders.multiEdit)) {
      assert.ok(!callable.includes("write"), "multi-edit replaces the redundant write tool");
      const a = path.join(cwd, "a.txt"), b = path.join(cwd, "b.txt");
      await execute("edit", { edits: [{ path: a, new: "alpha\n" }, { path: b, new: "beta\n" }] });
      const anchor = (await execute("read", { path: a })).match(/(?:^|\n)\s*(1#[^:\s]+):/);
      assert.ok(anchor, "selected read provider must return edit anchors");
      await execute("edit", { edits: [{ path: a, from: anchor[1], new: "updated" }, { path: b, old: "beta", new: "changed" }] });
      assert.equal(readFileSync(a, "utf8").trim(), "updated");
      assert.equal(readFileSync(b, "utf8").trim(), "changed");
      await assert.rejects(available.find((tool) => tool.name === "edit").execute("atomic-failure", {
        edits: [{ path: a, old: "updated", new: "must-not-land" }, { path: b, old: "absent-text", new: "must-not-land" }],
      }, new AbortController().signal), /Nothing was written/, "invalid batch must report atomic failure");
      assert.equal(readFileSync(a, "utf8").trim(), "updated", "failed batch must roll back every target");
      assert.equal(readFileSync(b, "utf8").trim(), "changed");
      console.log(`child-tools: PASS ${mode} ${role} anchored read/edit, creation, multi-file atomicity`);
    }
    if (role === "gsd-executor" && !childProviders.multiEdit) {
      assert.ok(callable.includes("write"), "stock authoring must retain write");
      const a = path.join(cwd, "stock-a.txt"), b = path.join(cwd, "stock-b.txt");
      await execute("write", { path: a, content: "alpha\n" });
      await execute("write", { path: b, content: "beta\n" });
      assert.match(await execute("read", { path: a }), /alpha/);
      await execute("edit", { path: a, edits: [{ oldText: "alpha", newText: "updated" }] });
      await execute("edit", { path: b, edits: [{ oldText: "beta", newText: "changed" }] });
      assert.equal(readFileSync(a, "utf8").trim(), "updated");
      assert.equal(readFileSync(b, "utf8").trim(), "changed");
      console.log(`child-tools: PASS ${mode} ${role} stock read/write/edit across separate files (no cross-file atomicity claim)`);
    }
    if (definition.tools.includes("web_search")) {
      for (const name of ["web_search", "fetch_content", "get_search_content", "source_check"]) {
        assert.ok(callable.includes(name), `missing web tool ${name}`);
        assert.ok(available.find((tool) => tool.name === name)?.parameters, `missing web schema ${name}`);
      }
      console.log(`child-tools: PASS ${mode} ${role} web registry/schema only (no live access)`);
    }
    const shellArgs = shell === "bash" ? { command: "printf pi-gsd-child-tools-ok", timeout: 10 } : { command: "Write-Output pi-gsd-child-tools-ok", timeout: 10 };
    assert.match(await execute("gsd", { action: "status", cwd }), /pi-gsd status/);
    const cli = await execute("gsd", { action: "run", args: ["--help"], cwd });
    assert.match(cli, /gsd-tools exited with 0/);
    assert.match(cli, /Usage: gsd-tools/);
    const directShell = await execute(shell, shellArgs);
    assert.match(directShell, /pi-gsd-child-tools-ok/);
    if (shell === "pwsh") assert.match(directShell, /exit_code["\s:]+0/);
    else await assert.rejects(execute(shell, { command: "exit 7", timeout: 10 }), /7/, "builtin shell must reject a nonzero exit");
    const code = `const status = await tools.gsd({action:"status",cwd:${JSON.stringify(cwd)}}); if (status.version !== 1 || !status.ok) throw new Error("structured status missing"); text(status.text); const help = await tools.gsd({action:"run",args:["--help"],cwd:${JSON.stringify(cwd)}}); if (!help.ok || help.execution.exitCode !== 0) throw new Error("CLI outcome missing"); text(help.text); const init = await tools.gsd({action:"run",args:["query","init.plan-phase","6"],cwd:${JSON.stringify(cwd)}}); if (!init.ok || init.execution.json.agent_runtime !== "pi" || !init.runtimeAgents) throw new Error("structured init missing"); const bad = await tools.gsd({action:"run",args:["query","pi-gsd-invalid-query"],cwd:${JSON.stringify(cwd)}}); if (bad.ok || !bad.execution || bad.execution.outcome === "success") throw new Error("failure became success"); text("structured-codemode-success-json-failure-ok"); text(await tools.${shell}(${JSON.stringify(shellArgs)}));`;
    assert.equal(child.messages.length, 0, "no model prompt or assistant turn may occur");
    // Pi requires an issuing assistant for nested tool calls. This is a synthetic
    // in-memory tool-call fixture, never a model response or a network request.
    const issuingFixture = {
      role: "assistant", api: "openai-responses", provider: "fixture", model: "no-model",
      content: [{ type: "toolCall", id: "no-model-codemode", name: "codemode", arguments: { code } }],
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "toolUse", timestamp: Date.now(),
    };
    actualSession.sessionManager.appendMessage(issuingFixture);
    actualSession.refreshContext();
    const nested = await execute("codemode", { code });
    assert.match(nested, /Script completed/);
    assert.match(nested, /structured-codemode-success-json-failure-ok/);
    assert.match(nested, /pi-gsd status/);
    assert.match(nested, /gsd-tools exited with 0/);
    assert.match(nested, /Usage: gsd-tools/);
    assert.match(nested, /pi-gsd-child-tools-ok/);
    if (shell === "pwsh") assert.match(nested, /exit_code["\s:]+0/);
    assert.deepEqual(child.messages, [issuingFixture], "only the synthetic issuing fixture may exist; no model turns");
    console.log(`child-tools: PASS ${mode} ${role} (native registry, gsd + ${shell} direct/codemode; policy narrowing preserved)`);
  } finally {
    await child?.dispose();
    await factory.dispose();
  }
}

if (processMode) {
  const root = mkdtempSync(path.join(tmpdir(), "pi-gsd-process-child-"));
  process.env.PI_CODING_AGENT_DIR = path.join(root, "agent");
  try { await verifyNativeChild(path.resolve(source), JSON.parse(readFileSync(process.argv[4], "utf8")), "detached-process", root); }
  finally { rmSync(root, { recursive: true, force: true }); }
} else {
  const root = mkdtempSync(path.join(tmpdir(), "pi-gsd-child-tools-"));
  const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = path.join(root, "agent");
  const snapshot = path.join(root, "owner-snapshot");
  const fork = path.resolve(source);
  try {
    mkdirSync(snapshot);
    cpSync(path.join(fork, "src"), path.join(snapshot, "src"), { recursive: true });
    cpSync(path.join(fork, "package.json"), path.join(snapshot, "package.json"));
    const modules = path.join(snapshot, "node_modules");
    mkdirSync(modules);
    const linked = new Set();
    // Optional owner dependencies from its installed tree; host peers from this repo.
    for (const base of [...(sdkRoot ? [path.resolve(sdkRoot, "../..")] : []), path.join(repo, "node_modules"), path.join(fork, "node_modules")]) {
      if (!existsSync(base)) continue;
      for (const name of readdirSync(base)) {
        if (name.startsWith(".") || linked.has(name)) continue;
        symlinkSync(path.join(base, name), path.join(modules, name), process.platform === "win32" ? "junction" : "dir");
        linked.add(name);
      }
    }
    const { registerRuntimeAgentEventListener } = await import(pathToFileURL(path.join(snapshot, "src/agents/runtime-agent-events.ts")).href);
    const { listRuntimeAgentConfigs } = await import(pathToFileURL(path.join(snapshot, "src/agents/runtime-agent-registry.ts")).href);
    if (Object.keys(childProviders).length) {
      mkdirSync(path.join(root, ".pi-gsd"));
      writeFileSync(path.join(root, ".pi-gsd/config.json"), JSON.stringify({ childProviders }));
    }
    const bus = new EventEmitter();
    const handlers = new Map();
    const parentTools = [];
    const host = {
      events: { emit: bus.emit.bind(bus), on(name, handler) { bus.on(name, handler); return () => bus.off(name, handler); } },
      on(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
      registerTool(tool) { parentTools.push(tool); }, getActiveTools: () => ["subagents_enable"], getAllTools: () => tools,
    };
    const removeListener = registerRuntimeAgentEventListener(host);
    registerPiGsdCore(host, { parameters: {}, packageRoot: repo, gsdCoreCommands: [] });
    for (const handler of handlers.get("session_start") ?? []) await handler({}, { cwd: root, isProjectTrusted: () => true });
    const status = await parentTools.find((tool) => tool.name === "gsd").execute("parent-status", { action: "status" }, undefined, undefined, { cwd: root });
    assert.match(status.content[0].text, /registration: registered/);
    assert.equal(status.structuredContent.capabilities.subagentState, "activation-available");
    assert.equal(status.structuredContent.capabilities.subagents, false);
    assert.equal(status.structuredContent.runtimeAgents.status.state, "registered");
    const registeredAgents = listRuntimeAgentConfigs(host);
    // Optional owner internals are confined to this isolated compatibility probe.
    const { handleManagementAction } = await import(pathToFileURL(path.join(snapshot, "src/agents/agent-management.ts")).href);
    for (const agent of ["gsd-phase-researcher", "gsd-planner", "gsd-plan-checker", "gsd-pattern-mapper"]) {
      const inspected = handleManagementAction("get", { agent }, { cwd: root, runtimeAgentOwner: host, modelRegistry: { getAvailable: () => [] } });
      assert.equal(inspected.isError, false, `owner get must inspect runtime-only ${agent}`);
    }
    console.log("child-tools: PASS runtime-only get for planning roles");
    assert.equal(registeredAgents.length, GSD_RUNTIME_ROLES.length);
    for (const role of roles) {
      const agent = registeredAgents.find((agent) => agent.name === role);
      assert.ok(agent);
      await verifyNativeChild(snapshot, agent, "foreground-session", root);
      const serialized = path.join(root, `${role}.json`);
      writeFileSync(serialized, JSON.stringify(agent));
      const result = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(import.meta.url), "--process-child", snapshot, serialized, pwsh ?? ""], { cwd: repo, encoding: "utf8", timeout: 90_000, windowsHide: true });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr + result.stdout);
      process.stdout.write(result.stdout);
    }
    for (const handler of handlers.get("session_shutdown") ?? []) handler({}, {});
    assert.equal(listRuntimeAgentConfigs(host).length, 0);
    removeListener();
    console.log(`child-tools: owner ${JSON.parse(readFileSync(path.join(fork, "package.json"), "utf8")).version}; SDK ${sdkManifest.version}; real native factory/source snapshot; no model requests or installed-file changes`);
  } finally {
    if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
    rmSync(root, { recursive: true, force: true });
  }
}
