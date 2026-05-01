import { describe, expect, it } from "vitest";

import { detectAgentTarget } from "@/lib/agent-detection";
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
      "note.create",
      "reminder.create",
      "timezone.compare",
      "weather.get"
    ]);
  });

  it("mock llm returns a structured reminder plan", async () => {
    const provider = createMockLLMProvider();
    const result = await provider.plan({
      prompt: "@小助手 明天提醒我给她发早安",
      roomContext: "Two-person long-distance room",
      availableTools: ["reminder.create"]
    });

    expect(result.intent).toBe("create_reminder");
    expect(result.requiredTools).toEqual(["reminder.create"]);
    expect(result.toolInputs["reminder.create"]).toMatchObject({
      title: "给她发早安"
    });
  });
});
