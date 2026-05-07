import { CronExpressionParser } from "cron-parser";
import type { Prisma, Reminder, ScheduledJob } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const MISSED_WINDOW_MS = 60 * 60 * 1000;
const MAX_FAIL_COUNT = 3;
const REMINDER_BATCH = 50;
const JOB_BATCH = 20;
const DEFAULT_AGENT_SLUG = "life-assistant";

// Hybrid strategy: reminders within 5min get a precise setTimeout; others poll.
const PRECISE_THRESHOLD_MS = 5 * 60 * 1000;

// In-memory timers for near-term reminders. Key = reminder.id, value = NodeJS.Timeout.
const activeTimers = new Map<string, NodeJS.Timeout>();

export type SchedulerTickResult = {
  reminders: { fired: number; skipped: number; failed: number };
  jobs: { fired: number; skipped: number; failed: number };
};

export function clearAllTimers() {
  for (const timer of activeTimers.values()) clearTimeout(timer);
  activeTimers.clear();
}

export async function schedulerTick(now = new Date()): Promise<SchedulerTickResult> {
  const [reminders, jobs] = await Promise.all([
    fireDueReminders(now),
    fireDueScheduledJobs(now),
  ]);
  await scheduleNearTermReminders(now);
  return { reminders, jobs };
}

async function fireDueReminders(now: Date) {
  const due = await prisma.reminder.findMany({
    where: { status: "pending", dueAt: { not: null, lte: now } },
    take: REMINDER_BATCH,
    orderBy: { dueAt: "asc" },
  });

  let fired = 0, skipped = 0, failed = 0;

  for (const reminder of due) {
    if (!reminder.dueAt) continue;
    if (activeTimers.has(reminder.id)) continue; // skip if timer owns it

    if (now.getTime() - reminder.dueAt.getTime() > MISSED_WINDOW_MS) {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: "skipped" },
      });
      skipped += 1;
      continue;
    }

    try {
      await dispatchReminderTask(reminder);
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: "fired" },
      });
      fired += 1;
    } catch (error) {
      failed += 1;
      await markReminderFailure(reminder, error);
    }
  }

  return { fired, skipped, failed };
}

async function fireDueScheduledJobs(now: Date) {
  const due = await prisma.scheduledJob.findMany({
    where: { enabled: true, nextRunAt: { lte: now } },
    take: JOB_BATCH,
    orderBy: { nextRunAt: "asc" },
  });

  let fired = 0, skipped = 0, failed = 0;

  for (const job of due) {
    const inWindow = now.getTime() - job.nextRunAt.getTime() <= MISSED_WINDOW_MS;

    try {
      if (inWindow) {
        await dispatchScheduledJobTask(job);
        fired += 1;
      } else {
        skipped += 1;
      }

      await prisma.scheduledJob.update({
        where: { id: job.id },
        data: {
          lastRunAt: inWindow ? now : job.lastRunAt,
          nextRunAt: computeNextRun(job.cron, job.timezone, now),
          failCount: 0,
        },
      });
    } catch (error) {
      failed += 1;
      await markJobFailure(job, error);
    }
  }

  return { fired, skipped, failed };
}

async function dispatchReminderTask(reminder: Reminder) {
  const agent = await prisma.agent.findUnique({ where: { slug: DEFAULT_AGENT_SLUG } });
  if (!agent) throw new Error(`Default agent '${DEFAULT_AGENT_SLUG}' not found`);

  const prompt = buildReminderPrompt(reminder);

  const task = await prisma.agentTask.create({
    data: {
      roomId: reminder.roomId,
      agentId: agent.id,
      input: {
        rawContent: reminder.title,
        normalizedContent: prompt,
        trigger: "reminder.fired",
        reminderId: reminder.id,
      } satisfies Prisma.InputJsonObject,
    },
  });

  await prisma.eventLog.create({
    data: {
      roomId: reminder.roomId,
      agentTaskId: task.id,
      type: "scheduler.reminder.fired",
      payload: { reminderId: reminder.id, title: reminder.title } satisfies Prisma.InputJsonObject,
    },
  });
}

async function dispatchScheduledJobTask(job: ScheduledJob) {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const promptFromPayload = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  const prompt = promptFromPayload || "执行预设的定时任务，并向房间发一条简短的播报。";

  const task = await prisma.agentTask.create({
    data: {
      roomId: job.roomId,
      agentId: job.agentId,
      input: {
        rawContent: prompt,
        normalizedContent: prompt,
        trigger: "scheduled.job",
        jobId: job.id,
      } satisfies Prisma.InputJsonObject,
    },
  });

  await prisma.eventLog.create({
    data: {
      roomId: job.roomId,
      agentTaskId: task.id,
      type: "scheduler.job.fired",
      payload: { jobId: job.id, cron: job.cron, timezone: job.timezone } satisfies Prisma.InputJsonObject,
    },
  });
}

function buildReminderPrompt(reminder: Reminder) {
  const parts = [`提醒到点了：${reminder.title}。`];
  if (reminder.body) parts.push(`附加说明：${reminder.body}。`);
  parts.push("请用一句温暖的话向房间发出这个提醒，不需要重复时间，也不要长篇大论。");
  return parts.join("");
}

function computeNextRun(cron: string, timezone: string, after: Date): Date {
  return CronExpressionParser.parse(cron, { tz: timezone, currentDate: after }).next().toDate();
}

async function markReminderFailure(reminder: Reminder, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const meta = (reminder.metadata ?? {}) as Record<string, unknown>;
  const attempts = ((meta.fireAttempts as number | undefined) ?? 0) + 1;

  const data: Prisma.ReminderUpdateInput = {
    metadata: { ...meta, fireAttempts: attempts, lastError: message } as Prisma.InputJsonValue,
  };
  if (attempts >= MAX_FAIL_COUNT) data.status = "cancelled";

  await prisma.reminder.update({ where: { id: reminder.id }, data });
  console.error(`[scheduler] reminder ${reminder.id} failed (attempt ${attempts}):`, message);
}

async function markJobFailure(job: ScheduledJob, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const failCount = job.failCount + 1;
  const data: Prisma.ScheduledJobUpdateInput = { failCount };
  if (failCount >= MAX_FAIL_COUNT) data.enabled = false;

  await prisma.scheduledJob.update({ where: { id: job.id }, data });
  console.error(`[scheduler] job ${job.id} failed (failCount=${failCount}):`, message);
}

async function scheduleNearTermReminders(now: Date) {
  const soon = new Date(now.getTime() + PRECISE_THRESHOLD_MS);
  const nearTerm = await prisma.reminder.findMany({
    where: {
      status: "pending",
      dueAt: { not: null, gt: now, lte: soon },
    },
    take: 100,
  });

  for (const reminder of nearTerm) {
    if (!reminder.dueAt || activeTimers.has(reminder.id)) continue;
    const delay = Math.max(0, reminder.dueAt.getTime() - now.getTime());
    const timer = setTimeout(() => {
      activeTimers.delete(reminder.id);
      void fireReminderNow(reminder.id);
    }, delay);
    activeTimers.set(reminder.id, timer);
  }
}

async function fireReminderNow(reminderId: string) {
  const reminder = await prisma.reminder.findUnique({ where: { id: reminderId } });
  if (!reminder || reminder.status !== "pending") return;

  try {
    await dispatchReminderTask(reminder);
    await prisma.reminder.update({
      where: { id: reminderId },
      data: { status: "fired" },
    });
  } catch (error) {
    await markReminderFailure(reminder, error);
  }
}
