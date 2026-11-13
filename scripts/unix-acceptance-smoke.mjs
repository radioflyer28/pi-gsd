#!/usr/bin/env node
// Opt-in real POSIX transport acceptance; no models, network or shared settings.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { execWithNodeSpawn, normalizeExecution, MAX_CAPTURE_BYTES } from "../src/extension/core-execution.ts";
import { createGsdDispatcher } from "../src/extension/dispatcher.ts";

assert.notEqual(process.platform, "win32", "Run this gate with native Unix Node, not WSL interop node.exe");
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdkRoot = process.env.PI_GSD_SMOKE_SDK_ROOT ?? path.join(repo, "node_modules/@earendil-works/pi-coding-agent");
const sdkVersion = JSON.parse(readFileSync(path.join(sdkRoot, "package.json"), "utf8")).version;
// Isolated compatibility instrumentation of the host's actual exec implementation.
// No host internal import is added to the extension's runtime code.
const { execCommand } = await import(pathToFileURL(path.join(sdkRoot, "dist/core/exec.js")).href);
const root = mkdtempSync(path.join(tmpdir(), "pi-gsd-posix-"));
const inheritedRuntime = process.env.GSD_RUNTIME;
try {
  for (const cause of ["cancel", "timeout", "overflow"]) {
    const ready = path.join(root, `${cause}.pid`);
    const program = `process.on('SIGTERM',()=>{}); require('node:fs').writeFileSync(${JSON.stringify(ready)},String(process.pid)); ${cause === "overflow" ? `process.stdout.write('x'.repeat(${MAX_CAPTURE_BYTES + 4096}));` : ""} setTimeout(()=>process.exit(99),10000);`;
    const controller = new AbortController();
    let pid, recovery, watchdog;
    try {
      const running = execWithNodeSpawn(process.execPath, ["-e", program], { signal: controller.signal, ...(cause === "timeout" ? { timeout: 2000 } : {}) });
      const resultPromise = Promise.race([running, new Promise((_, reject) => {
        watchdog = setTimeout(() => reject(new Error(`${cause}: transport failed to settle`)), 7000);
      })]);
      const readyDeadline = Date.now() + 5000;
      while (!existsSync(ready) && Date.now() < readyDeadline) await delay(10);
      assert.ok(existsSync(ready), `${cause}: child must install its SIGTERM handler before exercising termination`);
      pid = Number(readFileSync(ready, "utf8"));
      assert.ok(Number.isInteger(pid) && pid > 0);
      if (cause === "cancel") controller.abort();
      const raw = await resultPromise;
      assert.equal(typeof raw, "object");
      assert.equal(raw.signal, "SIGKILL", `${cause}: a SIGTERM-resistant process must require real escalation`);
      assert.equal(raw.terminationUnconfirmed, false);
      assert.equal(raw.exitCode, null);
      assert.throws(() => process.kill(pid, 0), (error) => error.code === "ESRCH", "process termination must actually be confirmed");
      const execution = normalizeExecution(raw);
      recovery = execution.fullOutput?.stdout;
      assert.equal(execution.outcome, cause === "cancel" ? "cancelled" : cause === "timeout" ? "timed-out" : "output-limit");
      console.log(`unix-acceptance: PASS real ${cause} escalation to SIGKILL; exit confirmed`);
    } finally {
      clearTimeout(watchdog);
      controller.abort();
      if (!pid && existsSync(ready)) pid = Number(readFileSync(ready, "utf8"));
      if (pid) { try { process.kill(pid, "SIGKILL"); } catch { /* Already reaped. */ } }
      if (recovery) rmSync(path.dirname(recovery), { recursive: true, force: true });
    }
  }
  process.env.GSD_RUNTIME = "claude";
  const launches = [];
  const dispatcher = createGsdDispatcher({ packageRoot: repo, exec: async (command, args, options) => {
    launches.push({ command, args, maxBuffer: options?.maxBuffer });
    return execCommand(command, args, options?.cwd, options);
  } });
  const init = await dispatcher.run(["query", "init.plan-phase", "6"], root);
  assert.equal(init.ok, true, init.text);
  assert.equal(init.details.execution.json.agent_runtime, "pi");
  assert.equal(process.env.GSD_RUNTIME, "claude", "parent environment must remain unchanged");
  assert.equal(launches.length, 1, "exercise the real host executor, not native fallback");
  assert.equal(launches[0].command, process.execPath);
  assert.equal(launches[0].args[0], "--import");
  assert.equal(launches[0].maxBuffer, MAX_CAPTURE_BYTES);
  const doctor = await dispatcher.doctor(root);
  assert.equal(doctor.details.core.binaryProbe.status, "healthy", doctor.text);
  console.log(`unix-acceptance: PASS real Pi ${sdkVersion} host executor, separate argv, CLI Pi identity and preserved parent environment`);
  console.log(JSON.stringify({ gate: "unix-acceptance", result: "passed", platform: process.platform, node: process.version, sdk: sdkVersion }));
} finally {
  if (inheritedRuntime === undefined) delete process.env.GSD_RUNTIME;
  else process.env.GSD_RUNTIME = inheritedRuntime;
  rmSync(root, { recursive: true, force: true });
}
