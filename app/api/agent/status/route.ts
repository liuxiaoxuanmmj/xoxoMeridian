import { errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const rooms = await prisma.roomParticipant.findMany({
      where: { userId: user.id },
      select: { roomId: true }
    });
    const roomIds = rooms.map((room) => room.roomId);

    const [runningTasks, recentTasks, pendingApprovals] = await Promise.all([
      prisma.agentTask.count({
        where: { roomId: { in: roomIds }, status: { in: ["pending", "running"] } }
      }),
      prisma.agentTask.findMany({
        where: { roomId: { in: roomIds } },
        orderBy: { createdAt: "desc" },
        take: 10
      }),
      prisma.agentToolApproval.findMany({
        where: {
          status: "pending",
          task: { roomId: { in: roomIds } }
        },
        orderBy: { requestedAt: "asc" },
        take: 10
      })
    ]);

    return jsonOk({
      isWorking: runningTasks > 0,
      runningTasks,
      recentTasks,
      pendingApprovals
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
