import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const OWNER_REPAIR_GUIDE = fileURLToPath(new URL("../../docs/PI-SUBAGENTS-REPAIR.md", import.meta.url));
export type OwnerCompatibilityState = "known-unpatched-source" | "known-patched-source" | "unknown" | "not-loaded" | "disabled";
export type OwnerCompatibility = {
  state: OwnerCompatibilityState;
  evidence: "loaded-provider-files-on-disk" | "none";
  runtimeVerified: false;
  nextAction: "ask-user" | "inspect" | "none";
  reason: string;
  repairGuide: string;
  providerPath?: string;
  packageRoot?: string;
  version?: string;
  entrySha256?: string;
  lookupPath?: string;
  lookupSha256?: string;
};

type ToolSource = { name?: string; sourceInfo?: { path?: string } };
// Exact reviewed 0.88.1 files only; CRLF is normalized to LF. These are diagnostic
// fingerprints, not an import graph, a trust grant or proof of loaded module bytes.
const layouts: Record<string, { entry: string; lookup: string; unpatched: string; patched?: string }> = {
  "index.ts": {
    entry: "88316d1ae0618d196fb2409d88bb881d214ccdce2809e7b1d82bbe604703fda4",
    lookup: "src/agents/agent-management.ts",
    unpatched: "efc2b3c9ce51c2ba9b0ecfbffe48d90251aa7367baa6679a859a7f5be34a8926",
    patched: "25c6f5df5d8bc6f7e94e293654324b07ebee7bd8baec6dfa62ec17d176e529b6",
  },
  "index.js": {
    entry: "ce413b7cb2e174f76d21a29a95704dcdfdbcb3c95049833dd4009d233e5f1b01",
    lookup: "src/agents/agent-management.js",
    unpatched: "7fb1556b765ea2c9cd4e1d44a74bf102851b20ec2f967a003dfb24a813138f8f",
  },
  "bundle/index.js": {
    entry: "a1d7bba35fae224d6e66ee011b5fd1a0df2a5b2d5e4e9098cec52ab6299c06b8",
    lookup: "bundle/chunk-PCZEQQAQ.js",
    unpatched: "2c948e1d73aebcd45b8274b86b410bca9f5ec90b2d580ec850ff0e9b9509f58b",
  },
};

export function classifyOwnerFingerprint(version: string, entry: string, entryHash: string, lookupHash: string): OwnerCompatibilityState {
  const known = Object.hasOwn(layouts, entry) ? layouts[entry] : undefined;
  if (version !== "0.88.1" || !known || known.entry !== entryHash) return "unknown";
  if (lookupHash === known.unpatched) return "known-unpatched-source";
  if (lookupHash === known.patched) return "known-patched-source";
  return "unknown";
}

/** Bounded regular-file reads; never execute owner code or scan installed candidates. */
function readBounded(file: string, limit: number): string {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw new Error("Unsupported diagnostic file");
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = fs.readSync(fd, buffer, length, buffer.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length > limit) throw new Error("Diagnostic file exceeded bound");
    return buffer.subarray(0, length).toString("utf8");
  } finally { fs.closeSync(fd); }
}

function sha256(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
}

export function inspectSubagentCompatibility(tools: readonly ToolSource[] = [], enabled = true): OwnerCompatibility {
  const base: OwnerCompatibility = {
    state: "unknown", evidence: "none", runtimeVerified: false, nextAction: "inspect",
    reason: "Loaded owner source is not identifiable; inspect list/get before proposing a repair.", repairGuide: OWNER_REPAIR_GUIDE,
  };
  if (!enabled) return { ...base, state: "disabled", nextAction: "none", reason: "Subagent integration is disabled; no repair inspection performed." };
  const owners = tools.filter((tool) => tool.name === "subagent" || tool.name === "subagents_enable");
  if (!owners.length) return { ...base, state: "not-loaded", nextAction: "none", reason: "No registered owner tool source; installed candidates are not loaded-source evidence." };
  if (owners.some((tool) => !tool.sourceInfo?.path || !path.isAbsolute(tool.sourceInfo.path))) return base;
  try {
    const entries = [...new Set(owners.map((tool) => fs.realpathSync(tool.sourceInfo!.path!)))];
    if (entries.length !== 1) return { ...base, reason: "Owner tools have conflicting provider paths; resolve provenance before proposing a repair." };
    const providerPath = entries[0];
    const evidence = { ...base, providerPath, evidence: "loaded-provider-files-on-disk" as const };
    let root = path.dirname(providerPath);
    for (let depth = 0; depth < 8; depth++) {
      const manifestPath = path.join(root, "package.json");
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(readBounded(manifestPath, 64 * 1024));
        if (manifest?.name !== "pi-subagents" || typeof manifest.version !== "string") return evidence;
        const identified = { ...evidence, packageRoot: root, version: manifest.version };
        const relative = path.relative(root, providerPath).split(path.sep).join("/");
        const layout = Object.hasOwn(layouts, relative) ? layouts[relative] : undefined;
        if (!layout || manifest.version !== "0.88.1") return { ...identified, reason: "Owner version or entrypoint is outside reviewed fingerprints; unknown does not mean unpatched." };
        const lookupPath = fs.realpathSync(path.join(root, layout.lookup));
        if (path.relative(root, lookupPath).split(path.sep).join("/") !== layout.lookup) return identified;
        const entrySha256 = sha256(readBounded(providerPath, 64 * 1024));
        const lookupSha256 = sha256(readBounded(lookupPath, 1024 * 1024));
        const state = classifyOwnerFingerprint(manifest.version, relative, entrySha256, lookupSha256);
        return { ...identified, state, entrySha256, lookupPath, lookupSha256,
          nextAction: state === "known-unpatched-source" ? "ask-user" : state === "unknown" ? "inspect" : "none",
          reason: state === "known-unpatched-source"
            ? "Reviewed unpatched runtime-only get lookup found on disk at the loaded provider. Advise the repair and ask the user before any changes. This is not a live runtime probe."
            : state === "known-patched-source"
              ? "Reviewed lookup patch found on disk; this does not prove the running session reloaded or that child capabilities are ready."
              : "Owner files differ from reviewed fingerprints; inspect public list/get behavior, not version alone, before proposing a repair.",
        };
      }
      const parent = path.dirname(root);
      if (parent === root) break;
      root = parent;
    }
    return evidence;
  } catch {
    return { ...base, reason: "Owner files are missing, unreadable, oversized or unsupported; compatibility is unknown, not unpatched." };
  }
}

export function formatOwnerCompatibility(check?: OwnerCompatibility): string[] {
  if (!check) return [];
  return [
    `- pi-subagents lookup compatibility: ${check.state} (runtime unverified)`,
    `- owner evidence: ${check.reason}`,
    ...(check.lookupPath ? [`- inspected lookup: ${JSON.stringify(check.lookupPath)}; LF-normalized SHA-256 ${check.lookupSha256}`] : []),
    ...(check.nextAction === "ask-user" ? [`- Approval required: read ${JSON.stringify(check.repairGuide)}, explain the bounded repair and ask whether to prepare it in a separate checkout or defer. Do not patch installed modules or change source selection automatically.`] : []),
  ];
}

export function ownerRepairNotice(check: OwnerCompatibility): string {
  return [
    "pi-gsd owner compatibility advisory (not user approval):",
    ...formatOwnerCompatibility(check),
    "Parent agent: read the repair guide, explain the evidence and proposed paths, then ask the user whether to prepare and test the patch or defer. Use the host question tool when available, otherwise ask in text and wait. Honor any earlier decline; silence is not consent. Approval to prepare a checkout does not approve activation, settings changes, downloads, delegation or credentialed calls. Stop required child work whose capabilities cannot be established; continue unrelated permitted work.",
  ].join("\n");
}
