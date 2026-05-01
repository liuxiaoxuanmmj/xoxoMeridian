import type { AgentTool } from "@/agent/types";

type MemoInput = {
  title?: string;
  content?: string;
  pinned?: boolean;
};

export function createMemoTool(): AgentTool<MemoInput> {
  return {
    name: "memo.create",
    description: "Create a persistent memo in the room side panel.",
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
