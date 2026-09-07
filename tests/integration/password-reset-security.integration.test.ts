import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { verifyPassword } from "@/lib/password";
import { createPasswordResetToken } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import {
  createTestUser,
  resetTestDatabase,
} from "@/tests/integration/support/database";

type StoredTokenRecord = Record<string, unknown>;

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function submitReset(token: string, password: string) {
  return resetPassword(
    new Request("http://localhost/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    }),
  );
}

async function readStoredToken(userId: string) {
  const rows = await prisma.$queryRaw<Array<{ record: StoredTokenRecord }>>`
    SELECT to_jsonb(reset_token) AS record
    FROM "PasswordResetToken" AS reset_token
    WHERE "userId" = ${userId}
  `;
  return rows.at(0)?.record ?? null;
}

describe("password reset token security", () => {
  it("stores only a versioned digest while returning the raw email token", async () => {
    const user = await createTestUser();

    const rawToken = await createPasswordResetToken(user.id);
    const stored = await readStoredToken(user.id);

    expect(stored).not.toBeNull();
    expect(stored).not.toHaveProperty("token");
    expect(stored?.tokenDigest).toMatch(/^v1:sha256:[a-f0-9]{64}$/);
    expect(stored?.tokenDigest).not.toBe(rawToken);
  });

  it("allows exactly one concurrent reset and invalidates every old session", async () => {
    const user = await createTestUser({ passwordHash: "old-password-hash" });
    await prisma.session.createMany({
      data: [
        {
          id: "reset-session-one",
          userId: user.id,
          expiresAt: new Date(Date.now() + 60_000),
        },
        {
          id: "reset-session-two",
          userId: user.id,
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
    });
    const token = await createPasswordResetToken(user.id);
    const candidates = [
      { password: "first-new-password-2026", response: submitReset(token, "first-new-password-2026") },
      { password: "second-new-password-2026", response: submitReset(token, "second-new-password-2026") },
    ];

    const responses = await Promise.all(candidates.map((candidate) => candidate.response));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);

    const successfulIndex = responses.findIndex((response) => response.status === 200);
    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    await expect(
      verifyPassword(candidates[successfulIndex].password, updatedUser.passwordHash),
    ).resolves.toBe(true);
    await expect(prisma.session.count({ where: { userId: user.id } })).resolves.toBe(0);
    await expect(prisma.passwordResetToken.count({ where: { userId: user.id } })).resolves.toBe(0);
    await expect(submitReset(token, "third-new-password-2026")).resolves.toMatchObject({ status: 400 });
  });

  it("rejects expired and unknown tokens without changing the password", async () => {
    const originalPasswordHash = "expired-token-password-hash";
    const user = await createTestUser({ passwordHash: originalPasswordHash });
    const expiredToken = await createPasswordResetToken(user.id);
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    await expect(
      submitReset(expiredToken, "expired-token-new-password-2026"),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      submitReset("unknown-password-reset-token", "unknown-token-new-password-2026"),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    ).resolves.toMatchObject({ passwordHash: originalPasswordHash });
  });

  it("rolls back token consumption and password changes when session invalidation fails", async () => {
    const originalPasswordHash = "unchanged-password-hash";
    const user = await createTestUser({ passwordHash: originalPasswordHash });
    await prisma.session.create({
      data: {
        id: "reset-session-rollback",
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const token = await createPasswordResetToken(user.id);

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION fail_password_reset_session_delete() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'simulated password reset session delete failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fail_password_reset_session_delete
      BEFORE DELETE ON "Session"
      FOR EACH STATEMENT EXECUTE FUNCTION fail_password_reset_session_delete()
    `);

    let failedResponse: Response;
    try {
      failedResponse = await submitReset(token, "should-not-be-committed-2026");
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS fail_password_reset_session_delete ON "Session"`,
      );
      await prisma.$executeRawUnsafe(
        "DROP FUNCTION IF EXISTS fail_password_reset_session_delete()",
      );
    }

    expect(failedResponse.status).toBe(500);
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    ).resolves.toMatchObject({ passwordHash: originalPasswordHash });
    await expect(prisma.session.count({ where: { userId: user.id } })).resolves.toBe(1);
    await expect(prisma.passwordResetToken.count({ where: { userId: user.id } })).resolves.toBe(1);
    await expect(submitReset(token, "committed-after-retry-2026")).resolves.toMatchObject({ status: 200 });
  });
});
