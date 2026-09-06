export function evaluateRun(state) {
  const checks = [
    { name: "requirement_coverage", passed: Boolean(state.plan?.acceptanceCriteria?.length) },
    { name: "security_review", passed: state.review?.status !== "blocked_security_review" },
    { name: "validation", passed: ["passed", "skipped", "not_run"].includes(state.tests?.status) },
    { name: "human_approval", passed: !state.modifiedFiles?.length || state.phase !== "awaiting_approval" }
  ];
  return { score: checks.filter((check) => check.passed).length / checks.length, checks };
}
