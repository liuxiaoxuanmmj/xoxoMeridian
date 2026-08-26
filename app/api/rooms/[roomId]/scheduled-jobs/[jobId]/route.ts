import { CronExpressionParser } from "cron-parser";

import { MAX_JOBS_PER_ROOM } from "@/agent/tools/schedule-tool";
import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { readJsonBody, scheduledJobPatchSchema } from "@/lib/validation";

type JobPayload = { prompt?: string; description?: string | null; runOnce?: boolean };

function formatJob(j: {
  id: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  nextRunAt: Date;
  lastRunAt: Date | null;
  failCount: number;
  payload: unknown;
  createdAt: Date;
}) {
  const payload = (j.payload as JobPayload | null) ?? {};
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
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomId: string; jobId: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { jobId, roomId } = await params;
    await assertRoomAccess(roomId, user.id);

    const job = await prisma.scheduledJob.findUnique({
      where: { id: jobId },
    });

    if (!job || job.roomId !== roomId) {
      return jsonError("Not found", 404);
    }

    return jsonOk({ job: formatJob(job) });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ roomId: string; jobId: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { jobId, roomId } = await params;
    await assertRoomAccess(roomId, user.id);

    const limited = enforceRateLimit(request, `scheduled-jobs-patch:${user.id}`, 10, 60_000);
    if (limited) return limited;

    const existing = await prisma.scheduledJob.findUnique({
      where: { id: jobId },
    });

    if (!existing || existing.roomId !== roomId) {
      return jsonError("Not found", 404);
    }

    const parsed = await readJsonBody(request, scheduledJobPatchSchema);

    if (parsed.enabled === true && !existing.enabled) {
      const activeCount = await prisma.scheduledJob.count({
        where: { roomId, enabled: true },
      });
      if (activeCount >= MAX_JOBS_PER_ROOM) {
        return jsonError(`Room already has ${activeCount} active jobs (max ${MAX_JOBS_PER_ROOM})`, 409);
      }
    }

    const cron = parsed.cron?.trim() || existing.cron;
    const timezone = parsed.timezone?.trim() || existing.timezone;

    let nextRunAt = existing.nextRunAt;
    const cronChanged = parsed.cron !== undefined && parsed.cron.trim() !== existing.cron;
    const tzChanged = parsed.timezone !== undefined && parsed.timezone.trim() !== existing.timezone;
    const reEnabling = parsed.enabled === true && !existing.enabled;

    if (cronChanged || tzChanged || reEnabling) {
      try {
        nextRunAt = CronExpressionParser.parse(cron, { tz: timezone }).next().toDate();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return jsonError(`Invalid cron expression: ${msg}`, 400);
      }
    }

    const prevPayload = (existing.payload as JobPayload | null) ?? {};
    const nextPrompt = parsed.prompt !== undefined ? parsed.prompt.trim() : prevPayload.prompt ?? "";
    if (!nextPrompt) {
      return jsonError("prompt cannot be empty", 400);
    }
    const nextDescription = parsed.description !== undefined ? parsed.description : prevPayload.description ?? null;
    const nextRunOnce = parsed.runOnce !== undefined ? parsed.runOnce === true : prevPayload.runOnce === true;

    const data: Record<string, unknown> = {
      cron,
      timezone,
      nextRunAt,
      payload: {
        prompt: nextPrompt,
        description: nextDescription,
        runOnce: nextRunOnce,
      },
    };

    if (parsed.enabled !== undefined) {
      data.enabled = parsed.enabled;
    }
    if (reEnabling) {
      data.failCount = 0;
    }

    const updated = await prisma.scheduledJob.update({
      where: { id: jobId },
      data,
    });

    return jsonOk({ job: formatJob(updated) });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ roomId: string; jobId: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { jobId, roomId } = await params;
    await assertRoomAccess(roomId, user.id);

    const limited = enforceRateLimit(request, `scheduled-jobs-delete:${user.id}`, 10, 60_000);
    if (limited) return limited;

    const job = await prisma.scheduledJob.findUnique({
      where: { id: jobId },
    });

    if (!job || job.roomId !== roomId) {
      return jsonError("Not found", 404);
    }

    const updated = await prisma.scheduledJob.update({
      where: { id: jobId },
      data: { enabled: false },
    });

    return jsonOk({ job: formatJob(updated) });
  } catch (error) {
    return errorToResponse(error);
  }
}
