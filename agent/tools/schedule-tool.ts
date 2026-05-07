import { CronExpressionParser } from "cron-parser";

import type { AgentTool, ToolExecutionContext } from "@/agent/types";

type ScheduleCreateInput = {
  cron?: string;
  timezone?: string;
  prompt?: string;
  description?: string;
};

type ScheduleListInput = Record<string, never>;

type ScheduleCancelInput = {
  jobId?: string;
};

// Hard cap on jobs per room. Prevents the LLM from going wild and filling the
// scheduler queue with duplicates.
const MAX_JOBS_PER_ROOM = 30;

export function createScheduleCreateTool(): AgentTool<ScheduleCreateInput> {
  return {
    name: "schedule.create",
    description:
      "Create a RECURRING scheduled job that fires the given prompt to the agent on a cron schedule. " +
      "Use this for repeating tasks like '每周六提醒我打扫卫生' or '每天早上8点发天气'. " +
      "For ONE-OFF reminders (tomorrow at 9am, next Monday, in 2 hours), use reminder.create instead. " +
      "The cron field uses standard 5-field cron (minute hour day-of-month month day-of-week). " +
      "Common patterns: " +
      "'0 9 * * *' = every day at 9:00; " +
      "'0 9 * * 6' = every Saturday at 9:00 (0=Sun, 6=Sat); " +
      "'30 22 * * 1-5' = weekdays at 22:30; " +
      "'0 9 1 * *' = 1st of every month at 9:00; " +
      "'0 */2 * * *' = every 2 hours. " +
      "Always set timezone to the user's IANA zone (e.g. 'Asia/Shanghai'). " +
      "The prompt field is what the agent will receive and act on when the schedule fires — phrase it as a command to yourself, e.g. '提醒用户打扫卫生，温柔一点'.",
    schema: {
      type: "object",
      required: ["cron", "timezone", "prompt"],
      properties: {
        cron: { type: "string", description: "Standard 5-field cron expression." },
        timezone: { type: "string", description: "IANA timezone, e.g. 'Asia/Shanghai'." },
        prompt: { type: "string", description: "What the agent should do when fired." },
        description: { type: "string", description: "Short human-readable summary, e.g. '每周六 9:00 打扫提醒'." }
      }
    },
    async execute(input, context) {
      const cron = input.cron?.trim();
      const timezone = input.timezone?.trim() || inferRequesterTimezone(context) || "Asia/Shanghai";
      const prompt = input.prompt?.trim();

      if (!cron) throw new Error("cron is required.");
      if (!prompt) throw new Error("prompt is required.");
      if (prompt.length > 500) throw new Error("prompt too long (>500 chars).");

      let nextRunAt: Date;
      try {
        nextRunAt = CronExpressionParser.parse(cron, { tz: timezone }).next().toDate();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Invalid cron expression '${cron}': ${msg}`);
      }

      const existingCount = await context.prisma.scheduledJob.count({
        where: { roomId: context.roomId, enabled: true }
      });
      if (existingCount >= MAX_JOBS_PER_ROOM) {
        throw new Error(`This room already has ${existingCount} active scheduled jobs (max ${MAX_JOBS_PER_ROOM}). Ask the user to cancel some first.`);
      }

      const job = await context.prisma.scheduledJob.create({
        data: {
          roomId: context.roomId,
          agentId: context.agentId,
          cron,
          timezone,
          payload: {
            prompt,
            description: input.description ?? null
          },
          enabled: true,
          nextRunAt,
          createdById: context.requestedById ?? undefined
        }
      });

      return {
        jobId: job.id,
        cron: job.cron,
        timezone: job.timezone,
        nextRunAt: job.nextRunAt.toISOString(),
        description: input.description ?? null
      };
    }
  };
}

export function createScheduleListTool(): AgentTool<ScheduleListInput> {
  return {
    name: "schedule.list",
    description:
      "List the active recurring scheduled jobs for this room. Call this BEFORE creating a new schedule if the user's request sounds similar to an existing one, so you don't create duplicates.",
    schema: { type: "object", properties: {} },
    async execute(_input, context) {
      const jobs = await context.prisma.scheduledJob.findMany({
        where: { roomId: context.roomId, enabled: true },
        orderBy: { nextRunAt: "asc" },
        take: 50,
        select: {
          id: true,
          cron: true,
          timezone: true,
          nextRunAt: true,
          payload: true
        }
      });
      return {
        count: jobs.length,
        jobs: jobs.map((j) => ({
          jobId: j.id,
          cron: j.cron,
          timezone: j.timezone,
          nextRunAt: j.nextRunAt.toISOString(),
          description: (j.payload as { description?: string } | null)?.description ?? null,
          prompt: (j.payload as { prompt?: string } | null)?.prompt ?? null
        }))
      };
    }
  };
}

export function createScheduleCancelTool(): AgentTool<ScheduleCancelInput> {
  return {
    name: "schedule.cancel",
    description:
      "Cancel (disable) a recurring scheduled job by its jobId. Use this when the user asks to stop a recurring reminder. Call schedule.list first if you don't know the id.",
    schema: {
      type: "object",
      required: ["jobId"],
      properties: {
        jobId: { type: "string", description: "The ScheduledJob id returned from schedule.list or schedule.create." }
      }
    },
    async execute(input, context) {
      const jobId = input.jobId?.trim();
      if (!jobId) throw new Error("jobId is required.");

      const job = await context.prisma.scheduledJob.findUnique({ where: { id: jobId } });
      if (!job) throw new Error(`Scheduled job not found: ${jobId}`);
      if (job.roomId !== context.roomId) {
        throw new Error("Scheduled job does not belong to this room.");
      }

      await context.prisma.scheduledJob.update({
        where: { id: jobId },
        data: { enabled: false }
      });

      return { jobId, cancelled: true };
    }
  };
}

function inferRequesterTimezone(context: ToolExecutionContext): string | undefined {
  return context.runtimeContext.participants.find(
    (p) => p.userId === context.requestedById
  )?.user.profile?.timezone ?? undefined;
}
