import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { registerUpstreamSafetyGuard, runUpstreamGuard } from "../src/extension/upstream-safety-guard.ts";
import { mockPi } from "./test-utils.ts";

test("upstream safety guard is disabled by default", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-safety-"));
  try {
    let calls = 0;
    const pi = mockPi();
    registerUpstreamSafetyGuard(pi.api, {
      packageRoot: cwd,
      exists: () => true,
      runner: async () => { calls += 1; return undefined; },
    });
    await pi.handlers.get("tool_call")![0]({ toolName: "write", input: { path: "x", content: "y" } }, { cwd });
    assert.equal(calls, 0);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("opt-in safety guard maps write payload and preserves upstream blocks", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-safety-"));
  try {
    fs.mkdirSync(path.join(cwd, ".pi-gsd"));
    fs.writeFileSync(path.join(cwd, ".pi-gsd", "config.json"), JSON.stringify({ safety: { upstreamGuards: "on" } }));
    const calls: Array<{ script: string; payload: Record<string, any> }> = [];
    const pi = mockPi();
    registerUpstreamSafetyGuard(pi.api, {
      packageRoot: cwd,
      exists: () => true,
      runner: async (script, payload) => {
        calls.push({ script, payload });
        return { block: true, reason: "upstream block" };
      },
    });
    const input = { path: ".planning/ROADMAP.md", content: "short" };
    const result = await pi.handlers.get("tool_call")![0]({ toolName: "write", input }, { cwd });
    assert.deepEqual(result, { block: true, reason: "upstream block" });
    assert.equal(calls.length, 1);
    assert.match(calls[0].script, /gsd-write-guard\.js$/);
    assert.deepEqual(calls[0].payload.tool_input, { file_path: input.path, content: input.content });
    assert.deepEqual(input, { path: ".planning/ROADMAP.md", content: "short" });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("opt-in safety guard fails open when runner throws", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-safety-"));
  try {
    fs.mkdirSync(path.join(cwd, ".pi-gsd"));
    fs.writeFileSync(path.join(cwd, ".pi-gsd", "config.json"), JSON.stringify({ safety: { upstreamGuards: "on" } }));
    const pi = mockPi();
    registerUpstreamSafetyGuard(pi.api, {
      packageRoot: cwd,
      exists: () => true,
      runner: async () => { throw new Error("boom"); },
    });
    const result = await pi.handlers.get("tool_call")![0]({ toolName: "edit", input: { path: "src/a.ts", edits: [] } }, { cwd });
    assert.equal(result, undefined);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("package-local upstream write guard blocks catastrophic planning shrink", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-safety-upstream-"));
  try {
    const planning = path.join(cwd, ".planning");
    fs.mkdirSync(planning);
    const roadmap = path.join(planning, "ROADMAP.md");
    fs.writeFileSync(roadmap, Array.from({ length: 100 }, (_, index) => `line ${index}`).join("\n"));
    const script = path.resolve("node_modules", "@opengsd", "gsd-core", "hooks", "gsd-write-guard.js");
    const result = await runUpstreamGuard(script, {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: roadmap, content: "replacement\n" },
      cwd,
    }, cwd);
    assert.equal(result?.block, true);
    assert.match(result?.reason ?? "", /Write guard/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("upstream guard runner ignores malformed output", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-safety-runner-"));
  try {
    const script = path.join(cwd, "guard.cjs");
    fs.writeFileSync(script, "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('not-json'));\n");
    assert.equal(await runUpstreamGuard(script, {}, cwd), undefined);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
