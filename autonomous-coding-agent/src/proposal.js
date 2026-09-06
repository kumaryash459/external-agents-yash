function asChanges(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((change) => change && typeof change.path === "string" && typeof change.content === "string");
}

export function parseProposal(content) {
  const candidate = String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(candidate);
    return { summary: parsed.summary ?? "", changes: asChanges(parsed.changes), tests: Array.isArray(parsed.tests) ? parsed.tests : [] };
  } catch {
    return { summary: String(content), changes: [], tests: [] };
  }
}

export function reviewChanges(changes) {
  const checks = [
    { id: "dynamic-eval", pattern: /\beval\s*\(/, severity: "high", message: "Avoid dynamic eval in generated code." },
    { id: "shell-execution", pattern: /shell\s*:\s*true/, severity: "high", message: "Do not enable shell execution for commands." },
    { id: "embedded-secret", pattern: /(?:api[_-]?key|password|secret)\s*[:=]\s*["'][^"']{8,}/i, severity: "high", message: "Do not embed credentials in source files." }
  ];
  return changes.flatMap((change) => checks.filter((check) => check.pattern.test(change.content)).map((check) => ({ ...check, path: change.path })));
}
