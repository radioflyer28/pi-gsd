import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPiGsdForAudience } from "./index.ts";

/** Explicit child entrypoint: same gsd tool, no parent coordination guidance.
 * Load this OR index.ts, never both. Tool policy remains the owner's concern. */
export default function registerPiGsdLeaf(pi: ExtensionAPI): void {
  registerPiGsdForAudience(pi, "leaf");
}
