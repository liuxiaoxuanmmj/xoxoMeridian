import { describe, expect, it } from "vitest";
import { z } from "zod";

import { BUILT_IN_TOOL_CONTRACTS } from "@/agent/tool-contracts";
import {
  memoPatchSchema,
  memoPostSchema,
  scheduledJobPatchSchema,
  scheduledJobPostSchema,
} from "@/lib/validation";

const memoEntries = [
  { name: "HTTP create", schema: memoPostSchema, base: { title: "标题", content: "内容" } },
  { name: "HTTP patch", schema: memoPatchSchema, base: { pinned: true } },
  { name: "Agent create", schema: BUILT_IN_TOOL_CONTRACTS["memo.create"].inputSchema, base: { title: "标题", content: "内容" } },
  { name: "Agent update", schema: BUILT_IN_TOOL_CONTRACTS["memo.update"].inputSchema, base: { memoId: "memo-1", pinned: true } },
];
const scheduleEntries = [
  { name: "HTTP create", schema: scheduledJobPostSchema, base: { cron: "0 9 * * *", timezone: "Asia/Shanghai", prompt: "提醒" } },
  { name: "HTTP patch", schema: scheduledJobPatchSchema, base: { prompt: "提醒" } },
  { name: "Agent create", schema: BUILT_IN_TOOL_CONTRACTS["schedule.create"].inputSchema, base: { cron: "0 9 * * *", timezone: "Asia/Shanghai", prompt: "提醒" } },
  { name: "Agent update", schema: BUILT_IN_TOOL_CONTRACTS["schedule.update"].inputSchema, base: { jobId: "job-1", prompt: "提醒" } },
];

for (const entry of memoEntries) {
  describe(`备忘录字段 ${entry.name}`, () => {
    it.each([{ field: "title", max: 500 }, { field: "content", max: 20_000 }])(
      "$field 接受 trim 后的边界值，拒绝边界加一、空白和 null",
      ({ field, max }) => {
        const value = "文".repeat(max);
        expect(entry.schema.parse({ ...entry.base, [field]: ` \n${value}\t ` })).toMatchObject({ [field]: value });
        for (const invalid of [value + "字", " \n\t ", "", null, 42]) {
          expect(entry.schema.safeParse({ ...entry.base, [field]: invalid }).success).toBe(false);
        }
      },
    );
  });
}

for (const entry of scheduleEntries) {
  describe(`计划描述 ${entry.name}`, () => {
    it("接受 trim 后的 500 字符，拒绝 501 字符及非字符串", () => {
      const description = "文".repeat(500);
      expect(entry.schema.parse({ ...entry.base, description: ` \n${description}\t ` })).toMatchObject({ description });
      for (const invalid of [description + "字", 42, {}]) {
        expect(entry.schema.safeParse({ ...entry.base, description: invalid }).success).toBe(false);
      }
    });

    it.each([null, "", " \n\t "])("将空描述 %j 统一为 null", (description) => {
      expect(entry.schema.parse({ ...entry.base, description })).toMatchObject({ description: null });
    });
  });
}

it("两条创建入口缺省标题相同，正文必填；更新省略字段保持省略", () => {
  for (const schema of [memoPostSchema, BUILT_IN_TOOL_CONTRACTS["memo.create"].inputSchema]) {
    expect(schema.parse({ content: " 内容 " })).toMatchObject({ title: "新的备忘录", content: "内容", pinned: false });
    expect(schema.safeParse({ title: "标题" }).success).toBe(false);
  }
  for (const entry of [memoEntries[1], memoEntries[3]]) {
    const parsed = entry.schema.parse(entry.base);
    expect(parsed).not.toHaveProperty("title");
    expect(parsed).not.toHaveProperty("content");
  }
  for (const entry of [scheduleEntries[1], scheduleEntries[3]]) {
    expect(entry.schema.parse(entry.base)).not.toHaveProperty("description");
  }
});

it("Tool 的 JSON schema 可导出字段上限与 nullable 输入", () => {
  for (const name of ["memo.create", "memo.update", "schedule.create", "schedule.update"] as const) {
    const schema = z.toJSONSchema(BUILT_IN_TOOL_CONTRACTS[name].inputSchema);
    if (name.startsWith("memo.")) {
      expect(schema.properties).toMatchObject({ title: { maxLength: 500 }, content: { maxLength: 20_000 } });
    } else {
      expect(schema.properties?.description).toMatchObject({ anyOf: [{ type: "string", maxLength: 500 }, { type: "null" }] });
    }
  }
});
