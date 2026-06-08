import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";

import {
  createGsdDispatcher,
  formatCapabilities,
  resolveCwd,
  truncateTailText,
} from "../src/extension/dispatcher.ts";
import { capabilities } from "./test-utils.ts";

test("resolveCwd prefers explicit params, then Pi context cwd, then default cwd", () => {
  const defaultCwd = path.resolve("default");
  const ctxCwd = path.resolve("ctx");
  const paramCwd = path.resolve("param");

  assert.equal(resolveCwd({}, { cwd: ctxCwd }, defaultCwd), ctxCwd);
  assert.equal(resolveCwd({ cwd: paramCwd }, { cwd: ctxCwd }, defaultCwd), paramCwd);
  assert.equal(resolveCwd({}, undefined, defaultCwd), defaultCwd);
});

test("truncateTailText leaves small output unchanged", () => {
  assert.equal(truncateTailText("short output", 100, 10), "short output");
});

test("truncateTailText keeps the tail when line count is too large", () => {
  const text = ["one", "two", "three", "four"].join("\n");
  const truncated = truncateTailText(text, 100, 2);

  assert.match(truncated, /\[output truncated:/);
  assert.match(truncated, /three\nfour$/);
  assert.doesNotMatch(truncated, /one\ntwo\nthree\nfour$/);
});

test("truncateTailText keeps the tail when character count is too large", () => {
  const truncated = truncateTailText("abcdefghijklmnopqrstuvwxyz", 5, 10);

  assert.match(truncated, /\[output truncated:/);
  assert.match(truncated, /vwxyz$/);
});

test("formatCapabilities reports planning directory and optional integrations", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-format-"));
  mkdirSync(path.join(cwd, ".planning"));

  try {
    const text = formatCapabilities(cwd, capabilities("delegated-ctx"));

    assert.ok(text.includes(`CWD: \`${cwd}\``));
    assert.match(text, /\.planning present: yes/);
    assert.match(text, /mode: `delegated-ctx`/);
    assert.match(text, /pi-subagents: detected/);
    assert.match(text, /context-mode: detected/);
    assert.doesNotMatch(text, /\.pi-gsd present/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("dispatcher status returns capability details without executing commands", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-status-"));
  let execCalled = false;
  const dispatcher = createGsdDispatcher({
    exec: async () => {
      execCalled = true;
      return "unexpected";
    },
    detect: () => capabilities("ctx-inline"),
  });

  try {
    const result = await dispatcher.status(cwd);

    assert.equal(execCalled, false);
    assert.equal(result.details.caps.mode, "ctx-inline");
    assert.match(result.text, /context-mode: detected/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("dispatcher doctor includes integration and state-boundary guidance", async () => {
  const dispatcher = createGsdDispatcher({ detect: () => capabilities("delegated-ctx") });

  const result = await dispatcher.doctor(process.cwd());

  assert.match(result.text, /do not fork or duplicate GSD Core semantics/i);
  assert.match(result.text, /subagent\(\{ action: "list" \}\)/);
  assert.match(result.text, /ctx_execute/);
  assert.match(result.text, /Do not create or assume `\.gsd\/`/);
});

test("dispatcher run dispatches to package-local gsd-tools with args, cwd, and signal", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-run-"));
  const controller = new AbortController();
  const calls: unknown[][] = [];
  const dispatcher = createGsdDispatcher({
    exec: async (...args: unknown[]) => {
      calls.push(args);
      return { stdout: "ok", exitCode: 0 };
    },
    detect: () => capabilities("inline"),
  });

  try {
    const result = await dispatcher.run(["progress", "--json"], cwd, controller.signal);

    assert.deepEqual(calls, [
      ["package-local-gsd-tools", ["progress", "--json"], { cwd, signal: controller.signal }],
    ]);
    assert.match(result.text, /gsd-tools exited with 0/);
    assert.match(result.text, /ok/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("dispatcher run includes stderr and non-zero exit codes", async () => {
  const dispatcher = createGsdDispatcher({
    exec: async () => ({ stdout: "out", stderr: "err", exitCode: 7 }),
    detect: () => capabilities("inline"),
  });

  const result = await dispatcher.run([], process.cwd());

  assert.match(result.text, /gsd-tools exited with 7/);
  assert.match(result.text, /out/);
  assert.match(result.text, /\[stderr\]\nerr/);
});

test("dispatcher run handles string exec results", async () => {
  const dispatcher = createGsdDispatcher({
    exec: async () => "plain output",
    detect: () => capabilities("inline"),
  });

  const result = await dispatcher.run([], process.cwd());

  assert.equal(result.text, "plain output");
});

test("dispatcher run truncates large command output through the configured truncator", async () => {
  const dispatcher = createGsdDispatcher({
    exec: async () => ({ stdout: "x".repeat(100), exitCode: 0 }),
    detect: () => capabilities("inline"),
    truncateOutput: (text) => `truncated:${text.length}`,
  });

  const result = await dispatcher.run([], process.cwd());

  assert.match(result.text, /^truncated:/);
});

test("dispatcher run returns a clear message when pi.exec is unavailable", async () => {
  const dispatcher = createGsdDispatcher({ detect: () => capabilities("inline") });

  const result = await dispatcher.run([], process.cwd());

  assert.match(result.text, /did not expose pi\.exec\(\)/);
});

test("dispatcher run refuses to use system-wide gsd-tools when package-local gsd-tools is missing", async () => {
  let called = false;
  const dispatcher = createGsdDispatcher({
    exec: async () => {
      called = true;
      return "should not run";
    },
    detect: () =>
      capabilities("inline", {
        gsdCore: false,
        paths: { gsdCore: null, gsdTools: null, subagents: null, contextMode: null },
      }),
  });

  const result = await dispatcher.run([], process.cwd());

  assert.equal(called, false);
  assert.match(result.text, /package-local `gsd-tools` binary was not detected/);
  assert.match(result.text, /do not rely on a system-wide GSD install/);
});

test("dispatcher run returns before dispatch when aborted", async () => {
  let called = false;
  const controller = new AbortController();
  controller.abort();
  const dispatcher = createGsdDispatcher({
    exec: async () => {
      called = true;
      return "should not run";
    },
    detect: () => capabilities("inline"),
  });

  const result = await dispatcher.run([], process.cwd(), controller.signal);

  assert.equal(called, false);
  assert.equal(result.text, "Cancelled before starting.");
});
