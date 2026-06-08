import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";

import {
  detectCapabilities,
  gsdToolsCommandNames,
  type Capabilities,
  type GsdMode,
} from "../src/extension/capabilities.ts";
import { registerPiGsdCore } from "../src/extension/register.ts";

function capabilities(mode: GsdMode): Capabilities {
  const subagents = mode === "delegated" || mode === "delegated-ctx";
  const contextMode = mode === "ctx-inline" || mode === "delegated-ctx";
  return {
    gsdCore: true,
    subagents,
    contextMode,
    mode,
    paths: {
      gsdCore: "package-local-gsd-core",
      gsdTools: "package-local-gsd-tools",
      subagents: subagents ? "subagent" : null,
      contextMode: contextMode ? "context-mode" : null,
    },
  };
}

function mockPi(exec?: (...args: unknown[]) => Promise<unknown>) {
  const tools: Record<string, any>[] = [];
  const commands = new Map<string, Record<string, any>>();
  return {
    api: {
      registerTool(tool: Record<string, any>) {
        tools.push(tool);
      },
      registerCommand(name: string, command: Record<string, any>) {
        commands.set(name, command);
      },
      exec,
    },
    tools,
    commands,
  };
}

function toolText(result: { content: Array<{ text: string }> }): string {
  return result.content.map((item) => item.text).join("\n");
}

test("registers one namespaced tool and three namespaced commands", () => {
  const pi = mockPi();

  registerPiGsdCore(pi.api, {
    parameters: {},
    detect: () => capabilities("inline"),
  });

  assert.equal(pi.tools.length, 1);
  assert.equal(pi.tools[0].name, "gsd");
  assert.deepEqual([...pi.commands.keys()].sort(), ["gsd-doctor", "gsd-run", "gsd-status"]);
});

test("status reports .planning and does not report .pi-gsd", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-status-"));
  mkdirSync(path.join(cwd, ".planning"));
  const pi = mockPi();

  try {
    registerPiGsdCore(pi.api, {
      parameters: {},
      detect: () => capabilities("inline"),
    });

    const result = await pi.tools[0].execute("call-1", { action: "status", cwd });
    const text = toolText(result);

    assert.match(text, /\.planning present: yes/);
    assert.doesNotMatch(text, /\.pi-gsd present/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("doctor includes no-fork, optional integration, and state-boundary guidance", async () => {
  const pi = mockPi();

  registerPiGsdCore(pi.api, {
    parameters: {},
    detect: () => capabilities("delegated-ctx"),
  });

  const result = await pi.tools[0].execute("call-1", { action: "doctor", cwd: process.cwd() });
  const text = toolText(result);

  assert.match(text, /do not fork or duplicate GSD Core semantics/i);
  assert.match(text, /subagent\(\{ action: "list" \}\)/);
  assert.match(text, /ctx_execute/);
  assert.match(text, /\.planning/);
  assert.match(text, /Do not create or assume `\.gsd\/`/);
});

test("run dispatches to package-local gsd-tools with args, cwd, and signal", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-run-"));
  const controller = new AbortController();
  const calls: unknown[][] = [];
  const pi = mockPi(async (...args: unknown[]) => {
    calls.push(args);
    return { stdout: "ok", exitCode: 0 };
  });

  try {
    registerPiGsdCore(pi.api, {
      parameters: {},
      detect: () => capabilities("inline"),
    });

    const result = await pi.tools[0].execute(
      "call-1",
      { action: "run", args: ["progress", "--json"], cwd },
      controller.signal,
    );

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [
      "package-local-gsd-tools",
      ["progress", "--json"],
      { cwd, signal: controller.signal },
    ]);
    assert.match(toolText(result), /gsd-tools exited with 0/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("run truncates large command output", async () => {
  const pi = mockPi(async () => ({ stdout: "x".repeat(50_100), exitCode: 0 }));

  registerPiGsdCore(pi.api, {
    parameters: {},
    detect: () => capabilities("inline"),
  });

  const result = await pi.tools[0].execute("call-1", { action: "run", cwd: process.cwd() });
  const text = toolText(result);

  assert.match(text, /\[output truncated:/);
  assert.ok(text.length < 50_300);
});

test("run returns a clear message when pi.exec is unavailable", async () => {
  const pi = mockPi();

  registerPiGsdCore(pi.api, {
    parameters: {},
    detect: () => capabilities("inline"),
  });

  const result = await pi.tools[0].execute("call-1", { action: "run", cwd: process.cwd() });

  assert.match(toolText(result), /did not expose pi\.exec\(\)/);
});

test("run refuses to use system-wide gsd-tools when package-local gsd-tools is missing", async () => {
  let called = false;
  const pi = mockPi(async () => {
    called = true;
    return "should not run";
  });

  registerPiGsdCore(pi.api, {
    parameters: {},
    detect: () => ({
      ...capabilities("inline"),
      gsdCore: false,
      paths: {
        gsdCore: null,
        gsdTools: null,
        subagents: null,
        contextMode: null,
      },
    }),
  });

  const result = await pi.tools[0].execute("call-1", { action: "run", cwd: process.cwd() });

  assert.equal(called, false);
  assert.match(toolText(result), /package-local `gsd-tools` binary was not detected/);
  assert.match(toolText(result), /do not rely on a system-wide GSD install/);
});

test("aborted run returns before dispatch", async () => {
  let called = false;
  const controller = new AbortController();
  controller.abort();
  const pi = mockPi(async () => {
    called = true;
    return "should not run";
  });

  registerPiGsdCore(pi.api, {
    parameters: {},
    detect: () => capabilities("inline"),
  });

  const result = await pi.tools[0].execute("call-1", { action: "run", cwd: process.cwd() }, controller.signal);

  assert.equal(called, false);
  assert.equal(toolText(result), "Cancelled before starting.");
});

test("capability detection reports all four optional integration modes", () => {
  const candidatePaths = {
    gsdCore: ["core"],
    gsdTools: ["tools"],
    subagents: ["subagent"],
    contextMode: ["context-mode"],
  };
  const modeFor = (existing: string[]) =>
    detectCapabilities({
      cwd: "repo",
      homeDir: "home",
      candidatePaths,
      exists: (candidate) => existing.includes(candidate),
    }).mode;

  assert.equal(modeFor([]), "inline");
  assert.equal(modeFor(["context-mode"]), "ctx-inline");
  assert.equal(modeFor(["subagent"]), "delegated");
  assert.equal(modeFor(["subagent", "context-mode"]), "delegated-ctx");

  const core = detectCapabilities({
    cwd: "repo",
    homeDir: "home",
    candidatePaths,
    exists: (candidate) => candidate === "core",
  });
  assert.equal(core.gsdCore, true);
  assert.equal(core.paths.gsdCore, "core");
});

test("capability detection prefers the pi-gsd package-local gsd-core dependency", () => {
  const packageRoot = path.resolve("pkg");
  const packageCore = path.join(packageRoot, "node_modules", "@opengsd", "gsd-core", "package.json");
  const packageTool = path.join(packageRoot, "node_modules", ".bin", gsdToolsCommandNames()[0]);
  const cwdCore = path.join("repo", "node_modules", "@opengsd", "gsd-core", "package.json");

  const caps = detectCapabilities({
    cwd: "repo",
    homeDir: "home",
    packageRoot,
    exists: (candidate) => candidate === packageCore || candidate === packageTool || candidate === cwdCore,
    candidatePaths: {
      subagents: [],
      contextMode: [],
    },
  });

  assert.equal(caps.gsdCore, true);
  assert.equal(caps.paths.gsdCore, packageCore);
  assert.equal(caps.paths.gsdTools, packageTool);
});

test("capability detection finds Pi npm-installed optional packages", () => {
  const homeDir = path.resolve("home");
  const subagentsPath = path.join(homeDir, ".pi", "agent", "npm", "node_modules", "pi-subagents");
  const contextModePath = path.join(homeDir, ".pi", "agent", "npm", "node_modules", "context-mode");

  const caps = detectCapabilities({
    cwd: "repo",
    homeDir,
    packageRoot: path.resolve("pkg"),
    exists: (candidate) => candidate === subagentsPath || candidate === contextModePath,
    candidatePaths: {
      gsdCore: [],
      gsdTools: [],
    },
  });

  assert.equal(caps.mode, "delegated-ctx");
  assert.equal(caps.paths.subagents, subagentsPath);
  assert.equal(caps.paths.contextMode, contextModePath);
});

test("package metadata and extension manifest match registered surface", () => {
  const manifest = JSON.parse(readFileSync(path.resolve("extension-manifest.json"), "utf8"));
  const pkg = JSON.parse(readFileSync(path.resolve("package.json"), "utf8"));

  assert.deepEqual(manifest.provides.tools, ["gsd"]);
  assert.deepEqual(manifest.provides.commands, ["gsd-status", "gsd-doctor", "gsd-run"]);
  assert.deepEqual(pkg.pi.extensions, ["./src/extension/index.ts"]);
  assert.deepEqual(pkg.pi.skills, ["./skills"]);
  assert.deepEqual(pkg.pi.prompts, ["./prompts"]);
  assert.equal(pkg.dependencies["@opengsd/gsd-core"], ">=1.3.0");
  assert.equal(pkg.peerDependencies["@opengsd/gsd-core"], undefined);
  assert.equal(pkg.peerDependenciesMeta, undefined);
  assert.equal(pkg.peerDependencies["@earendil-works/pi-coding-agent"], "*");
  assert.equal(pkg.peerDependencies["@earendil-works/pi-ai"], "*");
  assert.equal(pkg.peerDependencies.typebox, "*");
});
