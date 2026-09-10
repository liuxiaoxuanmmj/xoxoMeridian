import type { Prisma, ScheduledJob } from "@prisma/client";

export const MAX_ACTIVE_SCHEDULED_JOBS_PER_ROOM = 30;

export class ScheduledJobActiveLimitError extends Error {
  constructor(
    readonly activeCount: number,
    readonly limit = MAX_ACTIVE_SCHEDULED_JOBS_PER_ROOM,
  ) {
    super(`Room already has ${activeCount} active scheduled jobs (max ${limit}).`);
    this.name = "ScheduledJobActiveLimitError";
  }
}

export class ScheduledJobNotFoundError extends Error {
  constructor(readonly jobId: string) {
    super(`Scheduled job not found: ${jobId}`);
    this.name = "ScheduledJobNotFoundError";
  }
}

export class ScheduledJobRoomMismatchError extends Error {
  constructor(readonly jobId: string, readonly roomId: string) {
    super("Scheduled job does not belong to this room.");
    this.name = "ScheduledJobRoomMismatchError";
  }
}

async function lockRoom(
  tx: Prisma.TransactionClient,
  roomId: string,
) {
  const rooms = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Room"
    WHERE "id" = ${roomId}
    FOR UPDATE
  `;

  if (rooms.length !== 1) {
    throw new Error(`Cannot author a scheduled job for missing room ${roomId}.`);
  }
}

async function assertActiveCapacity(
  tx: Prisma.TransactionClient,
  roomId: string,
) {
  const activeCount = await tx.scheduledJob.count({
    where: { roomId, enabled: true },
  });
  if (activeCount >= MAX_ACTIVE_SCHEDULED_JOBS_PER_ROOM) {
    throw new ScheduledJobActiveLimitError(activeCount);
  }
}

export async function createActiveScheduledJob(
  tx: Prisma.TransactionClient,
  data: Prisma.ScheduledJobUncheckedCreateInput,
): Promise<ScheduledJob> {
  await lockRoom(tx, data.roomId);
  await assertActiveCapacity(tx, data.roomId);
  return tx.scheduledJob.create({ data });
}

export async function updateScheduledJobWithActiveCap(
  tx: Prisma.TransactionClient,
  input: {
    roomId: string;
    jobId: string;
    buildData: (
      existing: ScheduledJob,
    ) => Prisma.ScheduledJobUncheckedUpdateInput;
  },
): Promise<ScheduledJob> {
  await lockRoom(tx, input.roomId);

  const existing = await tx.scheduledJob.findUnique({
    where: { id: input.jobId },
  });
  if (!existing) {
    throw new ScheduledJobNotFoundError(input.jobId);
  }
  if (existing.roomId !== input.roomId) {
    throw new ScheduledJobRoomMismatchError(input.jobId, input.roomId);
  }

  const data = input.buildData(existing);
  const enabledUpdate = data.enabled;
  const nextEnabled = typeof enabledUpdate === "boolean"
    ? enabledUpdate
    : enabledUpdate?.set ?? existing.enabled;
  if (nextEnabled && !existing.enabled) {
    await assertActiveCapacity(tx, input.roomId);
  }

  return tx.scheduledJob.update({
    where: { id: input.jobId },
    data,
  });
}
