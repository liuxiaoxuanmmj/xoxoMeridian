import { errorToResponse, jsonOk } from "@/lib/api";
import { createPasswordResetToken } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { readJsonBody } from "@/lib/validation";
import { FIFTEEN_MINUTES_MS, RATE_LIMIT_KEYS, AUTH_MESSAGES } from "@/lib/constants";
import { env } from "@/lib/env";
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

    // TODO: Send email with reset link
    // For now, log the token (in production, this should send an email)
    if (env.NODE_ENV === "development") {
      console.log(`[password-reset] Token for ${email}: ${token}`);
      console.log(`[password-reset] Reset link: ${env.APP_BASE_URL}/reset-password?token=${token}`);
    }

    return jsonOk({
      message: AUTH_MESSAGES.PASSWORD_RESET_SENT,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
