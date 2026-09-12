import { describe, expect, it } from "vitest";

import {
  calculateModelCostMicros,
  estimateModelInputTokens,
  getAgentRuntimeBudgetCreateData,
  getBudgetLimitMessage
} from "@/agent/runtime-budget";
import type { LLMPlanRequest } from "@/agent/types";

describe("Agent runtime budget primitives", () => {
  it("uses high positive defaults so normal short runs are not stopped early", () => {
    expect(getAgentRuntimeBudgetCreateData()).toEqual(expect.objectContaining({
      maxTurns: 16,
      maxToolCalls: 64,
      maxRuntimeMs: 86_400_000,
      maxTokens: 1_000_000,
      maxCostMicros: 20_000_000,
      maxCompletionTokens: 8192
    }));
  });

  it("estimates a conservative prompt reservation and prices prompt/completion separately", () => {
    const request = createRequest();

    expect(estimateModelInputTokens(request)).toBeGreaterThan(8192);
    expect(calculateModelCostMicros({
      promptTokens: 100,
      completionTokens: 20,
      inputRate: 1_000_000,
      outputRate: 2_000_000
    })).toBe(140);
  });

  it("returns a stable user-facing message for every limit reason", () => {
    for (const reason of [
      "max_turns",
      "max_tool_calls",
      "max_runtime",
      "max_tokens",
      "max_cost"
    ] as const) {
      expect(getBudgetLimitMessage(reason)).toContain("Runtime 已安全停止");
    }
  });
});

function createRequest(): LLMPlanRequest {
  return {
    prompt: "完成一个简短任务",
    roomContext: {
      room: { name: "Test", slug: "test" },
      requestedById: null,
      self: null,
      partner: null,
      participants: [],
      recentMessages: [],
      pinnedMemos: [],
      activeSchedules: [],
      semanticMemory: { aboutHer: [], aboutMe: [], shared: [] },
      summaries: { global: null, recent: [] }
    },
    availableTools: []
  };
}
