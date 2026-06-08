import assert from "node:assert/strict";
import * as path from "node:path";
import test from "node:test";

import registerPiGsdExtension from "../src/extension/index.ts";
import { registerPiGsdCore } from "../src/extension/register.ts";
import { capabilities, mockPi, toolText } from "./test-utils.ts";

test("registerPiGsdCore registers one namespaced tool and three namespaced commands", () => {
  const pi = mockPi();

  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline") });

  assert.equal(pi.tools.length, 1);
  assert.equal(pi.tools[0].name, "gsd");
  assert.equal(pi.tools[0].label, "GSD");
  assert.deepEqual([...pi.commands.keys()].sort(), ["gsd-doctor", "gsd-run", "gsd-status"]);
});

test("registered tool defaults to status when action is omitted", async () => {
  const pi = mockPi();
  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline") });

  const result = await pi.tools[0].execute("call-1", { cwd: process.cwd() });

  assert.match(toolText(result), /# pi-gsd status/);
  assert.equal(result.details.caps.mode, "inline");
});

test("registered tool resolves cwd from Pi context when params omit cwd", async () => {
  const pi = mockPi();
  const cwd = path.resolve("from-context");
  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline") });

  const result = await pi.tools[0].execute("call-1", { action: "status" }, undefined, undefined, { cwd });

  assert.ok(toolText(result).includes(`CWD: \`${cwd}\``));
});

test("registered gsd-run command parses whitespace-separated args", async () => {
  const calls: unknown[][] = [];
  const pi = mockPi(async (...args: unknown[]) => {
    calls.push(args);
    return { stdout: "ok", exitCode: 0 };
  });
  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), defaultCwd: process.cwd() });

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
  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), defaultCwd: process.cwd() });

  const statusResponse = await pi.commands.get("gsd-status")!.handler("ignored args");
  const doctorResponse = await pi.commands.get("gsd-doctor")!.handler("ignored args");

  assert.equal(calls.length, 0);
  assert.match(statusResponse.text, /# pi-gsd status/);
  assert.match(doctorResponse.text, /## Integration guidance/);
});

test("registered commands notify UI and return undefined when UI is available", async () => {
  const pi = mockPi();
  const notifications: Array<{ message: string; level?: string }> = [];
  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("inline"), defaultCwd: process.cwd() });

  const response = await pi.commands.get("gsd-status")!.handler({
    cwd: process.cwd(),
    hasUI: true,
    ui: {
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
    },
  });

  assert.equal(response, undefined);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].message, /# pi-gsd status/);
  assert.equal(notifications[0].level, "info");
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
  assert.ok(pi.tools[0].parameters);
});
