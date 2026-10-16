#!/usr/bin/env node
// Bounded, no-model-call probe. Optional fork internals are inspected only here,
// never imported by the production adapter. All Git mutations stay in a temp repo.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createGsdDispatcher } from "../src/extension/dispatcher.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const coreRoot = path.dirname(require.resolve("@opengsd/gsd-core/package.json"));
const sdk = require(path.join(coreRoot, "gsd-core/bin/lib/host-integration-sdk.cjs"));
const root = mkdtempSync(path.join(tmpdir(), "pi-gsd-routing-spike-"));
const cwd = path.join(root, "project");
const forkRoot = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
const report = {
  coreVersion: JSON.parse(readFileSync(path.join(coreRoot, "package.json"), "utf8")).version,
  scope: "SDK negotiation + real CLI inspection + injected child-factory contract; no model requests or live children",
};

function git(args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

try {
  mkdirSync(path.join(cwd, ".planning"), { recursive: true });
  writeFileSync(path.join(cwd, ".planning/config.json"), JSON.stringify({ runtime: "pi", workflow: { use_worktrees: true } }));
  writeFileSync(path.join(cwd, "README.md"), "Disposable compatibility fixture.\n");
  git(["init", "--initial-branch=main"]);
  git(["add", "."]);
  git(["-c", "user.name=Pi GSD Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "-m", "fixture"]);

  const negotiated = sdk.handleHandshakeRequest(sdk.buildHandshakeRequest({
    embeddingMode: "imperative", commandSurface: "slash-programmatic",
    modelMode: "active", hookBus: "host", stateIO: "session-log-append",
    transport: "native-extension", runtime: "node", effortSurface: "none",
    dispatch: { namedDispatch: true, nested: false, maxDepth: 1, background: true,
      backgroundDispatch: true, subagentToolkit: "full", isolation: "orchestrator-worktree", maxConcurrency: 2 },
  }));
  assert.equal(negotiated.effective.dispatch.isolation, "orchestrator-worktree");
  assert.equal(negotiated.effective.dispatch.maxConcurrency, 2);
  report.sdkNegotiation = { isolation: negotiated.effective.dispatch.isolation, concurrency: 2 };

  // The read-only inspect verb does not write an isolation sentinel. Force only
  // runtime identity in this disposable process, never fake isolation capability.
  const oldRuntime = process.env.GSD_RUNTIME;
  process.env.GSD_RUNTIME = "pi";
  try {
    const dispatcher = createGsdDispatcher({ packageRoot: repoRoot });
    const result = await dispatcher.run(["query", "inspect-dispatch-isolation", "--json"], cwd);
    const successPrefix = "gsd-tools exited with 0\n\n";
    assert.ok(result.text.startsWith(successPrefix), result.text);
    const decision = JSON.parse(result.text.slice(successPrefix.length));
    assert.equal(decision.runtime, "pi");
    assert.equal(decision.isolation, "none");
    assert.equal(decision.exec, null);
    report.cliIsolationAfterHandshake = decision;
  } finally {
    if (oldRuntime === undefined) delete process.env.GSD_RUNTIME;
    else process.env.GSD_RUNTIME = oldRuntime;
  }
  assert.equal(git(["status", "--porcelain"]), "", "inspect query must not mutate fixture files");

  if (forkRoot) {
    // Probe a source snapshot, never install into or patch the operator's fork.
    // Peers deliberately come from this repo's tested dependency tree, not the
    // optional checkout's potentially incomplete package-resolution context.
    const snapshot = path.join(root, "fork-snapshot");
    mkdirSync(snapshot);
    cpSync(path.join(forkRoot, "src"), path.join(snapshot, "src"), { recursive: true });
    cpSync(path.join(forkRoot, "package.json"), path.join(snapshot, "package.json"));
    symlinkSync(path.join(repoRoot, "node_modules"), path.join(snapshot, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    const entry = path.join(snapshot, "src/runs/shared/child-session.ts");
    report.forkVersion = JSON.parse(readFileSync(path.join(snapshot, "package.json"), "utf8")).version;
    report.childFactorySourceSha256 = createHash("sha256").update(readFileSync(entry)).digest("hex");
    report.childFactoryDependencyContext = "isolated source snapshot with repository peers; not installed-fork resolution or live child inference";
    const { createDefaultChildSessionFactory } = await import(pathToFileURL(entry).href);
    const worktree = path.join(root, "plan-01");
    git(["worktree", "add", "-b", "fixture-plan-01", worktree]);
    const observed = [];
    const virtualOrder = [];
    const loaders = [];
    let withVirtual = false;
    const stop = "SPIKE_STOP_BEFORE_SESSION_CREATION";
    const fakePi = {
      ModelRuntime: { create: async () => ({
        virtual: new Map(),
        registerVirtualModel(definition) { virtualOrder.push("register"); this.virtual.set(`${definition.provider}/${definition.id}`, definition); },
        async refresh(options) { assert.equal(options.allowNetwork, false); virtualOrder.push("refresh-offline"); },
      }) },
      SettingsManager: { create: (actualCwd) => { observed.push(["settings", actualCwd]); return { getTheme: () => ({}) }; } },
      DefaultResourceLoader: class {
        constructor(options) {
          observed.push(["loader", options.cwd]);
          this.extensions = { extensions: [], errors: [], runtime: {
            pendingVirtualModelRegistrations: withVirtual ? [{ definition: { provider: "gsd", id: "light" }, extensionPath: "<fixture>" }] : [],
          } };
          loaders.push(this);
        }
        async reload() {}
        getExtensions() { return this.extensions; }
      },
      SessionManager: { inMemory: (actualCwd) => { observed.push(["session", actualCwd]); return {}; } },
      resolveCliModel: ({ cliModel, modelRuntime }) => {
        if (cliModel !== "gsd/light") return { model: { provider: "fixture", id: "physical" } };
        virtualOrder.push("resolve");
        return modelRuntime.virtual.has(cliModel) ? { model: { provider: "gsd", id: "light" } } : { error: "SPIKE_VIRTUAL_NOT_REGISTERED" };
      },
      createAgentSession: async (options) => {
        observed.push(["create", options.cwd]);
        assert.deepEqual(options.model, withVirtual ? { provider: "gsd", id: "light" } : { provider: "fixture", id: "physical" });
        if (withVirtual) virtualOrder.push("create-boundary");
        throw new Error(stop);
      },
    };
    const factory = createDefaultChildSessionFactory({ loadPiCodingAgent: async () => fakePi });
    const launch = {
      cwd: worktree, storage: { kind: "memory" }, model: "fixture/physical",
      extensionPaths: [], ambientExtensions: false, hooks: [], noSkills: true,
      noContextFiles: true, runtime: { fanoutChild: false, depth: 1, waitTool: { enabled: false }, fast: false },
    };
    try {
      await assert.rejects(factory.create(launch), new RegExp(stop));
      assert.deepEqual(observed, ["settings", "loader", "session", "create"].map((stage) => [stage, worktree]));
      report.externalWorktreeCwd = "forwarded unchanged to settings, resources, session storage and session creation (injected SDK)";
      withVirtual = true;
      observed.length = 0;
      await assert.rejects(factory.create({ ...launch, model: "gsd/light" }), new RegExp(stop));
      assert.deepEqual(observed, ["settings", "loader", "session", "create"].map((stage) => [stage, worktree]));
      assert.deepEqual(virtualOrder, ["register", "refresh-offline", "resolve", "create-boundary"]);
      assert.deepEqual(loaders.at(-1).getExtensions().runtime.pendingVirtualModelRegistrations, []);
      report.virtualChildPreResolution = "queued virtual definition registered and drained before model resolution; offline refresh; exact virtual model reaches session-creation boundary (injected SDK)";
    } finally {
      await factory.dispose();
    }
    git(["worktree", "remove", worktree]);
    git(["branch", "-D", "fixture-plan-01"]);
  } else {
    report.childFactory = "not probed; pass an explicit trusted pi-subagents package root as argument";
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true });
}
