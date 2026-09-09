import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestContext = vi.hoisted(() => ({
  headers: new Headers({
    host: "localhost",
    "user-agent": "xoxo-registration-capacity-integration-test",
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: vi.fn(),
  }),
  headers: async () => requestContext.headers,
}));

import { POST as register } from "@/app/api/auth/register/route";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  createTestRoom,
  createTestUser,
  resetTestDatabase,
} from "@/tests/integration/support/database";

const PARTICIPANT_DELAY_TRIGGER = "delay_concurrent_participant_insert";
const PARTICIPANT_DELAY_FUNCTION = "delay_concurrent_participant_insert";
const PARTICIPANT_FAILURE_TRIGGER = "fail_participant_insert";
const PARTICIPANT_FAILURE_FUNCTION = "fail_participant_insert";

beforeEach(async () => {
  await resetTestDatabase();
});

afterEach(async () => {
  await dropParticipantInsertTrigger(
    PARTICIPANT_DELAY_TRIGGER,
    PARTICIPANT_DELAY_FUNCTION,
  );
  await dropParticipantInsertTrigger(
    PARTICIPANT_FAILURE_TRIGGER,
    PARTICIPANT_FAILURE_FUNCTION,
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function dropParticipantInsertTrigger(triggerName: string, functionName: string) {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON "RoomParticipant"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${functionName}()`);
}

function submitRegistration(email: string, displayName: string, clientIp: string) {
  return register(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
        "x-forwarded-for": clientIp,
      },
      body: JSON.stringify({
        email,
        password: "registration-capacity-password-2026",
        displayName,
        inviteCode: env.INVITE_CODE,
        timezone: "Asia/Shanghai",
      }),
    }),
  );
}

describe("atomic registration room capacity", () => {
  it("allows at most one concurrent registration for the final room slot", async () => {
    const room = await createTestRoom({
      slug: env.DEMO_ROOM_SLUG,
      maxHumanUsers: 2,
    });
    const existingUser = await createTestUser({ email: "existing-member@example.com" });
    await prisma.roomParticipant.create({
      data: {
        roomId: room.id,
        userId: existingUser.id,
        role: "owner",
      },
    });

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION ${PARTICIPANT_DELAY_FUNCTION}() RETURNS trigger AS $$
      BEGIN
        PERFORM pg_sleep(0.5);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER ${PARTICIPANT_DELAY_TRIGGER}
      BEFORE INSERT ON "RoomParticipant"
      FOR EACH ROW EXECUTE FUNCTION ${PARTICIPANT_DELAY_FUNCTION}()
    `);

    const emails = ["concurrent-one@example.com", "concurrent-two@example.com"];
    let responses: Response[];
    try {
      responses = await Promise.all([
        submitRegistration(emails[0], "并发一", "198.51.100.31"),
        submitRegistration(emails[1], "并发二", "198.51.100.32"),
      ]);
    } finally {
      await dropParticipantInsertTrigger(
        PARTICIPANT_DELAY_TRIGGER,
        PARTICIPANT_DELAY_FUNCTION,
      );
    }

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const failedIndex = responses.findIndex((response) => response.status === 409);
    expect(failedIndex).toBeGreaterThanOrEqual(0);
    await expect(responses[failedIndex].json()).resolves.toEqual({ error: "Room is full" });

    const participants = await prisma.roomParticipant.findMany({
      where: { roomId: room.id },
      include: { user: true },
      orderBy: { joinedAt: "asc" },
    });
    expect(participants).toHaveLength(room.maxHumanUsers);
    expect(participants.filter((participant) => participant.userId !== existingUser.id)).toEqual([
      expect.objectContaining({ role: "member" }),
    ]);

    const failedEmail = emails[failedIndex];
    await expect(prisma.user.findUnique({ where: { email: failedEmail } })).resolves.toBeNull();
    await expect(prisma.user.count()).resolves.toBe(2);
    await expect(prisma.userProfile.count()).resolves.toBe(1);
    await expect(prisma.session.count()).resolves.toBe(1);
  });

  it("rolls back the user and profile when participant creation fails", async () => {
    const room = await createTestRoom({
      slug: env.DEMO_ROOM_SLUG,
      maxHumanUsers: 2,
    });
    const email = "participant-failure@example.com";

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION ${PARTICIPANT_FAILURE_FUNCTION}() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'simulated RoomParticipant insert failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER ${PARTICIPANT_FAILURE_TRIGGER}
      BEFORE INSERT ON "RoomParticipant"
      FOR EACH ROW EXECUTE FUNCTION ${PARTICIPANT_FAILURE_FUNCTION}()
    `);

    const failedResponse = await submitRegistration(email, "写入失败", "198.51.100.41");
    expect(failedResponse.status).toBe(500);
    await expect(prisma.user.findUnique({ where: { email } })).resolves.toBeNull();
    await expect(prisma.userProfile.count()).resolves.toBe(0);
    await expect(prisma.roomParticipant.count({ where: { roomId: room.id } })).resolves.toBe(0);
    await expect(prisma.session.count()).resolves.toBe(0);

    await dropParticipantInsertTrigger(
      PARTICIPANT_FAILURE_TRIGGER,
      PARTICIPANT_FAILURE_FUNCTION,
    );

    const retryResponse = await submitRegistration(email, "写入重试", "198.51.100.42");
    expect(retryResponse.status).toBe(200);
    const createdUser = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: {
        profile: true,
        participants: true,
        sessions: true,
      },
    });
    expect(createdUser.profile).not.toBeNull();
    expect(createdUser.participants).toEqual([
      expect.objectContaining({ roomId: room.id, role: "owner" }),
    ]);
    expect(createdUser.sessions).toHaveLength(1);
  });
});
