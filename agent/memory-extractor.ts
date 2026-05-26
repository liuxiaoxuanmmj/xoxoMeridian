import { prisma } from "@/lib/prisma";
import { callLLM } from "@/lib/llm";
import { deduplicatedMemoryWrite } from "@/agent/memory-dedup";

const EXTRACTION_MESSAGE_CADENCE = 10;
const MAX_CONSECUTIVE_EMPTY = 3;
const EXTRACTION_LOOKBACK = 30;
const MAX_EXTRACTIONS_PER_RUN = 5;

const STATE_KEY = "_system.extraction_state";
const KEY_PATTERN = /^[a-z0-9._-]{1,80}$/i;
const VALUE_MAX = 1000;

type ExtractionState = {
  lastExtractedAt: string;
  consecutiveEmptyResults: number;
};

type ExtractionAction = {
  action: "set" | "delete";
  key: string;
  value?: string;
};

export async function checkAndExtractMemories(roomId: string): Promise<void> {
  const stateRow = await prisma.memory.findUnique({
    where: { roomId_key: { roomId, key: STATE_KEY } }
  });

  let state: ExtractionState = stateRow
    ? (JSON.parse(stateRow.value) as ExtractionState)
    : { lastExtractedAt: new Date(0).toISOString(), consecutiveEmptyResults: 0 };

  const messagesSince = await prisma.message.count({
    where: {
      roomId,
      senderType: { not: "system" },
      createdAt: { gt: new Date(state.lastExtractedAt) }
    }
  });

  const effectiveCadence =
    EXTRACTION_MESSAGE_CADENCE * (1 + Math.min(state.consecutiveEmptyResults, MAX_CONSECUTIVE_EMPTY));

  if (messagesSince < effectiveCadence) return;

  const recentMessages = await prisma.message.findMany({
    where: { roomId, senderType: { not: "system" } },
    orderBy: { createdAt: "desc" },
    take: EXTRACTION_LOOKBACK,
    include: {
      sender: { select: { displayName: true } },
      senderAgent: { select: { displayName: true } }
    }
  });

  const existingMemories = await prisma.memory.findMany({
    where: { roomId, NOT: { key: { startsWith: "_system." } } },
    select: { key: true, value: true }
  });

  const room = await prisma.room.findUniqueOrThrow({
    where: { id: roomId },
    include: { participants: { include: { user: { select: { displayName: true } } } } }
  });

  const participantNames = room.participants.map((p) => p.user.displayName).join("、");

  const formattedMessages = recentMessages
    .reverse()
    .map((m) => {
      const from = m.sender?.displayName ?? m.senderAgent?.displayName ?? m.senderType;
      return `[${m.createdAt.toISOString()}] ${from}: ${m.content}`;
    })
    .join("\n");

  const memoryList = existingMemories.map((m) => `${m.key} = ${m.value}`).join("\n") || "（无）";

  const result = await callLLM({
    systemPrompt:
      "你是记忆提取助手。从近期对话中识别值得长期记住的稳定事实。\n\n" +
      `已有记忆（避免重复）：\n${memoryList}\n\n` +
      `房间参与者：${participantNames}\n\n` +
      "规则：\n" +
      "- 只提取下周仍然重要的持久事实（过敏、偏好、纪念日、地址、目标、关系细节）\n" +
      "- 不提取一次性心情、临时想法、当前对话内容\n" +
      "- key 以 shared. 开头，点分小写英文\n" +
      "- 如已有记忆过时，输出 delete\n" +
      "- value 用中文，200字以内\n" +
      `- 最多 ${MAX_EXTRACTIONS_PER_RUN} 条，没有就输出 []\n\n` +
      '只输出 JSON: [{ "action": "set", "key": "shared.xxx", "value": "..." }]',
    userContent: formattedMessages,
    temperature: 0.2,
    jsonMode: true,
    maxTokens: 800
  });

  let actions: ExtractionAction[];
  try {
    const parsed = JSON.parse(result.content);
    actions = Array.isArray(parsed) ? parsed : parsed.actions ?? parsed.results ?? [];
  } catch {
    console.error("[memory-extractor] Failed to parse LLM response:", result.content);
    return;
  }

  let written = 0;
  for (const action of actions.slice(0, MAX_EXTRACTIONS_PER_RUN)) {
    if (!action.key || !KEY_PATTERN.test(action.key)) continue;
    if (!action.key.startsWith("shared.")) continue;

    if (action.action === "set" && action.value) {
      if (action.value.length > VALUE_MAX) continue;
      await deduplicatedMemoryWrite(
        prisma,
        roomId,
        action.key,
        action.value,
        "auto-extraction",
        null
      );
      written++;
    } else if (action.action === "delete") {
      await prisma.memory.deleteMany({ where: { roomId, key: action.key } });
      written++;
    }
  }

  const newState: ExtractionState = {
    lastExtractedAt: new Date().toISOString(),
    consecutiveEmptyResults: written === 0 ? state.consecutiveEmptyResults + 1 : 0
  };

  await prisma.memory.upsert({
    where: { roomId_key: { roomId, key: STATE_KEY } },
    update: { value: JSON.stringify(newState), source: "system" },
    create: { roomId, key: STATE_KEY, value: JSON.stringify(newState), source: "system" }
  });
}
