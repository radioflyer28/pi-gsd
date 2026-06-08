declare module "@earendil-works/pi-coding-agent" {
  export type ExtensionAPI = {
    registerTool?: (tool: Record<string, unknown>) => void;
    registerCommand?: (name: string, command: Record<string, unknown>) => void;
    exec?: (
      command: string,
      args?: string[],
      options?: { cwd?: string; signal?: AbortSignal },
    ) => Promise<{ stdout?: string; stderr?: string; exitCode?: number } | string>;
  };

  export const DEFAULT_MAX_BYTES: number;
  export const DEFAULT_MAX_LINES: number;

  export function formatSize(bytes: number): string;

  export function truncateTail(
    text: string,
    options: { maxBytes: number; maxLines: number },
  ): {
    content: string;
    truncated: boolean;
    outputLines: number;
    totalLines: number;
    outputBytes: number;
    totalBytes: number;
  };
}

declare module "@earendil-works/pi-ai" {
  import type { TSchema } from "typebox";

  export function StringEnum<T extends readonly string[]>(values: T): TSchema;
}
