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
  assert.deepEqual(manifest.provides.commands, ["gsd-status", "gsd-doctor", "gsd-run", "gsd-model", "gsd-init-config", "gsd-*"]);
});

test("package metadata keeps GSD Core bundled and Pi packages external", () => {
  const pkg = JSON.parse(readFileSync(path.resolve("package.json"), "utf8"));

  assert.equal(pkg.dependencies["@opengsd/gsd-core"], "^1.9.1");
  assert.equal(pkg.peerDependencies["@opengsd/gsd-core"], undefined);
  assert.equal(pkg.optionalDependencies, undefined);

  assert.equal(pkg.dependencies["context-mode"], undefined);
  assert.equal(pkg.dependencies["pi-subagents"], undefined);
  assert.equal(pkg.peerDependencies["@earendil-works/pi-coding-agent"], "*");
  assert.equal(pkg.peerDependencies["@earendil-works/pi-ai"], "*");
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
});
