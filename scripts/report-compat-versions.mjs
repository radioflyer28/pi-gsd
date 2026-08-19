#!/usr/bin/env node
import { readFileSync } from "node:fs";
import * as path from "node:path";

const root = process.cwd();
const packages = [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-ai",
  "typebox",
  "@opengsd/gsd-core",
];

const versions = Object.fromEntries(packages.map((name) => {
  const manifest = path.join(root, "node_modules", ...name.split("/"), "package.json");
  const parsed = JSON.parse(readFileSync(manifest, "utf8"));
  if (typeof parsed.version !== "string") throw new Error(`Missing version in ${manifest}`);
  return [name, parsed.version];
}));

console.log(JSON.stringify({ os: process.platform, node: process.version, packages: versions }, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = [
    "## pi-gsd compatibility probe",
    "",
    `- OS: ${process.platform}`,
    `- Node: ${process.version}`,
    ...Object.entries(versions).map(([name, version]) => `- ${name}: ${version}`),
    "",
  ];
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, rows.join("\n"));
}
