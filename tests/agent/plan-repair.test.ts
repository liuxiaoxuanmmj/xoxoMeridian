import { describe, expect, it } from "vitest";

import { buildClarifyPlan, repairPlan } from "@/agent/plan-repair";
import { validatePlan } from "@/agent/plan-validator";
import type { AgentPlan } from "@/agent/types";

function makePlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    intent: "schedule",
    confidence: 1,
    requiredTools: [],
    taskSteps: [],
    finalResponsePlan: "",
    finalResponseText: "",
    toolInputs: {},
    ...overrides
  };
}

describe("repairPlan", () => {
  it("flips runOnce=true on schedule.create when user wording is one-shot", () => {
    const prompt = "在北京时间今晚十点零二分，给我发送一次苏轼的诗歌";
    const plan = makePlan({
      requiredTools: ["schedule.create"],
      finalResponseText: "好的，今晚十点零二分给你发苏轼的诗词。",
      toolInputs: {
        "schedule.create": { cron: "2 22 * * *", timezone: "Asia/Shanghai", prompt: "发诗" }
      }
    });

    const issues = validatePlan(plan, prompt);
    expect(issues.map((i) => i.code)).toContain("recurring_schedule_for_one_shot");

    const { repaired, remainingIssues } = repairPlan(plan, prompt, issues);
    const createInput = (repaired.toolInputs["schedule.create"] as Record<string, unknown>);
    expect(createInput.runOnce).toBe(true);
    expect(remainingIssues).toEqual([]);
  });

  it("repairs an array of schedule.create entries", () => {
    const prompt = "今晚八点和明早九点各给我发一次诗";
    const plan = makePlan({
      requiredTools: ["schedule.create"],
      finalResponseText: "好的，今晚八点给你发一次，明早九点再发一次。",
      toolInputs: {
        "schedule.create": [
          { cron: "0 20 * * *", prompt: "发诗", timezone: "Asia/Shanghai" },
          { cron: "0 9 * * *", prompt: "发诗", timezone: "Asia/Shanghai" }
        ]
      }
    });

    const issues = validatePlan(plan, prompt);
    const { repaired, remainingIssues } = repairPlan(plan, prompt, issues);

    const inputs = repaired.toolInputs["schedule.create"] as Array<Record<string, unknown>>;
    expect(inputs.every((i) => i.runOnce === true)).toBe(true);
    expect(remainingIssues).toEqual([]);
  });

  it("removes runOnce=true on schedule.update when reply promises recurrence", () => {
    const prompt = "改成每天早上都提醒";
    const plan = makePlan({
      requiredTools: ["schedule.update"],
      finalResponseText: "好的，以后每天早上都会提醒。",
      toolInputs: {
        "schedule.update": { jobId: "j-1", runOnce: true }
      }
    });

    const issues = validatePlan(plan, prompt);
    expect(issues.map((i) => i.code)).toContain("recurring_promise_with_run_once");

    const { repaired, remainingIssues } = repairPlan(plan, prompt, issues);
    const updateInput = repaired.toolInputs["schedule.update"] as Record<string, unknown>;
    expect(updateInput.runOnce).toBe(false);
    expect(remainingIssues).toEqual([]);
  });

  it("removes runOnce=true on schedule.create entries when reply promises recurrence", () => {
    const prompt = "以后每天早上都给我发诗";
    const plan = makePlan({
      requiredTools: ["schedule.create"],
      finalResponseText: "好的，以后每天早上都会发诗。",
      toolInputs: {
        "schedule.create": {
          cron: "0 8 * * *",
          timezone: "Asia/Shanghai",
          prompt: "发诗",
          runOnce: true
        }
      }
    });

    const issues = validatePlan(plan, prompt);
    expect(issues.map((i) => i.code)).toContain("recurring_promise_with_run_once");

    const { repaired, remainingIssues } = repairPlan(plan, prompt, issues);
    const createInput = repaired.toolInputs["schedule.create"] as Record<string, unknown>;
    expect(createInput.runOnce).toBe(false);
    expect(remainingIssues).toEqual([]);
  });

  it("cannot repair one_shot_promise_without_create and keeps the issue as remaining", () => {
    const prompt = "今晚八点，我没有说是每晚八点";
    const plan = makePlan({
      requiredTools: ["schedule.list", "schedule.cancel"],
      finalResponseText: "明白了，今晚八点只发一次就好。",
      toolInputs: {
        "schedule.list": {},
        "schedule.cancel": { jobId: "j-1" }
      }
    });

    const issues = validatePlan(plan, prompt);
    expect(issues.map((i) => i.code)).toContain("one_shot_promise_without_create");

    const { remainingIssues } = repairPlan(plan, prompt, issues);
    expect(remainingIssues.map((i) => i.code)).toContain("one_shot_promise_without_create");
  });

  it("returns the same plan unchanged when there are no issues", () => {
    const plan = makePlan({
      requiredTools: ["schedule.create"],
      finalResponseText: "好的，以后每天晚上八点都发。",
      toolInputs: { "schedule.create": { cron: "0 20 * * *", prompt: "发诗" } }
    });
    const { repaired, remainingIssues } = repairPlan(plan, "以后每天晚上八点给我发诗", []);
    expect(repaired).toEqual(plan);
    expect(remainingIssues).toEqual([]);
  });
});

describe("buildClarifyPlan", () => {
  it("produces a context-specific message for missing-create-after-cancel", () => {
    const plan = buildClarifyPlan(
      [
        {
          code: "one_shot_promise_without_create",
          message: "demo"
        }
      ],
      "今晚八点只发一次"
    );
    expect(plan.intent).toBe("clarify_schedule");
    expect(plan.requiredTools).toEqual([]);
    expect(plan.toolInputs).toEqual({});
    expect(plan.finalResponseText).toMatch(/取消|新.*?安排|什么时候/);
  });

  it("falls back to a generic ask when issue code is unknown", () => {
    const plan = buildClarifyPlan(
      [
        {
          code: "recurring_schedule_for_one_shot",
          message: "demo"
        }
      ],
      "今晚八点"
    );
    // Even when residual issue is one we *can* normally repair, the helper still
    // produces a non-empty clarification — defensive default.
    expect(plan.finalResponseText.length).toBeGreaterThan(0);
    expect(plan.intent).toBe("clarify_schedule");
  });
});
