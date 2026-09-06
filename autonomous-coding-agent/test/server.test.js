import assert from "node:assert/strict";
import test from "node:test";
import { createAgentServer } from "../src/server.js";

test("exposes a local health endpoint, workbench, and workflow API", async (t) => {
  const server = createAgentServer({ agentFactory: ({ timeline }) => ({ execute: async (input) => { await timeline.record("plan_created", { steps: ["review"] }); return { phase: "awaiting_approval", request: input.request }; } }) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await (await fetch(`${base}/health`)).json(), { status: "ok" });
  assert.match(await (await fetch(`${base}/`)).text(), /Development workbench/);
  const accepted = await (await fetch(`${base}/api/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: "Add health" }) })).json();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const run = await (await fetch(`${base}/api/runs/${accepted.id}`)).json();
  assert.equal(run.status, "completed");
  assert.equal(run.state.request, "Add health");
  assert.equal(run.events[0].type, "plan_created");
});
