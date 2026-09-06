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
    const result = await this.tools.run(["entire", "enable", "--agent", config.agent, "--telemetry=false"], repository);
    return { status: result.exitCode === 0 ? "enabled" : "failed", ...result };
  }
}
