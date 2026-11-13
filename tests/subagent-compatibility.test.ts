import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Value } from "typebox/value";
import { classifyOwnerFingerprint, inspectSubagentCompatibility, OWNER_REPAIR_GUIDE, type OwnerCompatibility } from "../src/extension/subagent-compatibility.ts";
import { detectCapabilities } from "../src/extension/capabilities.ts";
import { createGsdDispatcher } from "../src/extension/dispatcher.ts";
import { GSD_OUTPUT_SCHEMA, toGsdToolResult } from "../src/extension/tool-result.ts";
import { registerPiGsdCore } from "../src/extension/register.ts";
import { capabilities, mockPi } from "./test-utils.ts";

const tsEntry = "88316d1ae0618d196fb2409d88bb881d214ccdce2809e7b1d82bbe604703fda4";
const stockTS = "efc2b3c9ce51c2ba9b0ecfbffe48d90251aa7367baa6679a859a7f5be34a8926";
const patchedTS = "25c6f5df5d8bc6f7e94e293654324b07ebee7bd8baec6dfa62ec17d176e529b6";
const known: OwnerCompatibility = {
  state: "known-unpatched-source", evidence: "loaded-provider-files-on-disk", runtimeVerified: false,
  nextAction: "ask-user", repairGuide: OWNER_REPAIR_GUIDE, providerPath: "/reviewed/index.ts", lookupSha256: stockTS,
  reason: "Reviewed unpatched lookup source; not a live runtime probe.",
};

for (const [entry, entryHash, lookupHash] of [
  ["index.ts", tsEntry, stockTS],
  ["index.js", "ce413b7cb2e174f76d21a29a95704dcdfdbcb3c95049833dd4009d233e5f1b01", "7fb1556b765ea2c9cd4e1d44a74bf102851b20ec2f967a003dfb24a813138f8f"],
  ["bundle/index.js", "a1d7bba35fae224d6e66ee011b5fd1a0df2a5b2d5e4e9098cec52ab6299c06b8", "2c948e1d73aebcd45b8274b86b410bca9f5ec90b2d580ec850ff0e9b9509f58b"],
]) {
  test(`reviewed ${entry} fingerprint requires both exact files and version`, () => {
    assert.equal(classifyOwnerFingerprint("0.88.1", entry, entryHash, lookupHash), "known-unpatched-source");
    assert.equal(classifyOwnerFingerprint("0.88.2", entry, entryHash, lookupHash), "unknown");
    assert.equal(classifyOwnerFingerprint("0.88.1", entry, "modified", lookupHash), "unknown");
    assert.equal(classifyOwnerFingerprint("0.88.1", entry, entryHash, "modified"), "unknown");
  });
}
test("patched source and unsupported layouts never recommend the old patch", () => {
  assert.equal(classifyOwnerFingerprint("0.88.1", "index.ts", tsEntry, patchedTS), "known-patched-source");
  assert.equal(classifyOwnerFingerprint("0.88.1", "custom.ts", tsEntry, stockTS), "unknown");
  assert.equal(classifyOwnerFingerprint("0.88.1", "toString", tsEntry, stockTS), "unknown");
});

test("absent, disabled, relative and missing provider metadata do not infer an installed owner", () => {
  assert.equal(inspectSubagentCompatibility().state, "not-loaded");
  assert.equal(inspectSubagentCompatibility([{ name: "subagent" }], false).state, "disabled");
  for (const source of [undefined, "relative/index.ts", "builtin:subagent"]) {
    const result = inspectSubagentCompatibility([{ name: "subagent", sourceInfo: { path: source } }]);
    assert.equal(result.state, "unknown");
    assert.notEqual(result.nextAction, "ask-user");
  }
});

test("an active owner without source metadata is unknown, not absent", () => {
  for (const name of ["subagent", "subagents_enable"]) {
    const caps = detectCapabilities({ activeToolNames: [name], registeredTools: [] });
    assert.equal(caps.subagentCompatibility?.state, "unknown");
    assert.equal(caps.subagentCompatibility?.nextAction, "inspect");
  }
});

test("filesystem inspection is bounded, read-only, conflict-aware and not version-only", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-owner-fingerprint-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const entry = path.join(root, "index.ts");
  const lookup = path.join(root, "src/agents/agent-management.ts");
  fs.mkdirSync(path.dirname(lookup), { recursive: true });
  fs.writeFileSync(entry, "// unknown entry\n");
  fs.writeFileSync(lookup, "// unknown implementation\n");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "pi-subagents", version: "0.88.1" }));
  const tools = [{ name: "subagent", sourceInfo: { path: entry } }];
  const first = inspectSubagentCompatibility(tools);
  assert.equal(first.state, "unknown");
  assert.equal(first.version, "0.88.1");
  assert.equal(first.packageRoot, fs.realpathSync(root));
  assert.equal(first.runtimeVerified, false);
  assert.match(first.lookupSha256!, /^[a-f0-9]{64}$/);
  fs.writeFileSync(lookup, "// unknown implementation\r\n");
  assert.equal(inspectSubagentCompatibility(tools).lookupSha256, first.lookupSha256);
  assert.equal(fs.readFileSync(entry, "utf8"), "// unknown entry\n");
  const other = path.join(root, "different.ts");
  fs.writeFileSync(other, "");
  const conflict = inspectSubagentCompatibility([...tools, { name: "subagents_enable", sourceInfo: { path: other } }]);
  assert.equal(conflict.state, "unknown");
  assert.match(conflict.reason, /conflicting/);
  fs.writeFileSync(lookup, "x".repeat(1024 * 1024 + 1));
  assert.equal(inspectSubagentCompatibility(tools).state, "unknown");
  fs.rmSync(lookup);
  assert.equal(inspectSubagentCompatibility(tools).state, "unknown");
  fs.writeFileSync(path.join(root, "package.json"), "not json");
  assert.equal(inspectSubagentCompatibility(tools).state, "unknown");
});

test("installed candidate version alone is not a loaded-owner patch diagnosis", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-owner-candidate-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "pi-subagents", version: "0.88.1" }));
  const caps = detectCapabilities({ cwd: root, activeToolNames: [], registeredTools: [], candidatePaths: { subagents: [root] } });
  assert.equal(caps.integrationPackages.subagents?.version, "0.88.1");
  assert.equal(caps.subagentCompatibility?.state, "not-loaded");
});

test("status and doctor expose actionable structured evidence without treating it as CLI failure", async () => {
  const caps = capabilities("delegated", { subagentCompatibility: known });
  const dispatcher = createGsdDispatcher({ detect: () => caps, exec: async () => ({ exitCode: 0 }), externalGsdSkillPaths: () => [] });
  for (const action of ["status", "doctor"] as const) {
    const result = toGsdToolResult(action, await dispatcher[action](process.cwd()));
    assert.equal(Value.Check(GSD_OUTPUT_SCHEMA, result.structuredContent), true);
    assert.deepEqual(result.structuredContent.capabilities.subagentCompatibility, known);
    assert.equal(result.structuredContent.ok, true);
    assert.match(result.structuredContent.text, /Approval required/);
    assert.match(result.structuredContent.text, /separate checkout or defer/);
  }
});

test("parent advisory is once per source/project lifecycle and never starts a turn or asks on behalf of the user", async () => {
  const host = mockPi();
  let check = { ...known };
  registerPiGsdCore(host.api, { parameters: {}, gsdCoreCommands: [], detect: () => capabilities("delegated", { subagentCompatibility: check }) });
  const hook = host.handlers.get("before_agent_start")![0];
  const cwd = process.cwd();
  const result = await hook({}, { cwd }) as { message: { content: string; display: boolean } };
  assert.equal(result.message.display, true);
  assert.match(result.message.content, /ask the user/);
  assert.match(result.message.content, /Honor any earlier decline; silence is not consent/);
  assert.match(result.message.content, /not user approval/);
  assert.equal(await hook({}, { cwd }), undefined);
  assert.deepEqual(host.sentUserMessages, []);
  assert.deepEqual(host.sentMessages, []);
  check = { ...check, state: "unknown", nextAction: "inspect" };
  assert.equal(await hook({}, { cwd: path.join(cwd, "different") }), undefined);
  check = { ...known };
  assert.ok(await hook({}, { cwd: path.join(cwd, "different") }));
  for (const handler of host.handlers.get("session_shutdown") ?? []) await handler({}, { cwd });
  assert.ok(await hook({}, { cwd }));
});

test("leaf and disabled integrations do not inject repair prompts", async () => {
  for (const audience of ["parent", "leaf"] as const) {
    const host = mockPi();
    registerPiGsdCore(host.api, { parameters: {}, audience, gsdCoreCommands: [], detect: () => capabilities("inline", { subagentCompatibility: known, integrationSettings: { subagents: "off" } }) });
    for (const hook of host.handlers.get("before_agent_start") ?? []) assert.equal(await hook({}, { cwd: process.cwd() }), undefined);
    if (audience === "leaf") {
      assert.equal(host.handlers.has("before_agent_start"), false);
      assert.doesNotMatch(host.tools[0].promptGuidelines.join("\n"), /PI-SUBAGENTS-REPAIR/);
    }
  }
});

test("bundled repair instructions include exact patch, separate approvals and runtime verification", () => {
  const guide = fs.readFileSync(OWNER_REPAIR_GUIDE, "utf8");
  assert.match(guide, /Ask the user and wait/);
  assert.match(guide, /Obtain activation approval/);
  assert.match(guide, /restart/i);
  assert.match(guide, /runtimeVerified/);
  const patch = fs.readFileSync(path.join(path.dirname(OWNER_REPAIR_GUIDE), "patches/pi-subagents-0.88.1-runtime-get.patch"), "utf8");
  const added = patch.split(/\r?\n/).filter((line) => line.startsWith("+") && !line.startsWith("+++"));
  assert.equal(added.length, 2);
  assert.ok(added.every((line) => line.includes("ctx.runtimeAgentOwner, ctx.model?.provider")));
});
