import { Prisma } from "@prisma/client";

import { applyNoStoreHeaders, errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { appendSessionCookieHeaders, createSessionCookie } from "@/lib/auth";
import { env } from "@/lib/env";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { readJsonBody, registerSchema } from "@/lib/validation";
import { FIFTEEN_MINUTES_MS } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const limited = enforceRateLimit(request, "register", 5, FIFTEEN_MINUTES_MS);
    if (limited) return limited;

    const body = await readJsonBody(request, registerSchema);

    if (body.password.length < env.PASSWORD_MIN_LENGTH) {
      return jsonError(`Password must be at least ${env.PASSWORD_MIN_LENGTH} characters`, 400);
    }

    if (body.inviteCode !== env.INVITE_CODE) {
      return jsonError("Invalid invite code", 403);
    }

    const room = await prisma.room.findUnique({
      where: { slug: env.DEMO_ROOM_SLUG },
    });
    if (!room) {
      return jsonError("Default room not provisioned. Run prisma seed.", 500);
    }

    const passwordHash = await hashPassword(body.password);
    const avatarLabel = body.displayName.slice(0, 2);

    let user;
    try {
      user = await prisma.$transaction(async (tx) => {
        const occupied = await tx.roomParticipant.count({ where: { roomId: room.id } });
        if (occupied >= room.maxHumanUsers) {
          throw new Response(JSON.stringify({ error: "Room is full" }), {
            status: 409,
            headers: { "content-type": "application/json" },
          });
        }

        const created = await tx.user.create({
          data: {
            email: body.email,
            displayName: body.displayName,
            avatarLabel,
            passwordHash,
            profile: {
              create: {
                city: body.city ?? "—",
                country: body.country ?? "—",
                timezone: body.timezone ?? "UTC",
              },
            },
          },
        });

        await tx.roomParticipant.create({
          data: {
            roomId: room.id,
            userId: created.id,
            role: occupied === 0 ? "owner" : "member",
          },
        });

        return created;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return jsonError("An account with that email already exists", 409);
      }
      throw err;
    }

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
