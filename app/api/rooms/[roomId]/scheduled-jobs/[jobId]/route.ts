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
import {
  fireAtErrorMessage,
  resolveOneShotSchedule,
  resolveRecurringSchedule,
  ScheduledJobCronError,
  ScheduledJobFireAtError,
  ScheduledJobTimezoneError,
} from "@/lib/scheduled-job-one-shot";
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
          const timezone = parsed.timezone?.trim() || existing.timezone;
          const prevPayload = (existing.payload as JobPayload | null) ?? {};
          const existingRunOnce = prevPayload.runOnce === true;

          const nextPrompt = parsed.prompt !== undefined
            ? parsed.prompt.trim()
            : prevPayload.prompt ?? "";
          if (!nextPrompt) {
            throw jsonError("prompt cannot be empty", 400);
          }

          const reEnabling = parsed.enabled === true && !existing.enabled;
          const runOnce = parsed.runOnce !== undefined
            ? parsed.runOnce === true
            : existingRunOnce;
          const description = parsed.description !== undefined
            ? parsed.description
            : prevPayload.description ?? null;

          // An explicit instant defines the whole schedule: the stored cron has to
          // follow the new fireAt because the scheduler derives the next run from
          // cron when it claims the job.
          if (parsed.fireAt) {
            const resolved = resolveOneShotSchedule({
              fireAt: parsed.fireAt,
              cron: parsed.cron?.trim() ?? null,
              timezone,
            });
            return {
              cron: resolved.cron,
              timezone,
              nextRunAt: resolved.nextRunAt,
              payload: { prompt: nextPrompt, description, runOnce: true },
              ...(parsed.enabled !== undefined ? { enabled: parsed.enabled } : {}),
              ...(reEnabling ? { failCount: 0 } : {}),
            };
          }

          const cron = parsed.cron?.trim() || existing.cron;
          const cronChanged = parsed.cron !== undefined
            && parsed.cron.trim() !== existing.cron;
          const tzChanged = parsed.timezone !== undefined
            && parsed.timezone.trim() !== existing.timezone;
          // Converting a one-shot back to recurring must re-derive the instant
          // from cron; otherwise the job stays pinned to the old one-off time
          // even when the cron string itself is unchanged.
          const convertingToRecurring = existingRunOnce && !runOnce;

          const nextRunAt = cronChanged || tzChanged || reEnabling || convertingToRecurring
            ? resolveRecurringSchedule({ cron, timezone }).nextRunAt
            : existing.nextRunAt;

          return {
            cron,
            timezone,
            nextRunAt,
            payload: { prompt: nextPrompt, description, runOnce },
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
    if (error instanceof ScheduledJobFireAtError) {
      return jsonError(fireAtErrorMessage(error), 400);
    }
    if (error instanceof ScheduledJobCronError) {
      return jsonError(`Invalid cron expression: ${error.detail}`, 400);
    }
    if (error instanceof ScheduledJobTimezoneError) {
      return jsonError(`Invalid timezone: ${error.timezone}`, 400);
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
