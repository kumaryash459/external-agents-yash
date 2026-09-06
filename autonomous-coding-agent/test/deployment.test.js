import assert from "node:assert/strict";
import test from "node:test";
import { DeploymentManager } from "../src/deployment.js";

test("runs only explicitly enabled provider deployments", async () => {
  const commands = [];
  const manager = new DeploymentManager({ tools: { run: async (command) => { commands.push(command); return { command, exitCode: 0, output: "deployed" }; } } });
  assert.deepEqual(await manager.deploy(".", {}), { status: "not_requested" });
  const result = await manager.deploy(".", { enabled: true, provider: "docker", image: "demo:1" });
  assert.equal(result.status, "deployed");
  assert.deepEqual(commands, [["docker", "build", "-t", "demo:1", "."]]);
});
