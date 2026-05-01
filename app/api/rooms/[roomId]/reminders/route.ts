import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    const body = await request.json();
    const title = String(body.title ?? "").trim();

    if (!title) {
      return Response.json({ error: "Reminder title is required." }, { status: 400 });
    }

    const reminder = await prisma.reminder.create({
      data: {
        roomId: params.roomId,
        createdById: user.id,
        title,
        body: body.body ? String(body.body) : null,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        timezone: body.timezone ? String(body.timezone) : null,
        contactWindowStart: body.contactWindowStart ? String(body.contactWindowStart) : null,
        contactWindowEnd: body.contactWindowEnd ? String(body.contactWindowEnd) : null,
        notifyChannel: body.notifyChannel ? String(body.notifyChannel) : null,
        metadata: body.metadata ?? undefined
      }
    });

    return jsonOk({ reminder }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
