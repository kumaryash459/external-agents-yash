import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { spawn } from "node:child_process";

function workspacePath(repository, candidate) {
  if (typeof candidate !== "string" || !candidate) throw new Error("A change path is required.");
  const target = resolve(repository, candidate);
  const pathFromRoot = relative(repository, target);
  if (pathFromRoot === "" || pathFromRoot.startsWith("..") || /^(?:[\\/]|[A-Za-z]:)/.test(pathFromRoot)) {
    throw new Error(`Change path escapes the repository: ${candidate}`);
  }
  return target;
}

export class WorkspaceTools {
  async previewChanges(repository, changes = []) {
    return Promise.all(changes.map(async (change) => {
      const target = workspacePath(repository, change.path);
      let before = "";
      try { before = await readFile(target, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
      return { path: change.path, before, after: change.content, changed: before !== change.content };
    }));
  }

  async applyChanges(repository, changes = []) {
    const previews = await this.previewChanges(repository, changes);
    for (const change of previews.filter((item) => item.changed)) {
      const target = workspacePath(repository, change.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, change.after, "utf8");
    }
    return previews.filter((item) => item.changed).map(({ path }) => path);
  }

  async run(command, cwd) {
    if (!Array.isArray(command) || command.length === 0 || !command.every((part) => typeof part === "string")) {
      throw new Error("Validation commands must be non-empty string arrays.");
    }
    return new Promise((resolveRun, reject) => {
      const child = spawn(command[0], command.slice(1), { cwd, shell: false, windowsHide: true });
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.on("data", (chunk) => { output += chunk; });
      child.on("error", reject);
      child.on("close", (exitCode) => resolveRun({ command, exitCode, output: output.slice(-12000) }));
    });
  }
}
