import { assertRoomAccess } from "@/lib/access";
import { requireCurrentUser } from "@/lib/auth";
import { getRoomSnapshot } from "@/lib/room-snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sse(data: unknown, event = "snapshot") {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request, { params }: { params: { roomId: string } }) {
  const user = await requireCurrentUser();
  await assertRoomAccess(params.roomId, user.id);

  const encoder = new TextEncoder();
  let closed = false;

  request.signal.addEventListener("abort", () => {
    closed = true;
  });

  const stream = new ReadableStream({
    async start(controller) {
      const sendSnapshot = async () => {
        if (closed) {
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
      const interval = setInterval(sendSnapshot, 2000);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
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
