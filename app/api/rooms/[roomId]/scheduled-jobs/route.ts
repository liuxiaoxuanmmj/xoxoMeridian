import { CronExpressionParser } from "cron-parser";

import {
  FIRE_AT_GRACE_MS,
  isValidCron,
  MAX_JOBS_PER_ROOM,
  synthesizeCronFromDate,
} from "@/agent/tools/schedule-tool";
import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { readJsonBody, scheduledJobPostSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { roomId: string } }
) {
  try {
    const user = await requireCurrentUser();
    await assertRoomAccess(params.roomId, user.id);

    const url = new URL(request.url);
    const enabledFilter = url.searchParams.get("enabled");

    const where: Record<string, unknown> = { roomId: params.roomId };
    if (enabledFilter === "true") where.enabled = true;
    if (enabledFilter === "false") where.enabled = false;

    const jobs = await prisma.scheduledJob.findMany({
      where,
      orderBy: { nextRunAt: "asc" },
    });

    return jsonOk({
      jobs: jobs.map((j) => {
        const payload = (j.payload as { prompt?: string; description?: string | null; runOnce?: boolean } | null) ?? {};
        return {
          id: j.id,
          cron: j.cron,
          timezone: j.timezone,
          enabled: j.enabled,
          nextRunAt: j.nextRunAt.toISOString(),
          lastRunAt: j.lastRunAt?.toISOString() ?? null,
          failCount: j.failCount,
          prompt: payload.prompt ?? null,
          description: payload.description ?? null,
          runOnce: payload.runOnce === true,
          createdAt: j.createdAt.toISOString(),
        };
      }),
    });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: { roomId: string } }
) {
  try {
    const user = await requireCurrentUser();
    await assertRoomAccess(params.roomId, user.id);

    const limited = enforceRateLimit(request, `scheduled-jobs:${user.id}`, 10, 60_000);
    if (limited) return limited;

    const parsed = await readJsonBody(request, scheduledJobPostSchema);

    const agent = await prisma.agent.findUnique({ where: { slug: "life-assistant" } });
    if (!agent) {
      return jsonError("Default agent not configured", 500);
    }

    const existingCount = await prisma.scheduledJob.count({
      where: { roomId: params.roomId, enabled: true },
    });
    if (existingCount >= MAX_JOBS_PER_ROOM) {
      return jsonError(`Room already has ${existingCount} active jobs (max ${MAX_JOBS_PER_ROOM})`, 409);
    }

    let nextRunAt: Date;
    let effectiveCron: string;
    let runOnce = parsed.runOnce === true;

    if (parsed.fireAt) {
      const fireDate = new Date(parsed.fireAt);
      if (Number.isNaN(fireDate.getTime())) {
        return jsonError("Invalid fireAt datetime", 400);
      }
      const diff = fireDate.getTime() - Date.now();
      if (diff < -FIRE_AT_GRACE_MS) {
        return jsonError("fireAt is more than 5 minutes in the past", 400);
      }
      nextRunAt = diff < 0 ? new Date(Date.now() + 1000) : fireDate;
      runOnce = true;
      effectiveCron = parsed.cron && isValidCron(parsed.cron, parsed.timezone)
        ? parsed.cron
        : synthesizeCronFromDate(fireDate, parsed.timezone);
    } else {
      try {
        nextRunAt = CronExpressionParser.parse(parsed.cron!, { tz: parsed.timezone }).next().toDate();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return jsonError(`Invalid cron expression: ${msg}`, 400);
      }
      effectiveCron = parsed.cron!;
    }

    const job = await prisma.scheduledJob.create({
      data: {
        roomId: params.roomId,
        agentId: agent.id,
        cron: effectiveCron,
        timezone: parsed.timezone,
        payload: {
          prompt: parsed.prompt,
          description: parsed.description ?? null,
          runOnce,
        },
        enabled: true,
        nextRunAt,
        createdById: user.id,
      },
    });

    const payload = job.payload as { prompt?: string; description?: string | null; runOnce?: boolean };

    return jsonOk(
      {
        job: {
          id: job.id,
          cron: job.cron,
          timezone: job.timezone,
          enabled: job.enabled,
          nextRunAt: job.nextRunAt.toISOString(),
          prompt: payload.prompt ?? null,
          description: payload.description ?? null,
          runOnce,
          createdAt: job.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorToResponse(error);
  }
}
