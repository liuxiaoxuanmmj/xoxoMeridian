import { prisma } from "@/lib/prisma";
import { generateSecureToken } from "@/lib/crypto-utils";
import { ONE_HOUR_MS } from "@/lib/constants";

const RESET_TOKEN_EXPIRY_MS = ONE_HOUR_MS;

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
      token,
      expiresAt,
    },
  });

  return token;
}

// Verify and consume a password reset token
export async function verifyPasswordResetToken(
  token: string
): Promise<{ userId: string } | null> {
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    select: { userId: true, expiresAt: true },
  });

  if (!resetToken) {
    return null;
  }

  if (resetToken.expiresAt < new Date()) {
    // Token expired, delete it
    await prisma.passwordResetToken.delete({ where: { token } }).catch(() => {});
    return null;
  }

  return { userId: resetToken.userId };
}

// Delete a password reset token after use
export async function deletePasswordResetToken(token: string): Promise<void> {
  await prisma.passwordResetToken.delete({ where: { token } }).catch(() => {});
}

// Clean up expired password reset tokens (should be called periodically)
export async function cleanupExpiredResetTokens(): Promise<void> {
  await prisma.passwordResetToken.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
}
