import assert from "node:assert/strict";
import test from "node:test";
import { DatabricksGateway } from "../src/gateway.js";

test("uses the role-specific Databricks endpoint when configured", async () => {
  let url;
  const gateway = new DatabricksGateway({
    host: "https://workspace.example/", token: "token", endpoint: "default-endpoint",
    endpoints: { coding: "coding-endpoint" },
    fetchImpl: async (value) => { url = value; return { ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }) }; }
  });
  const result = await gateway.invoke({ model: "coding", task: "work", state: { phase: "code" } });
  assert.equal(url, "https://workspace.example/serving-endpoints/coding-endpoint/invocations");
  assert.equal(result.content, "ok");
});

test("reports configuration readiness without exposing credentials", () => {
  const gateway = new DatabricksGateway({ host: "https://workspace.example", token: "secret-token", endpoint: "coding" });
  const configuration = gateway.configuration();
  assert.equal(configuration.configured, true);
  assert.equal(JSON.stringify(configuration).includes("secret-token"), false);
});
