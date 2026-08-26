import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sse } from "@/lib/sse";
import { getDragPositions } from "@/lib/atlas-drag-cache";
import { getOrCreateBoard } from "@/lib/atlas-board";
import { cookies } from "next/headers";
import { USER_COOKIE, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireCurrentUser();

  const jar = await cookies();
  const token = jar.get(USER_COOKIE)?.value;
  const session = verifySession(token);
  const sessionId = session?.sessionId;

  const board = await getOrCreateBoard();

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
          // controller already closed
        }
      };

      const sendSnapshot = async () => {
        if (closed) return;

        if (sessionId) {
          const dbSession = await prisma.session.findUnique({
            where: { id: sessionId },
            select: { id: true, expiresAt: true },
          });

          if (dbSession) {
            if (dbSession.expiresAt < new Date()) {
              controller.enqueue(encoder.encode(sse({ reason: "session_deleted" }, "kicked")));
              stop();
              return;
            }
          } else {
            controller.enqueue(encoder.encode(sse({ reason: "session_deleted" }, "kicked")));
            stop();
            return;
          }
        }

        try {
          const [elements, connections] = await Promise.all([
            prisma.atlasElement.findMany({
              where: { boardId: board.id },
              orderBy: { zIndex: "asc" },
            }),
            prisma.atlasConnection.findMany({
              where: { boardId: board.id },
            }),
          ]);

          const dragPositions = getDragPositions();
          const mergedElements = elements.map((el) => {
            const drag = dragPositions.get(el.id);
            return drag ? { ...el, x: drag.x, y: drag.y } : el;
          });

          controller.enqueue(
            encoder.encode(
              sse({ boardId: board.id, elements: mergedElements, connections })
            )
          );
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              sse({ error: error instanceof Error ? error.message : "Snapshot failed" }, "error")
            )
          );
        }
      };

      await sendSnapshot();
      if (closed) return;
      interval = setInterval(sendSnapshot, 800);

      request.signal.addEventListener("abort", () => {
        stop();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
