import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import test from "node:test";

test("package metadata exposes the expected Pi package resources", () => {
  const manifest = JSON.parse(readFileSync(path.resolve("extension-manifest.json"), "utf8"));
  const pkg = JSON.parse(readFileSync(path.resolve("package.json"), "utf8"));

  assert.equal(pkg.name, "pi-gsd");
  assert.equal(pkg.private, true);
  assert.deepEqual(pkg.pi.extensions, ["./src/extension/index.ts"]);
  assert.equal(pkg.pi.skills, undefined);
  assert.deepEqual(pkg.pi.prompts, ["./prompts"]);

  assert.equal(manifest.id, "pi-gsd");
  assert.deepEqual(manifest.provides.tools, ["gsd"]);
  assert.deepEqual(manifest.provides.commands, ["gsd-status", "gsd-doctor", "gsd-run", "gsd-model", "gsd-model-config", "gsd-init-config", "gsd-*"]);
});

test("release metadata stays aligned and package contents are allowlisted", () => {
  const manifest = JSON.parse(readFileSync(path.resolve("extension-manifest.json"), "utf8"));
  const pkg = JSON.parse(readFileSync(path.resolve("package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(path.resolve("package-lock.json"), "utf8"));

  assert.equal(pkg.version, "0.3.1");
  assert.equal(manifest.version, pkg.version);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.equal(pkg.repository.url, "git+https://github.com/radioflyer28/pi-gsd.git");
  assert.equal(pkg.homepage, "https://github.com/radioflyer28/pi-gsd#readme");
  assert.deepEqual(pkg.files, ["src", "prompts", "docs", "README.md", "CHANGELOG.md", "LICENSE", "extension-manifest.json"]);
});

test("package metadata keeps GSD Core bundled and Pi packages external", () => {
  const pkg = JSON.parse(readFileSync(path.resolve("package.json"), "utf8"));

  assert.equal(pkg.dependencies["@opengsd/gsd-core"], "^1.17.0");
  assert.equal(pkg.engines.node, ">=24.0.0");
  assert.equal(pkg.peerDependencies["@opengsd/gsd-core"], undefined);
  assert.equal(pkg.optionalDependencies, undefined);

  assert.equal(pkg.dependencies["context-mode"], undefined);
  assert.equal(pkg.dependencies["pi-subagents"], undefined);
  const lock = JSON.parse(readFileSync(path.resolve("package-lock.json"), "utf8"));
  for (const peer of ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai"]) {
    assert.equal(pkg.peerDependencies[peer], ">=1.0.0");
    assert.equal(lock.packages[""].peerDependencies[peer], pkg.peerDependencies[peer]);
    assert.equal(pkg.dependencies[peer], undefined);
    assert.equal(pkg.devDependencies[peer], undefined);
    assert.ok(Number(lock.packages[`node_modules/${peer}`].version.split(".")[0]) >= 1);
  }
  assert.equal(lock.packages[""].dependencies["@opengsd/gsd-core"], pkg.dependencies["@opengsd/gsd-core"]);
  assert.equal(pkg.peerDependencies.typebox, "*");
});

test("package scripts use the built-in Node test runner and TypeScript compiler", () => {
  const pkg = JSON.parse(readFileSync(path.resolve("package.json"), "utf8"));

  assert.match(pkg.scripts.test, /node --experimental-strip-types --test tests\/\*\.test\.ts/);
  assert.equal(pkg.scripts.typecheck, "tsc --noEmit");
  assert.equal(pkg.scripts["typecheck:test"], "tsc -p tsconfig.test.json");
  assert.equal(pkg.scripts.check, "npm run typecheck && npm run typecheck:test");
  assert.equal(pkg.scripts.build, "tsc -p tsconfig.build.json");
  assert.equal(pkg.scripts["test:live-pi"], "node scripts/live-pi-rpc-smoke.mjs");
  assert.equal(pkg.scripts["test:live-subagent"], "node scripts/live-subagent-routing-smoke.mjs");
  assert.equal(pkg.scripts["release:check"], "node scripts/validate-release.mjs");
});


test("CI workflows use the declared Node 24 compatibility floor", () => {
  const ci = readFileSync(path.resolve(".github/workflows/ci.yml"), "utf8");
  assert.match(ci, /node-version: \[24\]/);
  for (const workflow of ["compatibility.yml", "live-subagents.yml"]) {
    const source = readFileSync(path.resolve(".github/workflows", workflow), "utf8");
    assert.match(source, /node-version: 24\b/);
    assert.doesNotMatch(source, /node-version: 22\b/);
  }
});
