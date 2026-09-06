import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export class EntireTimeline {
  constructor(path, clock = () => new Date().toISOString()) {
    this.path = path;
    this.clock = clock;
    this.events = [];
  }

  async record(type, payload = {}) {
    const event = { timestamp: this.clock(), type, ...payload };
    this.events.push(event);
    if (this.path) {
      await mkdir(dirname(this.path), { recursive: true });
      await appendFile(this.path, `${JSON.stringify(event)}\n`, "utf8");
    }
    return event;
  }
}
