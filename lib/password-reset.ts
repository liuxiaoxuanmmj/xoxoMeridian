import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { generateSecureToken } from "@/lib/crypto-utils";
import { ONE_HOUR_MS } from "@/lib/constants";

const RESET_TOKEN_EXPIRY_MS = ONE_HOUR_MS;
const RESET_TOKEN_DIGEST_PREFIX = "v1:sha256:";

function digestResetToken(token: string): string {
  return `${RESET_TOKEN_DIGEST_PREFIX}${createHash("sha256").update(token, "utf8").digest("hex")}`;
}

// Generate a cryptographically secure random reset token
export function generateResetToken(): string {
  return generateSecureToken();
}

// Create a password reset token for a user
export async function createPasswordResetToken(userId: string): Promise<string> {
  // Delete any existing reset tokens for this user
  await prisma.passwordResetToken.deleteMany({
    where: { userId },
  });

  const token = generateResetToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenDigest: digestResetToken(token),
      expiresAt,
    },
  });

  return token;
}

export async function resetPasswordWithToken(
  token: string,
  passwordHash: string,
): Promise<boolean> {
  const tokenDigest = digestResetToken(token);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const resetToken = await tx.passwordResetToken.findUnique({
      where: { tokenDigest },
      select: { id: true, userId: true },
    });
    if (!resetToken) {
      return false;
    }

    const claimed = await tx.passwordResetToken.deleteMany({
      where: {
        id: resetToken.id,
        tokenDigest,
        expiresAt: { gt: now },
      },
    });
    if (claimed.count !== 1) {
      return false;
    }

    await tx.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    });
    await tx.session.deleteMany({
      where: { userId: resetToken.userId },
    });

    return true;
  });
}

// Clean up expired password reset tokens (should be called periodically)
export async function cleanupExpiredResetTokens(): Promise<void> {
  await prisma.passwordResetToken.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
}
