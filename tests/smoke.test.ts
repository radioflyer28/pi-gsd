import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";

import { gsdToolsCommandNames } from "../src/extension/capabilities.ts";
import { createGsdDispatcher } from "../src/extension/dispatcher.ts";

test("smoke: package-local gsd-tools can be invoked without pi.exec", async () => {
  const packageRoot = process.cwd();
  const command = path.join(packageRoot, "node_modules", ".bin", gsdToolsCommandNames()[0]);
  const dispatcher = createGsdDispatcher({ packageRoot });

  const result = await dispatcher.run(["--help"], packageRoot);

  assert.match(result.text, /gsd-tools exited with 0/);
  assert.match(result.text, /Usage: gsd-tools/);
  assert.equal(result.details.caps.gsdCore, true);
});


test("smoke: real init.plan-phase reports Pi while preserving disk-install findings, config and model omission", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "pi-gsd-init-runtime-"));
  const previous = { runtime: process.env.GSD_RUNTIME, agents: process.env.GSD_AGENTS_DIR };
  try {
    mkdirSync(path.join(root, ".planning"));
    const config = JSON.stringify({ runtime: "claude", resolve_model_ids: "omit" });
    const configPath = path.join(root, ".planning", "config.json");
    writeFileSync(configPath, config);
    process.env.GSD_RUNTIME = "codex";
    process.env.GSD_AGENTS_DIR = path.join(root, "absent-agents");
    // Exercise the real CLI main-module guard, not just a script fixture.
    const dispatchers = [createGsdDispatcher(), createGsdDispatcher({
      gsdToolsCommand: path.resolve("node_modules/.bin/gsd-tools"),
      exec: async (command, args, options) => {
        const result = spawnSync(command, args ?? [], { cwd: options?.cwd, encoding: "utf8" });
        assert.ifError(result.error);
        return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status ?? 1 };
      },
    })];
    for (const dispatcher of dispatchers) {
    const result = await dispatcher.run(["query", "init.plan-phase", "6"], root);
    assert.match(result.text, /gsd-tools exited with 0/);
    const stdout = result.text.split("\n[stderr]")[0];
    const data = JSON.parse(stdout.slice(stdout.indexOf("{")));
    assert.equal(data.agent_runtime, "pi");
    assert.equal(data.agents_dir, process.env.GSD_AGENTS_DIR);
    assert.equal(data.agents_installed, false);
    assert.ok(data.missing_agents.includes("gsd-planner"));
    assert.equal(data.researcher_model, "");
    assert.equal(readFileSync(configPath, "utf8"), config);
    assert.equal(process.env.GSD_RUNTIME, "codex");
    assert.equal(result.details.piRuntimeAgents, undefined, "standalone dispatcher must not invent a session registry");
    }
  } finally {
    if (previous.runtime === undefined) delete process.env.GSD_RUNTIME; else process.env.GSD_RUNTIME = previous.runtime;
    if (previous.agents === undefined) delete process.env.GSD_AGENTS_DIR; else process.env.GSD_AGENTS_DIR = previous.agents;
    rmSync(root, { recursive: true, force: true });
  }
});
