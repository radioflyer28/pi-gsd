import * as path from "node:path";

import type { Capabilities, GsdMode } from "../src/extension/capabilities.ts";

type CapabilityOverrides = Omit<Partial<Capabilities>, "paths" | "detected" | "provenance" | "integrationPackages" | "integrationSettings" | "upstreamPiPlugin"> & {
  paths?: Partial<Capabilities["paths"]>;
  detected?: Partial<Capabilities["detected"]>;
  provenance?: Partial<Capabilities["provenance"]>;
  integrationPackages?: Partial<Capabilities["integrationPackages"]>;
  integrationSettings?: Partial<Capabilities["integrationSettings"]>;
  upstreamPiPlugin?: Partial<Capabilities["upstreamPiPlugin"]>;
};

export function capabilities(mode: GsdMode, overrides: CapabilityOverrides = {}): Capabilities {
  const { paths: pathOverrides, detected, provenance, integrationPackages, integrationSettings, upstreamPiPlugin, ...topLevelOverrides } = overrides;
  const subagents = mode === "delegated" || mode === "delegated-ctx";
  const contextMode = mode === "ctx-inline" || mode === "delegated-ctx";
  const detectedSubagents = detected?.subagents ?? subagents;
  const detectedContextMode = detected?.contextMode ?? contextMode;
  const paths = {
    gsdCore: "package-local-gsd-core",
    gsdTools: "package-local-gsd-tools",
    subagents: subagents ? "subagent" : null,
    contextMode: contextMode ? "context-mode" : null,
  };
  return {
    gsdCore: true,
    subagents,
    contextMode,
    mode,
    detected: {
      subagents: detectedSubagents,
      contextMode: detectedContextMode,
    },
    provenance: {
      subagents: provenance?.subagents ?? (detectedSubagents ? "active-tool" : "not-detected"),
      contextMode: provenance?.contextMode ?? (detectedContextMode ? "active-tool" : "not-detected"),
    },
    integrationPackages: {
      ...integrationPackages,
    },
    activeToolInventoryAvailable: true,
    upstreamPiPlugin: {
      activeTool: upstreamPiPlugin?.activeTool ?? false,
      activeCommand: upstreamPiPlugin?.activeCommand ?? false,
      paths: upstreamPiPlugin?.paths ?? [],
    },
    integrationSettings: {
      subagents: integrationSettings?.subagents ?? "auto",
      contextMode: integrationSettings?.contextMode ?? "auto",
    },
    safetySettings: {
      upstreamGuards: "off",
    },
    configPath: path.join(process.cwd(), ".pi-gsd", "config.json"),
    configWarnings: [],
    ...topLevelOverrides,
    paths: {
      ...paths,
      ...pathOverrides,
    },
  };
}

export function mockPi(
  exec?: (...args: unknown[]) => Promise<{ stdout?: string; stderr?: string; exitCode?: number } | string>,
  allTools: Array<{ name?: string }> = [],
  activeTools: string[] | undefined = allTools.map((tool) => tool.name).filter((name): name is string => Boolean(name)),
) {
  let thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" = "medium";
  let selectedModel: unknown;
  const tools: Record<string, any>[] = [];
  const commands = new Map<string, Record<string, any>>();
  const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
  const sentUserMessages: string[] = [];
  return {
    api: {
      registerTool(tool: Record<string, any>) {
        tools.push(tool);
      },
      registerCommand(name: string, command: Record<string, any>) {
        commands.set(name, command);
      },
      getAllTools() {
        return [...allTools, ...tools.map((tool) => ({ name: tool.name as string | undefined }))];
      },
      getActiveTools() {
        return activeTools;
      },
      getCommands() {
        return [...commands.keys()].map((name) => ({ name }));
      },
      getThinkingLevel() {
        return thinkingLevel;
      },
      setThinkingLevel(level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max") {
        thinkingLevel = level;
      },
      async setModel(model: unknown) {
        selectedModel = model;
        return true;
      },
      sendUserMessage(message: string) {
        sentUserMessages.push(message);
      },
      on(eventName: string, handler: (event: any, ctx: any) => unknown) {
        handlers.set(eventName, [...(handlers.get(eventName) ?? []), handler]);
      },
      exec,
    },
    tools,
    commands,
    handlers,
    sentUserMessages,
    get thinkingLevel() {
      return thinkingLevel;
    },
    get selectedModel() {
      return selectedModel;
    },
  };
}

export function toolText(result: { content: Array<{ text: string }> }): string {
  return result.content.map((item) => item.text).join("\n");
}
