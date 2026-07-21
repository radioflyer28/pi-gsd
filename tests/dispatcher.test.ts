import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";

import {
  createGsdDispatcher,
  findExternalGsdSkillPaths,
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

test("formatCapabilities reports integrations disabled by pi-gsd config", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-format-disabled-"));

  try {
    const text = formatCapabilities(
      cwd,
      capabilities("inline", {
        detected: { subagents: true, contextMode: true },
        integrationSettings: { subagents: "off", contextMode: "off" },
        configPath: path.join(cwd, ".pi-gsd", "config.json"),
        paths: { subagents: "<active-tool:subagent>", contextMode: "<active-tool:ctx_execute>" },
      }),
    );

    assert.match(text, /mode: `inline`/);
    assert.match(text, /pi-subagents: detected via active tool, disabled by .*\.pi-gsd.*config\.json/);
    assert.match(text, /context-mode: detected via active tool, disabled by .*\.pi-gsd.*config\.json/);
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

test("dispatcher init-config creates default .pi-gsd config files without overwriting", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-init-"));
  const dispatcher = createGsdDispatcher({ detect: () => capabilities("inline") });

  try {
    const result = await dispatcher.initConfig(cwd);
    const configPath = path.join(cwd, ".pi-gsd", "config.json");
    const routingPath = path.join(cwd, ".pi-gsd", "model-routing.json");

    assert.match(result.text, /pi-gsd config initialized/);
    assert.equal(JSON.parse(readFileSync(configPath, "utf8")).integrations.subagents, "auto");
    assert.equal(JSON.parse(readFileSync(routingPath, "utf8")).tiers.heavy.thinking, "xhigh");

    writeFileSync(configPath, JSON.stringify({ integrations: { subagents: "off" } }));
    const second = await dispatcher.initConfig(cwd);
    assert.match(second.text, /unchanged: .*config\.json/);
    assert.equal(JSON.parse(readFileSync(configPath, "utf8")).integrations.subagents, "off");

    const forced = await dispatcher.initConfig(cwd, true);
    assert.match(forced.text, /overwritten: .*config\.json/);
    assert.equal(JSON.parse(readFileSync(configPath, "utf8")).integrations.subagents, "auto");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("dispatcher init-config returns diagnostics when its target cannot be created", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-init-error-"));
  writeFileSync(path.join(cwd, ".pi-gsd"), "not a directory");
  const dispatcher = createGsdDispatcher({ detect: () => capabilities("inline") });

  try {
    const result = await dispatcher.initConfig(cwd);
    assert.match(result.text, /could not initialize project configuration/i);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("dispatcher doctor includes integration and state-boundary guidance", async () => {
  const dispatcher = createGsdDispatcher({
    detect: () => capabilities("delegated-ctx"),
    externalGsdSkillPaths: () => [],
  });

  const result = await dispatcher.doctor(process.cwd());

  assert.match(result.text, /do not fork or duplicate GSD Core semantics/i);
  assert.match(result.text, /subagent\(\{ action: "list" \}\)/);
  assert.match(result.text, /ctx_execute/);
  assert.match(result.text, /Do not create or assume `\.gsd\/`/);
});

test("dispatcher doctor omits optional integration guidance when integrations are disabled", async () => {
  const dispatcher = createGsdDispatcher({
    detect: () =>
      capabilities("inline", {
        detected: { subagents: true, contextMode: true },
        integrationSettings: { subagents: "off", contextMode: "off" },
      }),
    externalGsdSkillPaths: () => [],
  });

  const result = await dispatcher.doctor(process.cwd());

  assert.doesNotMatch(result.text, /subagent\(\{ action: "list" \}\)/);
  assert.doesNotMatch(result.text, /ctx_execute/);
  assert.match(result.text, /pi-subagents: detected via active tool, disabled/);
  assert.match(result.text, /context-mode: detected via active tool, disabled/);
});

test("dispatcher doctor reports package metadata, command discovery, and a bounded binary probe", async () => {
  const calls: unknown[][] = [];
  const dispatcher = createGsdDispatcher({
    detect: () => capabilities("inline"),
    externalGsdSkillPaths: () => [],
    exec: async (...args: unknown[]) => {
      calls.push(args);
      return { stdout: "Usage: gsd-tools", exitCode: 0 };
    },
  });

  const result = await dispatcher.doctor(process.cwd());

  assert.match(result.text, /gsd-core version: 1\.7\.0/);
  assert.match(result.text, /upstream command files: 71/);
  assert.match(result.text, /Package-local gsd-tools --help completed/);
  assert.deepEqual(calls[0]?.[1], ["--help"]);
  assert.equal(result.details.core?.binaryProbe?.status, "healthy");
});

test("dispatcher doctor reports a killed Pi probe as a failure", async () => {
  const dispatcher = createGsdDispatcher({
    detect: () => capabilities("inline"),
    externalGsdSkillPaths: () => [],
    exec: async () => ({ code: 0, killed: true }),
  });

  const result = await dispatcher.doctor(process.cwd());

  assert.equal(result.details.core?.binaryProbe?.status, "failed");
  assert.match(result.text, /gsd-tools --help was cancelled or timed out/);
});

test("dispatcher doctor warns when the upstream Pi plugin may overlap", async () => {
  const dispatcher = createGsdDispatcher({
    detect: () => capabilities("inline", { upstreamPiPlugin: { activeTool: true, activeCommand: true } }),
    externalGsdSkillPaths: () => [],
    exec: async () => ({ exitCode: 0 }),
  });

  const result = await dispatcher.doctor(process.cwd());

  assert.match(result.text, /Upstream Pi plugin coexistence warning/);
  assert.match(result.text, /active upstream surface: `\/gsd`/);
  assert.match(result.text, /active upstream surface: `gsd_invoke`/);
});

test("dispatcher doctor warns when external global gsd skills are present", async () => {
  const dispatcher = createGsdDispatcher({
    detect: () => capabilities("inline"),
    externalGsdSkillPaths: () => ["/home/user/.pi/agent/skills/gsd-plan-phase/SKILL.md"],
  });

  const result = await dispatcher.doctor(process.cwd());

  assert.match(result.text, /External GSD skill warning/);
  assert.match(result.text, /may bypass the thin pi-gsd adapter path/);
  assert.match(result.text, /gsd-plan-phase\/SKILL\.md/);
});

test("external GSD skill detector ignores pi-gsd and non-GSD skills", () => {
  const home = mkdtempSync(path.join(tmpdir(), "pi-gsd-skills-"));
  const skillsDir = path.join(home, ".pi", "agent", "skills");
  mkdirSync(path.join(skillsDir, "gsd-plan-phase"), { recursive: true });
  mkdirSync(path.join(skillsDir, "pi-gsd"), { recursive: true });
  mkdirSync(path.join(skillsDir, "review"), { recursive: true });
  writeFileSync(path.join(skillsDir, "gsd-plan-phase", "SKILL.md"), "---\nname: gsd-plan-phase\n---\n");
  writeFileSync(path.join(skillsDir, "pi-gsd", "SKILL.md"), "---\nname: pi-gsd\n---\n");
  writeFileSync(path.join(skillsDir, "review", "SKILL.md"), "---\nname: review\n---\n");

  try {
    assert.deepEqual(findExternalGsdSkillPaths(home), [path.join(skillsDir, "gsd-plan-phase", "SKILL.md")]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
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

test("dispatcher run turns launch failures into actionable diagnostics", async () => {
  const dispatcher = createGsdDispatcher({
    exec: async () => {
      throw new Error("permission denied");
    },
    detect: () => capabilities("inline"),
  });

  const result = await dispatcher.run([], process.cwd());

  assert.match(result.text, /could not launch its package-local `gsd-tools` binary/i);
  assert.match(result.text, /permission denied/);
  assert.match(result.text, /do not fall back to a system-wide GSD install/);
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

test("dispatcher run avoids shell launch for package-local Windows shims", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "pi-gsd-win-shim-"));
  const binDir = path.join(root, "node_modules", ".bin");
  const coreDir = path.join(root, "node_modules", "@opengsd", "gsd-core");
  const coreBin = path.join(coreDir, "gsd-core", "bin");
  mkdirSync(binDir, { recursive: true });
  mkdirSync(coreBin, { recursive: true });
  const shim = path.join(binDir, "gsd-tools.cmd");
  const entrypoint = path.join(coreBin, "gsd-tools.cjs");
  writeFileSync(shim, "placeholder");
  writeFileSync(path.join(coreDir, "package.json"), JSON.stringify({ bin: { "gsd-tools": "gsd-core/bin/gsd-tools.cjs" } }));
  writeFileSync(entrypoint, "console.log(JSON.stringify(process.argv.slice(2)))");
  const dispatcher = createGsdDispatcher({
    gsdToolsCommand: shim,
    detect: () => capabilities("inline"),
  });

  try {
    const result = await dispatcher.run(["arg with spaces", "&", "|", "^caret", 'quote"value'], root);

    assert.match(result.text, /gsd-tools exited with 0/);
    assert.match(result.text, /\["arg with spaces","&","\|","\^caret","quote\\"value"\]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatcher run keeps spawned command output memory-bounded before final truncation", async () => {
  const dispatcher = createGsdDispatcher({
    gsdToolsCommand: process.execPath,
    detect: () => capabilities("inline"),
  });

  const result = await dispatcher.run(["-e", "process.stdout.write('a'.repeat(70000)); process.stderr.write('b'.repeat(70000));"], process.cwd());

  assert.match(result.text, /stream output truncated before process close/);
  assert.ok(result.text.length < 50_500);
  assert.match(result.text, /a+\n\[stderr\]/);
  assert.match(result.text, /b+$/);
});

test("dispatcher run falls back to Node spawn when pi.exec is unavailable", async () => {
  const dispatcher = createGsdDispatcher({
    gsdToolsCommand: process.execPath,
    detect: () => capabilities("inline"),
  });

  const result = await dispatcher.run(["--version"], process.cwd());

  assert.match(result.text, /gsd-tools exited with 0/);
  assert.match(result.text, /v\d+\.\d+\.\d+/);
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

test("dispatcher run resolves cancellation after spawn starts", async () => {
  const dispatcher = createGsdDispatcher({
    gsdToolsCommand: process.execPath,
    detect: () => capabilities("inline"),
  });
  const controller = new AbortController();
  const running = dispatcher.run(["-e", "setInterval(() => {}, 1000)"], process.cwd(), controller.signal);

  setTimeout(() => controller.abort(), 50);
  const result = await running;

  assert.match(result.text, /gsd-tools exited with 130/);
  assert.match(result.text, /Cancelled while running|AbortError|The operation was aborted/i);
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
