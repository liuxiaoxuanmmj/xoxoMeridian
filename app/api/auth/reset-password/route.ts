import { errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { resetPasswordWithToken } from "@/lib/password-reset";
import { enforceRateLimit } from "@/lib/rate-limit";
import { readJsonBody } from "@/lib/validation";
import { FIFTEEN_MINUTES_MS, RATE_LIMIT_KEYS, AUTH_MESSAGES } from "@/lib/constants";
import { z } from "zod";
import { env } from "@/lib/env";

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(env.PASSWORD_MIN_LENGTH).max(256),
});

export async function POST(request: Request) {
  try {
    const { token, password } = await readJsonBody(request, resetPasswordSchema);

    // Rate limit: 10 attempts per 15 minutes per IP
    const limited = enforceRateLimit(request, RATE_LIMIT_KEYS.RESET_PASSWORD, 10, FIFTEEN_MINUTES_MS);
    if (limited) return limited;

    const passwordHash = await hashPassword(password);
    const consumed = await resetPasswordWithToken(token, passwordHash);
    if (!consumed) {
      return jsonError("无效或已过期的重置链接", 400);
    }

    return jsonOk({
      message: AUTH_MESSAGES.PASSWORD_RESET_SUCCESS,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
