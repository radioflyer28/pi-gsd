import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateTail,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

import { registerPiGsdCore } from "./register.ts";

const TOOL_PARAMS = Type.Object(
  {
    action: StringEnum(["status", "doctor", "run"] as const),
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
  registerPiGsdCore(pi, {
    parameters: TOOL_PARAMS,
    truncateOutput: truncateForPiTool,
  });
}
