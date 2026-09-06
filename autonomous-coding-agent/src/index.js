import { CodingAgent } from "./orchestrator.js";
import { listen } from "./server.js";

if (process.argv.includes("--serve")) {
  listen();
} else {
let raw = "";
for await (const chunk of process.stdin) raw += chunk;
if (!raw.trim()) throw new Error("Provide a JSON request on stdin.");
const state = await new CodingAgent().execute(JSON.parse(raw));
process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
}
