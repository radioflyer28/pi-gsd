import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";

import { detectCapabilities, gsdToolsCommandNames } from "../src/extension/capabilities.ts";

test("capability detection reports all optional integration modes", () => {
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
});

test("capability detection treats either package-local gsd-core or gsd-tools as core support", () => {
  const packageRoot = path.resolve("pkg");
  const packageCore = path.join(packageRoot, "node_modules", "@opengsd", "gsd-core", "package.json");
  const packageTool = path.join(packageRoot, "node_modules", ".bin", gsdToolsCommandNames()[0]);

  const coreOnly = detectCapabilities({
    cwd: "repo",
    homeDir: "home",
    packageRoot,
    exists: (candidate) => candidate === packageCore,
    candidatePaths: { subagents: [], contextMode: [] },
  });
  assert.equal(coreOnly.gsdCore, true);
  assert.equal(coreOnly.paths.gsdCore, packageCore);
  assert.equal(coreOnly.paths.gsdTools, null);

  const toolOnly = detectCapabilities({
    cwd: "repo",
    homeDir: "home",
    packageRoot,
    exists: (candidate) => candidate === packageTool,
    candidatePaths: { subagents: [], contextMode: [] },
  });
  assert.equal(toolOnly.gsdCore, true);
  assert.equal(toolOnly.paths.gsdCore, null);
  assert.equal(toolOnly.paths.gsdTools, packageTool);
});

test("capability detection prefers the pi-gsd package-local gsd-core dependency over repo dependencies", () => {
  const packageRoot = path.resolve("pkg");
  const packageCore = path.join(packageRoot, "node_modules", "@opengsd", "gsd-core", "package.json");
  const packageTool = path.join(packageRoot, "node_modules", ".bin", gsdToolsCommandNames()[0]);
  const cwdCore = path.join(path.resolve("repo"), "node_modules", "@opengsd", "gsd-core", "package.json");

  const caps = detectCapabilities({
    cwd: path.resolve("repo"),
    homeDir: "home",
    packageRoot,
    exists: (candidate) => candidate === packageCore || candidate === packageTool || candidate === cwdCore,
    candidatePaths: { subagents: [], contextMode: [] },
  });

  assert.equal(caps.gsdCore, true);
  assert.equal(caps.paths.gsdCore, packageCore);
  assert.equal(caps.paths.gsdTools, packageTool);
});

test("capability detection finds user-scoped Pi optional packages", () => {
  const cwd = path.resolve("repo");
  const homeDir = path.resolve("home");
  const subagentsPath = path.join(homeDir, ".pi", "agent", "npm", "node_modules", "pi-subagents");
  const contextModePath = path.join(homeDir, ".pi", "agent", "npm", "node_modules", "context-mode");

  const caps = detectCapabilities({
    cwd,
    homeDir,
    packageRoot: path.resolve("pkg"),
    exists: (candidate) => candidate === subagentsPath || candidate === contextModePath,
    candidatePaths: { gsdCore: [], gsdTools: [] },
  });

  assert.equal(caps.mode, "delegated-ctx");
  assert.equal(caps.paths.subagents, subagentsPath);
  assert.equal(caps.paths.contextMode, contextModePath);
});

test("capability detection finds project-local Pi optional packages", () => {
  const cwd = path.resolve("repo");
  const homeDir = path.resolve("home");
  const subagentsPath = path.join(cwd, ".pi", "npm", "node_modules", "pi-subagents");
  const contextModePath = path.join(cwd, ".pi", "npm", "node_modules", "context-mode");

  const caps = detectCapabilities({
    cwd,
    homeDir,
    packageRoot: path.resolve("pkg"),
    exists: (candidate) => candidate === subagentsPath || candidate === contextModePath,
    candidatePaths: { gsdCore: [], gsdTools: [] },
  });

  assert.equal(caps.mode, "delegated-ctx");
  assert.equal(caps.paths.subagents, subagentsPath);
  assert.equal(caps.paths.contextMode, contextModePath);
});

test("capability detection prefers project-local optional packages over user-scoped packages", () => {
  const cwd = path.resolve("repo");
  const homeDir = path.resolve("home");
  const projectContextMode = path.join(cwd, ".pi", "npm", "node_modules", "context-mode");
  const userContextMode = path.join(homeDir, ".pi", "agent", "npm", "node_modules", "context-mode");

  const caps = detectCapabilities({
    cwd,
    homeDir,
    packageRoot: path.resolve("pkg"),
    exists: (candidate) => candidate === projectContextMode || candidate === userContextMode,
    candidatePaths: { gsdCore: [], gsdTools: [], subagents: [] },
  });

  assert.equal(caps.mode, "ctx-inline");
  assert.equal(caps.paths.contextMode, projectContextMode);
});

test("capability detection trusts active Pi tool inventory over filesystem probes", () => {
  const caps = detectCapabilities({
    cwd: path.resolve("repo"),
    homeDir: path.resolve("home"),
    packageRoot: path.resolve("pkg"),
    exists: () => false,
    activeToolNames: ["ctx_execute", "subagent"],
    candidatePaths: { gsdCore: [], gsdTools: [] },
  });

  assert.equal(caps.mode, "delegated-ctx");
  assert.equal(caps.subagents, true);
  assert.equal(caps.contextMode, true);
  assert.equal(caps.paths.subagents, "<active-tool:subagent>");
  assert.equal(caps.paths.contextMode, "<active-tool:ctx_execute>");
});

test("active Pi inventory does not revive disabled integrations from stale filesystem paths", () => {
  const caps = detectCapabilities({
    cwd: path.resolve("repo"),
    homeDir: path.resolve("home"),
    packageRoot: path.resolve("pkg"),
    exists: (candidate) => candidate === "subagent" || candidate === "context-mode",
    activeToolNames: [],
    activeToolInventoryAvailable: true,
    candidatePaths: { gsdCore: [], gsdTools: [], subagents: ["subagent"], contextMode: ["context-mode"] },
  });

  assert.equal(caps.mode, "inline");
  assert.equal(caps.paths.subagents, null);
  assert.equal(caps.paths.contextMode, null);
  assert.equal(caps.provenance.subagents, "not-detected");
  assert.equal(caps.provenance.contextMode, "not-detected");
});

test("capability detection reports the upstream Pi plugin from active surfaces and plugin paths", () => {
  const cwd = path.resolve("repo");
  const homeDir = path.resolve("home");
  const pluginPath = path.join(homeDir, ".pi", "agent", "extensions", "gsd.cjs");
  const caps = detectCapabilities({
    cwd,
    homeDir,
    packageRoot: path.resolve("pkg"),
    exists: (candidate) => candidate === pluginPath,
    activeToolNames: ["gsd_invoke"],
    activeToolInventoryAvailable: true,
    activeCommandNames: ["gsd"],
    activeCommandInventoryAvailable: true,
    candidatePaths: { gsdCore: [], gsdTools: [], subagents: [], contextMode: [] },
  });

  assert.equal(caps.upstreamPiPlugin.activeTool, true);
  assert.equal(caps.upstreamPiPlugin.activeCommand, true);
  assert.deepEqual(caps.upstreamPiPlugin.paths, [pluginPath]);
});

test("capability detection masks optional integrations disabled by .pi-gsd/config.json", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-config-"));
  mkdirSync(path.join(cwd, ".pi-gsd"));
  writeFileSync(
    path.join(cwd, ".pi-gsd", "config.json"),
    JSON.stringify({ integrations: { subagents: "off", contextMode: "off" } }),
  );

  try {
    const caps = detectCapabilities({
      cwd,
      homeDir: path.resolve("home"),
      packageRoot: path.resolve("pkg"),
      exists: () => false,
      activeToolNames: ["ctx_execute", "subagent"],
      candidatePaths: { gsdCore: [], gsdTools: [] },
    });

    assert.equal(caps.mode, "inline");
    assert.equal(caps.subagents, false);
    assert.equal(caps.contextMode, false);
    assert.equal(caps.detected.subagents, true);
    assert.equal(caps.detected.contextMode, true);
    assert.equal(caps.integrationSettings.subagents, "off");
    assert.equal(caps.integrationSettings.contextMode, "off");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
