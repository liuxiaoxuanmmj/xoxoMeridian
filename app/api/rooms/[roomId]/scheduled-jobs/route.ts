import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  createActiveScheduledJob,
  ScheduledJobActiveLimitError,
} from "@/lib/scheduled-job-authoring";
import {
  fireAtErrorMessage,
  resolveOneShotSchedule,
  resolveRecurringSchedule,
  ScheduledJobCronError,
  ScheduledJobFireAtError,
  ScheduledJobTimezoneError,
} from "@/lib/scheduled-job-one-shot";
import { readJsonBody, scheduledJobPostSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { roomId } = await params;
    await assertRoomAccess(roomId, user.id);

    const url = new URL(request.url);
    const enabledFilter = url.searchParams.get("enabled");

    const where: Record<string, unknown> = { roomId };
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
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { roomId } = await params;
    await assertRoomAccess(roomId, user.id);

    const limited = enforceRateLimit(request, `scheduled-jobs:${user.id}`, 10, 60_000);
    if (limited) return limited;

    const parsed = await readJsonBody(request, scheduledJobPostSchema);

    const agent = await prisma.agent.findUnique({ where: { slug: "life-assistant" } });
    if (!agent) {
      return jsonError("Default agent not configured", 500);
    }

    let nextRunAt: Date;
    let effectiveCron: string;
    let runOnce = parsed.runOnce === true;

    if (parsed.fireAt) {
      const resolved = resolveOneShotSchedule({
        fireAt: parsed.fireAt,
        cron: parsed.cron ?? null,
        timezone: parsed.timezone,
      });
      nextRunAt = resolved.nextRunAt;
      effectiveCron = resolved.cron;
      runOnce = true;
    } else {
      try {
        const resolved = resolveRecurringSchedule({
          cron: parsed.cron!,
          timezone: parsed.timezone,
        });
        nextRunAt = resolved.nextRunAt;
        effectiveCron = resolved.cron;
      } catch (err) {
        if (err instanceof ScheduledJobCronError) {
          return jsonError(`Invalid cron expression: ${err.detail}`, 400);
        }
        throw err;
      }
    }

    const job = await prisma.$transaction((tx) =>
      createActiveScheduledJob(tx, {
        roomId,
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
      }),
    );

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
    if (error instanceof ScheduledJobActiveLimitError) {
      return jsonError(error.message, 409);
    }
    if (error instanceof ScheduledJobFireAtError) {
      return jsonError(fireAtErrorMessage(error), 400);
    }
    if (error instanceof ScheduledJobTimezoneError) {
      return jsonError(`Invalid timezone: ${error.timezone}`, 400);
    }
    return errorToResponse(error);
  }
}
