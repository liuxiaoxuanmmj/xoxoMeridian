import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireCurrentUser } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: mockRequireCurrentUser,
}));

import { POST as pauseFocus } from "@/app/api/study/pause/route";
import { POST as resumeFocus } from "@/app/api/study/resume/route";
import { GET as getStudy } from "@/app/api/study/route";
import { POST as startFocus } from "@/app/api/study/start/route";
import { POST as stopFocus } from "@/app/api/study/stop/route";
import { prisma } from "@/lib/prisma";
import {
  createTestRoom,
  createTestUser,
  resetTestDatabase,
} from "@/tests/integration/support/database";

const STOP_DELAY_TRIGGER = "delay_focus_stop_state_update";
const STOP_DELAY_FUNCTION = "delay_focus_stop_state_update";
const STOP_FAILURE_TRIGGER = "fail_focus_stop_state_update";
const STOP_FAILURE_FUNCTION = "fail_focus_stop_state_update";
const SESSION_DELAY_TRIGGER = "delay_focus_session_insert";
const SESSION_DELAY_FUNCTION = "delay_focus_session_insert";

beforeEach(async () => {
  await resetTestDatabase();
});

afterEach(async () => {
  await dropTrigger(STOP_DELAY_TRIGGER, STOP_DELAY_FUNCTION, "FocusState");
  await dropTrigger(STOP_FAILURE_TRIGGER, STOP_FAILURE_FUNCTION, "FocusState");
  await dropTrigger(SESSION_DELAY_TRIGGER, SESSION_DELAY_FUNCTION, "FocusSession");
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function dropTrigger(triggerName: string, functionName: string, tableName: string) {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON "${tableName}"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${functionName}()`);
}

async function createFocusFixture(
  sessionKey: string,
  overrides: {
    status?: "running" | "paused";
    startedAt?: Date;
    expectedEndAt?: Date | null;
    remainingSeconds?: number | null;
  } = {},
) {
  const room = await createTestRoom();
  const user = await createTestUser();
  await prisma.roomParticipant.create({
    data: {
      roomId: room.id,
      userId: user.id,
      role: "owner",
    },
  });
  await prisma.focusState.create({
    data: {
      userId: user.id,
      roomId: room.id,
      status: overrides.status ?? "running",
      mode: "focus",
      plannedMinutes: 25,
      startedAt: overrides.startedAt ?? new Date(Date.now() - 10 * 60_000),
      expectedEndAt: overrides.expectedEndAt === undefined
        ? new Date(Date.now() + 15 * 60_000)
        : overrides.expectedEndAt,
      remainingSeconds: overrides.remainingSeconds,
      pausedAt: overrides.status === "paused" ? new Date() : null,
      currentSessionKey: sessionKey,
      lastStudySeenAt: new Date(),
    },
  });
  mockRequireCurrentUser.mockResolvedValue({
    id: user.id,
    displayName: user.displayName,
    avatarLabel: user.avatarLabel,
    profile: { timezone: "UTC" },
  });
  return { room, user };
}

function submitStop(sessionKey: string) {
  return stopFocus(new Request("http://localhost/api/study/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionKey }),
  }));
}

function submitPause(sessionKey: string) {
  return pauseFocus(new Request("http://localhost/api/study/pause", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionKey }),
  }));
}

function submitResume(sessionKey: string) {
  return resumeFocus(new Request("http://localhost/api/study/resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionKey }),
  }));
}

function submitStart() {
  return startFocus(
    new Request("http://localhost/api/study/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "short", plannedMinutes: 5 }),
    }),
  );
}

function submitGet() {
  return getStudy(new Request("http://localhost/api/study"));
}

async function waitForSleepingFocusStateUpdate() {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [{ waiting } = { waiting: false }] = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
          AND state = 'active'
          AND wait_event = 'PgSleep'
          AND query LIKE 'UPDATE%FocusState%'
      ) AS waiting
    `;
    if (waiting) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("FocusState stop update did not reach the injected delay");
}

describe("atomic focus transitions", () => {
  it("keeps one session key from start through pause, resume, stop, and replay", async () => {
    const room = await createTestRoom();
    const user = await createTestUser();
    await prisma.roomParticipant.create({
      data: {
        roomId: room.id,
        userId: user.id,
        role: "owner",
      },
    });
    mockRequireCurrentUser.mockResolvedValue({
      id: user.id,
      displayName: user.displayName,
      avatarLabel: user.avatarLabel,
      profile: { timezone: "UTC" },
    });

    const startResponse = await submitStart();
    expect(startResponse.status).toBe(200);
    const startBody = await startResponse.json();
    const sessionKey = startBody.state.sessionKey as string;
    expect(sessionKey).toEqual(expect.any(String));
    const startedState = await prisma.focusState.findUniqueOrThrow({ where: { userId: user.id } });
    expect(startedState.currentSessionKey).toBe(sessionKey);

    const refreshResponse = await getStudy(new Request("http://localhost/api/study"));
    expect(refreshResponse.status).toBe(200);
    await expect(refreshResponse.json()).resolves.toEqual(
      expect.objectContaining({
        currentState: expect.objectContaining({ sessionKey }),
      }),
    );

    expect((await submitPause(sessionKey)).status).toBe(200);
    expect((await prisma.focusState.findUniqueOrThrow({ where: { userId: user.id } })).currentSessionKey)
      .toBe(startedState.currentSessionKey);

    expect((await submitResume(sessionKey)).status).toBe(200);
    expect((await prisma.focusState.findUniqueOrThrow({ where: { userId: user.id } })).currentSessionKey)
      .toBe(startedState.currentSessionKey);

    const stopResponse = await submitStop(sessionKey);
    const replayResponse = await submitStop(sessionKey);
    const [stopBody, replayBody] = await Promise.all([
      stopResponse.json(),
      replayResponse.json(),
    ]);

    expect([stopResponse.status, replayResponse.status]).toEqual([200, 200]);
    expect(replayBody.session.id).toBe(stopBody.session.id);
    await expect(prisma.focusSession.findUnique({
      where: {
        userId_sessionKey: {
          userId: user.id,
          sessionKey: startedState.currentSessionKey!,
        },
      },
    })).resolves.toEqual(expect.objectContaining({
      id: stopBody.session.id,
      sessionKey: startedState.currentSessionKey,
      status: "completed",
    }));
  });

  it("rejects a delayed command from the previous focus session", async () => {
    const room = await createTestRoom();
    const user = await createTestUser();
    await prisma.roomParticipant.create({
      data: {
        roomId: room.id,
        userId: user.id,
        role: "owner",
      },
    });
    mockRequireCurrentUser.mockResolvedValue({
      id: user.id,
      displayName: user.displayName,
      avatarLabel: user.avatarLabel,
      profile: { timezone: "UTC" },
    });

    const firstStartBody = await (await submitStart()).json();
    const firstSessionKey = firstStartBody.state.sessionKey as string;
    expect((await submitStop(firstSessionKey)).status).toBe(200);

    const secondStartBody = await (await submitStart()).json();
    const secondSessionKey = secondStartBody.state.sessionKey as string;
    expect(secondSessionKey).not.toBe(firstSessionKey);

    expect((await submitPause(firstSessionKey)).status).toBe(409);
    expect((await submitStop(firstSessionKey)).status).toBe(409);
    await expect(prisma.focusState.findUnique({ where: { userId: user.id } })).resolves.toEqual(
      expect.objectContaining({
        status: "running",
        currentSessionKey: secondSessionKey,
      }),
    );
    await expect(prisma.focusSession.count({ where: { userId: user.id } })).resolves.toBe(1);
  });

  it("reconciles an expired running timer on GET and keeps refresh idempotent", async () => {
    const sessionKey = "focus-expired-get";
    const expectedEndAt = new Date(Date.now() - 60_000);
    const startedAt = new Date(expectedEndAt.getTime() - 25 * 60_000);
    const { user } = await createFocusFixture(sessionKey, { startedAt, expectedEndAt });

    const firstResponse = await submitGet();
    const firstBody = await firstResponse.json();
    const refreshResponse = await submitGet();
    const refreshBody = await refreshResponse.json();

    expect([firstResponse.status, refreshResponse.status]).toEqual([200, 200]);
    expect(firstBody.currentState.status).toBe("idle");
    expect(refreshBody.currentState.status).toBe("idle");
    expect(firstBody.recentSessions).toEqual([
      expect.objectContaining({ actualMinutes: 25 }),
    ]);
    await expect(prisma.focusSession.findMany({ where: { userId: user.id } })).resolves.toEqual([
      expect.objectContaining({
        sessionKey,
        status: "completed",
        actualMinutes: 25,
        endedAt: expectedEndAt,
      }),
    ]);
  });

  it("settles an expired timer once when GET and a new start race", async () => {
    const expiredSessionKey = "focus-expired-start-race";
    const expectedEndAt = new Date(Date.now() - 60_000);
    const { user } = await createFocusFixture(expiredSessionKey, {
      startedAt: new Date(expectedEndAt.getTime() - 25 * 60_000),
      expectedEndAt,
    });

    const [getResponse, startResponse] = await Promise.all([submitGet(), submitStart()]);
    const startBody = await startResponse.json();

    expect([getResponse.status, startResponse.status]).toEqual([200, 200]);
    expect(startBody.state.status).toBe("running");
    expect(startBody.state.sessionKey).not.toBe(expiredSessionKey);
    await expect(prisma.focusSession.count({
      where: { userId: user.id, sessionKey: expiredSessionKey },
    })).resolves.toBe(1);
    await expect(prisma.focusState.findUnique({ where: { userId: user.id } })).resolves.toEqual(
      expect.objectContaining({
        status: "running",
        mode: "short",
        currentSessionKey: startBody.state.sessionKey,
      }),
    );
  });

  it("settles an expired explicit stop at the planned deadline and replays it", async () => {
    const sessionKey = "focus-expired-stop";
    const expectedEndAt = new Date(Date.now() - 60_000);
    const { user } = await createFocusFixture(sessionKey, {
      startedAt: new Date(expectedEndAt.getTime() - 25 * 60_000),
      expectedEndAt,
    });

    const firstResponse = await submitStop(sessionKey);
    const firstBody = await firstResponse.json();
    const replayResponse = await submitStop(sessionKey);
    const replayBody = await replayResponse.json();

    expect([firstResponse.status, replayResponse.status]).toEqual([200, 200]);
    expect(replayBody.session.id).toBe(firstBody.session.id);
    await expect(prisma.focusSession.findUnique({
      where: { userId_sessionKey: { userId: user.id, sessionKey } },
    })).resolves.toEqual(expect.objectContaining({
      actualMinutes: 25,
      endedAt: expectedEndAt,
    }));
  });

  it("does not reconcile an unexpired running timer or a paused timer", async () => {
    const runningKey = "focus-not-expired";
    const { user } = await createFocusFixture(runningKey);

    const runningResponse = await submitGet();
    expect(runningResponse.status).toBe(200);
    await expect(runningResponse.json()).resolves.toEqual(expect.objectContaining({
      currentState: expect.objectContaining({ status: "running", sessionKey: runningKey }),
    }));
    await expect(prisma.focusSession.count({ where: { userId: user.id } })).resolves.toBe(0);

    await prisma.focusState.update({
      where: { userId: user.id },
      data: {
        status: "paused",
        expectedEndAt: null,
        remainingSeconds: 60,
        pausedAt: new Date(Date.now() - 60 * 60_000),
      },
    });
    const pausedResponse = await submitGet();

    expect(pausedResponse.status).toBe(200);
    await expect(pausedResponse.json()).resolves.toEqual(expect.objectContaining({
      currentState: expect.objectContaining({ status: "paused", sessionKey: runningKey }),
    }));
    await expect(prisma.focusSession.count({ where: { userId: user.id } })).resolves.toBe(0);
  });

  it("rolls back expired GET reconciliation when the state settlement fails", async () => {
    const sessionKey = "focus-expired-get-rollback";
    const expectedEndAt = new Date(Date.now() - 60_000);
    const { user } = await createFocusFixture(sessionKey, {
      startedAt: new Date(expectedEndAt.getTime() - 25 * 60_000),
      expectedEndAt,
    });

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION ${STOP_FAILURE_FUNCTION}() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'simulated expired FocusState reconciliation failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER ${STOP_FAILURE_TRIGGER}
      BEFORE UPDATE ON "FocusState"
      FOR EACH ROW
      WHEN (NEW."status" = 'idle' AND OLD."status" <> 'idle')
      EXECUTE FUNCTION ${STOP_FAILURE_FUNCTION}()
    `);

    const response = await submitGet();

    expect(response.status).toBe(500);
    await expect(prisma.focusSession.count({ where: { userId: user.id } })).resolves.toBe(0);
    await expect(prisma.focusState.findUnique({ where: { userId: user.id } })).resolves.toEqual(
      expect.objectContaining({
        status: "running",
        currentSessionKey: sessionKey,
        expectedEndAt,
      }),
    );
  });

  it("settles concurrent stop requests as one completed session", async () => {
    const sessionKey = "focus-concurrent-stop";
    const { user } = await createFocusFixture(sessionKey);

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION ${SESSION_DELAY_FUNCTION}() RETURNS trigger AS $$
      BEGIN
        PERFORM pg_sleep(0.5);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER ${SESSION_DELAY_TRIGGER}
      BEFORE INSERT ON "FocusSession"
      FOR EACH ROW EXECUTE FUNCTION ${SESSION_DELAY_FUNCTION}()
    `);

    const responses = await Promise.all([submitStop(sessionKey), submitStop(sessionKey)]);
    const bodies = await Promise.all(responses.map((response) => response.json()));

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(bodies[0].session.id).toBe(bodies[1].session.id);
    await expect(prisma.focusSession.count({ where: { userId: user.id } })).resolves.toBe(1);
    await expect(prisma.focusSession.findFirst({ where: { userId: user.id } })).resolves.toEqual(
      expect.objectContaining({ sessionKey }),
    );
    await expect(prisma.focusState.findUnique({ where: { userId: user.id } })).resolves.toEqual(
      expect.objectContaining({
        status: "idle",
        currentSessionKey: sessionKey,
      }),
    );
  });

  it("does not let pause move an already settled focus back to paused", async () => {
    const sessionKey = "focus-stop-pause-interleave";
    const { user } = await createFocusFixture(sessionKey);

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION ${STOP_DELAY_FUNCTION}() RETURNS trigger AS $$
      BEGIN
        PERFORM pg_sleep(0.75);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER ${STOP_DELAY_TRIGGER}
      BEFORE UPDATE ON "FocusState"
      FOR EACH ROW
      WHEN (NEW."status" = 'idle' AND OLD."status" <> 'idle')
      EXECUTE FUNCTION ${STOP_DELAY_FUNCTION}()
    `);

    const stopPromise = submitStop(sessionKey);
    await waitForSleepingFocusStateUpdate();
    const pausePromise = submitPause(sessionKey);
    const [stopResponse, pauseResponse] = await Promise.all([stopPromise, pausePromise]);

    expect(stopResponse.status).toBe(200);
    expect(pauseResponse.status).toBe(409);
    await expect(prisma.focusSession.count({ where: { userId: user.id } })).resolves.toBe(1);
    await expect(prisma.focusState.findUnique({ where: { userId: user.id } })).resolves.toEqual(
      expect.objectContaining({
        status: "idle",
        currentSessionKey: sessionKey,
      }),
    );
  });

  it("rolls back the completed session when settling FocusState fails", async () => {
    const sessionKey = "focus-stop-rollback";
    const { user } = await createFocusFixture(sessionKey);

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION ${STOP_FAILURE_FUNCTION}() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'simulated FocusState settlement failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER ${STOP_FAILURE_TRIGGER}
      BEFORE UPDATE ON "FocusState"
      FOR EACH ROW
      WHEN (NEW."status" = 'idle' AND OLD."status" <> 'idle')
      EXECUTE FUNCTION ${STOP_FAILURE_FUNCTION}()
    `);

    const response = await submitStop(sessionKey);

    expect(response.status).toBe(500);
    await expect(prisma.focusSession.count({ where: { userId: user.id } })).resolves.toBe(0);
    await expect(prisma.focusState.findUnique({ where: { userId: user.id } })).resolves.toEqual(
      expect.objectContaining({
        status: "running",
        currentSessionKey: sessionKey,
      }),
    );
  });
});
