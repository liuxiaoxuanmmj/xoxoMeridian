import { CronExpressionParser } from "cron-parser";

import { TRANSIENT_TOOL_RETRY } from "@/agent/tool-errors";
import type { AgentTool, ToolExecutionContext } from "@/agent/types";
import {
  createActiveScheduledJob,
  updateScheduledJobWithActiveCap,
} from "@/lib/scheduled-job-authoring";

type ScheduleCreateInput = {
  cron?: string;
  fireAt?: string;
  timezone?: string;
  prompt?: string;
  description?: string;
  runOnce?: boolean;
};

// A one-off scheduled for an absolute datetime may land slightly in the past by
// the time planning latency finishes — fire it anyway, but refuse anything that
// is clearly too stale to be what the user meant.
export const FIRE_AT_GRACE_MS = 5 * 60 * 1000;

type ScheduleListInput = Record<string, never>;

type ScheduleCancelInput = {
  jobId?: string;
};

type ScheduleUpdateInput = {
  jobId?: string;
  cron?: string;
  timezone?: string;
  prompt?: string;
  description?: string;
  runOnce?: boolean;
};

export function createScheduleCreateTool(): AgentTool<ScheduleCreateInput> {
  return {
    name: "schedule.create",
    risk: "medium",
    retry: TRANSIENT_TOOL_RETRY,
    description:
      "Create a scheduled job that fires the given prompt to the agent. " +
      "**For ONE-OFF tasks at a specific datetime** (今晚八点 / 明早 7:30 / 4月5日 9:00), " +
      "use the **fireAt** field with an ISO-8601 datetime (with timezone offset) — this is the correct, unambiguous way " +
      "and the tool will automatically set runOnce=true. Example: fireAt='2026-05-09T20:40:00+08:00'. " +
      "**For RECURRING tasks** (每周六 / 每天早上 / 每晚), use the **cron** field with a 5-field cron expression. " +
      "Never use cron+runOnce to express 'today at HH:MM' — planning latency can push current time past HH:MM and " +
      "cron's next() will roll to tomorrow; fireAt handles this correctly. " +
      "Common cron patterns: " +
      "'0 9 * * *' = every day at 9:00; " +
      "'0 9 * * 6' = every Saturday at 9:00 (0=Sun, 6=Sat); " +
      "'30 22 * * 1-5' = weekdays at 22:30; " +
      "'0 */2 * * *' = every 2 hours. " +
      "Always set timezone to the user's IANA zone (e.g. 'Asia/Shanghai'); for fireAt, the ISO offset also carries zone info but timezone is still used for display. " +
      "The prompt field is what the agent will receive and act on when the schedule fires — phrase it as a command to yourself, e.g. '提醒用户打扫卫生，温柔一点'.",
    effect: "database-write",
    schema: {
      type: "object",
      required: ["timezone", "prompt"],
      properties: {
        fireAt: {
          type: "string",
          description:
            "ISO-8601 absolute datetime with timezone offset, e.g. '2026-05-09T20:40:00+08:00'. " +
            "Use this for any one-off at a specific time. Automatically sets runOnce=true. " +
            "Exactly one of fireAt or cron must be provided."
        },
        cron: {
          type: "string",
          description:
            "Standard 5-field cron expression for recurring schedules. " +
            "Exactly one of fireAt or cron must be provided."
        },
        timezone: { type: "string", description: "IANA timezone, e.g. 'Asia/Shanghai'." },
        prompt: { type: "string", description: "What the agent should do when fired." },
        description: { type: "string", description: "Short human-readable summary, e.g. '今晚 20:40 发一首诗'." },
        runOnce: {
          type: "boolean",
          description:
            "If true, the job fires exactly once and then disables itself. Automatically forced to true when fireAt is used. " +
            "Only set this manually with cron if you really need a cron-matched one-off (rare — prefer fireAt)."
        }
      }
    },
    async execute(input, context) {
      const cron = input.cron?.trim();
      const fireAtRaw = input.fireAt?.trim();
      const timezone = input.timezone?.trim() || inferRequesterTimezone(context) || "Asia/Shanghai";
      const prompt = input.prompt?.trim();

      if (!prompt) throw new Error("prompt is required.");
      if (prompt.length > 500) throw new Error("prompt too long (>500 chars).");
      if (!cron && !fireAtRaw) throw new Error("one of 'cron' or 'fireAt' is required.");

      let nextRunAt: Date;
      let effectiveCron: string;
      let runOnce = input.runOnce === true;

      if (fireAtRaw) {
        const parsed = new Date(fireAtRaw);
        if (Number.isNaN(parsed.getTime())) {
          throw new Error(`Invalid fireAt '${fireAtRaw}': not a valid ISO datetime.`);
        }
        const now = Date.now();
        const diff = parsed.getTime() - now;
        if (diff < -FIRE_AT_GRACE_MS) {
          throw new Error(
            `fireAt '${fireAtRaw}' is more than 5 minutes in the past. Ask the user to clarify the time.`
          );
        }
        // Slightly-in-the-past or now → push by 1s so scheduleNearTermJobs picks
        // it up via setTimeout instead of the lte:now batch in the same tick.
        nextRunAt = diff < 0 ? new Date(now + 1000) : parsed;
        runOnce = true;
        effectiveCron = cron && isValidCron(cron, timezone) ? cron : synthesizeCronFromDate(parsed, timezone);
      } else {
        try {
          nextRunAt = CronExpressionParser.parse(cron!, { tz: timezone }).next().toDate();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Invalid cron expression '${cron}': ${msg}`);
        }
        effectiveCron = cron!;
      }

      const job = await createActiveScheduledJob(
        context.prisma,
        {
          roomId: context.roomId,
          agentId: context.agentId,
          cron: effectiveCron,
          timezone,
          payload: {
            prompt,
            description: input.description ?? null,
            runOnce
          },
          enabled: true,
          nextRunAt,
          createdById: context.requestedById ?? undefined
        },
      );

      return {
        jobId: job.id,
        cron: job.cron,
        timezone: job.timezone,
        nextRunAt: job.nextRunAt.toISOString(),
        description: input.description ?? null,
        runOnce
      };
    }
  };
}

export function createScheduleListTool(): AgentTool<ScheduleListInput> {
  return {
    name: "schedule.list",
    risk: "low",
    retry: TRANSIENT_TOOL_RETRY,
    description:
      "List the active scheduled jobs for this room (recurring and one-off). Call this BEFORE creating or updating a schedule if the user's request sounds similar to an existing one, so you don't create duplicates.",
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
        jobs: jobs.map((j) => {
          const payload = (j.payload as { description?: string; prompt?: string; runOnce?: boolean } | null) ?? {};
          return {
            jobId: j.id,
            cron: j.cron,
            timezone: j.timezone,
            nextRunAt: j.nextRunAt.toISOString(),
            description: payload.description ?? null,
            prompt: payload.prompt ?? null,
            runOnce: payload.runOnce === true
          };
        })
      };
    }
  };
}

export function createScheduleCancelTool(): AgentTool<ScheduleCancelInput> {
  return {
    name: "schedule.cancel",
    risk: "medium",
    retry: TRANSIENT_TOOL_RETRY,
    description:
      "Cancel (disable) a scheduled job by its jobId. Use this when the user asks to fully stop a scheduled task. " +
      "If the user only wants to CHANGE the schedule (frequency, time, prompt), use schedule.update instead of cancel+create. " +
      "Call schedule.list first if you don't know the id.",
    effect: "database-write",
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

export function createScheduleUpdateTool(): AgentTool<ScheduleUpdateInput> {
  return {
    name: "schedule.update",
    risk: "medium",
    retry: TRANSIENT_TOOL_RETRY,
    description:
      "Modify an existing scheduled job in place. Use this when the user wants to change an existing schedule — " +
      "for example '改成每周六' / '其实我只要今晚一次' / '把时间改到九点'. " +
      "Prefer update over cancel+create so the user gets a single coherent change. " +
      "Only provide the fields you want to change; omitted fields keep their current value. " +
      "Setting runOnce=true converts a recurring job into a one-off that disables itself after the next fire; " +
      "setting runOnce=false converts it back to recurring. " +
      "If you change cron or timezone, nextRunAt is recomputed automatically.",
    effect: "database-write",
    schema: {
      type: "object",
      required: ["jobId"],
      properties: {
        jobId: { type: "string", description: "The ScheduledJob id from schedule.list or schedule.create." },
        cron: { type: "string", description: "New cron expression. Omit to keep current." },
        timezone: { type: "string", description: "New IANA timezone. Omit to keep current." },
        prompt: { type: "string", description: "New prompt for the agent when fired." },
        description: { type: "string", description: "New human-readable description." },
        runOnce: {
          type: "boolean",
          description: "If true, the job disables itself after the next fire."
        }
      }
    },
    async execute(input, context) {
      const jobId = input.jobId?.trim();
      if (!jobId) throw new Error("jobId is required.");

      const updated = await updateScheduledJobWithActiveCap(context.prisma, {
        roomId: context.roomId,
        jobId,
        buildData(existing) {
          const cron = input.cron?.trim() || existing.cron;
          const timezone = input.timezone?.trim() || existing.timezone;

          let nextRunAt = existing.nextRunAt;
          const cronChanged = input.cron !== undefined && input.cron.trim() !== existing.cron;
          const tzChanged = input.timezone !== undefined && input.timezone.trim() !== existing.timezone;
          if (cronChanged || tzChanged) {
            try {
              nextRunAt = CronExpressionParser.parse(cron, { tz: timezone }).next().toDate();
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              throw new Error(`Invalid cron expression '${cron}': ${msg}`);
            }
          }

          const prevPayload = (existing.payload as {
            prompt?: string;
            description?: string | null;
            runOnce?: boolean;
          } | null) ?? {};
          const nextPrompt = input.prompt !== undefined
            ? input.prompt.trim()
            : prevPayload.prompt ?? "";
          if (!nextPrompt) throw new Error("prompt cannot be empty.");
          if (nextPrompt.length > 500) throw new Error("prompt too long (>500 chars).");

          return {
            cron,
            timezone,
            nextRunAt,
            enabled: true,
            failCount: 0,
            payload: {
              prompt: nextPrompt,
              description: input.description !== undefined
                ? input.description
                : prevPayload.description ?? null,
              runOnce: input.runOnce !== undefined
                ? input.runOnce === true
                : prevPayload.runOnce === true,
            },
          };
        },
      });

      const updatedPayload = (updated.payload as {
        description?: string | null;
        runOnce?: boolean;
      } | null) ?? {};

      return {
        jobId: updated.id,
        cron: updated.cron,
        timezone: updated.timezone,
        nextRunAt: updated.nextRunAt.toISOString(),
        description: updatedPayload.description ?? null,
        runOnce: updatedPayload.runOnce === true
      };
    }
  };
}

function inferRequesterTimezone(context: ToolExecutionContext): string | undefined {
  return context.runtimeContext.participants.find(
    (p) => p.userId === context.requestedById
  )?.user.profile?.timezone ?? undefined;
}

export function isValidCron(cron: string, timezone: string): boolean {
  try {
    CronExpressionParser.parse(cron, { tz: timezone });
    return true;
  } catch {
    return false;
  }
}

// Derive a display-only cron from a concrete fireAt so the DB column (NOT NULL)
// always has a parseable value. Uses the wall-clock minute/hour of the fireAt
// in the given timezone — the value is cosmetic because runOnce=true disables
// the job after firing, but it still needs to round-trip through cron-parser.
export function synthesizeCronFromDate(fireAt: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(fireAt);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "0";
  return `${Number(minute)} ${Number(hour) % 24} * * *`;
}
