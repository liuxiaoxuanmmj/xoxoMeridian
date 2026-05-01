import type { AgentTool, ToolExecutionContext } from "@/agent/types";

type ReminderInput = {
  title?: string;
  body?: string;
  dueAt?: string;
  naturalDue?: string;
  timezone?: string;
  contactWindowStart?: string;
  contactWindowEnd?: string;
  notifyChannel?: string;
};

export function createReminderTool(): AgentTool<ReminderInput> {
  return {
    name: "reminder.create",
    description: "Create a persistent reminder. MVP stores it for display; future notification workers can deliver it.",
    schema: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string" },
        body: { type: "string" },
        dueAt: { type: "string" },
        naturalDue: { type: "string" },
        timezone: { type: "string" },
        notifyChannel: { type: "string" }
      }
    },
    async execute(input, context) {
      const title = input.title?.trim();
      if (!title) {
        throw new Error("Reminder title is required.");
      }

      const reminder = await context.prisma.reminder.create({
        data: {
          roomId: context.roomId,
          createdById: context.requestedById ?? undefined,
          agentTaskId: context.taskId,
          title,
          body: input.body,
          dueAt: parseDueAt(input),
          timezone: input.timezone ?? inferRequesterTimezone(context) ?? "Asia/Shanghai",
          contactWindowStart: input.contactWindowStart,
          contactWindowEnd: input.contactWindowEnd,
          notifyChannel: input.notifyChannel ?? "in-app",
          metadata: {
            naturalDue: input.naturalDue,
            notificationReady: false
          }
        }
      });

      return {
        reminderId: reminder.id,
        title: reminder.title,
        dueAt: reminder.dueAt,
        timezone: reminder.timezone,
        status: reminder.status
      };
    }
  };
}

function parseDueAt(input: ReminderInput) {
  if (input.dueAt) {
    const parsed = new Date(input.dueAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (input.naturalDue?.toLowerCase().includes("tomorrow") || input.body?.includes("明天")) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 30, 0, 0);
    return tomorrow;
  }

  return null;
}

function inferRequesterTimezone(context: ToolExecutionContext) {
  return context.runtimeContext.participants.find((participant) => participant.userId === context.requestedById)?.user.profile?.timezone;
}
