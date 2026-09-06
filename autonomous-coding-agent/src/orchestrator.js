import { resolve } from "node:path";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { scanRepository } from "./context.js";
import { DatabricksGateway } from "./gateway.js";
import { EntireTimeline } from "./timeline.js";
import { WorkspaceTools } from "./tools.js";
import { parseProposal, reviewChanges } from "./proposal.js";
import { DeploymentManager } from "./deployment.js";
import { EntireIntegration } from "./entire.js";
import { evaluateRun } from "./evaluation.js";
import { ProjectMemory } from "./memory.js";

export function routeModel(request) {
  if (/\b(debug|error|fail(?:ing|ed|ure)?|security|review)\b/i.test(request)) return "reasoning";
  if (/\b(readme|docs?|summari[sz]e|rename)\b/i.test(request)) return "fast";
  return "coding";
}

export class CodingAgent {
  constructor({ gateway = new DatabricksGateway(), scanner = scanRepository, timeline, tools = new WorkspaceTools(), deployer, entire } = {}) {
    this.gateway = gateway;
    this.scanner = scanner;
    this.timeline = timeline;
    this.tools = tools;
    this.deployer = deployer ?? new DeploymentManager({ tools });
    this.entire = entire ?? new EntireIntegration({ tools });
  }

  async execute(input) {
    const tracePath = input.tracePath ? resolve(input.repository ?? ".", input.tracePath) : undefined;
    const timeline = this.timeline ?? new EntireTimeline(tracePath);
    const memory = input.memory?.enabled ? new ProjectMemory(resolve(input.repository ?? ".")) : undefined;
    const State = Annotation.Root({ input: Annotation(), state: Annotation() });
    const update = (state) => ({ state });
    const graph = new StateGraph(State)
      .addNode("start_request", async ({ input }) => {
        const state = { request: input.request, repository: resolve(input.repository ?? "."), inputChanges: input.proposedChanges ?? [], phase: "context", errors: [], diffs: [], toolResults: [], repairAttempts: 0, memory: memory ? await memory.recent() : [] };
        await timeline.record("user_prompt", { request: state.request });
        return update(state);
      })
      .addNode("context", async ({ state }) => {
        state.context = await this.scanner(state.repository);
        await timeline.record("repository_scanned", { file_count: state.context.files.length, test_file_count: state.context.testFiles.length, project_type: state.context.architecture?.projectType, branch: state.context.git?.branch });
        return update(state);
      })
      .addNode("analyze", async ({ state }) => {
        state.phase = "analyze";
        state.requirements = { request: state.request, risk: /\b(auth|delete|deploy|payment|security)\b/i.test(state.request) ? "high" : "normal" };
        await timeline.record("task_analyzed", state.requirements);
        return update(state);
      })
      .addNode("plan", async ({ state }) => {
        state.phase = "plan";
        state.plan = { steps: ["inspect affected modules", "implement scoped change", "run existing and new tests"], acceptanceCriteria: ["requested behavior works", "tests pass"] };
        await timeline.record("plan_created", state.plan);
        return update(state);
      })
      .addNode("route", async ({ state }) => {
        state.model = routeModel(state.request);
        await timeline.record("model_routed", { model_role: state.model });
        return update(state);
      })
      .addNode("code", async ({ state }) => {
        state.phase = "code";
        const result = await this.gateway.invoke({ model: state.model, task: `Produce a scoped coding proposal for: ${state.request}\nReturn JSON only: {"summary":"...","changes":[{"path":"relative/path","content":"full file content"}],"tests":["test intent"]}. Do not include credentials or shell commands.`, state });
        state.proposal = parseProposal(result.content);
        state.changes = state.inputChanges.length ? state.inputChanges : state.proposal.changes;
        await timeline.record("agent_response", { model_role: state.model, response: state.proposal.summary, usage: result.usage });
        await timeline.record("code_generation_completed", { diff_count: state.changes.length });
        return update(state);
      })
      .addNode("test", async ({ state }) => {
        state.phase = "test";
        state.tests = { status: "not_run", strategy: "Run existing tests plus regression coverage for the requested change.", suggestedCommands: state.context.validationCommands };
        await timeline.record("test_strategy_created", state.tests);
        return update(state);
      })
      .addNode("review", async ({ state }) => {
        state.review = { status: "pending_human_approval", checks: ["correctness", "security", "requirements"], proposedFiles: state.changes.map((change) => change.path), findings: reviewChanges(state.changes) };
        if (state.review.findings.some((finding) => finding.severity === "high")) state.review.status = "blocked_security_review";
        await timeline.record("code_review_completed", state.review);
        return update(state);
      })
      .addNode("approval", async ({ input, state }) => {
        const blocked = state.review.status === "blocked_security_review";
        state.phase = blocked ? "security_review_required" : "awaiting_approval";
        await timeline.record(blocked ? "security_review_required" : input.approved ? "human_approval_confirmed" : "human_approval_required", { reason: blocked ? "High-risk generated content requires an explicit security review." : "Review the planned file changes before writes and validation run." });
        return update(state);
      })
      .addNode("apply", async ({ input, state }) => {
        state.phase = "apply";
        state.diffs = await this.tools.previewChanges(state.repository, state.changes);
        state.modifiedFiles = await this.tools.applyChanges(state.repository, state.changes);
        await timeline.record("files_modified", { files: state.modifiedFiles, diff_count: state.diffs.filter((diff) => diff.changed).length });
        return update(state);
      })
      .addNode("validate", async ({ input, state }) => {
        state.phase = "validate";
        const commands = input.validationCommands ?? state.context.validationCommands ?? [];
        state.tests.results = [];
        for (const command of commands) {
          const result = await this.tools.run(command, state.repository);
          state.tests.results.push(result);
          await timeline.record("terminal_command", result);
        }
        state.tests.status = state.tests.results.some((result) => result.exitCode !== 0) ? "failed" : commands.length ? "passed" : "skipped";
        await timeline.record("test_results", { status: state.tests.status, results: state.tests.results });
        return update(state);
      })
      .addNode("debug", async ({ input, state }) => {
        state.phase = "needs_debugging";
        const result = await this.gateway.invoke({ model: "reasoning", task: `Diagnose failed validation: ${JSON.stringify(state.tests.results)}\nReturn JSON only: {"summary":"root cause","changes":[{"path":"relative/path","content":"full file content"}]}.`, state });
        const repair = parseProposal(result.content);
        state.debugRecommendation = repair.summary;
        const mayRepair = input.autoRepair === true && state.repairAttempts < (input.maxRepairAttempts ?? 1) && repair.changes.length > 0 && reviewChanges(repair.changes).every((finding) => finding.severity !== "high");
        if (mayRepair) {
          state.repairAttempts += 1;
          state.changes = repair.changes;
          state.phase = "repairing";
        }
        await timeline.record("error_analyzed", { recommendation: state.debugRecommendation, auto_repair: mayRepair, repair_attempt: state.repairAttempts });
        return update(state);
      })
      .addNode("deploy", async ({ input, state }) => {
        state.phase = "deployment";
        state.deployment = await this.deployer.deploy(state.repository, input.deployment);
        await timeline.record("deployment_requested", state.deployment);
        return update(state);
      })
      .addNode("entire", async ({ input, state }) => {
        state.entire = await this.entire.enable(state.repository, input.entire);
        if (state.entire.status === "enabled") state.entire.verification = await this.entire.verify(state.repository);
        await timeline.record("entire_integration", state.entire);
        return update(state);
      })
      .addEdge(START, "start_request").addEdge("start_request", "context").addEdge("context", "analyze")
      .addEdge("analyze", "plan").addEdge("plan", "route").addEdge("route", "code").addEdge("code", "test").addEdge("test", "review").addEdge("review", "approval")
      .addConditionalEdges("approval", ({ input, state }) => input.approved && state.review.status !== "blocked_security_review" ? "entire" : END)
      .addEdge("entire", "apply")
      .addEdge("apply", "validate").addConditionalEdges("validate", ({ state }) => state.tests.status === "failed" ? "debug" : "deploy")
      .addConditionalEdges("debug", ({ state }) => state.phase === "repairing" ? "apply" : END).addEdge("deploy", END).compile();
    const state = (await graph.invoke({ input })).state;
    state.evaluation = evaluateRun(state);
    await timeline.record("evaluation_completed", state.evaluation);
    if (memory) await memory.record(state);
    return state;
  }
}
