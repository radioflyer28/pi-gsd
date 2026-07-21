import assert from "node:assert/strict";
import * as path from "node:path";
import test from "node:test";

import { discoverGsdCoreCommands, expandGsdCoreCommandPrompt, inspectGsdCoreCommands } from "../src/extension/gsd-core-commands.ts";

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

test("bundled v1.7 GSD Core commands are exposed through dynamic discovery", () => {
  const slashNames = new Set(discoverGsdCoreCommands().map((command) => command.slashName));

  for (const slashName of ["gsd-next", "gsd-onboard", "gsd-mempalace-capture", "gsd-mempalace-recall"]) {
    assert.ok(slashNames.has(slashName), `expected ${slashName} from package-local gsd-core`);
  }
});

test("bundled v1.7 gsd-next resolves its workflow inside the package-local core", () => {
  const command = discoverGsdCoreCommands().find(({ slashName }) => slashName === "gsd-next");
  assert.ok(command, "expected package-local gsd-next command");

  const coreRoot = path.resolve(path.dirname(command.path), "..", "..", "gsd-core");
  const prompt = expandGsdCoreCommandPrompt(command, "");

  assert.doesNotMatch(prompt, /@?(?:~|\$HOME)\/\.claude\/gsd-core\//);
  assert.ok(prompt.includes(`${coreRoot}${path.sep}workflows/smart-entry.md`));
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

test("command inspection preserves extension startup when upstream resources are unreadable", () => {
  const commandsDir = path.join("pkg", "node_modules", "@opengsd", "gsd-core", "commands", "gsd");
  const unreadableDirectory = inspectGsdCoreCommands({
    commandsDir,
    exists: () => true,
    readdir: () => {
      throw new Error("permission denied");
    },
  });
  const partiallyUnreadable = inspectGsdCoreCommands({
    commandsDir,
    exists: () => true,
    readdir: () => ["ok.md", "broken.md"],
    readFile: (filePath) => {
      if (filePath.endsWith("broken.md")) throw new Error("corrupt file");
      return "---\nname: gsd:ok\n---\nOk";
    },
  });

  assert.deepEqual(unreadableDirectory.commands, []);
  assert.match(unreadableDirectory.warnings[0], /Could not read upstream GSD command directory/);
  assert.deepEqual(partiallyUnreadable.commands.map((command) => command.slashName), ["gsd-ok"]);
  assert.match(partiallyUnreadable.warnings[0], /Skipped unreadable upstream GSD command broken\.md/);
});

test("config command prompt expansion injects Pi config update requirements", () => {
  const commandPath = path.join(
    "pkg",
    "node_modules",
    "@opengsd",
    "gsd-core",
    "commands",
    "gsd",
    "config.md",
  );
  const prompt = expandGsdCoreCommandPrompt(
    {
      slashName: "gsd-config",
      coreName: "gsd:config",
      description: "Config",
      path: commandPath,
      body: "Run gsd-tools query config-set foo bar",
    },
    "--advanced",
  );

  assert.match(prompt, /Pi runtime requirements for GSD config\/settings/);
  assert.match(prompt, /\.planning\/config\.json/);
  assert.match(prompt, /## Pi execution contract/);
  assert.match(prompt, /gsd\(\{ action: "run", args: \[\.\.\.\] \}\)/);
  assert.match(prompt, /Never use bare `gsd-tools`, `command -v gsd-tools`/);
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
      body: [
        "All: $ARGUMENTS",
        "First: $1",
        "Second: $2",
        "@~/.claude/gsd-core/workflows/plan-phase.md",
        "~/.claude/gsd-core/workflows/smart-entry.md",
        "@$HOME/.claude/gsd-core/workflows/plan-review.md",
      ].join("\n"),
    },
    '1 "two words"',
  );

  assert.match(prompt, /## Pi execution contract/);
  assert.match(prompt, /Run every upstream `gsd-tools` operation through pi-gsd/);
  assert.match(prompt, /All: 1 "two words"/);
  assert.match(prompt, /First: 1/);
  assert.match(prompt, /Second: two words/);
  assert.doesNotMatch(prompt, /@?~\/\.claude\/gsd-core/);
  assert.doesNotMatch(prompt, /@?\$HOME\/\.claude\/gsd-core/);
  assert.match(prompt, /@.*node_modules.*@opengsd.*gsd-core.*gsd-core.*workflows.*plan-phase\.md/);
  assert.match(prompt, /node_modules.*@opengsd.*gsd-core.*gsd-core.*workflows.*smart-entry\.md/);
  assert.match(prompt, /@.*node_modules.*@opengsd.*gsd-core.*gsd-core.*workflows.*plan-review\.md/);
});

test("command discovery keeps v1.7 frontmatter metadata out of the Pi command surface", () => {
  const commandsDir = path.join("pkg", "node_modules", "@opengsd", "gsd-core", "commands", "gsd");
  const filePath = path.join(commandsDir, "next.md");

  const [command] = discoverGsdCoreCommands({
    commandsDir,
    exists: (candidate) => candidate === commandsDir,
    readdir: () => ["next.md"],
    readFile: () => [
      "---",
      "name: gsd:next",
      "description: Choose the next workflow",
      "argument-hint: '[--fast]'",
      "effort: low",
      "allowed-tools:",
      "  - Read",
      "requires: [config, phase]",
      "argument-instructions: |",
      "  Keep this Pi-agnostic.",
      "---",
      "Use $ARGUMENTS",
    ].join("\n"),
  });

  assert.equal(command.path, filePath);
  assert.equal(command.slashName, "gsd-next");
  assert.equal(command.coreName, "gsd:next");
  assert.equal(command.description, "Choose the next workflow");
  assert.equal(command.argumentHint, "[--fast]");
  assert.equal(command.body, "Use $ARGUMENTS");
});
