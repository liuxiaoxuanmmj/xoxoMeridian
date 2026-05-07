import { describe, expect, it } from "vitest";

import { detectAgentTarget } from "@/lib/agent-detection";

describe("detectAgentTarget", () => {
  it("detects mention at start of line", () => {
    const result = detectAgentTarget("@小助手 查天气");
    expect(result.isAgentTargeted).toBe(true);
    expect(result.trigger).toBe("mention");
    expect(result.normalizedContent).toBe("查天气");
  });

  it("detects mention in the middle of a sentence", () => {
    const result = detectAgentTarget("记得 @小助手 帮我查一下天气");
    expect(result.isAgentTargeted).toBe(true);
    expect(result.trigger).toBe("mention");
    expect(result.normalizedContent).toBe("记得 帮我查一下天气");
  });

  it("detects mention at end of line", () => {
    const result = detectAgentTarget("帮我查一下天气 @小助手");
    expect(result.isAgentTargeted).toBe(true);
    expect(result.normalizedContent).toBe("帮我查一下天气");
  });

  it("detects mention followed by Chinese punctuation", () => {
    const result = detectAgentTarget("@小助手，你好");
    expect(result.isAgentTargeted).toBe(true);
    expect(result.normalizedContent).toBe("你好");
  });

  it("does not trigger on random text without mention", () => {
    const result = detectAgentTarget("今天天气不错");
    expect(result.isAgentTargeted).toBe(false);
    expect(result.trigger).toBe("none");
  });

  it("still supports /agent slash command", () => {
    const result = detectAgentTarget("/agent 查天气");
    expect(result.isAgentTargeted).toBe(true);
    expect(result.trigger).toBe("slash-command");
    expect(result.normalizedContent).toBe("查天气");
  });

  it("supports @assistant and @agent variants", () => {
    expect(detectAgentTarget("@assistant hi").isAgentTargeted).toBe(true);
    expect(detectAgentTarget("hey @agent please help").isAgentTargeted).toBe(true);
  });

  it("keeps stability: repeated calls return the same result (no lastIndex drift)", () => {
    const msg = "@小助手 查天气";
    expect(detectAgentTarget(msg).isAgentTargeted).toBe(true);
    expect(detectAgentTarget(msg).isAgentTargeted).toBe(true);
    expect(detectAgentTarget(msg).isAgentTargeted).toBe(true);
  });

  it("forceAgent strips mention from content even if present mid-line", () => {
    const result = detectAgentTarget("真的 @小助手 帮忙", true);
    expect(result.isAgentTargeted).toBe(true);
    expect(result.trigger).toBe("explicit-ui");
    expect(result.normalizedContent).toBe("真的 帮忙");
  });
});
