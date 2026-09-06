import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EntireIntegration } from "../src/entire.js";
import { evaluateRun } from "../src/evaluation.js";
import { ProjectMemory } from "../src/memory.js";

test("records reusable project memory only when requested", async () => {
  const memory = new ProjectMemory(await mkdtemp(join(tmpdir(), "agent-memory-")));
  await memory.record({ request: "Add health", phase: "deployment", modifiedFiles: ["src/health.js"], evaluation: { score: 1 } });
  assert.equal((await memory.recent())[0].request, "Add health");
});

test("scores requirements, security, validation, and approval", () => {
  const evaluation = evaluateRun({ plan: { acceptanceCriteria: ["works"] }, review: { status: "pending_human_approval" }, tests: { status: "passed" }, modifiedFiles: ["x"], phase: "deployment" });
  assert.equal(evaluation.score, 1);
});

test("runs Entire enable only with an explicit agent selection", async () => {
  const commands = [];
  const integration = new EntireIntegration({ tools: { run: async (command) => { commands.push(command); return { command, exitCode: 0, output: "ok" }; } } });
  assert.deepEqual(await integration.enable(".", {}), { status: "not_requested" });
  assert.equal((await integration.enable(".", { enable: true, agent: "codex" })).status, "enabled");
  assert.deepEqual(commands, [["entire", "enable", "--agent", "codex", "--telemetry=false"]]);
});
