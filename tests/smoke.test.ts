import assert from "node:assert/strict";
import * as path from "node:path";
import test from "node:test";

import { gsdToolsCommandNames } from "../src/extension/capabilities.ts";
import { createGsdDispatcher } from "../src/extension/dispatcher.ts";

test("smoke: package-local gsd-tools can be invoked without pi.exec", async () => {
  const packageRoot = process.cwd();
  const command = path.join(packageRoot, "node_modules", ".bin", gsdToolsCommandNames()[0]);
  const dispatcher = createGsdDispatcher({ packageRoot });

  const result = await dispatcher.run(["--help"], packageRoot);

  assert.match(result.text, /gsd-tools exited with 0/);
  assert.match(result.text, /Usage: gsd-tools/);
  assert.equal(result.details.caps.gsdCore, true);
});
