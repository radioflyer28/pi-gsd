#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const enabled = process.env.PI_GSD_RUN_LIVE_SUBAGENT === "1";
if (!enabled) {
  console.log("live-subagent-routing-smoke: skipped (set PI_GSD_RUN_LIVE_SUBAGENT=1 to run the credentialed probe)");
  process.exit(0);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const parentModel = process.env.PI_GSD_LIVE_MODEL;
if (!parentModel || !parentModel.includes("/")) {
  console.error("live-subagent-routing-smoke: PI_GSD_LIVE_MODEL must be an available provider/model reference");
  process.exit(1);
}
const useExistingAuth = process.env.PI_GSD_LIVE_USE_EXISTING_AUTH === "1";
const credentialEnv = process.env.PI_GSD_LIVE_API_KEY_ENV;
if (!useExistingAuth && (!credentialEnv || !process.env[credentialEnv])) {
  console.error("live-subagent-routing-smoke: PI_GSD_LIVE_API_KEY_ENV must name a non-empty credential environment variable (or set PI_GSD_LIVE_USE_EXISTING_AUTH=1 for a trusted local run)");
  process.exit(1);
}
const secret = credentialEnv ? process.env[credentialEnv] : undefined;

const parentThinking = process.env.PI_GSD_LIVE_THINKING || "high";
const expectedThinking = "medium";
const expectedChildModel = `${parentModel}:${expectedThinking}`;
const expectedChildModelId = parentModel.slice(parentModel.indexOf("/") + 1);
const subagentExtension = process.env.PI_SUBAGENTS_EXTENSION
  || path.join(process.env.HOME || "", ".pi", "agent", "npm", "node_modules", "pi-subagents", "src", "extension", "index.ts");
const root = mkdtempSync(path.join(tmpdir(), "pi-gsd-live-subagent-"));
const sessionDir = path.join(root, "sessions");
let stdout = "";
let stderr = "";

function tail(text, chars = 12000) {
  const bounded = text.length > chars ? text.slice(-chars) : text;
  return secret ? bounded.split(secret).join("<redacted>") : bounded;
}

function fail(message) {
  console.error(`live-subagent-routing-smoke: ${message}`);
  if (stdout) console.error(`\n[stdout]\n${tail(stdout)}`);
  if (stderr) console.error(`\n[stderr]\n${tail(stderr)}`);
  rmSync(root, { recursive: true, force: true });
  process.exit(1);
}

const prompt = [
  "Perform this deterministic integration probe and nothing else.",
  "Call gsd with action resolve-model and agent gsd-codebase-mapper.",
  `Confirm its pi-subagents consumer model is exactly ${expectedChildModel}.`,
  "Then call subagent with one async workflowScript child using builtin delegate, task 'Reply with exactly ROUTING_PROBE_OK', and the exact consumer model as the workflow/run model default.",
  "Wait for the child result and finish only after reporting ROUTING_PROBE_OK. Do not edit files.",
].join(" ");

const child = spawn("pi", [
  "--mode", "json",
  "--print",
  "--session-dir", sessionDir,
  "--no-extensions",
  "--extension", path.join(repoRoot, "src", "extension", "index.ts"),
  "--extension", subagentExtension,
  "--no-skills",
  "--no-prompt-templates",
  "--no-context-files",
  "--tools", "gsd,subagent,subagent_wait",
  "--model", `${parentModel}:${parentThinking}`,
  prompt,
], {
  cwd: repoRoot,
  env: {
    ...process.env,
    ...(useExistingAuth ? {} : { PI_CODING_AGENT_DIR: path.join(root, "agent") }),
    PI_SUBAGENTS_TEMP_ROOT: root,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

child.stdout.on("data", (chunk) => { stdout += String(chunk); });
child.stderr.on("data", (chunk) => { stderr += String(chunk); });
const timeout = setTimeout(() => child.kill("SIGTERM"), 10 * 60 * 1000);
const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
}).catch((error) => fail(`could not start Pi: ${error instanceof Error ? error.message : String(error)}`));
clearTimeout(timeout);
if (exitCode !== 0) fail(`Pi probe exited with ${exitCode}`);

const asyncRoot = path.join(root, "async-subagent-runs");
let statusFiles = [];
try {
  statusFiles = readdirSync(asyncRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(asyncRoot, entry.name, "status.json"))
    .filter((file) => existsSync(file));
} catch {
  fail("no isolated pi-subagents async run directory was created");
}
const statuses = statusFiles.map((file) => JSON.parse(readFileSync(file, "utf8")));
const probeStatuses = statuses.filter((candidate) => candidate.mode === "workflow" && JSON.stringify(candidate).includes("ROUTING_PROBE_OK"));
if (probeStatuses.length !== 1) {
  fail(`expected exactly one completed probe workflow, found ${probeStatuses.length} among ${statusFiles.length} async record(s)`);
}

const status = probeStatuses[0];
const serialized = JSON.stringify(status);
if (!serialized.includes(`\"model\":\"${expectedChildModelId}\"`) && !serialized.includes(`\"model\": \"${expectedChildModelId}\"`)) {
  fail(`status does not record child model id ${expectedChildModelId}`);
}
if (!serialized.includes(`\"thinking\":\"${expectedThinking}\"`) && !serialized.includes(`\"thinking\": \"${expectedThinking}\"`)) {
  fail(`status does not record child thinking ${expectedThinking}`);
}
if (!stdout.includes("ROUTING_PROBE_OK") && !serialized.includes("ROUTING_PROBE_OK")) {
  fail("child completion marker was not observed");
}

console.log(`live-subagent-routing-smoke: ok (${expectedChildModel})`);
rmSync(root, { recursive: true, force: true });
