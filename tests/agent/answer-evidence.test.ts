import { describe, expect, it } from "vitest";

import { buildAnswerEvidence, renderEvidenceFallback, validateAnswerText } from "@/agent/answer-evidence";
import type { LLMAnswerRequest, ToolResult } from "@/agent/types";

function request(toolResults: ToolResult[], prompt = "三亚9月24日到28日四天的天气，有台风吗，适合旅游吗"): LLMAnswerRequest {
  return {
    prompt, referenceTime: "2026-09-22T11:00:00Z",
    plan: { intent: "查询天气和台风", confidence: 0.9, requiredTools: [], taskSteps: [], finalResponsePlan: "内部计划", finalResponseText: "草稿称没有台风", toolInputs: {} },
    toolResults,
    roomContext: {
      room: { name: "测试", slug: "test" }, requestedById: null, self: null, partner: null,
      participants: [], recentMessages: [], pinnedMemos: [], activeSchedules: [],
      semanticMemory: { aboutHer: [], aboutMe: [], shared: [] }, summaries: { global: null, recent: [] }
    }
  };
}

const weather: ToolResult = {
  toolName: "weather.get", stepKey: "weather-0", input: { city: "三亚", startDate: "2026-09-24", endDate: "2026-09-28" },
  output: {
    provider: "qweather", city: "三亚", condition: "阴", temperatureC: 28, observedAt: "2026-09-22T18:48+08:00",
    issuedAt: "2026-09-22T08:00+08:00", timezone: "Asia/Shanghai",
    source: { name: "和风天气", url: "https://weather.test/sanya" },
    forecast: [{ date: "2026-09-24", textDay: "多云", tempMinC: 24, tempMaxC: 33 }]
  }
};
const search: ToolResult = {
  toolName: "web.search", output: {
    provider: "tavily", answer: "摘要错误断言当前有台风", results: [
      { title: "9月12日预警", url: "https://news.test/old", publishedDate: "2026-09-12", content: "影响时段9月12至15日。" },
      { title: "气候均值", url: "https://climate.test/sanya", content: "九月气候统计均值。" }
    ]
  }
};

describe("工具执行后证据与如实降级", () => {
  it("保留每次调用并隔离规划草稿和供应商摘要", () => {
    const input = request([weather, search, { ...weather, stepKey: "weather-1", output: { city: "海口" } }]);
    const evidence = buildAnswerEvidence(input);
    expect(evidence.calls).toHaveLength(3);
    expect(evidence.calls.map((call) => call.stepKey)).toEqual(["weather-0", undefined, "weather-1"]);
    expect(JSON.stringify(evidence)).not.toContain("摘要错误");
    expect(JSON.stringify(evidence)).not.toContain("草稿称");
    expect(JSON.stringify(input.toolResults)).toContain("摘要错误");
  });

  it("推导缺失日期并标识四天与五个日历日的歧义", () => {
    const evidence = buildAnswerEvidence(request([weather]));
    expect(evidence.calls[0].missingDates).toEqual(["2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"]);
    expect(evidence.dateNotes.join(" ")).toMatch(/5.*四天/);
    const text = renderEvidenceFallback(request([weather]));
    expect(text).toContain("2026-09-28");
    expect(text).toContain("暂时无法确认");
    expect(text).not.toContain("草稿称");
  });

  it("把旧公告、无日期来源和气候均值作为有适用限制的资料", () => {
    const evidence = buildAnswerEvidence(request([search]));
    expect(evidence.calls[0].warnings.join(" ")).toContain("发布日期早于");
    expect(evidence.calls[0].warnings.join(" ")).toContain("日期不明");
    expect(evidence.calls[0].warnings.join(" ")).toContain("气候");
    const text = renderEvidenceFallback(request([search], "三亚最近有台风吗"));
    expect(text.startsWith("台风：暂时无法确认")).toBe(true);
    expect(text).toContain("https://news.test/old");
    expect(text).not.toContain("摘要错误");
  });

  it("上海凌晨以目的地日期标记旧公告，带偏移的发布时间先转当地日期", () => {
    const input = request([weather, { toolName: "web.search", output: { results: [
      { title: "昨日公告", publishedDate: "2026-09-21" },
      { title: "今日公告", publishedDate: "2026-09-21T18:00:00Z" }
    ] } }]);
    input.referenceTime = "2026-09-21T20:00:00Z";
    const evidence = buildAnswerEvidence(input);
    expect(evidence.referenceDate).toBe("2026-09-22");
    expect(evidence.referenceTimezone).toBe("Asia/Shanghai");
    expect(evidence.calls[1].warnings.join(" ")).toContain("来源 1 发布日期早于");
    expect(evidence.calls[1].warnings.join(" ")).not.toContain("来源 2 发布日期早于");
  });

  it("天气和搜索调换顺序均展示两份结果，不截断目标范围", () => {
    const allWeather = { ...weather, output: { ...weather.output as object, forecast: [24, 25, 26, 27, 28].map((day) => ({ date: `2026-09-${day}`, textDay: "多云", tempMinC: 24, tempMaxC: 33 })) } };
    for (const results of [[allWeather, search], [search, allWeather]]) {
      const text = renderEvidenceFallback(request(results));
      expect(text).toContain("2026-09-28 多云");
      expect(text).toContain("9月12日预警");
      expect(text).not.toContain("缺失预报日期");
    }
  });

  it("模拟数据及失败不呈现为实况或确切出行判断", () => {
    const text = renderEvidenceFallback(request([
      { toolName: "weather.get", output: { provider: "mock", city: "三亚", temperatureC: 16, condition: "晴", fallbackReason: "供应商不可用" } },
      { toolName: "web.search", output: { availability: "unavailable", results: [], answer: "确定没有台风" } }
    ]));
    expect(text).toContain("模拟");
    expect(text).toContain("不可用");
    expect(text).not.toContain("16°C");
    expect(text).not.toContain("确定没有台风");
    expect(text).toContain("不能据此判断");
  });

  it("非天气组合和同工具多次调用都保留，记忆与列表响应真实结果变化", () => {
    const output = (value: string) => renderEvidenceFallback(request([
      { toolName: "memo.create", output: { title: "备忘一" } },
      { toolName: "memo.create", output: { title: "备忘二" } },
      { toolName: "memory.recall", output: { memories: [{ key: "shared.preference", value }] } },
      { toolName: "memo.list", output: { memos: [{ title: "周末", content: "一起散步" }] } },
      { toolName: "timezone.compare", output: { from: { label: "甲", time: "10:00" }, to: { label: "乙", time: "12:00" }, suggestion: "联系建议" } },
      search
    ], "查看备忘、记忆、时区和搜索"));
    expect(output("甲偏好")).toContain("甲偏好");
    expect(output("乙偏好")).not.toContain("甲偏好");
    for (const value of ["备忘一", "备忘二", "一起散步", "10:00", "9月12日预警"]) expect(output("甲偏好")).toContain(value);
  });

  it("已完成写操作按真实结果确认，不依赖综合服务", () => {
    const text = renderEvidenceFallback(request([
      { toolName: "schedule.create", output: { description: "散步", nextRunAt: "2026-09-23T12:00:00Z", timezone: "Asia/Shanghai", runOnce: true } },
      { toolName: "schedule.update", output: { description: "吃饭", nextRunAt: "2026-09-24T12:00:00Z", timezone: "Asia/Shanghai", runOnce: false, cron: "0 20 * * *" } },
      { toolName: "schedule.cancel", output: { cancelled: true } },
      { toolName: "memo.delete", output: { deleted: true } },
      { toolName: "memory.set", output: { value: "喜欢散步" } }
    ], "更新计划"));
    for (const value of ["已安排", "仅执行一次", "已更新", "已取消", "已删除", "喜欢散步"]) expect(text).toContain(value);
    expect(text).not.toContain("草稿称");
  });

  it("纯写入旅游备忘时只确认保存，不增加未经请求的旅行判断", () => {
    expect(renderEvidenceFallback(request([{ toolName: "memo.create", output: { title: "新的备忘录" } }], "备忘录：三亚旅游时查台风"))).toBe("备忘录已保存：新的备忘录。");
  });

  it("仅允许实际来源中的安全链接，拒绝模型编造来源", () => {
    const input = request([search]);
    expect(validateAnswerText("资料见[旧公告](https://news.test/old)。", input)).toContain("旧公告");
    expect(() => validateAnswerText("见 https://invented.test/typhoon", input)).toThrow(/来源/);
    expect(() => validateAnswerText("[危险](javascript:alert(1))", input)).toThrow(/来源/);
    expect(() => validateAnswerText(" ", input)).toThrow();
  });

  it.each([
    '[来源](//invented.test/current "标题")',
    '[来源](javascript:alert(1) "标题")',
    '[来源][1]\n[1]: //invented.test/current "标题"',
    '[来源][1]\n[1]: <javascript:alert(1)>',
    '<mailto:invented@test.invalid>'
  ])("拒绝带标题或引用式的未提供链接：%s", (text) => {
    expect(() => validateAnswerText(text, request([search]))).toThrow(/来源/);
  });

  it("接受实际来源的带标题/引用式链接及含配对括号的URL", () => {
    const source = "https://news.test/notice(2026)";
    const input = request([{ toolName: "web.search", output: { results: [{ url: source }] } }]);
    for (const text of [
      `[来源](${source} "标题")`,
      `[来源](<${source}> "标题")`,
      `[来源][1]\n[1]: ${source} "标题"`,
      `来源：${source}。`
    ]) expect(() => validateAnswerText(text, input), text).not.toThrow();
  });

  it("允许如实复述本地记忆和备忘里的URL，不把输入、草稿或搜索摘要链接当来源", () => {
    const input = request([
      { toolName: "memory.recall", output: { memories: [{ value: "喜欢 https://memory.test/place" }] } },
      { toolName: "memo.list", output: { memos: [{ content: "参考[网页](https://memo.test/page)" }] } },
      { toolName: "web.search", input: { query: "https://input.test" }, output: { answer: "https://summary.test", results: [{ url: "https://source.test", content: "https://snippet.test" }] } }
    ]);
    input.plan.finalResponseText = "https://draft.test";
    expect(validateAnswerText("喜欢 https://memory.test/place；备忘[网页](https://memo.test/page)", input)).toContain("memory.test");
    for (const url of ["https://input.test", "https://summary.test", "https://snippet.test", "https://draft.test"]) {
      expect(() => validateAnswerText(url, input)).toThrow(/来源/);
    }
  });
});
