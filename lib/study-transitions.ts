import { randomUUID } from "node:crypto";

import type { FocusSession, FocusState, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type StudyMode = "focus" | "short" | "long";

type SettledFocusSession = Pick<
  FocusSession,
  "id" | "mode" | "startedAt" | "endedAt" | "actualMinutes"
>;

export class StudyTransitionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudyTransitionConflictError";
  }
}

async function lockStudyUser(tx: Prisma.TransactionClient, userId: string) {
  const users = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "User"
    WHERE "id" = ${userId}
    FOR UPDATE
  `;
  if (users.length !== 1) {
    throw new Error("Cannot transition focus for a missing user.");
  }
}

function isRunningStatus(status: FocusState["status"]) {
  return status === "running" || status === "focusing";
}

function isActiveStatus(status: FocusState["status"]) {
  return isRunningStatus(status) || status === "paused";
}

function isExpiredRunningState(state: FocusState, now: Date) {
  return isRunningStatus(state.status)
    && state.expectedEndAt !== null
    && state.expectedEndAt.getTime() <= now.getTime();
}

function calculateActualMinutes(state: FocusState, endedAt: Date) {
  if (state.status === "paused") {
    const elapsedSeconds = state.plannedMinutes * 60 - (state.remainingSeconds ?? 0);
    return Math.max(1, Math.round(elapsedSeconds / 60));
  }

  const elapsedSeconds = state.expectedEndAt
    ? state.plannedMinutes * 60
      - Math.max(0, Math.ceil((state.expectedEndAt.getTime() - endedAt.getTime()) / 1000))
    : state.plannedMinutes * 60;
  return Math.max(1, Math.round(elapsedSeconds / 60));
}

async function readUpdatedState(tx: Prisma.TransactionClient, userId: string) {
  return tx.focusState.findUniqueOrThrow({ where: { userId } });
}

async function ensureActiveSessionKey(
  tx: Prisma.TransactionClient,
  state: FocusState,
  sessionKey = randomUUID(),
) {
  if (state.currentSessionKey) return state;

  const repaired = await tx.focusState.updateMany({
    where: {
      userId: state.userId,
      status: state.status,
      currentSessionKey: null,
    },
    data: { currentSessionKey: sessionKey },
  });
  if (repaired.count !== 1) {
    throw new StudyTransitionConflictError("Focus state changed while it was being restored.");
  }
  return readUpdatedState(tx, state.userId);
}

async function settleActiveFocusState(
  tx: Prisma.TransactionClient,
  state: FocusState,
  sessionKey: string,
  endedAt: Date,
) {
  const session = await tx.focusSession.upsert({
    where: {
      userId_sessionKey: { userId: state.userId, sessionKey },
    },
    update: {},
    create: {
      userId: state.userId,
      sessionKey,
      status: "completed",
      mode: state.mode,
      plannedMinutes: state.plannedMinutes,
      actualMinutes: calculateActualMinutes(state, endedAt),
      startedAt: state.startedAt ?? endedAt,
      endedAt,
      roomId: state.roomId,
    },
    select: {
      id: true,
      mode: true,
      startedAt: true,
      endedAt: true,
      actualMinutes: true,
    },
  });

  const updated = await tx.focusState.updateMany({
    where: {
      userId: state.userId,
      status: state.status,
      currentSessionKey: sessionKey,
    },
    data: {
      status: "idle",
      mode: "focus",
      startedAt: null,
      expectedEndAt: null,
      pausedAt: null,
      remainingSeconds: null,
      lastStudySeenAt: endedAt,
      currentSessionKey: sessionKey,
    },
  });
  if (updated.count !== 1) {
    throw new StudyTransitionConflictError("Focus state changed before it could be stopped.");
  }

  return {
    session,
    state: await readUpdatedState(tx, state.userId),
    replayed: false,
  };
}

async function reconcileExpiredState(
  tx: Prisma.TransactionClient,
  state: FocusState | null,
  now: Date,
) {
  if (!state || !isExpiredRunningState(state, now)) return null;

  const keyedState = await ensureActiveSessionKey(tx, state);
  return settleActiveFocusState(
    tx,
    keyedState,
    keyedState.currentSessionKey!,
    keyedState.expectedEndAt!,
  );
}

export async function reconcileExpiredFocusTimer(userId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await lockStudyUser(tx, userId);
    const state = await tx.focusState.findUnique({ where: { userId } });
    return reconcileExpiredState(tx, state, now);
  });
}

export async function startFocusTimer({
  userId,
  roomId,
  mode,
  plannedMinutes,
  now = new Date(),
}: {
  userId: string;
  roomId: string;
  mode: StudyMode;
  plannedMinutes: number;
  now?: Date;
}) {
  const sessionKey = randomUUID();

  return prisma.$transaction(async (tx) => {
    await lockStudyUser(tx, userId);
    let existing = await tx.focusState.findUnique({ where: { userId } });
    if (existing && isActiveStatus(existing.status)) {
      existing = await ensureActiveSessionKey(tx, existing);
      const reconciliation = await reconcileExpiredState(tx, existing, now);
      if (!reconciliation) return existing;
    }

    const expectedEndAt = new Date(now.getTime() + plannedMinutes * 60_000);
    return tx.focusState.upsert({
      where: { userId },
      update: {
        status: "running",
        mode,
        plannedMinutes,
        startedAt: now,
        expectedEndAt,
        remainingSeconds: null,
        pausedAt: null,
        lastStudySeenAt: now,
        currentSessionKey: sessionKey,
        roomId,
      },
      create: {
        userId,
        status: "running",
        mode,
        plannedMinutes,
        startedAt: now,
        expectedEndAt,
        remainingSeconds: null,
        pausedAt: null,
        lastStudySeenAt: now,
        currentSessionKey: sessionKey,
        roomId,
      },
    });
  });
}

export async function pauseFocusTimer(
  userId: string,
  expectedSessionKey: string,
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    await lockStudyUser(tx, userId);
    const state = await tx.focusState.findUnique({ where: { userId } });
    if (
      !state
      || !isRunningStatus(state.status)
      || state.currentSessionKey !== expectedSessionKey
    ) {
      throw new StudyTransitionConflictError("No running timer to pause.");
    }

    const remainingSeconds = state.expectedEndAt
      ? Math.max(0, Math.ceil((state.expectedEndAt.getTime() - now.getTime()) / 1000))
      : 0;
    const updated = await tx.focusState.updateMany({
      where: {
        userId,
        status: state.status,
        currentSessionKey: expectedSessionKey,
      },
      data: {
        status: "paused",
        expectedEndAt: null,
        pausedAt: now,
        remainingSeconds,
      },
    });
    if (updated.count !== 1) {
      throw new StudyTransitionConflictError("Focus state changed before it could be paused.");
    }
    return readUpdatedState(tx, userId);
  });
}

export async function resumeFocusTimer(
  userId: string,
  expectedSessionKey: string,
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    await lockStudyUser(tx, userId);
    const state = await tx.focusState.findUnique({ where: { userId } });
    if (
      !state
      || state.status !== "paused"
      || state.currentSessionKey !== expectedSessionKey
    ) {
      throw new StudyTransitionConflictError("No paused timer to resume.");
    }

    const expectedEndAt = new Date(now.getTime() + (state.remainingSeconds ?? 0) * 1000);
    const updated = await tx.focusState.updateMany({
      where: {
        userId,
        status: state.status,
        currentSessionKey: expectedSessionKey,
      },
      data: {
        status: "running",
        expectedEndAt,
        pausedAt: null,
        remainingSeconds: null,
      },
    });
    if (updated.count !== 1) {
      throw new StudyTransitionConflictError("Focus state changed before it could be resumed.");
    }
    return readUpdatedState(tx, userId);
  });
}

async function findSettledSession(
  tx: Prisma.TransactionClient,
  userId: string,
  sessionKey: string,
): Promise<SettledFocusSession | null> {
  return tx.focusSession.findUnique({
    where: {
      userId_sessionKey: { userId, sessionKey },
    },
    select: {
      id: true,
      mode: true,
      startedAt: true,
      endedAt: true,
      actualMinutes: true,
    },
  });
}

export async function stopFocusTimer(
  userId: string,
  expectedSessionKey: string,
  endedAt = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    await lockStudyUser(tx, userId);
    const state = await tx.focusState.findUnique({ where: { userId } });

    if (state?.status === "idle" && state.currentSessionKey === expectedSessionKey) {
      const settledSession = await findSettledSession(tx, userId, expectedSessionKey);
      if (settledSession) {
        return { session: settledSession, state, replayed: true };
      }
    }

    if (
      !state
      || !isActiveStatus(state.status)
      || state.currentSessionKey !== expectedSessionKey
    ) {
      throw new StudyTransitionConflictError("No active focus session.");
    }

    const settlementEnd = isExpiredRunningState(state, endedAt)
      ? state.expectedEndAt!
      : endedAt;
    return settleActiveFocusState(tx, state, expectedSessionKey, settlementEnd);
  });
}
