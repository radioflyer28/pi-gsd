import * as fs from "node:fs";
import * as path from "node:path";

import { defaultPackageRoot } from "./capabilities.ts";
import { loadPiGsdConfig, type ChildProviders } from "./config.ts";
import { parseFrontmatter, piExecutionGuidance } from "./gsd-core-commands.ts";

import { GSD_RUNTIME_ROLES, GSD_EXCLUDED_ROLES } from "./parity.ts";
export { GSD_RUNTIME_ROLES } from "./parity.ts";

/** Parse only the upstream frontmatter's supported scalar/list tool syntax. */
export function declaredRoleTools(markdown: string): string[] {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1];
  const declaration = frontmatter && /^tools:[ \t]*([^\r\n]*)(?:\r?\n((?:[ \t]+-[ \t]+[^\r\n]+(?:\r?\n|$))*))?/m.exec(frontmatter);
  if (!declaration) throw new Error("Upstream role has no tools declaration.");
  const tools = declaration[1].trim()
    ? declaration[1].split(",").map((tool) => tool.trim())
    : (declaration[2] ?? "").split(/\r?\n/).filter(Boolean).map((line) => line.replace(/^[ \t]+-[ \t]+/, "").trim());
  if (!tools.length || tools.some((tool) => !/^[A-Za-z][A-Za-z0-9_*-]*$/.test(tool))) {
    throw new Error("Unsupported upstream role tools declaration; review before registration.");
  }
  return tools;
}
export const RUNTIME_AGENT_EVENT = "pi-subagents:runtime-agent-register:v1";

type ToolInfo = { name?: string; exposure?: string; sourceInfo?: { path?: string; source?: string } };
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
  acceptanceRole: "writer" | "read-only";
  runner: { type: "pi" };
  systemPromptMode: "replace";
  inheritProjectContext: boolean;
  inheritGlobalContext: boolean;
  inheritSkills: boolean;
  defaultContext: "fresh";
  allowNestedSubagents: boolean;
};
export type GsdRuntimeAgentStatus = {
  state: "pending" | "registered" | "partial" | "unavailable" | "disabled";
  roles: string[];
  cwd?: string;
  unavailableRoles?: Record<string, string>;
  shellTool?: "bash" | "pwsh" | "powershell";
  bindings?: Array<{ role: string; tools: string[]; providers: string[] }>;
  reason?: string;
};

type Registration = { dispose(): void };
type RegisterRequest = {
  version: 1;
  name: string;
  definition: GsdRuntimeAgentDefinition;
  result?: { ok: true; registration: Registration } | { ok: false; error: unknown };
};

const MULTI_EDIT_ROLES = new Set(["gsd-phase-researcher", "gsd-planner", "gsd-pattern-mapper", "gsd-executor"]);
const RESEARCH_WEB_TOOLS = ["web_search", "fetch_content", "get_search_content", "source_check"];

/** Bind only an explicitly selected provider already trusted and registered in the parent. */
function bindChildProvider(entry: string | undefined, names: string[], inventory: ToolInfo[] = []): string | undefined {
  if (entry === undefined) return undefined;
  if (!path.isAbsolute(entry) || !fs.statSync(entry).isFile()) throw new Error("Child provider must name an existing absolute entrypoint.");
  const provider = fs.realpathSync(entry);
  for (const name of names) {
    const tool = inventory.find((candidate) => candidate.name === name && candidate.exposure !== "hidden");
    const source = tool?.sourceInfo?.path;
    if (!source || !path.isAbsolute(source) || !fs.statSync(source).isFile() || fs.realpathSync(source) !== provider) {
      throw new Error(`Child provider must match the registered, nonhidden parent ${name} provider; load and review it in the parent first.`);
    }
  }
  return provider;
}

export function buildGsdRuntimeAgents(options: {
  packageRoot?: string;
  platform?: NodeJS.Platform;
  tools?: ToolInfo[];
  childProviders?: ChildProviders;
  onUnavailable?: (role: string, reason: string) => void;
} = {}): Array<{ name: string; definition: GsdRuntimeAgentDefinition }> {
  const root = options.packageRoot ?? defaultPackageRoot();
  const gsdProvider = path.join(root, "src", "extension", "leaf.ts");
  if (!fs.statSync(gsdProvider).isFile()) throw new Error("pi-gsd child provider entrypoint is unavailable.");
  const windows = (options.platform ?? process.platform) === "win32";
  let shell: "bash" | "pwsh" | "powershell" = windows ? "powershell" : "bash";
  const providers = [fs.realpathSync(gsdProvider)];
  let shellError: string | undefined;
  if (windows) {
    try {
      const pwsh = options.tools?.find((tool) => tool.name === "pwsh");
      if (pwsh) {
        // Preserve an explicitly loaded shell integration. A disabled/broken
        // provider is not permission to route around it using the builtin shell.
        const entry = pwsh.sourceInfo?.path;
        if (pwsh.exposure === "hidden" || !entry || !path.isAbsolute(entry) || !fs.statSync(entry).isFile()) {
          throw new Error("Registered pwsh tool is hidden or lacks an existing provider sourceInfo.path; repair it instead of falling back to another shell.");
        }
        shell = "pwsh";
        providers.push(fs.realpathSync(entry));
      } else {
        const builtin = options.tools?.find((tool) => tool.name === "powershell" && tool.exposure !== "hidden"
          && tool.sourceInfo?.source === "builtin" && tool.sourceInfo.path === "builtin:powershell");
        if (!builtin) throw new Error("Windows GSD children require a registered pwsh tool with its trusted provider or the host's builtin powershell tool; no Bash fallback is used.");
      }
    } catch (error) {
      if (!options.onUnavailable) throw error;
      shellError = error instanceof Error ? error.message : String(error);
    }
  }
  const bindingErrors: Partial<Record<keyof ChildProviders, string>> = {};
  const resolveBinding = (key: keyof ChildProviders, names: string[]) => {
    try { return bindChildProvider(options.childProviders?.[key], names, options.tools); }
    catch (error) {
      if (!options.onUnavailable) throw error;
      bindingErrors[key] = `${key}: ${error instanceof Error ? error.message : String(error)}`;
      return undefined;
    }
  };
  const multiEdit = resolveBinding("multiEdit", ["read", "edit"]);
  const researchWeb = resolveBinding("researchWeb", RESEARCH_WEB_TOOLS);
  const core = path.join(root, "node_modules", "@opengsd", "gsd-core");
  const coreResources = path.join(core, "gsd-core");
  return GSD_RUNTIME_ROLES.flatMap((name): Array<{ name: string; definition: GsdRuntimeAgentDefinition }> => {
    const failures = [MULTI_EDIT_ROLES.has(name) ? bindingErrors.multiEdit : undefined,
      name === "gsd-phase-researcher" ? bindingErrors.researchWeb : undefined].filter(Boolean);
    if (failures.length) {
      options.onUnavailable!(name, failures.join("; "));
      return []; // Never silently downgrade an explicitly requested capability.
    }
    const rolePath = path.join(core, "agents", `${name}.md`);
    const markdown = fs.readFileSync(rolePath, "utf8");
    const { fields, body } = parseFrontmatter(markdown);
    if (fields.name !== name || !body.trim()) throw new Error(`Invalid package-local upstream role: ${name}`);
    const declared = declaredRoleTools(markdown);
    if (shellError && declared.includes("Bash")) { options.onUnavailable!(name, shellError); return []; }
    if (declared.includes("Agent") || declared.includes("Task")) throw new Error(`${name} requires nested dispatch; review its parity disposition.`);
    const authoringProvider = MULTI_EDIT_ROLES.has(name) && (declared.includes("Write") || declared.includes("Edit")) ? multiEdit : undefined;
    const webProvider = name === "gsd-phase-researcher" ? researchWeb : undefined;
    const roleProviders = declared.includes("Bash") ? [...providers] : [];
    if (authoringProvider) roleProviders.push(authoringProvider);
    if (webProvider) roleProviders.push(webProvider);
    const tools = ["read", "codemode", "contact_supervisor"];
    if (declared.includes("Grep")) tools.push("grep");
    if (declared.includes("Glob")) tools.push("find", "ls");
    if (declared.includes("Bash")) tools.push(shell, "gsd");
    if (declared.includes("Write")) tools.push(authoringProvider ? "edit" : "write");
    if (declared.includes("Edit") && !tools.includes("edit")) tools.push("edit");
    if (webProvider) tools.push(...RESEARCH_WEB_TOOLS);
    const supplied = ["Read", "Write", "Edit", "Bash", "Grep", "Glob", ...(webProvider ? ["WebSearch", "WebFetch"] : [])];
    const unsupplied = declared.filter((tool) => !supplied.includes(tool));
    const mutating = tools.some((tool) => [shell, "gsd", "write", "edit"].includes(tool));
    const role = body.replace(/(@?)(?:~|\$HOME)\/\.claude\/gsd-core\//g, (_match, include: string) => `${include}${coreResources}${path.sep}`);
    return [{
      name,
      definition: {
        description: fields.description || `Upstream GSD ${name}`,
        systemPrompt: [
          `Current upstream role: ${rolePath}`,
          role.trim(),
          ...piExecutionGuidance("leaf"),
          "This native Pi child owns only its assigned bounded work. Do not coordinate phases or spawn children. Escalate missing capabilities or genuine authorization decisions. Conditional web/MCP/skill requirements need explicit capability checks; do not silently skip required upstream steps.",
          ...(declared.includes("Bash") ? [`Use ${shell} for approved bounded foreground commands and inspect exit status.`] : ["This profile has no shell or gsd grant. Do not route around its file-tool boundary."]),
          ...(unsupplied.length ? [`Upstream-declared capabilities not supplied by this baseline: ${unsupplied.join(", ")}. Before accepting work, check whether its required steps need these capabilities. Escalate through contact_supervisor for approved setup or a parent-side user decision; never fabricate evidence or silently skip a required step.`] : []),
          ...(authoringProvider ? ["The selected multi-edit provider supplies a matched read/edit pair. Translate upstream Write/Edit to edit({edits:[{path,new:completeFileText}, ...]}): a path plus new with no selector creates or overwrites a whole file. For existing blocks read first and use returned anchors or exact old text. Make all authored edits for one change in one edit call; never write files through shell commands or heredocs. There is no separate write tool in this profile."] : []),
          ...(!authoringProvider && (declared.includes("Write") || declared.includes("Edit")) ? ["Stock Pi editing is sufficient for ordinary authoring. Use the read/edit/write tools actually granted in this child and follow their declared schemas; read existing files before editing. Separate file edits are valid: do not require the parent's anchored or multi-file edit API, and do not claim cross-file atomic rollback. If the assignment specifically requires unavailable atomic multi-file editing, escalate that requirement instead of pretending stock tools provide it."] : []),
          ...(webProvider ? ["Translate upstream WebSearch to web_search and WebFetch to fetch_content; inspect stored results with get_search_content and check claims with source_check. These explicitly bound web tools do not supply Context7 or other MCP tools. Preserve the upstream research-plan/fallback and provenance contracts; stop on missing mandatory capabilities."] : []),
          "Use codemode for useful batching/filtering, not to bypass tool policy. Preserve required approvals and assigned output ownership.",
        ].join("\n"),
        tools,
        extensions: [],
        subagentOnlyExtensions: [...new Set(roleProviders)],
        acceptanceRole: mutating ? "writer" : "read-only",
        runner: { type: "pi" },
        systemPromptMode: "replace",
        inheritProjectContext: true,
        inheritGlobalContext: false,
        inheritSkills: false,
        defaultContext: "fresh",
        allowNestedSubagents: false,
      },
    }];
  });
}

export function registerGsdRuntimeAgents(pi: RuntimeAgentHost, options: {
  packageRoot?: string;
  platform?: NodeJS.Platform;
} = {}): (cwd?: string) => GsdRuntimeAgentStatus {
  let state: GsdRuntimeAgentStatus = { state: "pending", roles: [] };
  let registrationCwd: string | undefined;
  const snapshot = (cwd?: string): GsdRuntimeAgentStatus => {
    if (cwd && registrationCwd && path.relative(registrationCwd, path.resolve(cwd)) !== "") {
      return { state: "unavailable", roles: [], cwd: registrationCwd,
        reason: "Registration belongs to a different project/session cwd; no runtime profile evidence is available for the requested cwd. Inspect profiles in that project's session before assigning work." };
    }
    return structuredClone({ ...state, ...(registrationCwd ? { cwd: registrationCwd } : {}) });
  };
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
    return snapshot;
  }
  pi.on("session_start", (_event, ctx) => {
    release();
    const cwd = ctx?.cwd ?? process.cwd();
    registrationCwd = path.resolve(cwd);
    state = { state: "pending", roles: [] };
    const configuration = loadPiGsdConfig(cwd);
    if (configuration.config.integrations.subagents === "off") {
      state = { state: "disabled", roles: [], reason: "integrations.subagents is off." };
      return;
    }
    // In particular, do not install orchestrator-facing roles inside restricted children.
    if (!pi.getActiveTools?.().some((name) => name === "subagent" || name === "subagents_enable")) {
      state = { state: "unavailable", roles: [], reason: "No active parent subagent interface; no child profiles registered." };
      return;
    }
    try {
      if (configuration.warnings.length) throw new Error(configuration.warnings.join(" "));
      if (configuration.config.childProviders && ctx?.isProjectTrusted?.() !== true) {
        throw new Error("childProviders requires a positively trusted project; no project-selected provider bindings were registered.");
      }
      const unavailableRoles: Record<string, string> = {};
      const roles = buildGsdRuntimeAgents({ ...options, tools: pi.getAllTools?.(), childProviders: configuration.config.childProviders,
        onUnavailable: (role, reason) => { unavailableRoles[role] = reason; },
      });
      for (const role of roles) {
        const request: RegisterRequest = { version: 1, ...role };
        pi.events!.emit(RUNTIME_AGENT_EVENT, request);
        if (!request.result) throw new Error("Installed pi-subagents does not support runtime agent registration or is not ready; repair the owner before required child steps. Inline work is allowed only where upstream permits it.");
        if (!request.result.ok) throw request.result.error;
        if (typeof request.result.registration?.dispose !== "function") throw new Error("Malformed pi-subagents runtime registration result.");
        registrations.push(request.result.registration);
      }
      const shellTool = (["pwsh", "powershell", "bash"] as const).find((tool) => roles.some(({ definition }) => definition.tools.includes(tool)));
      state = {
        state: Object.keys(unavailableRoles).length ? "partial" : "registered",
        ...(shellTool ? { shellTool } : {}),
        roles: roles.map(({ name }) => name),
        unavailableRoles,
        bindings: roles.filter(({ name }) =>
          (configuration.config.childProviders?.multiEdit && MULTI_EDIT_ROLES.has(name)) ||
          (configuration.config.childProviders?.researchWeb && name === "gsd-phase-researcher"))
          .map(({ name, definition }) => ({ role: name, tools: definition.tools, providers: definition.subagentOnlyExtensions })),
      };
      if (state.state === "partial") ctx?.ui?.notify?.(`pi-gsd: required provider bindings unavailable for ${Object.keys(unavailableRoles).join(", ")}; these roles were not registered. See /gsd-doctor.`, "warning");
    } catch (error) {
      release();
      state = { state: "unavailable", roles: [], reason: error instanceof Error ? error.message : String(error) };
      ctx?.ui?.notify?.(`pi-gsd child profiles unavailable: ${state.reason}`, "warning");
    }
  });
  pi.on("session_shutdown", () => {
    release();
    state = { state: "disabled", roles: [], reason: "Parent session shut down." };
    registrationCwd = undefined;
  });
  return snapshot;
}

export function formatGsdRuntimeAgentStatus(status: GsdRuntimeAgentStatus): string {
  return [
    "", "## GSD runtime agents", "",
    `- registration: ${status.state}`,
    ...(status.cwd ? [`- registration cwd: ${status.cwd}`] : []),
    ...(status.roles.length ? [`- native role profiles: ${status.roles.join(", ")}`] : []),
    ...(status.reason ? [`- reason: ${status.reason}`] : []),
    ...(status.shellTool ? [`- registered child shell: ${status.shellTool} (bounded foreground validation; not managed-job readiness)`] : []),
    ...Object.entries(status.unavailableRoles ?? {}).map(([role, reason]) => `- unavailable ${role}: ${reason}`),
    ...(status.bindings ?? []).map(({ role, tools, providers }) => `- equipped ${role}: tools ${tools.join(", ")}; providers ${providers.join(", ")}`),
    `- excluded roles: ${Object.entries(GSD_EXCLUDED_ROLES).map(([name, reason]) => `${name}: ${reason}`).join("; ")}`,
    "- baseline profiles do not supply conditional web/MCP/skills; stock editing is the baseline; optional childProviders bind multi-edit for planning authors/executor and web for phase research only; file-only roles do not gain gsd or shell grants",
    "- registration supplies tools/provider paths, not a successful child health check; child tool readiness remains unverified until startup/canary evidence is available",
  ].join("\n");
}
