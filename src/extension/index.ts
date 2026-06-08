import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateTail,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

import { registerContextModeGuard } from "./context-mode-guard.ts";
import { registerPiGsdCore } from "./register.ts";

const TOOL_PARAMS = Type.Object(
  {
    action: StringEnum(["status", "doctor", "run", "resolve-model", "init-config"] as const),
    args: Type.Optional(
      Type.Array(Type.String(), {
        description: "Arguments passed to gsd-tools for action=run.",
      }),
    ),
    cwd: Type.Optional(
      Type.String({
        description: "Working directory. Defaults to the current Pi session cwd.",
      }),
    ),
    target: Type.Optional(
      Type.String({
        description: "GSD target to resolve for action=resolve-model, such as gsd-planner or gsd-plan-phase.",
      }),
    ),
    agent: Type.Optional(
      Type.String({
        description: "GSD agent id to resolve, such as gsd-planner.",
      }),
    ),
    skill: Type.Optional(
      Type.String({
        description: "GSD skill/command id to resolve, such as gsd-plan-phase or gsd:plan-phase.",
      }),
    ),
    command: Type.Optional(
      Type.String({
        description: "GSD command id to resolve.",
      }),
    ),
    force: Type.Optional(
      Type.Boolean({
        description: "For action=init-config, overwrite existing .pi-gsd default files when true. Defaults to false.",
      }),
    ),
  },
  { additionalProperties: false },
);

function truncateForPiTool(text: string): string {
  const truncation = truncateTail(text, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });

  if (!truncation.truncated) return truncation.content;

  return [
    truncation.content,
    "",
    `[Output truncated: ${truncation.outputLines}/${truncation.totalLines} lines (${formatSize(
      truncation.outputBytes,
    )}/${formatSize(truncation.totalBytes)}).]`,
  ].join("\n");
}

export default function registerPiGsdExtension(pi: ExtensionAPI): void {
  registerPiGsdCore(pi as unknown as Parameters<typeof registerPiGsdCore>[0], {
    parameters: TOOL_PARAMS,
    truncateOutput: truncateForPiTool,
  });
  registerContextModeGuard(pi as Parameters<typeof registerContextModeGuard>[0]);
}
