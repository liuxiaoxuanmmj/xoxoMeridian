import type { AgentPlan } from "@/agent/types";

export type PlanValidationIssue = {
  code:
    | "one_shot_promise_without_create"
    | "recurring_schedule_for_one_shot"
    | "recurring_promise_with_run_once";
  message: string;
};

// One-off time hints in the user's utterance. Presence of these without a
// recurrence marker strongly implies a single-fire intent.
const ONE_SHOT_PROMPT_PATTERNS = [
  /今晚/, /今天晚上/, /今天中午/, /今天下午/, /今天早上/, /今儿/,
  /明天/, /明早/, /明晚/, /后天/, /大后天/,
  /下周[一二三四五六日天]/, /下个?月/,
  /\d+月\d+[日号]/, /\d+[-/]\d+[-/]\d+/,
  /\d+\s*小时后/, /\d+\s*分钟后/,
  /tomorrow/i, /tonight/i, /\bin\s+\d+\s+(hours?|minutes?|days?)/i,
];

// Recurrence markers — if any of these appear the intent is explicitly recurring.
const RECURRING_PATTERNS = [
  /每天/, /每晚/, /每早/, /每周/, /每月/, /每小时/, /每隔/, /以后(每|都)/,
  /天天/, /日日/, /每逢/,
  /\bevery\s+(day|week|month|hour|morning|night)\b/i, /\bdaily\b/i, /\bweekly\b/i,
];

// Phrases in the agent's reply that promise a single fire.
const ONE_SHOT_REPLY_PATTERNS = [
  /只.*?一次/, /仅.*?一次/, /就.*?一次/, /一次就好/, /只发一次/, /只执行一次/,
  /只.*?就好/,
  // Bounded gap: "今晚/今天/明早 + 至多 8 个非空白字 + 发|提醒|来" — keeps
  // legitimate one-shot promises in scope while excluding cancel-acknowledgements
  // such as "已取消今晚发苏轼诗词的任务" where 今晚/发 sit on opposite sides of
  // an 已取消 prefix the regex can't anchor against.
  /今晚\S{0,8}(发|提醒|来)/, /今天\S{0,8}(发|提醒|来)/, /明早\S{0,8}(发|提醒|来)/,
];

// Phrases in the agent's reply that promise recurrence.
const RECURRING_REPLY_PATTERNS = [
  /每天/, /每晚/, /每早/, /每周/, /每月/, /以后每/, /以后都/,
];

// Cancel-acknowledgement markers in the reply. When any of these match, we
// suppress the "promise without create" issue: the agent's reply describes a
// cancellation that has already happened, not a new one-shot it failed to wire.
const CANCEL_REPLY_PATTERNS = [
  /已取消/, /已删除/, /已停止/, /已关闭/, /已关停/,
  /帮你取消/, /帮你删除/, /帮你停掉/,
  /取消(了|好了)/, /删除(了|好了)/,
  /\bcancelled\b/i, /\bcanceled\b/i, /\bstopped\b/i, /\bremoved\b/i,
];

function anyMatch(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function toArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
  }
  if (value && typeof value === "object") return [value as Record<string, unknown>];
  return [];
}

export function validatePlan(plan: AgentPlan, userPrompt: string): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = [];
  const prompt = userPrompt ?? "";
  const reply = plan.finalResponseText ?? "";

  const promptOneShot = anyMatch(prompt, ONE_SHOT_PROMPT_PATTERNS);
  const promptRecurring = anyMatch(prompt, RECURRING_PATTERNS);
  const replyOneShot = anyMatch(reply, ONE_SHOT_REPLY_PATTERNS);
  const replyRecurring = anyMatch(reply, RECURRING_REPLY_PATTERNS);
  const replyCancelAck = anyMatch(reply, CANCEL_REPLY_PATTERNS);

  const tools = new Set(plan.requiredTools ?? []);
  const hasCreate = tools.has("schedule.create");
  const hasUpdate = tools.has("schedule.update");
  const hasCancel = tools.has("schedule.cancel");
  const hasReminderCreate = tools.has("reminder.create");

  const createInputs = toArray(plan.toolInputs?.["schedule.create"]);
  const updateInputs = toArray(plan.toolInputs?.["schedule.update"]);
  const anyCreateRunOnce = createInputs.some((i) => i.runOnce === true);
  const anyCreateRecurring = createInputs.some((i) => i.runOnce !== true);
  const anyUpdateRunOnceTrue = updateInputs.some((i) => i.runOnce === true);
  const anyUpdateRunOnceFalse = updateInputs.some((i) => i.runOnce === false);

  // Issue A: reply promises a one-shot fire but the tool plan only cancels —
  // no reminder.create / schedule.create / schedule.update that would actually
  // schedule the promised fire. This is the exact bug from the logs.
  // Suppress when the reply is a cancel acknowledgement: "已取消今晚发诗的任务"
  // is describing a deletion, not promising a fresh one-shot.
  if (replyOneShot && !replyCancelAck && hasCancel && !hasCreate && !hasUpdate && !hasReminderCreate) {
    issues.push({
      code: "one_shot_promise_without_create",
      message:
        "final_response_text 承诺了一次性的执行（如'今晚八点只发一次'），但 tool_inputs 里只有 schedule.cancel，没有 reminder.create、schedule.update 或 schedule.create(runOnce=true) 来真正安排这次执行。请补上替代任务。"
    });
  }

  // Issue B: user's wording is clearly one-off (今晚/明天/…/no recurrence word)
  // but the plan creates a recurring schedule without runOnce. This is the
  // first-step bug from the logs.
  if (promptOneShot && !promptRecurring && hasCreate && anyCreateRecurring && !anyCreateRunOnce) {
    issues.push({
      code: "recurring_schedule_for_one_shot",
      message:
        "用户表达的是一次性时间点（今晚/明天/具体日期等），但 schedule.create 没有设置 runOnce=true。请对该调用设置 runOnce=true，或改用 reminder.create 配合 dueAt。"
    });
  }

  // Issue C: reply promises recurrence but the plan turns an existing schedule
  // into a one-off (or creates a runOnce job). Catches the opposite mismatch.
  if (
    replyRecurring &&
    !replyOneShot &&
    ((hasCreate && anyCreateRunOnce && !anyCreateRecurring) || anyUpdateRunOnceTrue)
  ) {
    issues.push({
      code: "recurring_promise_with_run_once",
      message:
        "final_response_text 承诺了循环执行（如'每天/每晚'），但 tool_inputs 里把任务设置成了 runOnce=true（只执行一次）。请保持循环：对 schedule.create 去掉 runOnce 或设为 false，对 schedule.update 不要把 runOnce 改为 true。"
    });
  }

  // Suppress unused-var warning for anyUpdateRunOnceFalse; kept for future symmetry.
  void anyUpdateRunOnceFalse;

  return issues;
}

export function formatIssuesForLLM(issues: PlanValidationIssue[]): string {
  return issues
    .map((issue, idx) => `${idx + 1}. [${issue.code}] ${issue.message}`)
    .join("\n");
}
