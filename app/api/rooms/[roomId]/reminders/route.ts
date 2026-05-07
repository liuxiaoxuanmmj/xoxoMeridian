import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { readJsonBody, reminderPostSchema } from "@/lib/validation";

export async function GET(_request: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await requireCurrentUser();
    await assertRoomAccess(params.roomId, user.id);

    const reminders = await prisma.reminder.findMany({
      where: { roomId: params.roomId },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }]
    });

    return jsonOk({ reminders });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await requireCurrentUser();
    await assertRoomAccess(params.roomId, user.id);

    const limited = enforceRateLimit(request, `reminders:${user.id}`, 20, 60_000);
    if (limited) return limited;

    const parsed = await readJsonBody(request, reminderPostSchema);

    const reminder = await prisma.reminder.create({
      data: {
        roomId: params.roomId,
        createdById: user.id,
        title: parsed.title,
        body: parsed.body ?? null,
        dueAt: parsed.dueAt ? new Date(parsed.dueAt) : null,
        timezone: parsed.timezone ?? null,
        contactWindowStart: parsed.contactWindowStart ?? null,
        contactWindowEnd: parsed.contactWindowEnd ?? null,
        notifyChannel: parsed.notifyChannel ?? null,
        metadata: parsed.metadata as never
      }
    });

    return jsonOk({ reminder }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
