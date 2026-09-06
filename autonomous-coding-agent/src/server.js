import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { CodingAgent } from "./orchestrator.js";
import { ui } from "./ui.js";


function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; if (body.length > 1_000_000) request.destroy(); });
    request.on("end", () => { try { resolve(JSON.parse(body)); } catch { reject(new Error("Request body must be valid JSON.")); } });
    request.on("error", reject);
  });
}

function send(response, status, body, type = "application/json") {
  response.writeHead(status, { "Content-Type": `${type}; charset=utf-8` });
  response.end(type === "application/json" ? JSON.stringify(body) : body);
}

export function createAgentServer({ agentFactory = (options) => new CodingAgent(options) } = {}) {
  const runs = new Map();
  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/") return send(response, 200, ui, "text/html");
    if (request.method === "GET" && url.pathname === "/health") return send(response, 200, { status: "ok" });
    if (request.method === "POST" && url.pathname === "/api/runs") {
      try {
        const input = await readJson(request);
        if (!input.request || typeof input.request !== "string") return send(response, 400, { error: "request is required" });
        const id = randomUUID();
        runs.set(id, { id, status: "running" });
        const events = [];
        const timeline = { record: async (type, payload) => events.push({ timestamp: new Date().toISOString(), type, ...payload }) };
        void agentFactory({ timeline }).execute(input).then((state) => runs.set(id, { id, status: "completed", state, events })).catch((error) => runs.set(id, { id, status: "failed", error: error.message, events }));
        return send(response, 202, { id, status: "running" });
      } catch (error) { return send(response, 400, { error: error.message }); }
    }
    const match = url.pathname.match(/^\/api\/runs\/([\w-]+)$/);
    if (request.method === "GET" && match) return runs.has(match[1]) ? send(response, 200, runs.get(match[1])) : send(response, 404, { error: "run not found" });
    return send(response, 404, { error: "not found" });
  });
}

export function listen({ port = Number(process.env.PORT ?? 3000), host = process.env.HOST ?? "127.0.0.1" } = {}) {
  const server = createAgentServer();
  server.listen(port, host, () => console.log(`Autonomous Coding Agent listening on http://${host}:${port}`));
  return server;
}
