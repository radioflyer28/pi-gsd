#!/usr/bin/env node
import { readFileSync } from "node:fs";

function json(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

const pkg = json("package.json");
const lock = json("package-lock.json");
const manifest = json("extension-manifest.json");
const versions = {
  package: pkg.version,
  lock: lock.version,
  lockRoot: lock.packages?.[""]?.version,
  extensionManifest: manifest.version,
};
const unique = new Set(Object.values(versions));
if (unique.size !== 1 || [...unique].some((version) => typeof version !== "string")) {
  throw new Error(`Release version mismatch: ${JSON.stringify(versions)}`);
}

const version = pkg.version;
const tagIndex = process.argv.indexOf("--tag");
if (tagIndex >= 0) {
  const supplied = process.argv[tagIndex + 1];
  if (!supplied) throw new Error("--tag requires a value");
  const tagVersion = supplied.startsWith("v") ? supplied.slice(1) : supplied;
  if (tagVersion !== version) throw new Error(`Tag ${supplied} does not match package version ${version}`);
}

if (pkg.private !== true) throw new Error("package.json must remain private for a GitHub-only release");
if (!pkg.dependencies?.["@opengsd/gsd-core"]) throw new Error("@opengsd/gsd-core must remain a runtime dependency");
for (const integration of ["pi-subagents", "context-mode"]) {
  if (pkg.dependencies?.[integration] || pkg.devDependencies?.[integration]) {
    throw new Error(`${integration} must remain an external optional Pi package`);
  }
}
if (!pkg.pi?.extensions?.includes("./src/extension/index.ts")) throw new Error("Pi extension source path is missing");
if (!pkg.pi?.prompts?.includes("./prompts")) throw new Error("Pi prompt path is missing");

const changelog = readFileSync("CHANGELOG.md", "utf8");
if (!changelog.includes(`## [${version}] - `)) throw new Error(`CHANGELOG.md has no ${version} release heading`);

console.log(`release:check ok (v${version})`);
