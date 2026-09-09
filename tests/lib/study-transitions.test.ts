import type { FocusState } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockTransaction,
  mockQueryRaw,
  mockStateFindUnique,
  mockStateFindUniqueOrThrow,
  mockStateUpdateMany,
  mockStateUpsert,
  mockSessionFindUnique,
  mockSessionUpsert,
  mockTx,
} = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    focusState: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    focusSession: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };

  return {
    mockTransaction: vi.fn(),
    mockQueryRaw: tx.$queryRaw,
    mockStateFindUnique: tx.focusState.findUnique,
    mockStateFindUniqueOrThrow: tx.focusState.findUniqueOrThrow,
    mockStateUpdateMany: tx.focusState.updateMany,
    mockStateUpsert: tx.focusState.upsert,
    mockSessionFindUnique: tx.focusSession.findUnique,
    mockSessionUpsert: tx.focusSession.upsert,
    mockTx: tx,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
  },
}));

import {
  pauseFocusTimer,
  reconcileExpiredFocusTimer,
  resumeFocusTimer,
  startFocusTimer,
  stopFocusTimer,
  StudyTransitionConflictError,
} from "@/lib/study-transitions";

const baseTime = new Date("2026-09-08T08:00:00.000Z");

function makeState(overrides: Partial<FocusState> = {}): FocusState {
  return {
    id: "state-1",
    userId: "user-1",
    roomId: "room-1",
    status: "running",
    mode: "focus",
    plannedMinutes: 25,
    remainingSeconds: null,
    startedAt: baseTime,
    expectedEndAt: new Date(baseTime.getTime() + 25 * 60_000),
    pausedAt: null,
    lastStudySeenAt: baseTime,
    currentSessionKey: "focus-key",
    createdAt: baseTime,
    updatedAt: baseTime,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction.mockImplementation(
    async (operation: (tx: typeof mockTx) => Promise<unknown>) => operation(mockTx),
  );
  mockQueryRaw.mockResolvedValue([{ id: "user-1" }]);
  mockStateUpdateMany.mockResolvedValue({ count: 1 });
});

describe("study transition service", () => {
  it("starts a new keyed focus timer", async () => {
    const started = makeState();
    mockStateFindUnique.mockResolvedValue(null);
    mockStateUpsert.mockResolvedValue(started);

    const result = await startFocusTimer({
      userId: "user-1",
      roomId: "room-1",
      mode: "focus",
      plannedMinutes: 25,
      now: baseTime,
    });

    expect(result).toBe(started);
    expect(mockStateUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        currentSessionKey: expect.any(String),
        expectedEndAt: new Date("2026-09-08T08:25:00.000Z"),
      }),
    }));
  });

  it("returns an already active keyed timer without replacing its identity", async () => {
    const existing = makeState({ status: "paused", expectedEndAt: null });
    mockStateFindUnique.mockResolvedValue(existing);

    await expect(startFocusTimer({
      userId: "user-1",
      roomId: "room-1",
      mode: "short",
      plannedMinutes: 5,
      now: baseTime,
    })).resolves.toBe(existing);
    expect(mockStateUpsert).not.toHaveBeenCalled();
  });

  it("repairs an active legacy timer that has no session key", async () => {
    const legacy = makeState({ currentSessionKey: null });
    const repaired = makeState({ currentSessionKey: "repaired-key" });
    mockStateFindUnique.mockResolvedValue(legacy);
    mockStateFindUniqueOrThrow.mockResolvedValue(repaired);

    await expect(startFocusTimer({
      userId: "user-1",
      roomId: "room-1",
      mode: "focus",
      plannedMinutes: 25,
      now: baseTime,
    })).resolves.toBe(repaired);
  });

  it("settles an expired timer before starting a fresh keyed timer", async () => {
    const expired = makeState({
      startedAt: new Date("2026-09-08T07:35:00.000Z"),
      expectedEndAt: baseTime,
    });
    const idle = makeState({
      status: "idle",
      startedAt: null,
      expectedEndAt: null,
    });
    const started = makeState({
      mode: "short",
      plannedMinutes: 5,
      startedAt: baseTime,
      expectedEndAt: new Date("2026-09-08T08:05:00.000Z"),
      currentSessionKey: "fresh-key",
    });
    const expiredSession = {
      id: "expired-session",
      mode: "focus" as const,
      startedAt: expired.startedAt!,
      endedAt: baseTime,
      actualMinutes: 25,
    };
    mockStateFindUnique.mockResolvedValue(expired);
    mockSessionUpsert.mockResolvedValue(expiredSession);
    mockStateFindUniqueOrThrow.mockResolvedValue(idle);
    mockStateUpsert.mockResolvedValue(started);

    await expect(startFocusTimer({
      userId: "user-1",
      roomId: "room-1",
      mode: "short",
      plannedMinutes: 5,
      now: baseTime,
    })).resolves.toBe(started);

    expect(mockSessionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        sessionKey: "focus-key",
        actualMinutes: 25,
        endedAt: baseTime,
      }),
    }));
    expect(mockStateUpsert).toHaveBeenCalled();
  });

  it("uses different identities when an expired legacy timer is repaired before restart", async () => {
    const expiredLegacy = makeState({
      currentSessionKey: null,
      startedAt: new Date("2026-09-08T07:35:00.000Z"),
      expectedEndAt: baseTime,
    });
    const repaired = makeState({
      currentSessionKey: "repaired-expired-key",
      startedAt: expiredLegacy.startedAt,
      expectedEndAt: baseTime,
    });
    const idle = makeState({
      status: "idle",
      currentSessionKey: "repaired-expired-key",
      startedAt: null,
      expectedEndAt: null,
    });
    const started = makeState({
      mode: "short",
      plannedMinutes: 5,
      currentSessionKey: "fresh-key",
    });
    mockStateFindUnique.mockResolvedValue(expiredLegacy);
    mockStateFindUniqueOrThrow.mockResolvedValueOnce(repaired).mockResolvedValueOnce(idle);
    mockSessionUpsert.mockResolvedValue({
      id: "expired-session",
      mode: "focus",
      startedAt: repaired.startedAt!,
      endedAt: baseTime,
      actualMinutes: 25,
    });
    mockStateUpsert.mockResolvedValue(started);

    await startFocusTimer({
      userId: "user-1",
      roomId: "room-1",
      mode: "short",
      plannedMinutes: 5,
      now: baseTime,
    });

    const repairedKey = mockStateUpdateMany.mock.calls[0][0].data.currentSessionKey;
    const freshKey = mockStateUpsert.mock.calls[0][0].create.currentSessionKey;
    expect(repairedKey).toEqual(expect.any(String));
    expect(freshKey).toEqual(expect.any(String));
    expect(freshKey).not.toBe(repairedKey);
  });

  it("reconciles an expired running timer at its planned deadline", async () => {
    const expired = makeState({
      startedAt: new Date("2026-09-08T07:35:00.000Z"),
      expectedEndAt: baseTime,
    });
    const idle = makeState({
      status: "idle",
      startedAt: null,
      expectedEndAt: null,
    });
    const session = {
      id: "expired-session",
      mode: "focus" as const,
      startedAt: expired.startedAt!,
      endedAt: baseTime,
      actualMinutes: 25,
    };
    mockStateFindUnique.mockResolvedValue(expired);
    mockSessionUpsert.mockResolvedValue(session);
    mockStateFindUniqueOrThrow.mockResolvedValue(idle);

    await expect(reconcileExpiredFocusTimer(
      "user-1",
      new Date("2026-09-08T08:01:00.000Z"),
    )).resolves.toEqual({ session, state: idle, replayed: false });
    expect(mockSessionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ actualMinutes: 25, endedAt: baseTime }),
    }));
  });

  it("leaves unexpired and paused timers untouched during reconciliation", async () => {
    const unexpired = makeState();
    const paused = makeState({ status: "paused", expectedEndAt: null });
    mockStateFindUnique.mockResolvedValueOnce(unexpired).mockResolvedValueOnce(paused);

    await expect(reconcileExpiredFocusTimer("user-1", baseTime)).resolves.toBeNull();
    await expect(reconcileExpiredFocusTimer("user-1", baseTime)).resolves.toBeNull();
    expect(mockSessionUpsert).not.toHaveBeenCalled();
    expect(mockStateUpdateMany).not.toHaveBeenCalled();
  });

  it("pauses and resumes the same timer identity", async () => {
    const running = makeState();
    const paused = makeState({
      status: "paused",
      expectedEndAt: null,
      remainingSeconds: 900,
      pausedAt: new Date("2026-09-08T08:10:00.000Z"),
    });
    mockStateFindUnique.mockResolvedValueOnce(running).mockResolvedValueOnce(paused);
    mockStateFindUniqueOrThrow.mockResolvedValueOnce(paused).mockResolvedValueOnce(running);

    await expect(pauseFocusTimer(
      "user-1",
      "focus-key",
      new Date("2026-09-08T08:10:00.000Z"),
    )).resolves.toBe(paused);
    await expect(resumeFocusTimer(
      "user-1",
      "focus-key",
      new Date("2026-09-08T08:11:00.000Z"),
    )).resolves.toBe(running);
  });

  it("rejects a pause carrying a stale session key", async () => {
    mockStateFindUnique.mockResolvedValue(makeState());

    await expect(pauseFocusTimer("user-1", "stale-key", baseTime)).rejects.toBeInstanceOf(
      StudyTransitionConflictError,
    );
    expect(mockStateUpdateMany).not.toHaveBeenCalled();
  });

  it("settles an active timer and returns the new idle state", async () => {
    const running = makeState();
    const idle = makeState({
      status: "idle",
      startedAt: null,
      expectedEndAt: null,
    });
    const session = {
      id: "session-1",
      mode: "focus" as const,
      startedAt: baseTime,
      endedAt: new Date("2026-09-08T08:05:00.000Z"),
      actualMinutes: 5,
    };
    mockStateFindUnique.mockResolvedValue(running);
    mockSessionUpsert.mockResolvedValue(session);
    mockStateFindUniqueOrThrow.mockResolvedValue(idle);

    await expect(stopFocusTimer(
      "user-1",
      "focus-key",
      session.endedAt,
    )).resolves.toEqual({ session, state: idle, replayed: false });
    expect(mockSessionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ actualMinutes: 5, sessionKey: "focus-key" }),
    }));
  });

  it("settles a paused timer from its persisted remaining time", async () => {
    const paused = makeState({
      status: "paused",
      expectedEndAt: null,
      remainingSeconds: 900,
    });
    const session = {
      id: "session-paused",
      mode: "focus" as const,
      startedAt: baseTime,
      endedAt: new Date("2026-09-08T08:10:00.000Z"),
      actualMinutes: 10,
    };
    mockStateFindUnique.mockResolvedValue(paused);
    mockSessionUpsert.mockResolvedValue(session);
    mockStateFindUniqueOrThrow.mockResolvedValue(makeState({ status: "idle" }));

    await stopFocusTimer("user-1", "focus-key", session.endedAt);

    expect(mockSessionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ actualMinutes: 10 }),
    }));
  });

  it("settles an expired explicit stop at the planned deadline", async () => {
    const expired = makeState({
      startedAt: new Date("2026-09-08T07:35:00.000Z"),
      expectedEndAt: baseTime,
    });
    const idle = makeState({ status: "idle", startedAt: null, expectedEndAt: null });
    const session = {
      id: "expired-session",
      mode: "focus" as const,
      startedAt: expired.startedAt!,
      endedAt: baseTime,
      actualMinutes: 25,
    };
    mockStateFindUnique.mockResolvedValue(expired);
    mockSessionUpsert.mockResolvedValue(session);
    mockStateFindUniqueOrThrow.mockResolvedValue(idle);

    await stopFocusTimer(
      "user-1",
      "focus-key",
      new Date("2026-09-08T08:10:00.000Z"),
    );

    expect(mockSessionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ endedAt: baseTime, actualMinutes: 25 }),
    }));
  });

  it("replays an already settled stop without creating another session", async () => {
    const idle = makeState({ status: "idle", startedAt: null, expectedEndAt: null });
    const session = {
      id: "session-1",
      mode: "focus" as const,
      startedAt: baseTime,
      endedAt: new Date("2026-09-08T08:05:00.000Z"),
      actualMinutes: 5,
    };
    mockStateFindUnique.mockResolvedValue(idle);
    mockSessionFindUnique.mockResolvedValue(session);

    await expect(stopFocusTimer("user-1", "focus-key", session.endedAt)).resolves.toEqual({
      session,
      state: idle,
      replayed: true,
    });
    expect(mockSessionUpsert).not.toHaveBeenCalled();
  });
});
