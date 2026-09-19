import type { AgentPlan } from "@/agent/types";

export const scheduleClarificationPrompt = "把之前的计划改成今晚八点，只发一次。";

export function cancelOnlyPlan(jobId: string): AgentPlan {
  return {
    intent: "revise_schedule",
    confidence: 0.9,
    requiredTools: ["schedule.cancel"],
    taskSteps: ["取消旧任务"],
    finalResponsePlan: "确认改为一次性任务",
    finalResponseText: "明白了，今晚八点只发一次就好。",
    toolInputs: { "schedule.cancel": { jobId } }
  };
}
