import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = path.resolve("scripts/validate-release.mjs");
const source = JSON.parse(readFileSync("package.json", "utf8"));

function validate(change: (fixture: any) => void = () => {}, tag?: string) {
  const fixture = {
    pkg: structuredClone(source),
    lock: { version: source.version, packages: {
      "": { version: source.version, dependencies: { "@opengsd/gsd-core": "1.19.0" } },
      "node_modules/@opengsd/gsd-core": { version: "1.19.0" },
    } },
    manifest: { version: source.version },
    installed: { version: "1.19.0" },
  };
  change(fixture);
  const root = mkdtempSync(path.join(tmpdir(), "pi-gsd-release-"));
  try {
    mkdirSync(path.join(root, "node_modules/@opengsd/gsd-core"), { recursive: true });
    for (const [file, data] of Object.entries({
      "package.json": fixture.pkg, "package-lock.json": fixture.lock,
      "extension-manifest.json": fixture.manifest,
      "node_modules/@opengsd/gsd-core/package.json": fixture.installed,
    })) writeFileSync(path.join(root, file), JSON.stringify(data));
    writeFileSync(path.join(root, "CHANGELOG.md"), `## [${fixture.pkg.version}] - 2026-11-02\n`);
    return spawnSync(process.execPath, [script, ...(tag ? ["--tag", tag] : [])], { cwd: root, encoding: "utf8", timeout: 10_000 });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("release check accepts aligned versions and matching Git tags", () => {
  const result = validate(undefined, `v${source.version}`);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /GSD Core 1\.19\.0/);
});

for (const field of ["declared", "lockRoot", "locked", "installed"]) {
  test(`release check rejects mismatched ${field} Core version`, () => {
    const result = validate((f) => {
      if (field === "declared") f.pkg.dependencies["@opengsd/gsd-core"] = "^1.19.0";
      if (field === "lockRoot") f.lock.packages[""].dependencies["@opengsd/gsd-core"] = "^1.19.0";
      if (field === "locked") f.lock.packages["node_modules/@opengsd/gsd-core"].version = "1.20.0";
      if (field === "installed") f.installed.version = "1.20.0";
    });
    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /GSD Core must be pinned exactly/);
  });
}

test("release check rejects unaligned schemes and incorrect tags", () => {
  for (const version of ["0.3.2", "1.19.0", "1.19.0-pi.0", "1.19.0-pi.01", "1.19.0-pi.1+build"]) {
    const result = validate((f) => { f.pkg.version = f.lock.version = f.lock.packages[""].version = f.manifest.version = version; });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Release version must be/);
  }
  const result = validate(undefined, "v1.19.0-pi.99");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match package version/);
});
