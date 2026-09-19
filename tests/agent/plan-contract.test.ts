import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { readPersistedAgentPlan } from "@/agent/agent-runtime";
import { createLLMProvider } from "@/agent/llm-provider";
import { NO_TOOL_RETRY } from "@/agent/tool-errors";
import { createToolRegistry, ToolRegistry } from "@/agent/tool-registry";
import type { AgentPlan, LLMPlanRequest } from "@/agent/types";

vi.mock("@/lib/env", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...original,
    env: {
      ...original.env,
      LLM_PROVIDER: "openai-compatible",
      LLM_API_KEY: "plan-contract-test-key",
      LLM_BASE_URL: "https://planner.test/v1"
    }
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const validPlan: AgentPlan = {
  intent: "create_memo",
  confidence: 0.9,
  requiredTools: ["memo.create"],
  taskSteps: ["保存备忘录"],
  finalResponsePlan: "确认保存",
  finalResponseText: "已经记下了。",
  toolInputs: { "memo.create": { content: "周末一起散步" } }
};

const invalidPlans: Array<[string, unknown]> = [
  ["missing structure", { intent: "create_memo" }],
  ["negative confidence", { ...validPlan, confidence: -0.1 }],
  ["confidence above one", { ...validPlan, confidence: 1.1 }],
  ["non-string task step", { ...validPlan, taskSteps: [42] }],
  ["non-string tool name", { ...validPlan, requiredTools: [42] }],
  ["unknown tool", { ...validPlan, requiredTools: ["memo.invented"] }],
  ["missing tool input", { ...validPlan, toolInputs: {} }],
  ["missing required field", { ...validPlan, toolInputs: { "memo.create": {} } }],
  ["unexpected input field", { ...validPlan, toolInputs: { "memo.create": { content: "内容", message: "未知字段" } } }],
  ["non-object input", { ...validPlan, toolInputs: { "memo.create": "内容" } }],
  ["empty batch", { ...validPlan, toolInputs: { "memo.create": [] } }],
  ["invalid later batch entry", { ...validPlan, toolInputs: { "memo.create": [{ content: "有效" }, {}] } }],
  ["duplicate tool", { ...validPlan, requiredTools: ["memo.create", "memo.create"] }],
  ["unlisted action", { ...validPlan, requiredTools: [] }],
  ["non-object tool map", { ...validPlan, toolInputs: [] }]
];

function externalPlan(value: unknown) {
  if (typeof value !== "object" || value === null) return value;
  const plan = value as Record<string, unknown>;
  return {
    intent: plan.intent,
    confidence: plan.confidence,
    required_tools: plan.requiredTools,
    task_steps: plan.taskSteps,
    final_response_plan: plan.finalResponsePlan,
    final_response_text: plan.finalResponseText,
    tool_inputs: plan.toolInputs
  };
}

function request(): LLMPlanRequest {
  return {
    prompt: "帮我记录周末一起散步",
    availableTools: createToolRegistry().list().map(({ name, description, schema }) => ({ name, description, schema })),
    roomContext: {
      room: { name: "测试房间", slug: "plan-test" },
      requestedById: null,
      self: null,
      partner: null,
      participants: [],
      recentMessages: [],
      pinnedMemos: [],
      activeSchedules: [],
      semanticMemory: { aboutHer: [], aboutMe: [], shared: [] },
      summaries: { global: null, recent: [] }
    }
  };
}

function respond(content: string) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }
  })));
}

describe("Agent plan contract at external and persisted boundaries", () => {
  it.each(invalidPlans)("rejects persisted %s without silently dropping actions", (_name, plan) => {
    expect(() => readPersistedAgentPlan(plan)).toThrow(/plan validation/i);
  });

  it.each(invalidPlans)("rejects external %s without silently dropping actions", async (_name, plan) => {
    respond(JSON.stringify(externalPlan(plan)));
    await expect(createLLMProvider().plan(request())).rejects.toMatchObject({
      name: "AgentPlanValidationError",
      category: "validation"
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("rejects non-finite persisted confidence %s", (confidence) => {
    expect(() => readPersistedAgentPlan({ ...validPlan, confidence })).toThrow(/plan validation/i);
  });

  it.each(["null", "[]", "42", '"text"', '{"private":"test-sensitive-payload"'])("rejects malformed JSON or root %s with a bounded safe reason", async (content) => {
    respond(content);
    const error = await createLLMProvider().plan(request()).catch((failure: unknown) => failure);
    expect(error).toMatchObject({ name: "AgentPlanValidationError", category: "validation" });
    expect((error as Error).message.length).toBeLessThanOrEqual(512);
    expect((error as Error).message).not.toContain("test-sensitive-payload");
  });

  it("enforces the current allowed tools for both external and persisted plans", async () => {
    const registry = createToolRegistry();
    expect(() => readPersistedAgentPlan(validPlan, registry, [])).toThrow(/plan validation/i);
    respond(JSON.stringify(externalPlan(validPlan)));
    await expect(createLLMProvider().plan({ ...request(), availableTools: [] })).rejects.toMatchObject({
      category: "validation"
    });
  });

  it("bounds reasons without copying arbitrary tool names or input values", async () => {
    const secret = "test-sensitive-payload";
    const plan = { ...validPlan, requiredTools: Array.from({ length: 40 }, (_, i) => `${secret}-${i}`) };
    respond(JSON.stringify(externalPlan(plan)));
    const error = await createLLMProvider().plan(request()).catch((failure: unknown) => failure);
    expect(error).toMatchObject({ name: "AgentPlanValidationError", category: "validation" });
    expect((error as Error).message.length).toBeLessThanOrEqual(512);
    expect(JSON.stringify(error)).not.toContain(secret);
  });

  it("uses the supplied Registry input schema at both boundaries", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "memo.create", description: "测试契约变化", schema: {}, risk: "low", retry: NO_TOOL_RETRY,
      inputSchema: z.object({ content: z.literal("新契约") }).strict(),
      outputSchema: z.object({}), execute: vi.fn()
    });
    expect(() => readPersistedAgentPlan(validPlan, registry)).toThrow(/plan validation/i);
    respond(JSON.stringify(externalPlan(validPlan)));
    await expect(createLLMProvider(registry).plan(request())).rejects.toMatchObject({ category: "validation" });
    const updated = { ...validPlan, toolInputs: { "memo.create": { content: "新契约" } } };
    expect(readPersistedAgentPlan(updated, registry)).toEqual(updated);
    respond(JSON.stringify(externalPlan(updated)));
    await expect(createLLMProvider(registry).plan(request())).resolves.toMatchObject(updated);
  });

  it.each([
    { ...validPlan, requiredTools: [], toolInputs: {}, finalResponseText: "你好。" },
    { ...validPlan, toolInputs: { "memo.create": [{ content: "第一条" }, { content: "第二条" }] } },
    { ...validPlan, requiredTools: ["memo.list"], toolInputs: { "memo.list": {} } }
  ])("preserves valid zero-tool, batched and empty-input plans", async (plan) => {
    expect(readPersistedAgentPlan(plan)).toEqual(plan);
    respond(JSON.stringify(externalPlan(plan)));
    await expect(createLLMProvider().plan(request())).resolves.toMatchObject({
      ...plan,
      usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 }
    });
  });

  it("treats only absent persisted plans as needing a new plan", () => {
    expect(readPersistedAgentPlan(null)).toBeNull();
    expect(readPersistedAgentPlan(undefined)).toBeNull();
  });
});
