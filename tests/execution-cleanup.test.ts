import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { syncBuiltinESMExports } from "node:module";
import * as path from "node:path";
import { execWithNodeSpawn, normalizeExecution, OUTPUT_DRAIN_MS, TERMINATION_GRACE_MS, TERMINATION_CONFIRM_MS } from "../src/extension/core-execution.ts";
import { createGsdDispatcher } from "../src/extension/dispatcher.ts";
import registerParent from "../src/extension/index.ts";
import registerLeaf from "../src/extension/leaf.ts";
import { capabilities, mockPi } from "./test-utils.ts";

for (const failed of [["stdout"], ["stderr"], ["stdout", "stderr"]]) {
  test(`recovery remains incomplete when saving ${failed.join(" and ")} fails`, (t) => {
    const originalWrite = fs.writeFileSync, originalTemp = fs.mkdtempSync;
    const directories: string[] = [];
    t.mock.method(fs, "mkdtempSync", (...args: Parameters<typeof fs.mkdtempSync>) => {
      const directory = originalTemp(...args); directories.push(String(directory)); return directory;
    });
    t.mock.method(fs, "writeFileSync", (...args: Parameters<typeof fs.writeFileSync>) => {
      if (failed.some((stream) => path.basename(String(args[0])) === `${stream}.txt`)) throw new Error("injected disk failure");
      return originalWrite(...args);
    });
    syncBuiltinESMExports();
    try {
      const result = normalizeExecution({ exitCode: 0, stdout: "s".repeat(70000), stderr: "e".repeat(70000) });
      assert.equal(result.fullOutput?.complete, false);
      for (const stream of failed) assert.ok(result.recoveryError?.includes(stream));
      for (const stream of ["stdout", "stderr"] as const) {
        if (failed.includes(stream)) assert.equal(result.fullOutput?.[stream], undefined);
        else assert.equal(fs.readFileSync(result.fullOutput![stream]!, "utf8").length, 70000);
      }
    } finally {
      t.mock.restoreAll(); syncBuiltinESMExports();
      for (const directory of directories) fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const code of [0, 7]) {
  test(`inherited pipes cannot delay an exited command indefinitely (exit ${code})`, async () => {
    const program = `const {spawn}=require('node:child_process'); const c=spawn(process.execPath,['-e','setTimeout(()=>{},10000)'],{stdio:['ignore',process.stdout,process.stderr],detached:true,windowsHide:true}); console.log(c.pid); c.unref(); process.exit(${code});`;
    let pid: number | undefined;
    try {
      const start = Date.now();
      const raw = await execWithNodeSpawn(process.execPath, ["-e", program], { timeout: 5_000 });
      assert.notEqual(typeof raw, "string");
      if (typeof raw === "string") throw new Error("Expected execution facts");
      pid = Number.parseInt(raw.stdout!, 10);
      assert.ok(Number.isInteger(pid) && pid > 0);
      assert.ok(Date.now() - start < 4_000, "must not await descendant pipe closure or the execution deadline");
      assert.equal(raw.exitCode, code);
      assert.equal(raw.timedOut, false);
      const result = normalizeExecution(raw);
      assert.equal(result.captureIncomplete, true);
      assert.equal(result.terminationUnconfirmed, false);
      assert.equal(result.outcome, code === 0 ? "incomplete-output" : "failed");
      assert.equal(result.json, undefined);
    } finally { if (pid) { try { process.kill(pid); } catch { /* Descendant already exited. */ } } }
  });
}

function fakeProcess() {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(), stderr: new PassThrough(), pid: 42,
    signals: [] as string[], unreferenced: false,
    kill(signal: string) { this.signals.push(signal); return true; },
    unref() { this.unreferenced = true; },
  });
  return child;
}

for (const cause of ["cancel", "timeout", "overflow"] as const) {
  test(`${cause} escalates and settles even without exit/close confirmation`, async (t) => {
    const child = fakeProcess();
    t.mock.method(childProcess, "spawn", () => child);
    syncBuiltinESMExports();
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const controller = new AbortController();
    try {
      const promise = execWithNodeSpawn("fixture", [], { signal: controller.signal, ...(cause === "timeout" ? { timeout: 10 } : {}) });
      if (cause === "cancel") controller.abort();
      if (cause === "timeout") t.mock.timers.tick(10);
      if (cause === "overflow") child.stdout.write(Buffer.alloc(8 * 1024 * 1024 + 1));
      assert.deepEqual(child.signals, ["SIGTERM"]);
      t.mock.timers.tick(TERMINATION_GRACE_MS);
      assert.deepEqual(child.signals, ["SIGTERM", "SIGKILL"]);
      t.mock.timers.tick(TERMINATION_CONFIRM_MS);
      const raw = await promise;
      assert.notEqual(typeof raw, "string");
      if (typeof raw === "string") throw new Error("Expected execution facts");
      assert.equal(raw.terminationUnconfirmed, true);
      assert.equal(raw.exitCode, null);
      assert.equal(raw.stdoutIncomplete, true);
      assert.equal(child.unreferenced, true);
      assert.equal(child.stdout.destroyed, true);
      assert.equal(child.stderr.destroyed, true);
      // Do not normalize the 8 MiB overflow fixture into an unnecessary recovery file.
      if (cause !== "overflow") assert.equal(normalizeExecution(raw).outcome, cause === "cancel" ? "cancelled" : "timed-out");
      child.emit("error", new Error("late event"));
      child.emit("close", 0, null);
    } finally { t.mock.restoreAll(); syncBuiltinESMExports(); t.mock.timers.reset(); }
  });
}

test("abort during drain does not relabel completed work", async (t) => {
  const child = fakeProcess();
  t.mock.method(childProcess, "spawn", () => child); syncBuiltinESMExports();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const controller = new AbortController();
    const dispatcher = createGsdDispatcher({ detect: () => capabilities("inline"), gsdToolsCommand: "fixture" });
    const promise = dispatcher.run([], process.cwd(), controller.signal);
    child.emit("exit", 0, null);
    controller.abort();
    const result = await promise;
    assert.equal(result.details.execution?.outcome, "incomplete-output");
    assert.equal(result.details.execution?.exitCode, 0);
    assert.deepEqual(child.signals, []);
    t.mock.timers.tick(OUTPUT_DRAIN_MS + TERMINATION_GRACE_MS + TERMINATION_CONFIRM_MS);
    assert.deepEqual(child.signals, []);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); t.mock.timers.reset(); }
});

test("leaf entrypoint keeps the same tool/schema but omits parent coordination and registrations", async () => {
  const parent = mockPi(), leaf = mockPi(async () => ({ stdout: '{"agent_runtime":"pi"}', exitCode: 0 }), [{ name: "subagents_enable" }]);
  let registrations = 0;
  registerParent(parent.api as any);
  registerLeaf({ ...leaf.api, events: { emit() { registrations++; } } } as any);
  assert.equal(leaf.tools.length, 1);
  assert.equal(leaf.tools[0].name, "gsd");
  assert.deepEqual(leaf.tools[0].parameters, parent.tools[0].parameters);
  assert.deepEqual(leaf.tools[0].outputSchema, parent.tools[0].outputSchema);
  const prompt = leaf.tools[0].promptGuidelines.join("\n");
  assert.match(prompt, /Leaf execution only/);
  assert.match(prompt, /contact_supervisor/);
  assert.doesNotMatch(prompt, /Before each bounded GSD child assignment|Before selecting any GSD child|Parent coordinators|call subagents_enable/);
  assert.match(parent.tools[0].promptGuidelines.join("\n"), /Before each bounded GSD child assignment/);
  for (const handler of leaf.handlers.get("session_start") ?? []) await handler({}, { cwd: process.cwd(), isProjectTrusted: () => true });
  assert.equal(registrations, 0, "leaf audience must not register profiles even if a parent interface is present");
  const init = await leaf.tools[0].execute("leaf-init", { action: "run", args: ["query", "init.plan-phase", "6"] });
  assert.equal(init.structuredContent.runtimeAgents.status.state, "unavailable");
  assert.match(init.structuredContent.runtimeAgents.status.reason, /Leaf provider/);
  assert.doesNotMatch(init.content[0].text, /inspect each exact required role|list\/get/);
});

test("process exit clears the execution deadline while pipe draining remains bounded", async (t) => {
  const child = fakeProcess();
  t.mock.method(childProcess, "spawn", () => child); syncBuiltinESMExports();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const promise = execWithNodeSpawn("fixture", [], { timeout: 10 });
    child.emit("exit", 0, null);
    t.mock.timers.tick(10);
    assert.deepEqual(child.signals, []);
    t.mock.timers.tick(OUTPUT_DRAIN_MS);
    const raw = await promise;
    assert.notEqual(typeof raw, "string");
    if (typeof raw === "string") throw new Error("Expected execution facts");
    assert.equal(raw.timedOut, false);
    assert.equal(raw.exitCode, 0);
    assert.equal(normalizeExecution(raw).outcome, "incomplete-output");
    assert.deepEqual(child.signals, []);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); t.mock.timers.reset(); }
});
