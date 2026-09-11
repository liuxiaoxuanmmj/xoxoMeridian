import { z } from "zod";

const emptyInput = z.object({}).strict();
const id = z.string().min(1).max(200);
const isoDateString = z.string().min(1).max(100);

const memoSummary = z.object({
  memoId: id,
  title: z.string(),
  content: z.string(),
  pinned: z.boolean().optional(),
  createdAt: isoDateString.optional()
}).passthrough();

const scheduleSummary = z.object({
  jobId: id,
  cron: z.string(),
  timezone: z.string(),
  nextRunAt: isoDateString,
  description: z.string().nullable(),
  prompt: z.string().nullable().optional(),
  runOnce: z.boolean()
}).passthrough();

export const BUILT_IN_TOOL_CONTRACTS = {
  "memo.list": {
    inputSchema: emptyInput,
    outputSchema: z.object({
      count: z.number().int().nonnegative(),
      memos: z.array(memoSummary)
    })
  },
  "memo.create": {
    inputSchema: z.object({
      title: z.string().max(500).optional(),
      content: z.string().min(1).max(20_000),
      pinned: z.boolean().optional()
    }).strict(),
    outputSchema: memoSummary.pick({ memoId: true, title: true, content: true })
  },
  "memo.update": {
    inputSchema: z.object({
      memoId: id,
      title: z.string().max(500).optional(),
      content: z.string().max(20_000).optional(),
      pinned: z.boolean().optional()
    }).strict(),
    outputSchema: memoSummary.pick({
      memoId: true,
      title: true,
      content: true,
      pinned: true
    })
  },
  "memo.delete": {
    inputSchema: z.object({ memoId: id }).strict(),
    outputSchema: z.object({ memoId: id, deleted: z.literal(true) })
  },
  "memory.set": {
    inputSchema: z.object({
      key: z.string().min(1).max(80).regex(/^[a-z0-9._-]+$/i),
      value: z.string().min(1).max(1000),
      scope: z.enum(["shared", "me", "her"]).optional(),
      source: z.string().max(200).optional()
    }).strict(),
    outputSchema: z.object({
      memoryId: id,
      key: z.string(),
      value: z.string(),
      merged: z.string().optional()
    })
  },
  "memory.recall": {
    inputSchema: z.object({
      prefix: z.string().max(80).optional(),
      limit: z.number().int().min(1).max(50).optional()
    }).strict(),
    outputSchema: z.object({
      count: z.number().int().nonnegative(),
      memories: z.array(z.object({
        key: z.string(),
        value: z.string(),
        updatedAt: isoDateString
      }))
    })
  },
  "schedule.create": {
    inputSchema: z.object({
      cron: z.string().min(1).max(200).optional(),
      fireAt: z.string().min(1).max(100).optional(),
      timezone: z.string().min(1).max(200),
      prompt: z.string().min(1).max(500),
      description: z.string().max(500).optional(),
      runOnce: z.boolean().optional()
    }).strict(),
    outputSchema: scheduleSummary.omit({ prompt: true })
  },
  "schedule.list": {
    inputSchema: emptyInput,
    outputSchema: z.object({
      count: z.number().int().nonnegative(),
      jobs: z.array(scheduleSummary)
    })
  },
  "schedule.cancel": {
    inputSchema: z.object({ jobId: id }).strict(),
    outputSchema: z.object({ jobId: id, cancelled: z.literal(true) })
  },
  "schedule.update": {
    inputSchema: z.object({
      jobId: id,
      cron: z.string().min(1).max(200).optional(),
      fireAt: z.string().min(1).max(100).optional(),
      timezone: z.string().min(1).max(200).optional(),
      prompt: z.string().min(1).max(500).optional(),
      description: z.string().max(500).optional(),
      runOnce: z.boolean().optional()
    }).strict(),
    outputSchema: scheduleSummary.omit({ prompt: true })
  },
  "timezone.compare": {
    inputSchema: z.object({
      fromLabel: z.string().max(200).optional(),
      fromTimezone: z.string().max(200).optional(),
      toLabel: z.string().max(200).optional(),
      toTimezone: z.string().max(200).optional()
    }).strict(),
    outputSchema: z.object({
      from: z.object({ label: z.string(), timezone: z.string(), time: z.string() }),
      to: z.object({ label: z.string(), timezone: z.string(), time: z.string() }),
      suggestion: z.string()
    })
  },
  "weather.get": {
    inputSchema: z.object({
      city: z.string().min(1).max(200).optional(),
      includeForecast: z.boolean().optional()
    }).strict(),
    outputSchema: z.object({
      provider: z.enum(["qweather", "mock"]),
      city: z.string(),
      condition: z.string(),
      advice: z.string()
    }).passthrough()
  },
  "web.search": {
    inputSchema: z.object({
      query: z.string().min(1).max(400),
      maxResults: z.number().int().min(1).max(10).optional(),
      searchDepth: z.enum(["basic", "advanced"]).optional()
    }).strict(),
    outputSchema: z.object({
      provider: z.enum(["tavily", "mock"]),
      query: z.string(),
      answer: z.string().optional(),
      results: z.array(z.object({
        title: z.string(),
        url: z.string(),
        content: z.string(),
        score: z.number(),
        publishedDate: z.string().optional()
      })),
      responseTime: z.number().optional(),
      fallbackReason: z.string().optional(),
      _meta: z.object({
        totalResults: z.number().int().nonnegative(),
        displayMode: z.enum(["inline", "card", "collapsed"]).optional()
      }).optional()
    })
  }
} as const;

export type BuiltInToolName = keyof typeof BUILT_IN_TOOL_CONTRACTS;

export function getBuiltInToolContract(name: string) {
  return name in BUILT_IN_TOOL_CONTRACTS
    ? BUILT_IN_TOOL_CONTRACTS[name as BuiltInToolName]
    : null;
}
