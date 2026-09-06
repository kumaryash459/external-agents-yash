import assert from "node:assert/strict";
import test from "node:test";
import { CodingAgent, routeModel } from "../src/orchestrator.js";

test("routes specialist models by task type", () => {
  assert.equal(routeModel("Fix the failing test"), "reasoning");
  assert.equal(routeModel("Update the README"), "fast");
  assert.equal(routeModel("Add an endpoint"), "coding");
});

test("stops at human approval and records the traceable lifecycle", async () => {
  const events = [];
  const agent = new CodingAgent({
    scanner: async () => ({ files: ["app.js"], testFiles: ["app.test.js"], documents: {} }),
    gateway: { invoke: async () => ({ content: "proposal", usage: { input_tokens: 4 } }) },
    timeline: { record: async (type, payload) => events.push({ type, ...payload }) }
  });
  const state = await agent.execute({ request: "Add a health endpoint", repository: "." });
  assert.equal(state.phase, "awaiting_approval");
  assert.ok(events.some((event) => event.type === "repository_scanned"));
  assert.ok(events.some((event) => event.type === "human_approval_required"));
});

test("takes the deployment branch only after explicit approval", async () => {
  const events = [];
  const agent = new CodingAgent({
    scanner: async () => ({ files: [], testFiles: [], documents: {} }),
    gateway: { invoke: async () => ({ content: "proposal", usage: {} }) },
    timeline: { record: async (type, payload) => events.push({ type, ...payload }) }
  });
  const state = await agent.execute({ request: "Deploy the app", repository: ".", approved: true });
  assert.equal(state.phase, "deployment");
  assert.ok(events.some((event) => event.type === "deployment_requested"));
  assert.ok(!events.some((event) => event.type === "human_approval_required"));
});

test("applies approved changes and records validation output", async () => {
  const calls = [];
  const tools = {
    previewChanges: async (_repo, changes) => changes.map((change) => ({ ...change, changed: true })),
    applyChanges: async (_repo, changes) => changes.map((change) => change.path),
    run: async (command) => { calls.push(command); return { command, exitCode: 0, output: "ok" }; }
  };
  const agent = new CodingAgent({
    scanner: async () => ({ files: [], testFiles: [], documents: {} }),
    gateway: { invoke: async () => ({ content: "proposal", usage: {} }) },
    timeline: { record: async () => {} },
    tools
  });
  const state = await agent.execute({ request: "Add an endpoint", repository: ".", approved: true, proposedChanges: [{ path: "src/health.js", content: "export default 'ok';" }], validationCommands: [["npm", "test"]] });
  assert.deepEqual(state.modifiedFiles, ["src/health.js"]);
  assert.equal(state.tests.status, "passed");
  assert.deepEqual(calls, [["npm", "test"]]);
});

test("captures a debugger recommendation when validation fails", async () => {
  const agent = new CodingAgent({
    scanner: async () => ({ files: [], testFiles: [], documents: {} }),
    gateway: { invoke: async ({ model }) => ({ content: `${model} response`, usage: {} }) },
    timeline: { record: async () => {} },
    tools: { previewChanges: async () => [], applyChanges: async () => [], run: async (command) => ({ command, exitCode: 1, output: "failed" }) }
  });
  const state = await agent.execute({ request: "Fix failing test", repository: ".", approved: true, validationCommands: [["npm", "test"]] });
  assert.equal(state.phase, "needs_debugging");
  assert.equal(state.debugRecommendation, "reasoning response");
});

test("blocks unsafe generated changes even when approval is supplied", async () => {
  const agent = new CodingAgent({
    scanner: async () => ({ files: [], testFiles: [], documents: {}, validationCommands: [] }),
    gateway: { invoke: async () => ({ content: "proposal", usage: {} }) },
    timeline: { record: async () => {} },
    tools: { previewChanges: async () => { throw new Error("must not write"); } }
  });
  const state = await agent.execute({ request: "Run command", repository: ".", approved: true, proposedChanges: [{ path: "src/run.js", content: "exec(command, { shell: true })" }] });
  assert.equal(state.phase, "security_review_required");
  assert.equal(state.review.status, "blocked_security_review");
});

test("retries one safe model repair only when auto-repair is explicitly enabled", async () => {
  let validationRuns = 0;
  const applied = [];
  const agent = new CodingAgent({
    scanner: async () => ({ files: [], testFiles: [], documents: {}, validationCommands: [] }),
    gateway: { invoke: async ({ model }) => model === "reasoning"
      ? { content: '{"summary":"fix test","changes":[{"path":"src/app.js","content":"fixed"}]}', usage: {} }
      : { content: "proposal", usage: {} } },
    timeline: { record: async () => {} },
    tools: {
      previewChanges: async (_repo, changes) => changes.map((change) => ({ ...change, changed: true })),
      applyChanges: async (_repo, changes) => { applied.push(changes[0].content); return changes.map((change) => change.path); },
      run: async (command) => ({ command, exitCode: validationRuns++ ? 0 : 1, output: "test" })
    }
  });
  const state = await agent.execute({ request: "Fix app", repository: ".", approved: true, autoRepair: true, proposedChanges: [{ path: "src/app.js", content: "broken" }], validationCommands: [["npm", "test"]] });
  assert.equal(state.phase, "deployment");
  assert.equal(state.repairAttempts, 1);
  assert.deepEqual(applied, ["broken", "fixed"]);
});
