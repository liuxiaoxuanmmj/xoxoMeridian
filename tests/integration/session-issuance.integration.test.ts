import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestContext = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  headers: new Headers({
    host: "localhost",
    "user-agent": "xoxo-session-integration-test",
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => name === "xoxo_session" && requestContext.cookieValue
      ? { name, value: requestContext.cookieValue }
      : undefined,
    set: vi.fn(),
  }),
  headers: async () => requestContext.headers,
}));

import { GET as getCurrentProfile } from "@/app/api/auth/me/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { env } from "@/lib/env";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  createTestRoom,
  createTestUser,
  resetTestDatabase,
} from "@/tests/integration/support/database";

const SESSION_INSERT_DELAY_TRIGGER = "delay_concurrent_session_insert";
const SESSION_INSERT_DELAY_FUNCTION = "delay_concurrent_session_insert";
const SESSION_INSERT_FAILURE_TRIGGER = "fail_replacement_session_insert";
const SESSION_INSERT_FAILURE_FUNCTION = "fail_replacement_session_insert";

beforeEach(async () => {
  requestContext.cookieValue = undefined;
  await resetTestDatabase();
});

afterEach(async () => {
  await dropSessionInsertTrigger(
    SESSION_INSERT_DELAY_TRIGGER,
    SESSION_INSERT_DELAY_FUNCTION,
  );
  await dropSessionInsertTrigger(
    SESSION_INSERT_FAILURE_TRIGGER,
    SESSION_INSERT_FAILURE_FUNCTION,
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function dropSessionInsertTrigger(triggerName: string, functionName: string) {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON "Session"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${functionName}()`);
}

async function createLoginFixture() {
  const password = "session-issuance-password-2026";
  const room = await createTestRoom();
  const user = await createTestUser({ passwordHash: await hashPassword(password) });
  await prisma.roomParticipant.create({
    data: {
      roomId: room.id,
      userId: user.id,
      role: "owner",
    },
  });
  return { password, room, user };
}

function submitLogin(email: string, password: string) {
  return login(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      body: JSON.stringify({ email, password }),
    }),
  );
}

function getIssuedCookie(response: Response) {
  const values = response.headers.getSetCookie();
  for (const value of [...values].reverse()) {
    const match = value.match(/^xoxo_session=([^;]+)/);
    if (match?.[1]) return match[1];
  }
  throw new Error("认证响应没有签发非空 xoxo_session Cookie");
}

async function requestCurrentProfile(cookieValue: string) {
  requestContext.cookieValue = cookieValue;
  return getCurrentProfile(new Request("http://localhost/api/auth/me"));
}

describe("atomic session issuance", () => {
  it("serializes concurrent logins so only the final cookie remains authorized", async () => {
    const { password, user } = await createLoginFixture();

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION ${SESSION_INSERT_DELAY_FUNCTION}() RETURNS trigger AS $$
      BEGIN
        PERFORM pg_sleep(0.5);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER ${SESSION_INSERT_DELAY_TRIGGER}
      BEFORE INSERT ON "Session"
      FOR EACH ROW EXECUTE FUNCTION ${SESSION_INSERT_DELAY_FUNCTION}()
    `);

    let responses: Response[];
    try {
      responses = await Promise.all([
        submitLogin(user.email, password),
        submitLogin(user.email, password),
      ]);
    } finally {
      await dropSessionInsertTrigger(
        SESSION_INSERT_DELAY_TRIGGER,
        SESSION_INSERT_DELAY_FUNCTION,
      );
    }

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    await expect(prisma.session.count({ where: { userId: user.id } })).resolves.toBe(1);

    const cookies = responses.map(getIssuedCookie);
    const profileResponses: Response[] = [];
    for (const cookie of cookies) {
      profileResponses.push(await requestCurrentProfile(cookie));
    }
    expect(profileResponses.map((response) => response.status).sort()).toEqual([200, 401]);
  });

  it("rolls back old-session invalidation when replacement creation fails", async () => {
    const { password, user } = await createLoginFixture();
    const oldSession = await prisma.session.create({
      data: {
        id: "session-that-must-survive-a-failed-replacement",
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION ${SESSION_INSERT_FAILURE_FUNCTION}() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'simulated replacement Session insert failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER ${SESSION_INSERT_FAILURE_TRIGGER}
      BEFORE INSERT ON "Session"
      FOR EACH ROW EXECUTE FUNCTION ${SESSION_INSERT_FAILURE_FUNCTION}()
    `);

    const response = await submitLogin(user.email, password);
    expect(response.status).toBe(500);

    await expect(prisma.session.findMany({ where: { userId: user.id } })).resolves.toEqual([
      expect.objectContaining({ id: oldSession.id }),
    ]);
  });

  it("issues a usable session through the registration entry point", async () => {
    await createTestRoom({ slug: env.DEMO_ROOM_SLUG });

    const response = await register(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({
          email: "registered-session@example.com",
          password: "registered-session-password-2026",
          displayName: "注册会话",
          inviteCode: env.INVITE_CODE,
          timezone: "Asia/Shanghai",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json() as { user: { id: string } };
    await expect(prisma.session.count({ where: { userId: body.user.id } })).resolves.toBe(1);
    await expect(requestCurrentProfile(getIssuedCookie(response))).resolves.toMatchObject({ status: 200 });
  });
});
