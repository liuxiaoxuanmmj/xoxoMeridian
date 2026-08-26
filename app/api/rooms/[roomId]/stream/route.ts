import { assertRoomAccess } from "@/lib/access";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRoomSnapshot } from "@/lib/room-snapshot";
import { sse } from "@/lib/sse";
import { cookies } from "next/headers";
import { USER_COOKIE, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const user = await requireCurrentUser();
  const { roomId } = await params;
  await assertRoomAccess(roomId, user.id);

  // Get the session ID from the cookie to track this specific session
  const jar = await cookies();
  const token = jar.get(USER_COOKIE)?.value;
  const session = verifySession(token);
  const sessionId = session?.sessionId;

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      let interval: ReturnType<typeof setInterval> | null = null;

      const stop = () => {
        if (closed) return;
        closed = true;
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        try {
          controller.close();
        } catch {
          // controller already closed — fine
        }
      };

      const sendSnapshot = async () => {
        if (closed) return;

        // 1. Session still valid? Check if it exists in the database
        if (sessionId) {
          const dbSession = await prisma.session.findUnique({
            where: { id: sessionId },
            select: { id: true, expiresAt: true },
          });
          if (!dbSession || dbSession.expiresAt < new Date()) {
            controller.enqueue(
              encoder.encode(sse({ reason: "session_deleted" }, "kicked"))
            );
            stop();
            return;
          }
        }

        // 2. Room still exists and user is still a participant? A delete from
        //    another client cascades the participant row, so this single
        //    lookup covers both "room deleted" and "user ejected".
        const participant = await prisma.roomParticipant.findUnique({
          where: { roomId_userId: { roomId, userId: user.id } },
          select: { id: true },
        });
        if (!participant) {
          controller.enqueue(encoder.encode(sse({}, "roomDeleted")));
          stop();
          return;
        }

        try {
          const snapshot = await getRoomSnapshot(roomId, user.id);
          controller.enqueue(encoder.encode(sse(snapshot)));
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              sse(
                {
                  error: error instanceof Error ? error.message : "Snapshot failed"
                },
                "error"
              )
            )
          );
        }
      };

      await sendSnapshot();
      if (closed) return;
      interval = setInterval(sendSnapshot, 2000);

      request.signal.addEventListener("abort", () => {
        stop();
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
