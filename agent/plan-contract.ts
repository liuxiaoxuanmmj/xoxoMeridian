import { z } from "zod";

import type { ToolRegistry } from "@/agent/tool-registry";
import type { AgentPlan } from "@/agent/types";

const agentPlanSchema = z.object({
  intent: z.string().min(1),
  confidence: z.number().min(0).max(1),
  requiredTools: z.array(z.string().min(1)),
  taskSteps: z.array(z.string()),
  finalResponsePlan: z.string(),
  finalResponseText: z.string(),
  toolInputs: z.record(z.string(), z.unknown())
});

type PlanSource = "planner" | "persisted" | "repaired";
type ContractIssue = {
  code: "invalid_json" | "invalid_structure" | "unknown_tool" | "tool_not_allowed"
    | "duplicate_tool" | "missing_tool_input" | "unexpected_tool_input"
    | "empty_tool_calls" | "invalid_tool_input";
  path: string;
  schemaCode?: string;
};

const MAX_ISSUES = 8;

export class AgentPlanValidationError extends Error {
  readonly category = "validation";
  readonly issues: ContractIssue[];

  constructor(readonly source: PlanSource, issues: ContractIssue[]) {
    const boundedIssues = issues.slice(0, MAX_ISSUES);
    super(`Agent plan validation failed (${source}): ${boundedIssues
      .map((issue) => `${issue.code} at ${issue.path}`)
      .join("; ")}`.slice(0, 512));
    this.name = "AgentPlanValidationError";
    this.issues = boundedIssues;
  }
}

export function parseAgentPlan(
  value: unknown,
  registry: ToolRegistry,
  allowedToolNames: readonly string[],
  source: PlanSource
): AgentPlan {
  const parsed = agentPlanSchema.safeParse(value);
  if (!parsed.success) {
    throw new AgentPlanValidationError(source, parsed.error.issues.slice(0, MAX_ISSUES).map((issue) => ({
      code: "invalid_structure",
      // 只记录固定顶层字段；任意输入 key、值和 Zod 错误正文不进入摘要。
      path: typeof issue.path[0] === "string" && issue.path[0] in agentPlanSchema.shape
        ? issue.path[0] : "plan",
      schemaCode: issue.code
    })));
  }

  const plan = parsed.data;
  const tools = new Map(registry.list().map((tool) => [tool.name, tool]));
  const allowed = new Set(allowedToolNames);
  const required = new Set<string>();
  const issues: ContractIssue[] = [];
  const addIssue = (issue: ContractIssue) => {
    if (issues.length < MAX_ISSUES) issues.push(issue);
  };

  for (const [index, name] of plan.requiredTools.entries()) {
    const path = `requiredTools.${index}`;
    if (required.has(name)) addIssue({ code: "duplicate_tool", path });
    required.add(name);
    const tool = tools.get(name);
    if (!tool) {
      addIssue({ code: "unknown_tool", path });
      continue;
    }
    if (!allowed.has(name)) addIssue({ code: "tool_not_allowed", path });
    if (!Object.hasOwn(plan.toolInputs, name)) {
      addIssue({ code: "missing_tool_input", path });
      continue;
    }
    const input = plan.toolInputs[name];
    const calls = Array.isArray(input) ? input : [input];
    if (calls.length === 0) addIssue({ code: "empty_tool_calls", path });
    for (const [callIndex, call] of calls.entries()) {
      const result = tool.inputSchema.safeParse(call);
      if (!result.success) {
        addIssue({
          code: "invalid_tool_input",
          path: `${path}.calls.${callIndex}`,
          schemaCode: result.error.issues[0]?.code
        });
      }
    }
  }
  for (const name of Object.keys(plan.toolInputs)) {
    if (!required.has(name)) addIssue({ code: "unexpected_tool_input", path: "toolInputs" });
  }
  if (issues.length > 0) throw new AgentPlanValidationError(source, issues);
  return plan;
}

export function parsePlannerResponse(
  content: string,
  registry: ToolRegistry,
  allowedToolNames: readonly string[]
): AgentPlan {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new AgentPlanValidationError("planner", [{ code: "invalid_json", path: "plan" }]);
  }
  const value = typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? raw as Record<string, unknown> : {};
  return parseAgentPlan({
    intent: value.intent,
    confidence: value.confidence,
    requiredTools: value.required_tools,
    taskSteps: value.task_steps,
    finalResponsePlan: value.final_response_plan,
    finalResponseText: value.final_response_text,
    toolInputs: value.tool_inputs
  }, registry, allowedToolNames, "planner");
}
