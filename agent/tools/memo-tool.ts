import type { AgentTool } from "@/agent/types";
import { TRANSIENT_TOOL_RETRY } from "@/agent/tool-errors";

type MemoInput = {
  title?: string;
  content?: string;
  pinned?: boolean;
};

type MemoListInput = Record<string, never>;

export function createMemoListTool(): AgentTool<MemoListInput> {
  return {
    name: "memo.list",
    risk: "low",
    retry: TRANSIENT_TOOL_RETRY,
    description:
      "List all memos in this room. Call this when the user asks about existing memos or wants to review them, before creating new ones.",
    schema: { type: "object", properties: {} },
    async execute(_input, context) {
      const memos = await context.prisma.memo.findMany({
        where: { roomId: context.roomId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          content: true,
          pinned: true,
          createdAt: true
        }
      });
      return {
        count: memos.length,
        memos: memos.map((m) => ({
          memoId: m.id,
          title: m.title,
          content: m.content,
          pinned: m.pinned,
          createdAt: m.createdAt.toISOString()
        }))
      };
    }
  };
}

export function createMemoTool(): AgentTool<MemoInput> {
  return {
    name: "memo.create",
    risk: "medium",
    retry: TRANSIENT_TOOL_RETRY,
    description: "Create a persistent memo in the room side panel.",
    effect: "database-write",
    schema: {
      type: "object",
      required: ["content"],
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        pinned: { type: "boolean" }
      }
    },
    async execute(input, context) {
      const content = input.content?.trim();
      if (!content) {
        throw new Error("Memo content is required.");
      }

      const memo = await context.prisma.memo.create({
        data: {
          roomId: context.roomId,
          createdById: context.requestedById ?? undefined,
          agentTaskId: context.taskId,
          title: input.title?.trim() || "新的备忘录",
          content,
          pinned: Boolean(input.pinned)
        }
      });

      return {
        memoId: memo.id,
        title: memo.title,
        content: memo.content
      };
    }
  };
}

type MemoUpdateInput = {
  memoId?: string;
  title?: string;
  content?: string;
  pinned?: boolean;
};

export function createMemoUpdateTool(): AgentTool<MemoUpdateInput> {
  return {
    name: "memo.update",
    risk: "medium",
    retry: TRANSIENT_TOOL_RETRY,
    description:
      "Update an existing memo in place. Use this when the user wants to change a memo's title, content, or pinned status. " +
      "Only provide the fields you want to change; omitted fields keep their current value. " +
      "Call memo.list first if you don't know the memoId.",
    effect: "database-write",
    schema: {
      type: "object",
      required: ["memoId"],
      properties: {
        memoId: { type: "string", description: "The memo id from memo.list or memo.create." },
        title: { type: "string", description: "New title. Omit to keep current." },
        content: { type: "string", description: "New content. Omit to keep current." },
        pinned: { type: "boolean", description: "New pinned status. Omit to keep current." }
      }
    },
    async execute(input, context) {
      const memoId = input.memoId?.trim();
      if (!memoId) throw new Error("memoId is required.");

      const existing = await context.prisma.memo.findUnique({ where: { id: memoId } });
      if (!existing) throw new Error(`Memo not found: ${memoId}`);
      if (existing.roomId !== context.roomId) {
        throw new Error("Memo does not belong to this room.");
      }

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title.trim() || existing.title;
      if (input.content !== undefined) data.content = input.content.trim() || existing.content;
      if (input.pinned !== undefined) data.pinned = input.pinned;

      const updated = await context.prisma.memo.update({ where: { id: memoId }, data });

      return {
        memoId: updated.id,
        title: updated.title,
        content: updated.content,
        pinned: updated.pinned
      };
    }
  };
}

type MemoDeleteInput = {
  memoId?: string;
};

export function createMemoDeleteTool(): AgentTool<MemoDeleteInput> {
  return {
    name: "memo.delete",
    risk: "high",
    retry: TRANSIENT_TOOL_RETRY,
    description:
      "Delete a memo by its memoId. Use this when the user wants to remove a memo entirely. " +
      "Call memo.list first if you don't know the memoId.",
    effect: "database-write",
    schema: {
      type: "object",
      required: ["memoId"],
      properties: {
        memoId: { type: "string", description: "The memo id from memo.list or memo.create." }
      }
    },
    async execute(input, context) {
      const memoId = input.memoId?.trim();
      if (!memoId) throw new Error("memoId is required.");

      const existing = await context.prisma.memo.findUnique({ where: { id: memoId } });
      if (!existing) throw new Error(`Memo not found: ${memoId}`);
      if (existing.roomId !== context.roomId) {
        throw new Error("Memo does not belong to this room.");
      }

      await context.prisma.memo.delete({ where: { id: memoId } });

      return { memoId, deleted: true };
    }
  };
}
