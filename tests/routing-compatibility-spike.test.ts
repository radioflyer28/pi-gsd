import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

// A trusted fixture with an intentionally absent node_modules. Its bare peer
// import must resolve only in the disposable snapshot, not mutate this fixture.
function fixtureFactory(registerVirtual: boolean): string {
  return `import { Type } from 'typebox';
Type.String();
export function createDefaultChildSessionFactory({ loadPiCodingAgent }) {
  return {
    async create(launch) {
      const pi = await loadPiCodingAgent();
      const modelRuntime = await pi.ModelRuntime.create();
      pi.SettingsManager.create(launch.cwd);
      const loader = new pi.DefaultResourceLoader({ cwd: launch.cwd });
      await loader.reload();
      const queue = loader.getExtensions().runtime;
      if (queue.pendingVirtualModelRegistrations.length) {
        ${registerVirtual ? "for (const {definition} of queue.pendingVirtualModelRegistrations) modelRuntime.registerVirtualModel(definition); queue.pendingVirtualModelRegistrations = []; await modelRuntime.refresh({allowNetwork:false});" : ""}
      }
      pi.SessionManager.inMemory(launch.cwd);
      const resolved = pi.resolveCliModel({cliModel:launch.model,modelRuntime});
      if (resolved.error) throw new Error(resolved.error);
      return pi.createAgentSession({cwd:launch.cwd,model:resolved.model});
    },
    async dispose() {},
  };
}`;
}

for (const registerVirtual of [true, false]) {
  test(`optional child compatibility probe ${registerVirtual ? "verifies snapshot queue ordering" : "rejects a missing virtual queue flush"}`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gsd-child-probe-test-"));
    try {
      const entry = path.join(root, "src/runs/shared/child-session.ts");
      fs.mkdirSync(path.dirname(entry), { recursive: true });
      const source = fixtureFactory(registerVirtual);
      fs.writeFileSync(entry, source);
      fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "pi-subagents", version: "0.0.0-fixture", type: "module" }));
      const result = spawnSync(process.execPath, ["--experimental-strip-types", path.resolve("scripts/routing-compatibility-spike.mjs"), root], {
        encoding: "utf8", timeout: 30_000, windowsHide: true,
      });
      assert.ifError(result.error);
      if (registerVirtual) {
        assert.equal(result.status, 0, result.stderr);
        const report = JSON.parse(result.stdout);
        assert.equal(report.forkVersion, "0.0.0-fixture");
        assert.match(report.childFactorySourceSha256, /^[a-f0-9]{64}$/);
        assert.match(report.childFactoryDependencyContext, /repository peers/);
        assert.match(report.virtualChildPreResolution, /registered and drained/);
        assert.equal(report.cliIsolationAfterHandshake.isolation, "none");
      } else {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /SPIKE_VIRTUAL_NOT_REGISTERED/);
      }
      assert.equal(fs.readFileSync(entry, "utf8"), source);
      assert.equal(fs.existsSync(path.join(root, "node_modules")), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
