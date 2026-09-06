import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export class ProjectMemory {
  constructor(repository) { this.path = join(repository, ".entire", "autonomous-agent", "memory.jsonl"); }

  async recent(limit = 5) {
    try { return (await readFile(this.path, "utf8")).trim().split("\n").filter(Boolean).slice(-limit).map(JSON.parse); } catch (error) { if (error.code === "ENOENT") return []; throw error; }
  }

  async record(state) {
    await mkdir(dirname(this.path), { recursive: true });
    const entry = { timestamp: new Date().toISOString(), request: state.request, phase: state.phase, modifiedFiles: state.modifiedFiles ?? [], evaluation: state.evaluation };
    await appendFile(this.path, `${JSON.stringify(entry)}\n`, "utf8");
    return entry;
  }
}
