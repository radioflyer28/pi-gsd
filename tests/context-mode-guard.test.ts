import assert from "node:assert/strict";
import * as path from "node:path";
import test from "node:test";

import { evaluateContextModeToolCall, registerContextModeGuard } from "../src/extension/context-mode-guard.ts";
import registerPiGsdExtension from "../src/extension/index.ts";
import { mockPi } from "./test-utils.ts";

function dirStats() {
  return { isDirectory: () => true, isFile: () => false, size: 0 } as any;
}

function fileStats(size: number) {
  return { isDirectory: () => false, isFile: () => true, size } as any;
}

test("context-mode guard blocks wholesale .planning indexing unless explicitly requested", () => {
  const decision = evaluateContextModeToolCall(
    { toolName: "ctx_index", input: { path: ".planning" } },
    { cwd: process.cwd() },
    { stat: () => dirStats() },
  );

  assert.equal(decision.action, "block");
  assert.match(decision.reason, /wholesale context-mode indexing of \.planning/);
});

test("context-mode guard warns instead of blocking when user explicitly requested .planning indexing", () => {
  const decision = evaluateContextModeToolCall(
    { toolName: "ctx_index", input: { path: ".planning" } },
    {
      cwd: process.cwd(),
      sessionManager: {
        getBranch: () => [
          {
            message: {
              role: "user",
              content: "Please index the .planning directory for this investigation.",
            },
          },
        ],
      },
    },
    { stat: () => dirStats() },
  );

  assert.equal(decision.action, "warn");
  assert.match(decision.reason, /explicitly requested/);
});

test("context-mode guard blocks planning root indexing through symlink-resolved paths", () => {
  const cwd = path.resolve("repo");
  const decision = evaluateContextModeToolCall(
    { toolName: "ctx_index", input: { path: "planning-link" } },
    { cwd },
    {
      stat: () => dirStats(),
      realpath: () => path.join(cwd, ".planning"),
    },
  );

  assert.equal(decision.action, "block");
  assert.match(decision.reason, /wholesale context-mode indexing of \.planning/);
});

test("context-mode guard treats .planning path casing defensively", () => {
  const decision = evaluateContextModeToolCall(
    { toolName: "ctx_index", input: { path: ".PLANNING" } },
    { cwd: process.cwd() },
    { stat: () => dirStats(), realpath: () => null },
  );

  assert.equal(decision.action, "block");
});

test("context-mode guard warns on individual .planning artifacts without blocking", () => {
  const decision = evaluateContextModeToolCall(
    { toolName: "ctx_index", input: { path: ".planning/phase/PLAN.md" } },
    { cwd: process.cwd() },
    { stat: () => fileStats(2048) },
  );

  assert.equal(decision.action, "warn");
  assert.match(decision.reason, /Prefer direct reads/);
});

test("context-mode guard warns when ctx_execute_file is used for a small source file", () => {
  const decision = evaluateContextModeToolCall(
    { toolName: "ctx_execute_file", input: { path: "src/extension/register.ts" } },
    { cwd: process.cwd() },
    { stat: () => fileStats(1024) },
  );

  assert.equal(decision.action, "warn");
  assert.match(decision.reason, /Small source\/planning file/);
});

test("context-mode guard allows small data files where read/edit is not clearly better", () => {
  const decision = evaluateContextModeToolCall(
    { toolName: "ctx_execute_file", input: { path: "fixtures/example.json" } },
    { cwd: process.cwd() },
    { stat: () => fileStats(1024) },
  );

  assert.equal(decision.action, "allow");
});

test("context-mode guard allows explicit computed extraction from small source files", () => {
  const decision = evaluateContextModeToolCall(
    { toolName: "ctx_execute_file", input: { path: "src/extension/register.ts" } },
    {
      cwd: process.cwd(),
      sessionManager: {
        getBranch: () => [
          {
            message: {
              role: "user",
              content: "Count how many registerCommand calls are in src/extension/register.ts without reading the whole file.",
            },
          },
        ],
      },
    },
    { stat: () => fileStats(1024) },
  );

  assert.equal(decision.action, "allow");
});

test("context-mode guard allows logs, reports, and other bulky/transient paths", () => {
  const decision = evaluateContextModeToolCall(
    { toolName: "ctx_execute_file", input: { path: "logs/test-output.log" } },
    { cwd: process.cwd() },
    { stat: () => fileStats(1024) },
  );

  assert.equal(decision.action, "allow");
});

test("context-mode guard allows searches and execute commands without friction", () => {
  assert.equal(evaluateContextModeToolCall({ toolName: "ctx_search", input: { queries: ["foo"] } }).action, "allow");
  assert.equal(evaluateContextModeToolCall({ toolName: "ctx_execute", input: { language: "shell" } }).action, "allow");
});

test("registered context-mode guard blocks through Pi tool_call hook and notifies UI", async () => {
  const pi = mockPi();
  registerContextModeGuard(pi.api as any);
  const notifications: Array<{ message: string; level?: string }> = [];

  const result = await pi.handlers.get("tool_call")![0](
    { toolName: "ctx_index", input: { path: ".planning" } },
    {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        notify(message: string, level?: string) {
          notifications.push({ message, level });
        },
      },
    },
  );

  assert.deepEqual(result, {
    block: true,
    reason:
      "Blocked wholesale context-mode indexing of .planning/. Read relevant planning files directly or index only an explicitly requested large artifact.",
  });
  assert.equal(notifications[0].level, "error");
});

test("default extension registers both the gsd tool and context-mode guard", () => {
  const pi = mockPi();

  registerPiGsdExtension(pi.api as any);

  assert.equal(pi.tools[0].name, "gsd");
  assert.equal(pi.handlers.get("tool_call")?.length, 1);
});
