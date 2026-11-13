#!/usr/bin/env node
// Opt-in, no-model compatibility matrix. Never installs or patches its inputs.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [ownerArg, expectedCommit, ...sdkArgs] = process.argv.slice(2);
assert.ok(ownerArg && /^[a-f0-9]{40}$/.test(expectedCommit ?? "") && sdkArgs.length,
  "Usage: npm run test:compatibility -- <trusted-owner-checkout> <exact-owner-commit> <sdk-root> [sdk-root...]; Windows uses builtin powershell unless PI_GSD_MATRIX_PWSH selects a trusted provider");
const owner = path.resolve(ownerArg);
function git(...args) {
  const result = spawnSync("git", ["-C", owner, ...args], { encoding: "utf8", windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
assert.equal(git("rev-parse", "HEAD"), expectedCommit, "Owner commit must match the explicit pin");
function fingerprint() {
  const hash = createHash("sha256");
  function visit(relative) {
    for (const entry of readdirSync(path.join(owner, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) hash.update(file.replaceAll("\\", "/")).update("\0").update(readFileSync(path.join(owner, file))).update("\0");
      else throw new Error(`Unsupported owner source entry: ${file}`);
    }
  }
  hash.update(readFileSync(path.join(owner, "package.json")));
  visit("src");
  return hash.digest("hex");
}
const sourceHash = fingerprint();
const pwsh = process.env.PI_GSD_MATRIX_PWSH;
// Omit PI_GSD_MATRIX_PWSH to exercise the selected SDK's stock Windows shell.
console.log(JSON.stringify({ matrix: "pi-gsd-no-model-v1", platform: process.platform, node: process.version,
  owner, commit: expectedCommit, sourceHash, dirty: git("status", "--porcelain") !== "",
  ownerVersion: JSON.parse(readFileSync(path.join(owner, "package.json"), "utf8")).version,
  providers: { pwsh, multiEdit: process.env.PI_GSD_SMOKE_MULTI_EDIT, researchWeb: process.env.PI_GSD_SMOKE_RESEARCH_WEB } }));
for (const sdkArg of sdkArgs) {
  const sdk = path.resolve(sdkArg);
  const version = JSON.parse(readFileSync(path.join(sdk, "package.json"), "utf8")).version;
  const env = { ...process.env, PI_GSD_SMOKE_SDK_ROOT: sdk };
  console.log(JSON.stringify({ sdk, version, gate: "starting" }));
  for (const args of [["scripts/live-pi-rpc-smoke.mjs"],
    ["--experimental-strip-types", "scripts/subagent-tool-capability-smoke.mjs", owner, ...(pwsh ? [path.resolve(pwsh)] : [])]]) {
    const result = spawnSync(process.execPath, args, { cwd: repo, env, stdio: "inherit", windowsHide: true, timeout: 600_000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `Compatibility gate failed: SDK ${version}, ${args.join(" ")}`);
  }
  assert.equal(fingerprint(), sourceHash, "Owner source changed while checking it; rerun the matrix");
  assert.equal(git("rev-parse", "HEAD"), expectedCommit);
  console.log(JSON.stringify({ sdk, version, gate: "passed", cases: 18 }));
}
console.log("compatibility-matrix: PASS explicit inputs only; no minimum-owner, cross-platform or credentialed workflow claim");
