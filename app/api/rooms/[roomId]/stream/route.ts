import { assertRoomAccess } from "@/lib/access";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRoomSnapshot } from "@/lib/room-snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sse(data: unknown, event = "snapshot") {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request, { params }: { params: { roomId: string } }) {
  const user = await requireCurrentUser();
  await assertRoomAccess(params.roomId, user.id);

  // Capture the session version that the current cookie was signed with;
  // every tick compares against the DB so a newer login elsewhere kicks
  // this stream within ~2 seconds.
  const initialSessionVersion = user.sessionVersion;

  const encoder = new TextEncoder();
  let closed = false;

  request.signal.addEventListener("abort", () => {
    closed = true;
  });

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

        // 1. Session still the latest? If not, the cookie on this browser has
        //    been superseded by a newer login — push a kick and bail.
        const current = await prisma.user.findUnique({
          where: { id: user.id },
          select: { sessionVersion: true },
        });
        if (!current || current.sessionVersion !== initialSessionVersion) {
          controller.enqueue(
            encoder.encode(sse({ reason: "session_superseded" }, "kicked"))
          );
          stop();
          return;
        }

        // 2. Room still exists and user is still a participant? A delete from
        //    another client cascades the participant row, so this single
        //    lookup covers both "room deleted" and "user ejected".
        const participant = await prisma.roomParticipant.findUnique({
          where: { roomId_userId: { roomId: params.roomId, userId: user.id } },
          select: { id: true },
        });
        if (!participant) {
          controller.enqueue(encoder.encode(sse({}, "roomDeleted")));
          stop();
          return;
        }

        try {
          const snapshot = await getRoomSnapshot(params.roomId);
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
