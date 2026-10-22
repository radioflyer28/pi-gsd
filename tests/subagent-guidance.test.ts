import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";

import { createGsdDispatcher } from "../src/extension/dispatcher.ts";
import { expandGsdCoreCommandPrompt } from "../src/extension/gsd-core-commands.ts";
import { formatResolvedModelRouting, resolveModelRouting } from "../src/extension/model-routing.ts";
import { registerPiGsdCore } from "../src/extension/register.ts";
import { capabilities, mockPi } from "./test-utils.ts";

function assertCapabilityGuidance(text: string) {
  assert.match(text, /current Pi session only, not selected child readiness/);
  assert.match(text, /Before selecting any GSD child/);
  assert.match(text, /action: "list", options: \{ capabilities: true \}/);
  assert.match(text, /source, effective tools, provider configuration, exclusions and capability ceilings/);
  assert.match(text, /not successful child provider registration/);
  assert.match(text, /Planning, execution, verification, review and research assignments all need capability checks/);
  assert.match(text, /Select tools by required operations, not the upstream role name/);
  assert.match(text, /`gsd` in its tool allowlist.*pi-gsd provider loaded through `subagentOnlyExtensions` or `extensions`/);
  assert.match(text, /builtin `worker` does not include `gsd`/);
  assert.match(text, /Do not grant `gsd` to unrelated read-only helpers/);
  assert.match(text, /no read-only GSD tool or per-action permission restriction/);
  assert.match(text, /`acceptanceRole: read-only` and task prose do not enforce read-only access/);
  assert.match(text, /Inspection-only helpers should omit `gsd`, write tools and shells/);
  assert.match(text, /`bash` on Unix\/WSL.*`pwsh` with its provider on native Windows/);
  assert.match(text, /Managed jobs are optional, not a baseline requirement/);
  assert.match(text, /`process` is POSIX-only; Windows uses `pwsh`\/`pwsh_job`/);
  assert.match(text, /Do not bypass an active managed-process policy/);
  assert.match(text, /include `codemode` alongside their permitted direct tools/);
  assert.match(text, /It does not grant tools or load their providers/);
  assert.match(text, /Await all calls and inspect tool-specific errors\/exit statuses/);
  assert.match(text, /`tool_search` is separate and optional/);
  assert.match(text, /Verify permitted tools through codemode in the child canary/);
  assert.match(text, /no inherited skills catalog is required/);
  assert.match(text, /missing or unknown, keep the assignment inline/);
  assert.match(text, /do not silently substitute a parent command-running relay/);
  assert.match(text, /one-writer boundaries.*user approvals.*upstream verification.*independent acceptance/);
  assert.match(text, /Phase coordination and nested delegation require separate explicit authorization and tool configuration/);
  assert.match(text, /Do not enable nested orchestration or widen generic profiles/);
}

test("registered GSD tool requires capability-aware profile selection independently of model routing", () => {
  const pi = mockPi();
  registerPiGsdCore(pi.api, { parameters: {}, detect: () => capabilities("delegated"), gsdCoreCommands: [] });
  const guidance = pi.tools[0].promptGuidelines.join("\n");
  assertCapabilityGuidance(guidance);
  assert.match(guidance, /exact agent name and a taskId/);
  assert.match(guidance, /exact model for pass-model, omit for omit-model, do not delegate for resolve-first/);
  assert.deepEqual(pi.tools.map((tool) => tool.name), ["gsd"]);
});

for (const command of ["plan-phase", "execute-phase", "verify-work", "code-review"]) {
  test(`expanded ${command} carries the shared child capability contract`, () => {
    const prompt = expandGsdCoreCommandPrompt({
      slashName: `gsd-${command}`, coreName: `gsd:${command}`, description: "Upstream assignment",
      path: path.resolve(`node_modules/@opengsd/gsd-core/commands/gsd/${command}.md`),
      body: "Perform approved assignment $ARGUMENTS using the supplied upstream workflow.",
    }, "35");
    assertCapabilityGuidance(prompt);
    assert.match(prompt, /Perform approved assignment 35 using the supplied upstream workflow/);
    assert.match(prompt, /Run every upstream GSD CLI operation.*through pi-gsd/);
  });
}

test("status and doctor never infer child readiness from current-session integrations", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-child-readiness-"));
  try {
    const cases = [
      capabilities("inline"), capabilities("ctx-inline"), capabilities("delegated"), capabilities("delegated-ctx"),
      capabilities("inline", { detected: { subagents: true }, integrationSettings: { subagents: "off" } }),
      capabilities("inline", { detected: { subagents: true }, provenance: { subagents: "registered-tool-inactive" } }),
    ];
    for (const caps of cases) {
      let executions = 0;
      const dispatcher = createGsdDispatcher({
        detect: () => caps, externalGsdSkillPaths: () => [],
        exec: async () => { executions++; return { stdout: "help", exitCode: 0 }; },
      });
      const status = await dispatcher.status(cwd);
      assert.equal(executions, 0, "status must remain read-only");
      const doctor = await dispatcher.doctor(cwd);
      for (const result of [status, doctor]) {
        assert.match(result.text, /integration scope: current Pi session only/);
        assert.match(result.text, /child tool readiness: unverified/);
        assert.equal(result.details.caps, caps);
      }
      if (caps.subagents) assertCapabilityGuidance(doctor.text);
      else assert.doesNotMatch(doctor.text, /action: "list", options: \{ capabilities: true \}/);
      assert.ok(executions <= 1, "doctor must not launch or preflight a child");
      if (caps.contextMode && caps.subagents) {
        assert.match(doctor.text, /their own tool policy permits them and their child session loads the provider/);
      }
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

for (const agent of ["gsd-planner", "gsd-executor", "gsd-verifier", "gsd-plan-checker", "gsd-code-reviewer", "gsd-phase-researcher"]) {
  test(`a resolved ${agent} model is not reported as a tool readiness check`, () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "pi-gsd-model-not-tools-"));
    try {
      const model = { provider: "fixture", id: "physical" };
      const resolved = resolveModelRouting({ agent, taskId: "one-assignment" }, {
        cwd, model, thinkingLevel: "high", modelRegistry: { getAvailable: () => [model] },
      });
      assert.equal(resolved.target, agent);
      assert.equal(resolved.subagent.action, "pass-model");
      assert.equal(resolved.subagent.model, `fixture/physical:${resolved.thinking}`);
      assert.match(formatResolvedModelRouting(resolved), /child tool readiness: unverified.*model resolution grants neither/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}

function documentedProfiles() {
  const guide = readFileSync(new URL("../docs/SUBAGENT-PROFILES.md", import.meta.url), "utf8");
  const profiles = [...guide.matchAll(/```yaml\r?\n([\s\S]*?)```/g)].map((match) => match[1]);
  assert.equal(profiles.length, 3);
  return { guide, profiles };
}

function profileTools(profile: string) {
  return profile.match(/^tools: (.+)$/m)?.[1].split(",").map((name) => name.trim());
}

test("operational templates support different upstream roles with explicit platform providers", () => {
  const { guide, profiles } = documentedProfiles();
  for (const [index, profile] of profiles.slice(0, 2).entries()) {
    assert.match(profile, /^name: pi-gsd-operator$/m);
    assert.match(profile, /^acceptanceRole: writer$/m);
    assert.deepEqual(profileTools(profile), [
      "read", "grep", "find", "ls", index === 0 ? "bash" : "pwsh",
      "edit", "write", "gsd", "codemode", "contact_supervisor",
    ]);
    assert.match(profile, /^inheritSkills: false$/m);
    assert.match(profile, /^subagentOnlyExtensions:\r?\n.*pi-gsd\/src\/extension\/index\.ts/m);
    if (index === 1) assert.match(profile, /pi-pwsh-notify-secure\/src\/index\.ts/);
    assert.match(profile, /supplied current\r?\npackage-local upstream role and workflow/);
    assert.match(profile, /Use codemode for useful batching, filtering or deterministic tool chains/);
    assert.match(profile, /Keep simple reads and\r?\nauthored edits direct/);
    assert.doesNotMatch(profile, /gsd-executor|execute-plan|allowNestedSubagents: true|inheritSkills: true|^model:/m);
  }
  for (const role of ["Planning", "Execution", "Verification", "Review / plan checking", "Research / scouting", "Phase coordination"]) {
    assert.ok(guide.includes(`| ${role} |`), `missing assignment guidance for ${role}`);
  }
  assert.match(guide, /no read-only `gsd` grant/);
  assert.match(guide, /no per-action permission restriction/);
  assert.match(guide, /Do not\r?\n   route every operational child as `gsd-executor`/);
  assert.match(guide, /no separate codemode provider-extension\r?\n  path is needed/);
  assert.match(guide, /exercise both through `codemode`/);
});

test("inspection-only template excludes operational and nested tools instead of relying on a role label", () => {
  const { guide, profiles } = documentedProfiles();
  const inspector = profiles[2];
  assert.match(inspector, /^name: pi-gsd-inspector$/m);
  assert.match(inspector, /^acceptanceRole: read-only$/m);
  assert.deepEqual(profileTools(inspector), ["read", "grep", "find", "ls", "codemode", "contact_supervisor"]);
  assert.match(inspector, /^inheritSkills: false$/m);
  assert.match(inspector, /^extensions: \[\]$/m);
  assert.doesNotMatch(inspector, /^subagentOnlyExtensions:|allowNestedSubagents: true/m);
  assert.match(inspector, /stop and escalate rather than skip them/);
  assert.match(guide, /not an operating-system\r?\nsandbox/);
  assert.match(guide, /including codemode discovery/);
  assert.match(guide, /Do\r?\n     not test absence by invoking destructive operations/);
});

test("legacy executor setup link points to the generalized profile guide", () => {
  const legacy = readFileSync(new URL("../docs/SUBAGENT-EXECUTORS.md", import.meta.url), "utf8");
  assert.match(legacy, /\[GSD subagent profiles\]\(SUBAGENT-PROFILES\.md\)/);
  assert.doesNotMatch(legacy, /```yaml/);
});
