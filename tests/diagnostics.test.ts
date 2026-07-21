import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";

import { appendPiGsdDiagnostic, getPiGsdDiagnosticSummary } from "../src/extension/diagnostics.ts";

test("private diagnostics remain off unless a project opts in", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-diagnostics-off-"));

  try {
    assert.equal(appendPiGsdDiagnostic(cwd, { event: "tool", target: "gsd.run", outcome: "ok" }), false);
    assert.equal(getPiGsdDiagnosticSummary(cwd).enabled, false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("private diagnostics record bounded, argument-free command outcomes when enabled", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-diagnostics-on-"));
  mkdirSync(path.join(cwd, ".pi-gsd"));
  writeFileSync(path.join(cwd, ".pi-gsd", "config.json"), JSON.stringify({ diagnostics: { sessionLog: "on" } }));

  try {
    assert.equal(appendPiGsdDiagnostic(cwd, {
      event: "command",
      target: "gsd:next",
      outcome: "error",
      detail: "  launch failed\nwith a concise reason  ",
    }), true);

    const summary = getPiGsdDiagnosticSummary(cwd);
    assert.equal(summary.enabled, true);
    assert.equal(summary.entries, 1);
    assert.deepEqual(summary.lastEvent?.target, "gsd:next");
    assert.equal(summary.lastEvent?.outcome, "error");
    const record = JSON.parse(readFileSync(summary.path, "utf8"));
    assert.equal(record.detail, "launch failed with a concise reason");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
