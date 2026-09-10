import { CronExpressionParser } from "cron-parser";

import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  ScheduledJobActiveLimitError,
  ScheduledJobNotFoundError,
  ScheduledJobRoomMismatchError,
  updateScheduledJobWithActiveCap,
} from "@/lib/scheduled-job-authoring";
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

    const parsed = await readJsonBody(request, scheduledJobPatchSchema);
    const updated = await prisma.$transaction((tx) =>
      updateScheduledJobWithActiveCap(tx, {
        roomId,
        jobId,
        buildData(existing) {
          const cron = parsed.cron?.trim() || existing.cron;
          const timezone = parsed.timezone?.trim() || existing.timezone;

          let nextRunAt = existing.nextRunAt;
          const cronChanged = parsed.cron !== undefined
            && parsed.cron.trim() !== existing.cron;
          const tzChanged = parsed.timezone !== undefined
            && parsed.timezone.trim() !== existing.timezone;
          const reEnabling = parsed.enabled === true && !existing.enabled;

          if (cronChanged || tzChanged || reEnabling) {
            try {
              nextRunAt = CronExpressionParser.parse(cron, { tz: timezone }).next().toDate();
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              throw jsonError(`Invalid cron expression: ${msg}`, 400);
            }
          }

          const prevPayload = (existing.payload as JobPayload | null) ?? {};
          const nextPrompt = parsed.prompt !== undefined
            ? parsed.prompt.trim()
            : prevPayload.prompt ?? "";
          if (!nextPrompt) {
            throw jsonError("prompt cannot be empty", 400);
          }

          return {
            cron,
            timezone,
            nextRunAt,
            payload: {
              prompt: nextPrompt,
              description: parsed.description !== undefined
                ? parsed.description
                : prevPayload.description ?? null,
              runOnce: parsed.runOnce !== undefined
                ? parsed.runOnce === true
                : prevPayload.runOnce === true,
            },
            ...(parsed.enabled !== undefined ? { enabled: parsed.enabled } : {}),
            ...(reEnabling ? { failCount: 0 } : {}),
          };
        },
      }),
    );

    return jsonOk({ job: formatJob(updated) });
  } catch (error) {
    if (
      error instanceof ScheduledJobNotFoundError
      || error instanceof ScheduledJobRoomMismatchError
    ) {
      return jsonError("Not found", 404);
    }
    if (error instanceof ScheduledJobActiveLimitError) {
      return jsonError(error.message, 409);
    }
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
