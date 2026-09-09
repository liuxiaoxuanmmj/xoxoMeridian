import type { Prisma } from "@prisma/client";

export function getPostVisibilityWhere(userId: string): Prisma.PostWhereInput {
  return {
    OR: [
      { type: "user_post" },
      {
        type: "agent_log",
        roomId: { not: null },
        room: {
          participants: {
            some: { userId },
          },
        },
      },
    ],
  };
}
