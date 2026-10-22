import * as fs from "node:fs";
import * as path from "node:path";

import { defaultPackageRoot } from "./capabilities.ts";
import { loadPiGsdConfig } from "./config.ts";
import { parseFrontmatter, piExecutionGuidance } from "./gsd-core-commands.ts";

// A bounded adapter surface, not a copied upstream workflow or model catalog.
export const GSD_RUNTIME_ROLES = ["gsd-planner", "gsd-executor", "gsd-verifier", "gsd-plan-checker", "gsd-code-reviewer"] as const;
export const RUNTIME_AGENT_EVENT = "pi-subagents:runtime-agent-register:v1";

type ToolInfo = { name?: string; exposure?: string; sourceInfo?: { path?: string } };
export type RuntimeAgentHost = {
  on?: (name: string, handler: (event: any, ctx: any) => unknown) => unknown;
  events?: { emit(name: string, data: unknown): void };
  getActiveTools?: () => string[];
  getAllTools?: () => ToolInfo[];
};
export type GsdRuntimeAgentDefinition = {
  description: string;
  systemPrompt: string;
  tools: string[];
  extensions: string[];
  subagentOnlyExtensions: string[];
  acceptanceRole: "writer";
  runner: { type: "pi" };
  systemPromptMode: "replace";
  inheritProjectContext: boolean;
  inheritGlobalContext: boolean;
  inheritSkills: boolean;
  defaultContext: "fresh";
  allowNestedSubagents: boolean;
};
export type GsdRuntimeAgentStatus = {
  state: "pending" | "registered" | "unavailable" | "disabled";
  roles: string[];
  reason?: string;
};

type Registration = { dispose(): void };
type RegisterRequest = {
  version: 1;
  name: string;
  definition: GsdRuntimeAgentDefinition;
  result?: { ok: true; registration: Registration } | { ok: false; error: unknown };
};

export function buildGsdRuntimeAgents(options: {
  packageRoot?: string;
  platform?: NodeJS.Platform;
  tools?: ToolInfo[];
} = {}): Array<{ name: string; definition: GsdRuntimeAgentDefinition }> {
  const root = options.packageRoot ?? defaultPackageRoot();
  const gsdProvider = path.join(root, "src", "extension", "index.ts");
  if (!fs.statSync(gsdProvider).isFile()) throw new Error("pi-gsd child provider entrypoint is unavailable.");
  const windows = (options.platform ?? process.platform) === "win32";
  const shell = windows ? "pwsh" : "bash";
  const providers = [fs.realpathSync(gsdProvider)];
  if (windows) {
    const pwsh = options.tools?.find((tool) => tool.name === "pwsh" && tool.exposure !== "hidden");
    const entry = pwsh?.sourceInfo?.path;
    if (!entry || !path.isAbsolute(entry) || !fs.statSync(entry).isFile()) {
      throw new Error("Windows GSD children require a registered pwsh tool with an existing provider sourceInfo.path; load its trusted provider in the parent first.");
    }
    providers.push(fs.realpathSync(entry));
  }
  const core = path.join(root, "node_modules", "@opengsd", "gsd-core");
  const coreResources = path.join(core, "gsd-core");
  return GSD_RUNTIME_ROLES.map((name) => {
    const rolePath = path.join(core, "agents", `${name}.md`);
    const markdown = fs.readFileSync(rolePath, "utf8");
    const { fields, body } = parseFrontmatter(markdown);
    if (fields.name !== name || !body.trim()) throw new Error(`Invalid package-local upstream role: ${name}`);
    const declared = /^tools:\s*(.+)$/m.exec(markdown)?.[1].split(",").map((tool) => tool.trim()) ?? [];
    const tools = ["read", "grep", "find", "ls", shell, "gsd", "codemode", "contact_supervisor"];
    if (declared.includes("Write")) tools.push("write");
    if (declared.includes("Edit")) tools.push("edit");
    const role = body.replace(/(@?)(?:~|\$HOME)\/\.claude\/gsd-core\//g, (_match, include: string) => `${include}${coreResources}${path.sep}`);
    return {
      name,
      definition: {
        description: fields.description || `Upstream GSD ${name}`,
        systemPrompt: [
          `Current upstream role: ${rolePath}`,
          role.trim(),
          ...piExecutionGuidance(),
          "This native Pi child owns only its assigned bounded work. Do not coordinate phases or spawn children. Escalate missing capabilities or genuine authorization decisions. Conditional web/MCP/skill requirements are not supplied by this baseline; do not silently skip required upstream steps.",
          `Use ${shell} for approved bounded foreground commands and inspect exit status. Use codemode for useful batching/filtering, not to bypass tool policy. Preserve required approvals and assigned output ownership.`,
        ].join("\n"),
        tools,
        extensions: [],
        subagentOnlyExtensions: providers,
        acceptanceRole: "writer",
        runner: { type: "pi" },
        systemPromptMode: "replace",
        inheritProjectContext: true,
        inheritGlobalContext: false,
        inheritSkills: false,
        defaultContext: "fresh",
        allowNestedSubagents: false,
      },
    };
  });
}

export function registerGsdRuntimeAgents(pi: RuntimeAgentHost, options: {
  packageRoot?: string;
  platform?: NodeJS.Platform;
} = {}): () => GsdRuntimeAgentStatus {
  let state: GsdRuntimeAgentStatus = { state: "pending", roles: [] };
  let registrations: Registration[] = [];
  const release = () => {
    const owned = registrations;
    registrations = [];
    for (const registration of owned.reverse()) {
      try { registration.dispose(); } catch { /* Continue releasing the other owned registrations. */ }
    }
  };
  if (!pi.on || !pi.events) {
    state = { state: "unavailable", roles: [], reason: "Runtime registration needs Pi events and lifecycle hooks." };
    return () => structuredClone(state);
  }
  pi.on("session_start", (_event, ctx) => {
    release();
    const cwd = ctx?.cwd ?? process.cwd();
    if (loadPiGsdConfig(cwd).config.integrations.subagents === "off") {
      state = { state: "disabled", roles: [], reason: "integrations.subagents is off." };
      return;
    }
    // In particular, do not install orchestrator-facing roles inside restricted children.
    if (!pi.getActiveTools?.().some((name) => name === "subagent" || name === "subagents_enable")) {
      state = { state: "unavailable", roles: [], reason: "No active parent subagent interface; no child profiles registered." };
      return;
    }
    try {
      const roles = buildGsdRuntimeAgents({ ...options, tools: pi.getAllTools?.() });
      for (const role of roles) {
        const request: RegisterRequest = { version: 1, ...role };
        pi.events!.emit(RUNTIME_AGENT_EVENT, request);
        if (!request.result) throw new Error("Installed pi-subagents does not support runtime agent registration or is not ready; use a compatible version or keep work inline.");
        if (!request.result.ok) throw request.result.error;
        if (typeof request.result.registration?.dispose !== "function") throw new Error("Malformed pi-subagents runtime registration result.");
        registrations.push(request.result.registration);
      }
      state = { state: "registered", roles: roles.map(({ name }) => name) };
    } catch (error) {
      release();
      state = { state: "unavailable", roles: [], reason: error instanceof Error ? error.message : String(error) };
      ctx?.ui?.notify?.(`pi-gsd child profiles unavailable: ${state.reason}`, "warning");
    }
  });
  pi.on("session_shutdown", () => {
    release();
    state = { state: "disabled", roles: [], reason: "Parent session shut down." };
  });
  return () => structuredClone(state);
}

export function formatGsdRuntimeAgentStatus(status: GsdRuntimeAgentStatus): string {
  return [
    "", "## GSD runtime agents", "",
    `- registration: ${status.state}`,
    ...(status.roles.length ? [`- native role profiles: ${status.roles.join(", ")}`] : []),
    ...(status.reason ? [`- reason: ${status.reason}`] : []),
    "- registration supplies tools/provider paths, not a successful child health check; child tool readiness remains unverified until startup/canary evidence is available",
  ].join("\n");
}
