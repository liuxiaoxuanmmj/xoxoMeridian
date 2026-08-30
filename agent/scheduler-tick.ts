import { CronExpressionParser } from "cron-parser";
import type { Prisma, ScheduledJob } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const MISSED_WINDOW_MS = 60 * 60 * 1000;
const MAX_FAIL_COUNT = 3;
const JOB_BATCH = 20;
const DEFAULT_AGENT_SLUG = "life-assistant";

const JOB_PRECISE_THRESHOLD_MS = 2 * 60 * 1000;

export const TRIGGER_SCHEDULED_JOB = "scheduled.job";

// Tools the agent must NOT call when running on behalf of a fired
// schedule — calling any of these would re-create or mutate the
// very task that just fired, causing self-reschedule loops.
export const SCHEDULER_BLOCKED_TOOLS: readonly string[] = [
  "schedule.create",
  "schedule.update",
  "schedule.cancel",
];

export const TRIGGER_MARKER = "[这是已触发的定时任务正在执行]";

const BLOCKED_TOOL_DIRECTIVE =
  `不要再调用 ${SCHEDULER_BLOCKED_TOOLS.join(" / ")} 安排新任务。`;

const activeJobTimers = new Map<string, NodeJS.Timeout>();

export type SchedulerTickResult = {
  jobs: { fired: number; skipped: number; failed: number };
};

export function clearAllTimers() {
  for (const timer of activeJobTimers.values()) clearTimeout(timer);
  activeJobTimers.clear();
}

export async function schedulerTick(now = new Date()): Promise<SchedulerTickResult> {
  const empty = { fired: 0, skipped: 0, failed: 0 };

  const hasJob = await prisma.scheduledJob.findFirst({ where: { enabled: true }, select: { id: true } });

  if (!hasJob) {
    return { jobs: { ...empty } };
  }

  const jobs = await (async () => {
    const fired = await fireDueScheduledJobs(now);
    await scheduleNearTermJobs(now);
    return fired;
  })();

  return { jobs };
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

    try {
      const result = await claimAndDispatchScheduledJob(job, now, inWindow);
      if (result === "fired") fired += 1;
      if (result === "skipped") skipped += 1;
    } catch (error) {
      await recordJobDispatchFailure(job, error);
      failed += 1;
    }
  }

  return { fired, skipped, failed };
}

async function claimAndDispatchScheduledJob(
  job: ScheduledJob,
  now: Date,
  inWindow: boolean
): Promise<"lost" | "skipped" | "fired"> {
  const newNextRunAt = computeNextRun(job.cron, job.timezone, now);
  const runOnce = isRunOnce(job);

  return prisma.$transaction(async (tx) => {
    const claim = await tx.scheduledJob.updateMany({
      where: {
        id: job.id,
        enabled: job.enabled,
        nextRunAt: job.nextRunAt,
        lastRunAt: job.lastRunAt,
        failCount: job.failCount
      },
      data: {
        lastRunAt: inWindow ? now : job.lastRunAt,
        nextRunAt: newNextRunAt,
        failCount: 0,
        enabled: runOnce && inWindow ? false : true
      }
    });
    if (claim.count === 0) return "lost";
    if (!inWindow) return "skipped";

    await dispatchScheduledJobTask(job, tx);
    return "fired";
  });
}

async function dispatchScheduledJobTask(
  job: ScheduledJob,
  client: Prisma.TransactionClient
) {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const promptFromPayload = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  const action = promptFromPayload || "执行预设的定时任务，并向房间发一条简短的播报。";
  const prompt = wrapTriggerPrompt(action);

  const task = await client.agentTask.create({
    data: {
      roomId: job.roomId,
      agentId: job.agentId,
      input: {
        rawContent: action,
        normalizedContent: prompt,
        trigger: TRIGGER_SCHEDULED_JOB,
        jobId: job.id,
      } satisfies Prisma.InputJsonObject,
    },
  });

  await client.eventLog.create({
    data: {
      roomId: job.roomId,
      agentTaskId: task.id,
      type: "scheduler.job.fired",
      payload: { jobId: job.id, cron: job.cron, timezone: job.timezone } satisfies Prisma.InputJsonObject,
    },
  });
}

// Wraps a fire-time action prompt with a marker so the LLM treats it as "execute
// now" instead of mistaking it for a fresh user request to schedule something.
// Idempotent: if the marker is already present, returns the input unchanged.
function wrapTriggerPrompt(action: string): string {
  if (action.startsWith(TRIGGER_MARKER)) return action;
  return (
    `${TRIGGER_MARKER} 请立即执行下面的动作并把结果发到房间。\n` +
    `${BLOCKED_TOOL_DIRECTIVE}\n\n` +
    `动作：${action}`
  );
}

function computeNextRun(cron: string, timezone: string, after: Date): Date {
  return CronExpressionParser.parse(cron, { tz: timezone, currentDate: after }).next().toDate();
}

function isRunOnce(job: ScheduledJob): boolean {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  return payload.runOnce === true;
}

async function recordJobDispatchFailure(job: ScheduledJob, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const failCount = job.failCount + 1;
  const reachedCap = failCount >= MAX_FAIL_COUNT;

  const update = await prisma.scheduledJob.updateMany({
    where: {
      id: job.id,
      enabled: job.enabled,
      nextRunAt: job.nextRunAt,
      lastRunAt: job.lastRunAt,
      failCount: job.failCount
    },
    data: {
      failCount,
      enabled: reachedCap ? false : job.enabled
    }
  });
  if (update.count === 1) {
    console.error(`[scheduler] job ${job.id} failed (failCount=${failCount}):`, message);
  } else {
    console.warn(`[scheduler] ignored stale failure for job ${job.id}:`, message);
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

async function fireJobNow(jobId: string) {
  const job = await prisma.scheduledJob.findUnique({ where: { id: jobId } });
  if (!job || !job.enabled) return;

  const now = new Date();

  try {
    await claimAndDispatchScheduledJob(job, now, true);
  } catch (error) {
    await recordJobDispatchFailure(job, error);
  }
}
