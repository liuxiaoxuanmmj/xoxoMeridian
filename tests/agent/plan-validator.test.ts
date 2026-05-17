import { describe, expect, it } from "vitest";

import { validatePlan, formatIssuesForLLM } from "@/agent/plan-validator";
import type { AgentPlan } from "@/agent/types";

function makePlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    intent: "test",
    confidence: 1,
    requiredTools: [],
    taskSteps: [],
    finalResponsePlan: "",
    finalResponseText: "",
    toolInputs: {},
    ...overrides
  };
}

describe("validatePlan", () => {
  it("passes when schedule.create for a clearly recurring request is recurring", () => {
    const plan = makePlan({
      requiredTools: ["schedule.create"],
      finalResponseText: "好的，以后每天晚上八点我都会给你发一首苏轼的诗词。",
      toolInputs: {
        "schedule.create": { cron: "0 20 * * *", timezone: "Asia/Shanghai", prompt: "发诗" }
      }
    });
    expect(validatePlan(plan, "以后每天晚上八点给我发一首苏轼的诗词")).toEqual([]);
  });

  it("flags recurring schedule.create when user said 今晚 (one-shot)", () => {
    const plan = makePlan({
      requiredTools: ["schedule.create"],
      finalResponseText: "好的，我已经帮你设置好了，以后每天晚上八点都发。",
      toolInputs: {
        "schedule.create": { cron: "0 20 * * *", timezone: "Asia/Shanghai", prompt: "发诗" }
      }
    });
    const issues = validatePlan(plan, "在北京时间的今晚八点，给我发送一首苏轼的诗词");
    expect(issues.map((i) => i.code)).toContain("recurring_schedule_for_one_shot");
  });

  it("accepts schedule.create with runOnce=true for one-shot wording", () => {
    const plan = makePlan({
      requiredTools: ["schedule.create"],
      finalResponseText: "好的，今晚八点给你发一首苏轼诗词。",
      toolInputs: {
        "schedule.create": {
          cron: "0 20 * * *",
          timezone: "Asia/Shanghai",
          prompt: "发诗",
          runOnce: true
        }
      }
    });
    expect(validatePlan(plan, "今晚八点给我发一首苏轼的诗词")).toEqual([]);
  });

  it("flags cancel-only plan when reply promises one-shot fire", () => {
    const plan = makePlan({
      requiredTools: ["schedule.list", "schedule.cancel"],
      finalResponseText: "明白了，今晚八点只发一次就好。",
      toolInputs: {
        "schedule.list": {},
        "schedule.cancel": { jobId: "j-1" }
      }
    });
    const issues = validatePlan(plan, "今晚八点，我没有说是每晚八点");
    expect(issues.map((i) => i.code)).toContain("one_shot_promise_without_create");
  });

  it("does not flag cancel-only when reply is a plain cancel confirmation", () => {
    const plan = makePlan({
      requiredTools: ["schedule.cancel"],
      finalResponseText: "好的，已经把那个任务取消掉。",
      toolInputs: {
        "schedule.cancel": { jobId: "j-1" }
      }
    });
    expect(validatePlan(plan, "把那个任务取消掉")).toEqual([]);
  });

  it("does not flag cancel-only when reply mentions 今晚发 inside a cancel-ack", () => {
    // This is the exact regression from the logs: the user typed "删除定时任务",
    // the agent correctly cancelled, and the reply happened to mention what was
    // cancelled ("已取消今晚发苏轼诗词的任务"). The old greedy /今晚.*?发/ would
    // light up Issue A and the runtime would replace the reply with the safe
    // fallback. With the cancel-ack guard + tightened regex, no issue should fire.
    const plan = makePlan({
      requiredTools: ["schedule.cancel"],
      finalResponseText: "好的，已取消今晚发苏轼诗词的任务。",
      toolInputs: {
        "schedule.cancel": { jobId: "j-1" }
      }
    });
    expect(validatePlan(plan, "删除定时任务")).toEqual([]);
  });

  it("flags a plan that promises 每天 but uses schedule.update runOnce=true", () => {
    const plan = makePlan({
      requiredTools: ["schedule.update"],
      finalResponseText: "好的，以后每天早上都会提醒。",
      toolInputs: {
        "schedule.update": { jobId: "j-1", runOnce: true }
      }
    });
    const issues = validatePlan(plan, "改成每天早上都提醒");
    expect(issues.map((i) => i.code)).toContain("recurring_promise_with_run_once");
  });

  it("accepts cancel + schedule.create(fireAt) replacement for one-shot correction", () => {
    const plan = makePlan({
      requiredTools: ["schedule.cancel", "schedule.create"],
      finalResponseText: "明白了，今晚八点只发一次就好。",
      toolInputs: {
        "schedule.cancel": { jobId: "j-1" },
        "schedule.create": {
          fireAt: "2026-05-09T20:00:00+08:00",
          timezone: "Asia/Shanghai",
          prompt: "发苏轼诗词"
        }
      }
    });
    expect(validatePlan(plan, "今晚八点，我没有说是每晚八点")).toEqual([]);
  });

  it("formatIssuesForLLM produces numbered human-readable output", () => {
    const text = formatIssuesForLLM([
      { code: "one_shot_promise_without_create", message: "A" },
      { code: "recurring_schedule_for_one_shot", message: "B" }
    ]);
    expect(text).toMatch(/1\.\s*\[one_shot_promise_without_create\]\s*A/);
    expect(text).toMatch(/2\.\s*\[recurring_schedule_for_one_shot\]\s*B/);
  });
});
