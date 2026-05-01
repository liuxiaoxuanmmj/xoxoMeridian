import type { AgentTool } from "@/agent/types";

type NoteInput = {
  content?: string;
  color?: string;
};

export function createNoteTool(): AgentTool<NoteInput> {
  return {
    name: "note.create",
    description: "Create a small sticky note in the room side panel.",
    schema: {
      type: "object",
      required: ["content"],
      properties: {
        content: { type: "string" },
        color: { type: "string" }
      }
    },
    async execute(input, context) {
      const content = input.content?.trim();
      if (!content) {
        throw new Error("Note content is required.");
      }

      const note = await context.prisma.note.create({
        data: {
          roomId: context.roomId,
          createdById: context.requestedById ?? undefined,
          agentTaskId: context.taskId,
          content,
          color: input.color ?? "warm"
        }
      });

      return {
        noteId: note.id,
        content: note.content,
        color: note.color
      };
    }
  };
}
