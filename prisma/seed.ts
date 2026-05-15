import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const room = await prisma.room.upsert({
    where: { slug: process.env.DEMO_ROOM_SLUG ?? "our-room" },
    update: {},
    create: {
      slug: process.env.DEMO_ROOM_SLUG ?? "our-room",
      name: "Our Meridian Room",
      description: "A private two-person room with a local life assistant.",
      maxHumanUsers: 2,
    },
  });

  await prisma.agent.upsert({
    where: { slug: "life-assistant" },
    update: {},
    create: {
      slug: "life-assistant",
      displayName: "小助手",
      description: "A local runtime life assistant that can read room context and call whitelisted tools.",
      config: {
        defaultRoomId: room.id,
        locale: "zh-CN",
      },
    },
  });

  await prisma.eventLog.create({
    data: {
      roomId: room.id,
      type: "seed.completed",
      payload: { roomId: room.id },
    },
  });

  const inviteHint = process.env.INVITE_CODE
    ? `INVITE_CODE=${process.env.INVITE_CODE.slice(0, 2)}***${process.env.INVITE_CODE.slice(-2)}`
    : "INVITE_CODE not set";
  console.log(`[seed] room=${room.slug}; ${inviteHint}; ready for /api/auth/register`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
