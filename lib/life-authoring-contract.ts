import { z } from "zod";

// 保留原 Agent 入口已接受的长度，已有合法记录无需迁移或缩短。
export const MEMO_TITLE_MAX_LENGTH = 500;
export const MEMO_CONTENT_MAX_LENGTH = 20_000;
export const SCHEDULE_DESCRIPTION_MAX_LENGTH = 500;
export const DEFAULT_MEMO_TITLE = "新的备忘录";

export const memoTitleSchema = z.string().trim().min(1).max(MEMO_TITLE_MAX_LENGTH);
export const memoContentSchema = z.string().trim().min(1).max(MEMO_CONTENT_MAX_LENGTH);

// 客户端只消费基础字段 schema；对象 schema 由 HTTP/Agent 入口组装。
// Zod 对象构造会探测动态代码生成，浏览器 CSP 不允许这种 eval 探测。
export const memoCreateFields = {
  title: memoTitleSchema.default(DEFAULT_MEMO_TITLE),
  content: memoContentSchema,
  pinned: z.boolean().default(false),
};

export const memoUpdateFields = {
  title: memoTitleSchema.optional(),
  content: memoContentSchema.optional(),
  pinned: z.boolean().optional(),
};

// undefined 表示不修改；null 或空白表示清空。overwrite 保持输入/输出
// 类型一致，供 Tool Registry 导出 JSON schema，同时在解析时统一空值。
export const scheduleDescriptionSchema = z.string()
  .trim()
  .max(SCHEDULE_DESCRIPTION_MAX_LENGTH)
  .nullable()
  .overwrite((value) => value === "" ? null : value);
