import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fetchWeatherSnapshot } from "@/agent/tools/weather-tool";

export const dynamic = "force-dynamic";

// GET /api/rooms/[roomId]/weather?who=partner|self|both
// Returns current weather for the requested participant(s), using the partner
// by default. The underlying fetch has its own 10-min cache, so polling this
// endpoint from the UI does not hit QWeather on every call.
export async function GET(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { roomId } = await params;
    await assertRoomAccess(roomId, user.id);

    const limited = enforceRateLimit(request, `weather:${user.id}`, 30, 60_000);
    if (limited) return limited;

    const { searchParams } = new URL(request.url);
    const who = (searchParams.get("who") ?? "partner").toLowerCase();

    const participants = await prisma.roomParticipant.findMany({
      where: { roomId },
      orderBy: { joinedAt: "asc" },
      include: { user: { include: { profile: true } } }
    });

    const meIdx = participants.findIndex((p) => p.userId === user.id);
    const me = meIdx >= 0 ? participants[meIdx] : participants[0];
    const partner = participants.find((p) => p.userId !== user.id) ?? participants[1] ?? null;

    const results: Array<{
      subject: "self" | "partner";
      displayName: string;
      city: string | null;
      snapshot: Awaited<ReturnType<typeof fetchWeatherSnapshot>> | null;
      error: string | null;
    }> = [];

    const targets: Array<{ subject: "self" | "partner"; entry: typeof me | null }> = [];
    if (who === "self") targets.push({ subject: "self", entry: me });
    else if (who === "both") {
      targets.push({ subject: "self", entry: me });
      targets.push({ subject: "partner", entry: partner });
    } else {
      targets.push({ subject: "partner", entry: partner });
    }

    for (const { subject, entry } of targets) {
      const city = entry?.user.profile?.city ?? null;
      if (!entry || !city) {
        results.push({
          subject,
          displayName: entry?.user.displayName ?? (subject === "self" ? "本人" : "对方"),
          city,
          snapshot: null,
          error: city ? null : "city not set on profile"
        });
        continue;
      }

      try {
        const snapshot = await fetchWeatherSnapshot(city);
        results.push({
          subject,
          displayName: entry.user.displayName,
          city,
          snapshot,
          error: null
        });
      } catch (err) {
        results.push({
          subject,
          displayName: entry.user.displayName,
          city,
          snapshot: null,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    return jsonOk({ results });
  } catch (error) {
    return errorToResponse(error);
  }
}
