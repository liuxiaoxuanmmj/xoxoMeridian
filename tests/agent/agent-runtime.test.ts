import { describe, expect, it } from "vitest";

import { detectAgentTarget } from "@/lib/agent-detection";
import { filterToolsForTrigger } from "@/agent/agent-runtime";
import { createMockLLMProvider } from "@/agent/llm-provider";
import { createToolRegistry } from "@/agent/tool-registry";

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

  it("mock llm returns a structured weather plan", async () => {
    const provider = createMockLLMProvider();
    const result = await provider.plan({
      prompt: "@小助手 查一下天气",
      roomContext: {
        room: { name: "Test", slug: "test" },
        participants: [],
        recentMessages: [],
        pinnedMemos: [],
        activeSchedules: [],
        semanticMemory: { aboutHer: [], aboutMe: [], shared: [] },
        summaries: { global: null, recent: [] }
      },
      availableTools: [{ name: "weather.get", description: "", schema: {} }]
    });

    expect(result.intent).toBe("get_weather");
    expect(result.requiredTools).toEqual(["weather.get"]);
    expect(result.toolInputs["weather.get"]).toMatchObject({
      city: "London"
    });
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
