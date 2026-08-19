#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const piPackageRoot = path.join(repoRoot, "node_modules", "@earendil-works", "pi-coding-agent");
const piManifest = JSON.parse(readFileSync(path.join(piPackageRoot, "package.json"), "utf8"));
const piEntrypoint = path.resolve(piPackageRoot, piManifest.bin.pi);
const requiredCommands = [
  "gsd-status",
  "gsd-doctor",
  "gsd-run",
  "gsd-model",
  "gsd-plan-phase",
  "gsd-map-codebase",
  "gsd-execute-phase",
  "gsd-verify-work",
  "gsd-next",
  "gsd-onboard",
  "gsd-mempalace-capture",
  "gsd-mempalace-recall",
];

function fail(message, details = "") {
  console.error(`live-pi-rpc-smoke: ${message}`);
  if (details) console.error(details.trim());
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [
    piEntrypoint,
    "--mode",
    "rpc",
    "--no-session",
    "--no-extensions",
    "--no-builtin-tools",
    "--no-skills",
    "--no-prompt-templates",
    "--offline",
    "-e",
    "./src/extension/index.ts",
  ],
  { cwd: repoRoot, stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
);

let stdoutBuffer = "";
let stderr = "";
let settled = false;
const timeout = setTimeout(() => {
  if (settled) return;
  settled = true;
  child.kill("SIGTERM");
  fail("timed out waiting for Pi RPC get_commands response", stderr);
}, 20_000);

child.on("error", (error) => {
  clearTimeout(timeout);
  fail(
    "could not start `pi`; install Pi or skip the optional live smoke test",
    error instanceof Error ? error.message : String(error),
  );
});

child.stderr.on("data", (chunk) => {
  stderr += String(chunk);
});

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function checkCommands(commands) {
  const byName = new Map(commands.map((command) => [command.name, command]));
  const missing = requiredCommands.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    fail(`missing expected live Pi command(s): ${missing.join(", ")}`);
  }

  const wrongSource = requiredCommands
    .map((name) => byName.get(name))
    .filter((command) => command?.source !== "extension");
  if (wrongSource.length > 0) {
    fail(
      "expected required GSD commands to come from the pi-gsd extension",
      JSON.stringify(wrongSource, null, 2),
    );
  }

  const gsdCommands = commands.filter((command) => command.name?.startsWith("gsd-"));
  if (gsdCommands.length < 50) {
    fail(`expected broad upstream GSD command exposure, found only ${gsdCommands.length} gsd-* commands`);
  }

  return { total: commands.length, gsd: gsdCommands.length };
}

let commandSummary;

child.stdout.on("data", (chunk) => {
  stdoutBuffer += String(chunk);
  let newlineIndex;
  while ((newlineIndex = stdoutBuffer.indexOf("\n")) >= 0) {
    const line = stdoutBuffer.slice(0, newlineIndex).trim();
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
    if (!line) continue;

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }

    if (message.type === "extension_error") {
      child.kill("SIGTERM");
      fail("Pi emitted an extension error", JSON.stringify(message, null, 2));
    }

    if (message.type !== "response") continue;
    if (message.command === "get_commands") {
      if (!message.success) {
        child.kill("SIGTERM");
        fail("Pi RPC get_commands failed", JSON.stringify(message, null, 2));
      }

      commandSummary = checkCommands(message.data?.commands ?? []);
      send({ id: "pi-gsd-live-doctor", type: "prompt", message: "/gsd-doctor" });
      continue;
    }

    if (message.id !== "pi-gsd-live-doctor" || message.command !== "prompt") continue;
    settled = true;
    clearTimeout(timeout);
    if (!message.success) {
      child.kill("SIGTERM");
      fail("Pi RPC /gsd-doctor handler failed", JSON.stringify(message, null, 2));
    }

    console.log(`live-pi-rpc-smoke: ok (${commandSummary.total} total commands, ${commandSummary.gsd} gsd-* extension commands; /gsd-doctor handled)`);
    child.kill("SIGTERM");
  }
});

send({ id: "pi-gsd-live-smoke", type: "get_commands" });
await once(child, "exit");
