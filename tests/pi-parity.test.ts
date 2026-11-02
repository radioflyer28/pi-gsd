import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";
import test from "node:test";
import { GSD_RUNTIME_ROLES, GSD_EXCLUDED_ROLES, GSD_HOOK_PARITY } from "../src/extension/parity.ts";
import { discoverGsdCoreCommands, expandGsdCoreCommandPrompt, inspectGsdCoreCommands, parseFrontmatter } from "../src/extension/gsd-core-commands.ts";

const core = path.resolve("node_modules/@opengsd/gsd-core");

test("every bundled role and hook has an explicit reviewed parity disposition", () => {
  const roles = readdirSync(path.join(core, "agents")).filter((file) => /^gsd-.*\.md$/.test(file) && !file.endsWith(".compact.md")).map((file) => file.slice(0, -3)).sort();
  assert.deepEqual([...GSD_RUNTIME_ROLES, ...Object.keys(GSD_EXCLUDED_ROLES)].sort(), roles);
  assert.equal(new Set([...GSD_RUNTIME_ROLES, ...Object.keys(GSD_EXCLUDED_ROLES)]).size, roles.length);
  const hooks = readdirSync(path.join(core, "hooks")).filter((file) => /^gsd-.*\.(js|sh)$/.test(file)).sort();
  assert.deepEqual(Object.keys(GSD_HOOK_PARITY).sort(), hooks);
  const registered = readFileSync(path.join(core, "hooks/hooks.json"), "utf8");
  for (const [hook] of registered.matchAll(/gsd-[a-z-]+\.(?:js|sh)/g)) assert.ok(hook in GSD_HOOK_PARITY, hook);
  assert.deepEqual(Object.entries(GSD_HOOK_PARITY).filter(([, value]) => value === "bridged-opt-in").map(([name]) => name).sort(), ["gsd-worktree-path-guard.js", "gsd-write-guard.js"]);
});

test("commands wrap canonical GSD Core resources rather than upstream's Pi package", () => {
  const commands = discoverGsdCoreCommands();
  const files = readdirSync(path.join(core, "commands/gsd")).filter((file) => file.endsWith(".md")).sort();
  assert.deepEqual(commands.map((command) => path.basename(command.path)).sort(), files);
  for (const command of commands) {
    assert.equal(command.body, parseFrontmatter(readFileSync(command.path, "utf8")).body);
    const rendered = expandGsdCoreCommandPrompt(command, "");
    assert.match(rendered, /Pi execution contract/);
    assert.match(rendered, /resolve-model/);
    assert.doesNotMatch(rendered, /gsd_dispatch|__GSD_PI_ENGINE_ROOT__|pi[\\/]package-skills/);
  }
  // Resource presence is deliberately not marked as end-to-end support.
  const workflows = readdirSync(path.join(core, "gsd-core/workflows"), { recursive: true }).filter((file) => String(file).endsWith(".md"));
  assert.equal(workflows.length, 183, "review workflow resource coverage on upstream upgrades");
});

test("bundled command discovery needs no upstream Pi templates or extension", () => {
  const reads: string[] = [];
  const inspection = inspectGsdCoreCommands({
    packageRoot: "fixture", exists: () => true, readdir: () => ["debug.md"],
    readFile: (file) => {
      reads.push(file);
      assert.equal(file, path.join("fixture", "node_modules", "@opengsd", "gsd-core", "commands", "gsd", "debug.md"));
      return "---\nname: gsd:debug\n---\nCanonical workflow $ARGUMENTS";
    },
  });
  assert.equal(reads.length, 1);
  assert.deepEqual(inspection.warnings, []);
  assert.match(expandGsdCoreCommandPrompt(inspection.commands[0], "--diagnose"), /Canonical workflow --diagnose/);
});
