import assert from "node:assert/strict";
import * as path from "node:path";
import test from "node:test";

import { discoverGsdCoreCommands, expandGsdCoreCommandPrompt } from "../src/extension/gsd-core-commands.ts";

test("discovers multiple upstream command markdown files from a flat command directory", () => {
  const commandsDir = path.join("pkg", "node_modules", "@opengsd", "gsd-core", "commands", "gsd");
  const files: Record<string, string> = {
    [path.join(commandsDir, "plan-phase.md")]: "---\nname: gsd:plan-phase\ndescription: Plan a phase\nargument-hint: [phase]\n---\nPhase $1",
    [path.join(commandsDir, "verify-work.md")]: "---\ndescription: Verify work\n---\nVerify $ARGUMENTS",
    [path.join(commandsDir, "notes.txt")]: "ignored",
  };

  const commands = discoverGsdCoreCommands({
    commandsDir,
    exists: (candidate) => candidate === commandsDir,
    readdir: () => ["plan-phase.md", "verify-work.md", "notes.txt"],
    readFile: (filePath) => files[filePath],
  });

  assert.deepEqual(commands.map((command) => command.slashName), ["gsd-plan-phase", "gsd-verify-work"]);
  assert.equal(commands[0].coreName, "gsd:plan-phase");
  assert.equal(commands[0].argumentHint, "[phase]");
  assert.equal(commands[1].coreName, "gsd:verify-work");
});

test("command discovery tolerates malformed or missing frontmatter", () => {
  const commandsDir = path.join("pkg", "node_modules", "@opengsd", "gsd-core", "commands", "gsd");
  const filePath = path.join(commandsDir, "odd-command.md");

  const commands = discoverGsdCoreCommands({
    commandsDir,
    exists: (candidate) => candidate === commandsDir,
    readdir: () => ["odd-command.md"],
    readFile: () => "---\nname gsd:broken\n---\nBody $ARGUMENTS",
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0].slashName, "gsd-odd-command");
  assert.equal(commands[0].coreName, "gsd:odd-command");
  assert.equal(commands[0].path, filePath);
});

test("command discovery returns no commands when upstream command directory is missing", () => {
  assert.deepEqual(discoverGsdCoreCommands({ commandsDir: "missing", exists: () => false }), []);
});

test("command prompt expansion preserves quoted arguments and rewrites package-local GSD Core references", () => {
  const commandPath = path.join(
    "pkg",
    "node_modules",
    "@opengsd",
    "gsd-core",
    "commands",
    "gsd",
    "plan-phase.md",
  );
  const prompt = expandGsdCoreCommandPrompt(
    {
      slashName: "gsd-plan-phase",
      coreName: "gsd:plan-phase",
      description: "Plan",
      path: commandPath,
      body: "All: $ARGUMENTS\nFirst: $1\nSecond: $2\n@~/.claude/gsd-core/workflows/plan-phase.md",
    },
    '1 "two words"',
  );

  assert.match(prompt, /All: 1 "two words"/);
  assert.match(prompt, /First: 1/);
  assert.match(prompt, /Second: two words/);
  assert.doesNotMatch(prompt, /@~\/\.claude\/gsd-core/);
  assert.match(prompt, /@.*node_modules.*@opengsd.*gsd-core.*gsd-core.*workflows.*plan-phase\.md/);
});
