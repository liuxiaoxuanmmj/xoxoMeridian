import { getDefaultRoomForUser } from "@/lib/access";
import { applyNoStoreHeaders, errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { appendSessionCookieHeaders, createSessionCookie } from "@/lib/auth";
import { verifyPassword, verifyPasswordDummy } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { loginSchema, readJsonBody } from "@/lib/validation";
import { FIFTEEN_MINUTES_MS } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const { email, password } = await readJsonBody(request, loginSchema);

    // Key includes email so a flood targeting one account can't lock out
    // the other; 20 attempts / 15 min is enough for legitimate retries.
    const limited = enforceRateLimit(request, `login:${email}`, 20, FIFTEEN_MINUTES_MS);
    if (limited) return limited;

    const user = await prisma.user.findUnique({ where: { email } });

    // Always perform bcrypt comparison to prevent timing attacks that could
    // reveal whether an email exists. Use dummy hash when user doesn't exist.
    const isValid = user
      ? await verifyPassword(password, user.passwordHash)
      : await verifyPasswordDummy(password);

    if (!user || !isValid) {
      return jsonError("Invalid credentials", 401);
    }

    const room = await getDefaultRoomForUser(user);
    const sessionCookie = await createSessionCookie(user.id);

    const response = jsonOk({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarLabel: user.avatarLabel,
      },
      room: { id: room.id, slug: room.slug, name: room.name },
    });
    applyNoStoreHeaders(response.headers);
    appendSessionCookieHeaders(response.headers, sessionCookie.cookie);
    return response;
  } catch (error) {
    return errorToResponse(error);
  }
}
