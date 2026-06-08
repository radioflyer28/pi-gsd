import type { Capabilities, GsdMode } from "../src/extension/capabilities.ts";

export function capabilities(mode: GsdMode, overrides: Partial<Capabilities> = {}): Capabilities {
  const subagents = mode === "delegated" || mode === "delegated-ctx";
  const contextMode = mode === "ctx-inline" || mode === "delegated-ctx";
  return {
    gsdCore: true,
    subagents,
    contextMode,
    mode,
    paths: {
      gsdCore: "package-local-gsd-core",
      gsdTools: "package-local-gsd-tools",
      subagents: subagents ? "subagent" : null,
      contextMode: contextMode ? "context-mode" : null,
    },
    ...overrides,
    paths: {
      gsdCore: "package-local-gsd-core",
      gsdTools: "package-local-gsd-tools",
      subagents: subagents ? "subagent" : null,
      contextMode: contextMode ? "context-mode" : null,
      ...overrides.paths,
    },
  };
}

export function mockPi(
  exec?: (...args: unknown[]) => Promise<unknown>,
  allTools: Array<{ name?: string }> = [],
) {
  let thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" = "medium";
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
      getThinkingLevel() {
        return thinkingLevel;
      },
      setThinkingLevel(level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh") {
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
