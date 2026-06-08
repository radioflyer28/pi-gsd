import assert from "node:assert/strict";
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
