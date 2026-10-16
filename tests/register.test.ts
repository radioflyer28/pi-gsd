import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import registerPiGsdExtension from "../src/extension/index.ts";
import { parseCommandArgs, registerPiGsdCore } from "../src/extension/register.ts";
import { capabilities, mockPi, toolText } from "./test-utils.ts";

test("registerPiGsdCore registers one namespaced tool and six namespaced commands", () => {
  const pi = mockPi();

  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), gsdCoreCommands: [] });

  assert.equal(pi.tools.length, 1);
  assert.equal(pi.tools[0].name, "gsd");
  assert.equal(pi.tools[0].label, "GSD");
  assert.deepEqual([...pi.commands.keys()].sort(), ["gsd-doctor", "gsd-init-config", "gsd-model", "gsd-model-config", "gsd-run", "gsd-status"]);
});

test("registerPiGsdCore exposes upstream GSD Core commands as slash commands", async () => {
  const pi = mockPi();
  registerPiGsdCore(pi.api, {
    parameters: {},
    detect: () => capabilities("inline"),
    gsdCoreCommands: [
      {
        slashName: "gsd-plan-phase",
        coreName: "gsd:plan-phase",
        description: "Create detailed phase plan",
        argumentHint: "[phase]",
        path: "node_modules/@opengsd/gsd-core/commands/gsd/plan-phase.md",
        body: "Phase number: $ARGUMENTS\nFirst arg: $1\n@~/.claude/gsd-core/workflows/plan-phase.md",
      },
    ],
  });

  assert.ok(pi.commands.has("gsd-plan-phase"));
  assert.match(pi.commands.get("gsd-plan-phase")!.description, /\[phase\].*Create detailed phase plan/);

  await pi.commands.get("gsd-plan-phase")!.handler("1 --research", { isIdle: () => true });

  assert.equal(pi.sentUserMessages.length, 1);
  assert.match(pi.sentUserMessages[0], /Execute upstream GSD Core command `gsd:plan-phase`/);
  assert.match(pi.sentUserMessages[0], /Phase number: 1 --research/);
  assert.match(pi.sentUserMessages[0], /First arg: 1/);
  assert.match(pi.sentUserMessages[0], /node_modules.*@opengsd.*gsd-core.*gsd-core.*workflows.*plan-phase\.md/);
});

test("gsd-config profile command updates config through package-local dispatcher", async () => {
  const pi = mockPi();
  const calls: Array<{ args: string[]; cwd: string }> = [];
  const dispatcher = {
    status: async () => ({ text: "", details: { caps: capabilities("inline") } }),
    doctor: async () => ({ text: "", details: { caps: capabilities("inline") } }),
    resolveModel: async () => ({ text: "", details: { caps: capabilities("inline") } }),
    initConfig: async () => ({ text: "", details: { caps: capabilities("inline") } }),
    run: async (args: string[], cwd: string) => {
      calls.push({ args, cwd });
      return { text: "profile set", details: { caps: capabilities("inline") } };
    },
  };

  registerPiGsdCore(pi.api, {
    parameters: {},
    dispatcher,
    defaultCwd: "project-root",
    gsdCoreCommands: [
      {
        slashName: "gsd-config",
        coreName: "gsd:config",
        description: "Configure GSD",
        path: "node_modules/@opengsd/gsd-core/commands/gsd/config.md",
        body: "Config $ARGUMENTS",
      },
    ],
  });

  const response = await pi.commands.get("gsd-config")!.handler("--profile inherit", { cwd: "project-root" });

  assert.equal(response.text, "profile set");
  assert.deepEqual(calls, [{ args: ["query", "config-set-model-profile", "inherit", "--raw"], cwd: path.resolve("project-root") }]);
  assert.equal(pi.sentUserMessages.length, 0);
});

test("registered tool defaults to status when action is omitted", async () => {
  const pi = mockPi();
  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), gsdCoreCommands: [] });

  const result = await pi.tools[0].execute("call-1", { cwd: process.cwd() });

  assert.match(toolText(result), /# pi-gsd status/);
  assert.equal(result.details.caps.mode, "inline");
});

test("registered tool resolves cwd from Pi context when params omit cwd", async () => {
  const pi = mockPi();
  const cwd = path.resolve("from-context");
  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), gsdCoreCommands: [] });

  const result = await pi.tools[0].execute("call-1", { action: "status" }, undefined, undefined, { cwd });

  assert.ok(toolText(result).includes(`CWD: \`${cwd}\``));
});

test("registered gsd-run command parses whitespace-separated args", async () => {
  const calls: unknown[][] = [];
  const pi = mockPi(async (...args: unknown[]) => {
    calls.push(args);
    return { stdout: "ok", exitCode: 0 };
  });
  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), defaultCwd: process.cwd(), gsdCoreCommands: [] });

  const response = await pi.commands.get("gsd-run")!.handler("progress --json");

  assert.deepEqual(calls[0]?.[1], ["progress", "--json"]);
  assert.match(response.text, /ok/);
});

test("registered status and doctor commands ignore string args", async () => {
  const calls: unknown[][] = [];
  const pi = mockPi(async (...args: unknown[]) => {
    calls.push(args);
    return "unexpected";
  });
  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), defaultCwd: process.cwd(), gsdCoreCommands: [] });

  const statusResponse = await pi.commands.get("gsd-status")!.handler("ignored args");
  const doctorResponse = await pi.commands.get("gsd-doctor")!.handler("ignored args");

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.[1], ["--help"]);
  assert.match(statusResponse.text, /# pi-gsd status/);
  assert.match(doctorResponse.text, /## Compatibility probe/);
  assert.match(doctorResponse.text, /## Integration guidance/);
});

test("registered commands return text instead of sending large notifications through UI", async () => {
  const pi = mockPi();
  const notifications: Array<{ message: string; level?: string }> = [];
  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), defaultCwd: process.cwd(), gsdCoreCommands: [] });

  const response = await pi.commands.get("gsd-status")!.handler({
    cwd: process.cwd(),
    hasUI: true,
    ui: {
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
    },
  });

  assert.match(response.text, /# pi-gsd status/);
  assert.deepEqual(notifications, []);
});

test("parseCommandArgs preserves quoted and escaped gsd-run arguments", () => {
  assert.deepEqual(parseCommandArgs('phase add "user login" --tag foo\\ bar'), [
    "phase",
    "add",
    "user login",
    "--tag",
    "foo bar",
  ]);
  assert.deepEqual(parseCommandArgs("run 'single quoted value' plain"), [
    "run",
    "single quoted value",
    "plain",
  ]);
});

test("registered detection uses active Pi tool inventory when available", async () => {
  const pi = mockPi(undefined, [{ name: "ctx_execute" }, { name: "subagent" }]);
  registerPiGsdCore(pi.api, {
    parameters: {},
    exists: () => false,
    packageRoot: path.resolve("pkg"),
    defaultCwd: process.cwd(),
    gsdCoreCommands: [],
  });

  const result = await pi.tools[0].execute("call-1", { action: "status", cwd: process.cwd() });

  assert.equal(result.details.caps.mode, "delegated-ctx");
  assert.match(toolText(result), /context-mode: detected/);
  assert.match(toolText(result), /pi-subagents: detected/);
});

test("runtime detection reports registered-but-inactive optional tools without enabling them", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-inactive-tools-"));
  const pi = mockPi(undefined, [{ name: "subagent" }, { name: "ctx_execute" }], []);
  registerPiGsdCore(pi.api, { parameters: {}, defaultCwd: cwd, gsdCoreCommands: [] });

  try {
    const result = await pi.tools[0].execute("call-1", { action: "status" }, undefined, undefined, { cwd });
    assert.equal(result.details.caps.mode, "inline");
    assert.equal(result.details.caps.detected.subagents, true);
    assert.equal(result.details.caps.detected.contextMode, true);
    assert.equal(result.details.caps.provenance.subagents, "registered-tool-inactive");
    assert.equal(result.details.caps.provenance.contextMode, "registered-tool-inactive");
    assert.match(toolText(result), /pi-subagents: loaded but inactive/);
    assert.match(toolText(result), /context-mode: loaded but inactive/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("default extension registers the public tool with context-mode and subagent guidance", () => {
  const pi = mockPi();

  registerPiGsdExtension(pi.api as any);

  assert.equal(pi.tools.length, 1);
  assert.equal(pi.tools[0].name, "gsd");
  assert.match(pi.tools[0].description, /upstream GSD Core/);
  assert.ok(Array.isArray(pi.tools[0].promptGuidelines));
  assert.ok(pi.tools[0].promptGuidelines.some((line: string) => line.includes("context-mode")));
  assert.ok(pi.tools[0].promptGuidelines.some((line: string) => line.includes("pi-subagents")));
  assert.ok(pi.tools[0].promptGuidelines.some((line: string) => line.includes("resolve-model")));
  assert.ok(pi.tools[0].parameters);
});

test("registered tool resolves Pi-native model routing with inherit fallback", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-routing-default-"));
  const pi = mockPi();
  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), defaultCwd: cwd, gsdCoreCommands: [] });

  const result = await pi.tools[0].execute(
    "call-1",
    { action: "resolve-model", agent: "gsd-planner" },
    undefined,
    undefined,
    {
      cwd,
      model: { provider: "openai", id: "gpt-5.3-codex" },
      modelRegistry: { getAvailable: () => [{ provider: "openai", id: "gpt-5.3-codex" }] },
    },
  );

  assert.match(toolText(result), /# pi-gsd model routing/);
  assert.match(toolText(result), /target: `gsd-planner`/);
  assert.match(toolText(result), /tier: heavy/);
  assert.match(toolText(result), /resolved model: openai\/gpt-5\.3-codex/);
  assert.match(toolText(result), /launch thinking request: xhigh/);
});

test("gsd-model-config interactively writes a provider-neutral tier route", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-model-config-"));
  try {
    const pi = mockPi();
    registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), defaultCwd: cwd, gsdCoreCommands: [] });
    const selections = ["openai/custom", "max", "error"];
    const response = await pi.commands.get("gsd-model-config")!.handler("light", {
      cwd,
      ui: {
        select: async () => selections.shift(),
        confirm: async () => true,
      },
      model: { provider: "openai", id: "current" },
      modelRegistry: { getAvailable: () => [{ provider: "openai", id: "custom" }] },
    });

    assert.match(response.text, /Updated light model routing/);
    const config = JSON.parse(fs.readFileSync(path.join(cwd, ".pi-gsd", "model-routing.json"), "utf8"));
    assert.deepEqual(config.tiers.light, { model: "openai/custom", thinking: "max", fallback: "error" });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("gsd-model-config cancellation leaves routing config unchanged", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-model-config-"));
  try {
    const configDir = path.join(cwd, ".pi-gsd");
    fs.mkdirSync(configDir);
    const configPath = path.join(configDir, "model-routing.json");
    const original = '{"fallback":"inherit"}\n';
    fs.writeFileSync(configPath, original);
    const pi = mockPi();
    registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), defaultCwd: cwd, gsdCoreCommands: [] });
    const response = await pi.commands.get("gsd-model-config")!.handler("heavy", {
      cwd,
      ui: { select: async () => "Cancel" },
      modelRegistry: { getAvailable: () => [] },
    });
    assert.match(response.text, /cancelled/);
    assert.equal(fs.readFileSync(configPath, "utf8"), original);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("warn-only validator checks and consumes freshly resolved child routes", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-routing-validator-"));
  try {
    const pi = mockPi(undefined, [{ name: "subagent" }], ["subagent"]);
    registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("delegated"), defaultCwd: cwd, gsdCoreCommands: [] });
    await pi.tools[0].execute("resolve", { action: "resolve-model", agent: "gsd-codebase-mapper" }, undefined, undefined, {
      cwd,
      model: { provider: "openai", id: "current" },
      modelRegistry: { getAvailable: () => [{ provider: "openai", id: "current" }] },
    });
    const warnings: string[] = [];
    const handler = pi.handlers.get("tool_call")![0];
    const outcome = await handler({ toolName: "subagent", input: { agent: "gsd-codebase-mapper" } }, { cwd, ui: { notify: (message: string) => warnings.push(message) } });
    assert.equal(outcome, undefined);
    assert.match(warnings.join("\n"), /expected exact model `openai\/current:medium`/);

    warnings.length = 0;
    await handler({ toolName: "subagent", input: { agent: "gsd-codebase-mapper" } }, { cwd, ui: { notify: (message: string) => warnings.push(message) } });
    assert.equal(warnings.length, 0, "pending route should be consumed after one launch attempt");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("warn-only validator accepts exact model and ignores management calls", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-routing-validator-"));
  try {
    const pi = mockPi(undefined, [{ name: "subagent" }], ["subagent"]);
    registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("delegated"), defaultCwd: cwd, gsdCoreCommands: [] });
    const handler = pi.handlers.get("tool_call")![0];
    const warnings: string[] = [];
    await handler({ toolName: "subagent", input: { action: "list" } }, { cwd, ui: { notify: (message: string) => warnings.push(message) } });
    await pi.tools[0].execute("resolve", { action: "resolve-model", agent: "gsd-codebase-mapper" }, undefined, undefined, {
      cwd,
      model: { provider: "openai", id: "current" },
      modelRegistry: { getAvailable: () => [{ provider: "openai", id: "current" }] },
    });
    await handler({ toolName: "subagent", input: { agent: "gsd-codebase-mapper", model: "openai/current:medium" } }, { cwd, ui: { notify: (message: string) => warnings.push(message) } });
    assert.deepEqual(warnings, []);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("gsd-model command applies inherited route thinking without forcing a model", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-routing-default-"));
  const pi = mockPi();
  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), defaultCwd: cwd, gsdCoreCommands: [] });

  const response = await pi.commands.get("gsd-model")!.handler("agent gsd-planner", {
    cwd,
    model: { provider: "openai", id: "gpt-5.3-codex" },
    modelRegistry: {
      getAvailable: () => [],
    },
  });

  // Defaults inherit model, so command leaves model unchanged but still applies planner thinking.
  assert.match(response.text, /Model left unchanged/);
  assert.equal(pi.thinkingLevel, "xhigh");
});

test("gsd-model reports Pi's effective thinking level after capability clamping", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-routing-clamped-"));
  const pi = mockPi();
  pi.api.setThinkingLevel = () => {};
  pi.api.getThinkingLevel = () => "high";
  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), defaultCwd: cwd, gsdCoreCommands: [] });

  const response = await pi.commands.get("gsd-model")!.handler("agent gsd-planner", {
    cwd,
    model: { provider: "openai", id: "current" },
    modelRegistry: { getAvailable: () => [] },
  });

  assert.match(response.text, /Requested Pi thinking level xhigh; effective level is high/);
});

test("gsd-model command reports unavailable prompt UI without changing model", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-routing-"));
  fs.mkdirSync(path.join(cwd, ".pi-gsd"));
  fs.writeFileSync(
    path.join(cwd, ".pi-gsd", "model-routing.json"),
    JSON.stringify({ fallback: "prompt", tiers: { heavy: { model: "openai/missing", thinking: "xhigh" } } }),
  );

  const pi = mockPi();
  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), defaultCwd: cwd, gsdCoreCommands: [] });

  const response = await pi.commands.get("gsd-model")!.handler("agent gsd-planner", {
    cwd,
    hasUI: false,
    model: { provider: "openai", id: "current" },
    modelRegistry: { getAvailable: () => [] },
  });

  assert.match(response.text, /Model and thinking left unchanged; prompt was unavailable/);
  assert.match(response.text, /Thinking level left unchanged because the model route was not applied/);
  assert.equal(pi.selectedModel, undefined);
  assert.equal(pi.thinkingLevel, "medium");
});

test("gsd-model command leaves thinking unchanged when explicit model switch fails", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-routing-"));
  fs.mkdirSync(path.join(cwd, ".pi-gsd"));
  fs.writeFileSync(
    path.join(cwd, ".pi-gsd", "model-routing.json"),
    JSON.stringify({ agents: { "gsd-planner": { model: "openai/good", thinking: "xhigh" } } }),
  );

  const pi = mockPi();
  pi.api.setModel = async () => false;
  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), defaultCwd: cwd, gsdCoreCommands: [] });
  const goodModel = { provider: "openai", id: "good" };

  const response = await pi.commands.get("gsd-model")!.handler("agent gsd-planner", {
    cwd,
    modelRegistry: {
      getAvailable: () => [goodModel],
      find: (provider: string, id: string) => (provider === "openai" && id === "good" ? goodModel : undefined),
    },
  });

  assert.match(response.text, /Could not switch to openai\/good/);
  assert.match(response.text, /Thinking level left unchanged/);
  assert.equal(pi.thinkingLevel, "medium");
});

test("gsd-model command can prompt for a fallback model when configured model is unavailable", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-routing-"));
  fs.mkdirSync(path.join(cwd, ".pi-gsd"));
  fs.writeFileSync(
    path.join(cwd, ".pi-gsd", "model-routing.json"),
    JSON.stringify({ fallback: "prompt", tiers: { heavy: { model: "openai/missing", thinking: "xhigh" } } }),
  );

  const pi = mockPi();
  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), defaultCwd: cwd, gsdCoreCommands: [] });
  const goodModel = { provider: "openai", id: "good" };

  const response = await pi.commands.get("gsd-model")!.handler("agent gsd-planner", {
    cwd,
    hasUI: true,
    ui: {
      select: async () => "openai/good",
    },
    model: { provider: "openai", id: "current" },
    modelRegistry: {
      getAvailable: () => [goodModel],
      find: (provider: string, id: string) => (provider === "openai" && id === "good" ? goodModel : undefined),
    },
  });

  assert.match(response.text, /Switched Pi model to openai\/good/);
  assert.equal(pi.selectedModel, goodModel);
  assert.equal(pi.thinkingLevel, "xhigh");

  const resolvedAgain = await pi.tools[0].execute(
    "call-2",
    { action: "resolve-model", agent: "gsd-planner" },
    undefined,
    undefined,
    {
      cwd,
      model: { provider: "openai", id: "current" },
      modelRegistry: {
        getAvailable: () => [goodModel],
        find: (provider: string, id: string) => (provider === "openai" && id === "good" ? goodModel : undefined),
      },
    },
  );

  assert.match(toolText(resolvedAgain), /source: session\.gsd-planner/);
  assert.match(toolText(resolvedAgain), /resolved model: openai\/good/);
});
