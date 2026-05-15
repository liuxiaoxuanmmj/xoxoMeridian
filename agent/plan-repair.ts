import { toArray, validatePlan, type PlanValidationIssue } from "@/agent/plan-validator";
import type { AgentPlan } from "@/agent/types";

export type RepairResult = {
  repaired: AgentPlan;
  remainingIssues: PlanValidationIssue[];
};

function clonePlan(plan: AgentPlan): AgentPlan {
  return {
    ...plan,
    requiredTools: [...plan.requiredTools],
    taskSteps: [...plan.taskSteps],
    toolInputs: structuredClone(plan.toolInputs)
  };
}

function patchToolInputs(
  plan: AgentPlan,
  tool: string,
  patch: (entry: Record<string, unknown>) => void
) {
  for (const entry of toArray(plan.toolInputs[tool])) patch(entry);
}

export function repairPlan(
  plan: AgentPlan,
  prompt: string,
  issues: PlanValidationIssue[]
): RepairResult {
  if (issues.length === 0) {
    return { repaired: plan, remainingIssues: [] };
  }

  const repaired = clonePlan(plan);
  const codes = new Set(issues.map((i) => i.code));

  if (codes.has("recurring_schedule_for_one_shot")) {
    patchToolInputs(repaired, "schedule.create", (entry) => {
      entry.runOnce = true;
    });
  }

  if (codes.has("recurring_promise_with_run_once")) {
    patchToolInputs(repaired, "schedule.update", (entry) => {
      if (entry.runOnce === true) entry.runOnce = false;
    });
    patchToolInputs(repaired, "schedule.create", (entry) => {
      if (entry.runOnce === true) entry.runOnce = false;
    });
  }

  // one_shot_promise_without_create needs a fireAt/dueAt we can't invent —
  // leave as residual so caller falls back to clarification.

  const remainingIssues = validatePlan(repaired, prompt);
  return { repaired, remainingIssues };
}

export function buildClarifyPlan(
  remainingIssues: PlanValidationIssue[],
  _prompt: string
): AgentPlan {
  const codes = new Set(remainingIssues.map((i) => i.code));

  let finalResponseText: string;
  if (codes.has("one_shot_promise_without_create")) {
    finalResponseText =
      "之前那个已经帮你取消了。要不要再新安排一次？告诉我具体什么时候发，我马上排上。";
  } else if (codes.size === 0) {
    finalResponseText =
      "我对你说的时间还有点不确定，能再具体说一下吗？例如「今晚 22:00 发一次」或者「以后每晚 22:00 都发」。";
  } else {
    finalResponseText =
      "我刚才不太确定你是要只发一次还是以后每天都发——你说一下，我按你说的来。";
  }

  return {
    intent: "clarify_schedule",
    confidence: 0,
    requiredTools: [],
    taskSteps: ["一致性校验未通过且无法自动修复，改为请用户澄清"],
    finalResponsePlan: "由于时间或意图无法确认，让用户再确认一次。",
    finalResponseText,
    toolInputs: {}
  };
}
