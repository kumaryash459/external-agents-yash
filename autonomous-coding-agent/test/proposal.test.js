import assert from "node:assert/strict";
import test from "node:test";
import { parseProposal, reviewChanges } from "../src/proposal.js";

test("accepts a structured coding proposal", () => {
  const proposal = parseProposal('```json\n{"summary":"add health","changes":[{"path":"src/health.js","content":"export default 200;"}],"tests":["npm test"]}\n```');
  assert.equal(proposal.summary, "add health");
  assert.equal(proposal.changes[0].path, "src/health.js");
});

test("flags unsafe generated source before approval", () => {
  const findings = reviewChanges([{ path: "src/run.js", content: "childProcess.exec(command, { shell: true })" }]);
  assert.equal(findings[0].id, "shell-execution");
  assert.equal(findings[0].severity, "high");
});
