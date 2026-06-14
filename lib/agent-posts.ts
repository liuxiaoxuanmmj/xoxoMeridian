import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ensureUniqueSlug } from "@/lib/posts";

type AgentPostInput = {
  title: string;
  content: string;
  roomId: string;
  metadata?: Record<string, unknown>;
};

export async function createAgentLogPost(input: AgentPostInput) {
  // Throttle: max 3 agent_log posts per room in 10 minutes
  const recentCutoff = new Date(Date.now() - 10 * 60 * 1000);
  const recentCount = await prisma.post.count({
    where: {
      type: "agent_log",
      roomId: input.roomId,
      publishedAt: { gte: recentCutoff },
    },
  });
  if (recentCount >= 3) return null;

  const baseSlug = `agent-log-${Date.now()}`;
  const slug = await ensureUniqueSlug(baseSlug);

  return prisma.post.create({
    data: {
      slug,
      title: input.title,
      content: input.content,
      type: "agent_log",
      roomId: input.roomId,
      publishedAt: new Date(),
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export function buildAgentLogContent(
  task: {
    agent: { displayName: string };
    status: string;
    toolCalls?: { toolName: string }[];
  },
  result: unknown
): string {
  const toolNames = task.toolCalls?.map((tc) => tc.toolName).join(", ") ?? "none";
  return [
    `**Agent**: ${task.agent.displayName}`,
    `**Status**: ${task.status}`,
    `**Tools used**: ${toolNames}`,
    "",
    "## Result",
    "```json",
    JSON.stringify(result, null, 2),
    "```",
  ].join("\n");
}
