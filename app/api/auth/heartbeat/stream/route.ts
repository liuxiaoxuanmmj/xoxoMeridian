import { cookies } from "next/headers";

import { USER_COOKIE, verifySession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sse } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Lightweight session-validity heartbeat. Every authenticated client opens one
// and gets a `kicked` event within ~10s if their session is deleted from the
// database (e.g., by a login from a different IP).

const HEARTBEAT_MS = 10_000;

export async function GET(request: Request) {
  const token = cookies().get(USER_COOKIE)?.value;
  const session = verifySession(token);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Same-device cookie clobber: another tab on this browser logged in as a
  // different account, overwriting xoxo_session. The new cookie still
  // verify()s — but it points to a different userId than the tab that opened
  // this stream. Kick proactively rather than letting the tab keep operating
  // under stale `currentUser`.
  const expect = new URL(request.url).searchParams.get("u");
  if (expect && expect !== session.userId) {
    return new Response("Identity mismatch", { status: 401 });
  }

  const { sessionId, userId } = session;

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
          // already closed
        }
      };

      const tick = async () => {
        if (closed) return;
        try {
          // Check if session still exists in database
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

          // Cheap keepalive ping so reverse proxies don't drop the connection.
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          // Transient DB blip — skip this tick rather than tear down the stream.
        }
      };

      // Send an immediate hello so the client knows the channel is live and
      // can flip its UI state without waiting a full HEARTBEAT_MS.
      controller.enqueue(encoder.encode(sse({ ok: true }, "ready")));
      interval = setInterval(tick, HEARTBEAT_MS);

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
