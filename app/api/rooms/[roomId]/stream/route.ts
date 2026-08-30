import { assertRoomAccess } from "@/lib/access";
import { requireCurrentUser, USER_COOKIE, verifySession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRoomSnapshot } from "@/lib/room-snapshot";
import { sse } from "@/lib/sse";
import { cookies } from "next/headers";

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
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;

  const stop = (closeController = true) => {
    if (closed) return;
    closed = true;
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    request.signal.removeEventListener("abort", handleAbort);
    if (!closeController || !controller) return;
    try {
      controller.close();
    } catch {
      // The client or response consumer may already have closed the stream.
    }
  };

  const handleAbort = () => {
    stop();
  };

  const write = (event: string) => {
    if (closed || !controller) return false;
    try {
      controller.enqueue(encoder.encode(event));
      return true;
    } catch {
      stop(false);
      return false;
    }
  };

  const sendSnapshot = async () => {
    if (closed) return;
    try {
      // 1. Session still valid? Check if it exists in the database
      if (sessionId) {
        const dbSession = await prisma.session.findUnique({
          where: { id: sessionId },
          select: { id: true, expiresAt: true },
        });
        if (closed) return;
        if (!dbSession || dbSession.expiresAt < new Date()) {
          write(sse({ reason: "session_deleted" }, "kicked"));
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
      if (closed) return;
      if (!participant) {
        write(sse({}, "roomDeleted"));
        stop();
        return;
      }

      const snapshot = await getRoomSnapshot(roomId, user.id);
      if (closed) return;
      write(sse(snapshot));
    } catch (error) {
      if (closed) return;
      write(
        sse(
          {
            error: error instanceof Error ? error.message : "Snapshot failed"
          },
          "error"
        )
      );
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      controller = streamController;
      request.signal.addEventListener("abort", handleAbort, { once: true });
      if (request.signal.aborted) {
        stop();
        return;
      }
      await sendSnapshot();
      if (closed) return;
      interval = setInterval(sendSnapshot, 2000);
    },
    cancel() {
      stop(false);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
