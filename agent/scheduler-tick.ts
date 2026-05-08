import { CronExpressionParser } from "cron-parser";
import type { Prisma, Reminder, ScheduledJob } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const MISSED_WINDOW_MS = 60 * 60 * 1000;
const MAX_FAIL_COUNT = 3;
const REMINDER_BATCH = 50;
const JOB_BATCH = 20;
const DEFAULT_AGENT_SLUG = "life-assistant";

const REMINDER_PRECISE_THRESHOLD_MS = 5 * 60 * 1000;
const JOB_PRECISE_THRESHOLD_MS = 2 * 60 * 1000;

const activeTimers = new Map<string, NodeJS.Timeout>();
const activeJobTimers = new Map<string, NodeJS.Timeout>();

export type SchedulerTickResult = {
  reminders: { fired: number; skipped: number; failed: number };
  jobs: { fired: number; skipped: number; failed: number };
};

export function clearAllTimers() {
  for (const timer of activeTimers.values()) clearTimeout(timer);
  activeTimers.clear();
  for (const timer of activeJobTimers.values()) clearTimeout(timer);
  activeJobTimers.clear();
}

export async function schedulerTick(now = new Date()): Promise<SchedulerTickResult> {
  const empty = { fired: 0, skipped: 0, failed: 0 };

  const [hasReminder, hasJob] = await Promise.all([
    prisma.reminder.findFirst({ where: { status: "pending" }, select: { id: true } }),
    prisma.scheduledJob.findFirst({ where: { enabled: true }, select: { id: true } }),
  ]);

  if (!hasReminder && !hasJob) {
    return { reminders: { ...empty }, jobs: { ...empty } };
  }

  const reminderWork = hasReminder
    ? (async () => {
        const fired = await fireDueReminders(now);
        await scheduleNearTermReminders(now);
        return fired;
      })()
    : Promise.resolve({ ...empty });

  const jobWork = hasJob
    ? (async () => {
        const fired = await fireDueScheduledJobs(now);
        await scheduleNearTermJobs(now);
        return fired;
      })()
    : Promise.resolve({ ...empty });

  const [reminders, jobs] = await Promise.all([reminderWork, jobWork]);
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
    if (activeTimers.has(reminder.id)) continue;

    const missed = now.getTime() - reminder.dueAt.getTime() > MISSED_WINDOW_MS;
    const targetStatus: Prisma.ReminderUpdateInput["status"] = missed ? "skipped" : "fired";

    const claim = await prisma.reminder.updateMany({
      where: { id: reminder.id, status: "pending" },
      data: { status: targetStatus },
    });
    if (claim.count === 0) continue;

    if (missed) {
      skipped += 1;
      continue;
    }

    try {
      await dispatchReminderTask(reminder);
      fired += 1;
    } catch (error) {
      await releaseReminderClaim(reminder, error);
      failed += 1;
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
    if (activeJobTimers.has(job.id)) continue;

    const inWindow = now.getTime() - job.nextRunAt.getTime() <= MISSED_WINDOW_MS;
    const newNextRunAt = computeNextRun(job.cron, job.timezone, now);

    const claim = await prisma.scheduledJob.updateMany({
      where: { id: job.id, enabled: true, nextRunAt: job.nextRunAt },
      data: {
        lastRunAt: inWindow ? now : job.lastRunAt,
        nextRunAt: newNextRunAt,
        failCount: 0,
      },
    });
    if (claim.count === 0) continue;

    if (!inWindow) {
      skipped += 1;
      continue;
    }

    try {
      await dispatchScheduledJobTask(job);
      fired += 1;
    } catch (error) {
      await rollbackJobClaim(job, error);
      failed += 1;
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

async function releaseReminderClaim(reminder: Reminder, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const meta = (reminder.metadata ?? {}) as Record<string, unknown>;
  const attempts = ((meta.fireAttempts as number | undefined) ?? 0) + 1;
  const reachedCap = attempts >= MAX_FAIL_COUNT;

  await prisma.reminder.update({
    where: { id: reminder.id },
    data: {
      status: reachedCap ? "cancelled" : "pending",
      metadata: { ...meta, fireAttempts: attempts, lastError: message } as Prisma.InputJsonValue,
    },
  });
  console.error(`[scheduler] reminder ${reminder.id} failed (attempt ${attempts}):`, message);
}

async function rollbackJobClaim(job: ScheduledJob, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const failCount = job.failCount + 1;
  const reachedCap = failCount >= MAX_FAIL_COUNT;

  await prisma.scheduledJob.update({
    where: { id: job.id },
    data: {
      nextRunAt: job.nextRunAt,
      lastRunAt: job.lastRunAt,
      failCount,
      enabled: reachedCap ? false : job.enabled,
    },
  });
  console.error(`[scheduler] job ${job.id} failed (failCount=${failCount}):`, message);
}

async function scheduleNearTermReminders(now: Date) {
  const soon = new Date(now.getTime() + REMINDER_PRECISE_THRESHOLD_MS);
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

async function scheduleNearTermJobs(now: Date) {
  const soon = new Date(now.getTime() + JOB_PRECISE_THRESHOLD_MS);
  const nearTerm = await prisma.scheduledJob.findMany({
    where: {
      enabled: true,
      nextRunAt: { gt: now, lte: soon },
    },
    take: 100,
  });

  for (const job of nearTerm) {
    if (activeJobTimers.has(job.id)) continue;
    const delay = Math.max(0, job.nextRunAt.getTime() - now.getTime());
    const timer = setTimeout(() => {
      activeJobTimers.delete(job.id);
      void fireJobNow(job.id);
    }, delay);
    activeJobTimers.set(job.id, timer);
  }
}

async function fireReminderNow(reminderId: string) {
  const reminder = await prisma.reminder.findUnique({ where: { id: reminderId } });
  if (!reminder || reminder.status !== "pending") return;
  if (!reminder.dueAt) return;

  const claim = await prisma.reminder.updateMany({
    where: { id: reminderId, status: "pending" },
    data: { status: "fired" },
  });
  if (claim.count === 0) return;

  try {
    await dispatchReminderTask(reminder);
  } catch (error) {
    await releaseReminderClaim(reminder, error);
  }
}

async function fireJobNow(jobId: string) {
  const job = await prisma.scheduledJob.findUnique({ where: { id: jobId } });
  if (!job || !job.enabled) return;

  const now = new Date();
  const newNextRunAt = computeNextRun(job.cron, job.timezone, now);

  const claim = await prisma.scheduledJob.updateMany({
    where: { id: jobId, enabled: true, nextRunAt: job.nextRunAt },
    data: {
      lastRunAt: now,
      nextRunAt: newNextRunAt,
      failCount: 0,
    },
  });
  if (claim.count === 0) return;

  try {
    await dispatchScheduledJobTask(job);
  } catch (error) {
    await rollbackJobClaim(job, error);
  }
}
