import { errorToResponse, jsonOk } from "@/lib/api";
import { createPasswordResetToken } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { readJsonBody } from "@/lib/validation";
import { FIFTEEN_MINUTES_MS, RATE_LIMIT_KEYS, AUTH_MESSAGES } from "@/lib/constants";
import { env } from "@/lib/env";
import { sendEmail, createPasswordResetEmail } from "@/lib/email";
import { z } from "zod";

const forgotPasswordSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
});

export async function POST(request: Request) {
  try {
    const { email } = await readJsonBody(request, forgotPasswordSchema);

    // Rate limit: 5 attempts per 15 minutes per email
    const limited = enforceRateLimit(request, RATE_LIMIT_KEYS.FORGOT_PASSWORD(email), 5, FIFTEEN_MINUTES_MS);
    if (limited) return limited;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    // Always return success to prevent email enumeration
    // Even if user doesn't exist, we pretend to send an email
    if (!user) {
      return jsonOk({
        message: AUTH_MESSAGES.PASSWORD_RESET_SENT,
      });
    }

    // Create reset token
    const token = await createPasswordResetToken(user.id);

    // Send password reset email
    const resetLink = `${env.APP_BASE_URL}/reset-password?token=${token}`;
    const emailPayload = createPasswordResetEmail({
      email: user.email,
      resetLink,
      expiryHours: 1,
    });

    const result = await sendEmail(emailPayload);

    if (!result.success) {
      console.error(`[password-reset] Failed to send email to ${email}:`, result.error);
      // Don't expose email sending failure to prevent enumeration
      // Log for debugging but return success to user
    }

    return jsonOk({
      message: AUTH_MESSAGES.PASSWORD_RESET_SENT,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
