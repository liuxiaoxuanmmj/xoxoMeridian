import { describe, expect, it } from "vitest";
import { z } from "zod";

import { detectAgentTarget } from "@/lib/agent-detection";
import { filterToolsForTrigger, readPersistedAgentPlan } from "@/agent/agent-runtime";
import { createMockLLMProvider } from "@/agent/llm-provider";
import { createToolRegistry } from "@/agent/tool-registry";
import type { StructuredRoomContext } from "@/agent/types";

function requesterAwareRoomContext(
  requestedById: string | null
): StructuredRoomContext {
  const alice = {
    userId: "u1",
    displayName: "Alice",
    city: "Shanghai",
    timezone: "Asia/Shanghai",
    profileNote: null
  };
  const bob = {
    userId: "u2",
    displayName: "Bob",
    city: "London",
    timezone: "Europe/London",
    profileNote: null
  };

  return {
    room: { name: "Test", slug: "test" },
    requestedById,
    self: requestedById === bob.userId ? bob : requestedById === alice.userId ? alice : null,
    partner: requestedById === bob.userId ? alice : requestedById === alice.userId ? bob : null,
    participants: [alice, bob],
    recentMessages: [],
    pinnedMemos: [],
    activeSchedules: [],
    semanticMemory: { aboutHer: [], aboutMe: [], shared: [] },
    summaries: { global: null, recent: [] }
  };
}

describe("agent dispatch primitives", () => {
  it("detects direct assistant mentions", () => {
    expect(detectAgentTarget("@小助手 明天提醒我给她发早安")).toEqual({
      isAgentTargeted: true,
      normalizedContent: "明天提醒我给她发早安",
      trigger: "mention"
    });
  });

  it("detects slash command dispatch", () => {
    expect(detectAgentTarget("/agent 查一下她那边今天的天气")).toEqual({
      isAgentTargeted: true,
      normalizedContent: "查一下她那边今天的天气",
      trigger: "slash-command"
    });
  });

  it("registers only whitelisted tools for the local runtime", () => {
    const registry = createToolRegistry();
    expect(registry.list().map((tool) => tool.name).sort()).toEqual([
      "memo.create",
      "memo.delete",
      "memo.list",
      "memo.update",
      "memory.recall",
      "memory.set",
      "schedule.cancel",
      "schedule.create",
      "schedule.list",
      "schedule.update",
      "timezone.compare",
      "weather.get",
      "web.search"
    ]);
  });

  it("classifies every Tool risk and marks permanent deletion as high risk", () => {
    const tools = createToolRegistry().list();

    expect(tools.every((tool) => ["low", "medium", "high"].includes(tool.risk))).toBe(true);
    expect(tools.find((tool) => tool.name === "memo.delete")?.risk).toBe("high");
  });

  it("requires every Tool to declare a bounded retry policy", () => {
    const tools = createToolRegistry().list();

    expect(tools.every((tool) => (
      Number.isInteger(tool.retry.maxAttempts)
      && tool.retry.maxAttempts >= 1
      && tool.retry.backoffMs >= 0
    ))).toBe(true);
  });

  it("derives Planner JSON Schema from each runtime Zod input contract", () => {
    const tools = createToolRegistry().list();

    expect(tools.every((tool) => tool.inputSchema && tool.outputSchema)).toBe(true);
    for (const tool of tools) {
      expect(tool.schema).toEqual(z.toJSONSchema(tool.inputSchema));
    }
  });

  it("mock llm returns a structured weather plan", async () => {
    const provider = createMockLLMProvider();
    const result = await provider.plan({
      prompt: "@小助手 查一下天气",
      roomContext: requesterAwareRoomContext("u1"),
      availableTools: [{ name: "weather.get", description: "", schema: {} }]
    });

    expect(result.intent).toBe("get_weather");
    expect(result.requiredTools).toEqual(["weather.get"]);
    expect(result.toolInputs["weather.get"]).toMatchObject({
      city: "London"
    });
  });

  it("plans weather and timezone from the explicit second requester view", async () => {
    const provider = createMockLLMProvider();
    const roomContext = requesterAwareRoomContext("u2");

    const weather = await provider.plan({
      prompt: "查一下对方天气",
      roomContext,
      availableTools: [{ name: "weather.get", description: "", schema: {} }]
    });
    const timezone = await provider.plan({
      prompt: "比较一下我们的时差",
      roomContext,
      availableTools: [{ name: "timezone.compare", description: "", schema: {} }]
    });

    expect(weather.toolInputs["weather.get"]).toEqual({ city: "Shanghai" });
    expect(timezone.toolInputs["timezone.compare"]).toEqual({
      fromLabel: "Bob",
      fromTimezone: "Europe/London",
      toLabel: "Alice",
      toTimezone: "Asia/Shanghai"
    });
  });

  it("does not infer requester-relative Planner inputs from participant order", async () => {
    const provider = createMockLLMProvider();
    const roomContext = requesterAwareRoomContext(null);

    const weather = await provider.plan({
      prompt: "查一下对方天气",
      roomContext,
      availableTools: [{ name: "weather.get", description: "", schema: {} }]
    });
    const timezone = await provider.plan({
      prompt: "比较一下我们的时差",
      roomContext,
      availableTools: [{ name: "timezone.compare", description: "", schema: {} }]
    });

    expect(weather.toolInputs["weather.get"]).toEqual({});
    expect(timezone.toolInputs["timezone.compare"]).toEqual({});
  });
});

describe("filterToolsForTrigger", () => {
  const allTools = [
    { name: "memory.recall" },
    { name: "memory.set" },
    { name: "schedule.create" },
    { name: "schedule.update" },
    { name: "schedule.cancel" },
    { name: "schedule.list" },
    { name: "weather.get" }
  ];

  it("passes through unchanged for user-typed prompts (no trigger)", () => {
    expect(filterToolsForTrigger(allTools, undefined)).toEqual(allTools);
  });

  it("passes through unchanged for mention/slash-command triggers", () => {
    expect(filterToolsForTrigger(allTools, "mention")).toEqual(allTools);
    expect(filterToolsForTrigger(allTools, "slash-command")).toEqual(allTools);
  });

  it("strips writeable scheduling tools when trigger is scheduled.job", () => {
    const filtered = filterToolsForTrigger(allTools, "scheduled.job").map((t) => t.name);
    // Read-only schedule.list stays so the agent can still introspect.
    expect(filtered).toContain("schedule.list");
    expect(filtered).not.toContain("schedule.create");
    expect(filtered).not.toContain("schedule.update");
    expect(filtered).not.toContain("schedule.cancel");
  });

  it("strips writeable scheduling tools when trigger is scheduled.job (alias)", () => {
    const filtered = filterToolsForTrigger(allTools, "scheduled.job").map((t) => t.name);
    expect(filtered).not.toContain("schedule.create");
    expect(filtered).toContain("memory.recall");
  });
});

describe("readPersistedAgentPlan", () => {
  it("restores a complete persisted plan for task retry", () => {
    const plan = {
      intent: "create_memo",
      confidence: 0.9,
      requiredTools: ["memo.create"],
      taskSteps: ["create memo"],
      finalResponsePlan: "confirm",
      finalResponseText: "已经记下了。",
      toolInputs: {
        "memo.create": { content: "remember this" }
      }
    };

    expect(readPersistedAgentPlan(plan)).toEqual(plan);
  });

  it("rejects incomplete persisted data instead of resuming it", () => {
    expect(readPersistedAgentPlan({ intent: "create_memo" })).toBeNull();
  });
});
