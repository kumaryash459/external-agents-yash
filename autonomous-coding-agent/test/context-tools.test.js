import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepository } from "../src/context.js";
import { WorkspaceTools } from "../src/tools.js";

test("treats a missing repository as a new project", async () => {
  const context = await scanRepository(join(tmpdir(), "agent-missing-project"));
  assert.equal(context.architecture.projectType, "new");
  assert.deepEqual(context.files, []);
});

test("rejects changes that escape the selected repository", async () => {
  const repository = await mkdtemp(join(tmpdir(), "agent-workspace-"));
  await assert.rejects(new WorkspaceTools().previewChanges(repository, [{ path: "../outside.js", content: "unsafe" }]), /escapes the repository/);
});
