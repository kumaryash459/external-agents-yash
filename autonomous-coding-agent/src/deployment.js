const providers = {
  docker: ({ image = "autonomous-coding-agent:latest" }) => ["docker", "build", "-t", image, "."],
  vercel: ({ production = false }) => ["vercel", ...(production ? ["--prod"] : [])],
  netlify: ({ production = false }) => ["netlify", "deploy", ...(production ? ["--prod"] : [])]
};

export class DeploymentManager {
  constructor({ tools }) { this.tools = tools; }

  async deploy(repository, config = {}) {
    if (!config.enabled) return { status: "not_requested" };
    const command = config.command ?? providers[config.provider]?.(config);
    if (!command) throw new Error("Choose deployment.provider (docker, vercel, netlify) or provide deployment.command.");
    const result = await this.tools.run(command, repository);
    return { provider: config.provider ?? "command", ...result, status: result.exitCode === 0 ? "deployed" : "failed" };
  }
}
