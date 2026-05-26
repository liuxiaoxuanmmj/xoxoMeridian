import { prisma } from "@/lib/prisma";
import { callLLM } from "@/lib/llm";

const UNSUMMARIZED_THRESHOLD = 40;
const RECENT_PROTECT_COUNT = 30;
const GLOBAL_MERGE_THRESHOLD = 10;
const MAX_MESSAGES_PER_SUMMARY = 60;
const MIN_MESSAGES_FOR_SUMMARY = 10;
const MESSAGE_TRUNCATE_LENGTH = 500;

export async function checkAndSummarize(roomId: string): Promise<void> {
  const lastRangeSummary = await prisma.messageSummary.findFirst({
    where: { roomId, type: "range" },
    orderBy: { createdAt: "desc" }
  });

  const sinceFilter = lastRangeSummary?.rangeEndId
    ? await prisma.message
        .findUnique({ where: { id: lastRangeSummary.rangeEndId }, select: { createdAt: true } })
        .then((m) => (m ? { createdAt: { gt: m.createdAt } } : {}))
    : {};

  const unsummarizedCount = await prisma.message.count({
    where: { roomId, senderType: { not: "system" }, ...sinceFilter }
  });

  if (unsummarizedCount <= UNSUMMARIZED_THRESHOLD) return;

  await generateRangeSummary(roomId, lastRangeSummary?.rangeEndId ?? null);

  const rangeCount = await prisma.messageSummary.count({
    where: { roomId, type: "range" }
  });

  if (rangeCount > GLOBAL_MERGE_THRESHOLD) {
    await generateGlobalSummary(roomId);
  }
}

async function generateRangeSummary(
  roomId: string,
  lastRangeEndId: string | null
): Promise<void> {
  let startFilter = {};
  if (lastRangeEndId) {
    const endMsg = await prisma.message.findUnique({
      where: { id: lastRangeEndId },
      select: { createdAt: true }
    });
    if (endMsg) startFilter = { createdAt: { gt: endMsg.createdAt } };
  }

  const protectBoundary = await prisma.message.findMany({
    where: { roomId, senderType: { not: "system" } },
    orderBy: { createdAt: "desc" },
    take: RECENT_PROTECT_COUNT,
    select: { createdAt: true }
  });

  const cutoff = protectBoundary.at(-1)?.createdAt;
  if (!cutoff) return;

  const messages = await prisma.message.findMany({
    where: {
      roomId,
      senderType: { not: "system" },
      ...startFilter,
      createdAt: { lt: cutoff }
    },
    orderBy: { createdAt: "asc" },
    take: MAX_MESSAGES_PER_SUMMARY,
    include: {
      sender: { select: { displayName: true } },
      senderAgent: { select: { displayName: true } }
    }
  });

  if (messages.length < MIN_MESSAGES_FOR_SUMMARY) return;

  const formatted = messages.map((m) => {
    const from = m.sender?.displayName ?? m.senderAgent?.displayName ?? m.senderType;
    const content = m.content.length > MESSAGE_TRUNCATE_LENGTH
      ? m.content.slice(0, MESSAGE_TRUNCATE_LENGTH) + "…"
      : m.content;
    return `[${m.createdAt.toISOString()}] ${from}: ${content}`;
  }).join("\n");

  const result = await callLLM({
    systemPrompt:
      "你是对话摘要助手。把两人私聊+AI助手的对话记录提炼成结构化摘要。\n" +
      "要求：覆盖讨论话题、情绪动态、计划约定、重要事件、助手任务执行结果。\n" +
      "按时间顺序组织，保留关键细节（人名、地点、时间），200-400字。\n" +
      "第三人称客观叙述。只输出摘要正文。",
    userContent: formatted,
    temperature: 0.2,
    maxTokens: 800
  });

  await prisma.messageSummary.create({
    data: {
      roomId,
      type: "range",
      rangeStartId: messages[0].id,
      rangeEndId: messages[messages.length - 1].id,
      messageCount: messages.length,
      summary: result.content,
      tokenEstimate: result.usage?.totalTokens ?? null
    }
  });
}

async function generateGlobalSummary(roomId: string): Promise<void> {
  const allRange = await prisma.messageSummary.findMany({
    where: { roomId, type: "range" },
    orderBy: { createdAt: "asc" }
  });

  const keepRecent = 5;
  if (allRange.length <= keepRecent) return;

  const toMerge = allRange.slice(0, -keepRecent);

  const existingGlobal = await prisma.messageSummary.findFirst({
    where: { roomId, type: "global" }
  });

  const parts: string[] = [];
  if (existingGlobal) {
    parts.push(`【现有全局摘要】\n${existingGlobal.summary}`);
  }
  parts.push(
    `【待合并的区间摘要（${toMerge.length}条）】\n` +
    toMerge.map((s, i) => `${i + 1}. ${s.summary}`).join("\n\n")
  );

  const result = await callLLM({
    systemPrompt:
      "你是长期记忆整理助手。把多段摘要合并为全局概览。\n" +
      "按主题分类（日常、事件、情感、计划、助手使用），合并重复信息保留最新。\n" +
      "如有现有全局摘要则在其基础上更新。500-800字。只输出正文。",
    userContent: parts.join("\n\n"),
    temperature: 0.2,
    maxTokens: 1500
  });

  if (existingGlobal) {
    await prisma.messageSummary.update({
      where: { id: existingGlobal.id },
      data: { summary: result.content, tokenEstimate: result.usage?.totalTokens ?? null }
    });
  } else {
    await prisma.messageSummary.create({
      data: {
        roomId,
        type: "global",
        summary: result.content,
        tokenEstimate: result.usage?.totalTokens ?? null
      }
    });
  }

  await prisma.messageSummary.deleteMany({
    where: { id: { in: toMerge.map((s) => s.id) } }
  });
}
