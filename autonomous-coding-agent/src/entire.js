export class EntireIntegration {
  constructor({ tools }) { this.tools = tools; }

  async diagnose(repository) {
    try {
      const version = await this.tools.run(["entire", "--version"], repository);
      return { available: version.exitCode === 0, version: version.output.trim() };
    } catch {
      return { available: false, reason: "The Entire CLI is not on PATH." };
    }
  }

  async enable(repository, config = {}) {
    if (!config.enable || !config.agent) return { status: "not_requested" };
    const command = config.initialSetup
      ? ["entire", "enable", "--agent", config.agent]
      : ["entire", "agent", "add", config.agent];
    const result = await this.tools.run(command, repository);
    return { status: result.exitCode === 0 ? "enabled" : "failed", hookConfig: config.agent === "codex" ? ".codex/hooks.json" : undefined, ...result };
  }

  async verify(repository) {
    const [agents, status] = await Promise.all([
      this.tools.run(["entire", "agent", "list"], repository),
      this.tools.run(["entire", "status", "--detailed"], repository)
    ]);
    return { agents, status, healthy: agents.exitCode === 0 && status.exitCode === 0 };
  }
}
