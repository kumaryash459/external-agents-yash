export class DatabricksGateway {
  constructor({ fetchImpl = fetch, host = process.env.DATABRICKS_HOST, token = process.env.DATABRICKS_TOKEN, endpoint = process.env.DATABRICKS_ENDPOINT, endpoints } = {}) {
    this.fetch = fetchImpl;
    this.host = host?.replace(/\/$/, "");
    this.token = token;
    this.endpoint = endpoint;
    this.endpoints = endpoints ?? {
      coding: process.env.DATABRICKS_CODING_ENDPOINT,
      reasoning: process.env.DATABRICKS_REASONING_ENDPOINT,
      fast: process.env.DATABRICKS_FAST_ENDPOINT
    };
  }

  async invoke({ model, task, state }) {
    const endpoint = this.endpoints[model] ?? this.endpoint;
    if (!this.host || !this.token || !endpoint) return { model, content: `[local ${model}] ${task}`, usage: { input_tokens: 0, output_tokens: 0 } };
    const response = await this.fetch(`${this.host}/serving-endpoints/${endpoint}/invocations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: task }], metadata: { workflow_state: state.phase, model_role: model } })
    });
    if (!response.ok) throw new Error(`Databricks gateway failed: ${response.status}`);
    const body = await response.json();
    return { model, content: body.choices?.[0]?.message?.content ?? JSON.stringify(body), usage: body.usage ?? {} };
  }

  configuration() {
    return {
      configured: Boolean(this.host && this.token && (this.endpoint || Object.values(this.endpoints).some(Boolean))),
      hostConfigured: Boolean(this.host),
      tokenConfigured: Boolean(this.token),
      defaultEndpointConfigured: Boolean(this.endpoint),
      roleEndpointsConfigured: Object.fromEntries(Object.entries(this.endpoints).map(([role, endpoint]) => [role, Boolean(endpoint)]))
    };
  }
}
