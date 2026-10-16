import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { registerUpstreamSafetyGuard, runUpstreamGuard, UPSTREAM_GUARD_TIMEOUT_MS, type UpstreamGuardDiagnostic } from "../src/extension/upstream-safety-guard.ts";
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


test("upstream guard preserves a denial arriving after the old 4s timeout", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-safety-slow-"));
  try {
    assert.equal(UPSTREAM_GUARD_TIMEOUT_MS, 120_000);
    const script = path.join(cwd, "guard.cjs");
    fs.writeFileSync(script, `process.stdin.resume(); process.stdin.on('end', () => setTimeout(() => process.stdout.write(JSON.stringify({ decision: 'block', reason: 'delayed denial' })), 4500));`);
    assert.deepEqual(await runUpstreamGuard(script, {}, cwd), { block: true, reason: "delayed denial" });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("upstream guard bounds stderr diagnostics without losing valid blocks", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-safety-stderr-"));
  try {
    const script = path.join(cwd, "guard.cjs");
    fs.writeFileSync(script, `process.stdin.resume(); process.stdin.on('end', () => { process.stderr.write('probe diagnostic\\u001b\\u009b' + 'x'.repeat(10000)); process.stdout.write(JSON.stringify({ decision: 'block', reason: 'keep block' })); });`);
    const diagnostics: UpstreamGuardDiagnostic[] = [];
    assert.deepEqual(await runUpstreamGuard(script, {}, cwd, undefined, { onDiagnostic: (entry) => diagnostics.push(entry) }), { block: true, reason: "keep block" });
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].kind, "stderr");
    assert.equal(diagnostics[0].script, "guard.cjs");
    assert.equal(diagnostics[0].message.length, 2048);
    assert.doesNotMatch(diagnostics[0].message, /[\u0000-\u001f\u007f-\u009f]/);
    assert.deepEqual(await runUpstreamGuard(script, {}, cwd, undefined, { onDiagnostic: () => { throw new Error("diagnostic sink failed"); } }), { block: true, reason: "keep block" });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("upstream guard timeout and cancellation stay fail-open and distinct", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-safety-cancel-"));
  try {
    const script = path.join(cwd, "guard.cjs");
    fs.writeFileSync(script, "process.stdin.resume(); setInterval(() => {}, 1000);");
    const diagnostics: UpstreamGuardDiagnostic[] = [];
    assert.equal(await runUpstreamGuard(script, {}, cwd, undefined, { timeoutMs: 300, onDiagnostic: (entry) => diagnostics.push(entry) }), undefined);
    assert.equal(diagnostics.filter(({ kind }) => kind === "timeout").length, 1);
    assert.match(diagnostics[0].message, /300ms.*unknown/);
    diagnostics.length = 0;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100);
    try {
      assert.equal(await runUpstreamGuard(script, {}, cwd, controller.signal, { onDiagnostic: (entry) => diagnostics.push(entry) }), undefined);
    } finally {
      clearTimeout(timer);
    }
    assert.equal(diagnostics.length, 0);
    // A pre-aborted call must not spawn even a missing script.
    assert.equal(await runUpstreamGuard(path.join(cwd, "missing.cjs"), {}, cwd, controller.signal, { onDiagnostic: (entry) => diagnostics.push(entry) }), undefined);
    assert.equal(diagnostics.length, 0);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("upstream guard excessive output fails open with a bounded diagnostic", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-safety-output-"));
  try {
    const script = path.join(cwd, "guard.cjs");
    fs.writeFileSync(script, "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('x'.repeat(70000)));");
    const diagnostics: UpstreamGuardDiagnostic[] = [];
    assert.equal(await runUpstreamGuard(script, {}, cwd, undefined, { onDiagnostic: (entry) => diagnostics.push(entry) }), undefined);
    assert.equal(diagnostics[0].kind, "output-limit");
    assert.ok(diagnostics[0].message.length <= 2048);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
