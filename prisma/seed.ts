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
      maxHumanUsers: 2
    }
  });

  const me = await prisma.user.upsert({
    where: { email: process.env.DEMO_MY_EMAIL ?? "me@example.com" },
    update: {
      displayName: "我",
      avatarLabel: "我",
      demoRole: "me"
    },
    create: {
      email: process.env.DEMO_MY_EMAIL ?? "me@example.com",
      displayName: "我",
      avatarLabel: "我",
      demoRole: "me",
      profile: {
        create: {
          city: "Shanghai",
          country: "China",
          timezone: "Asia/Shanghai",
          preferences: {
            contactWindow: "08:00-23:30",
            tone: "warm and practical"
          }
        }
      }
    }
  });

  const her = await prisma.user.upsert({
    where: { email: process.env.DEMO_HER_EMAIL ?? "her@example.com" },
    update: {
      displayName: "她",
      avatarLabel: "她",
      demoRole: "her"
    },
    create: {
      email: process.env.DEMO_HER_EMAIL ?? "her@example.com",
      displayName: "她",
      avatarLabel: "她",
      demoRole: "her",
      profile: {
        create: {
          city: "London",
          country: "United Kingdom",
          timezone: "Europe/London",
          preferences: {
            contactWindow: "09:00-22:30",
            weatherLocation: "London"
          }
        }
      }
    }
  });

  await prisma.roomParticipant.upsert({
    where: { roomId_userId: { roomId: room.id, userId: me.id } },
    update: { role: "owner" },
    create: { roomId: room.id, userId: me.id, role: "owner" }
  });

  await prisma.roomParticipant.upsert({
    where: { roomId_userId: { roomId: room.id, userId: her.id } },
    update: { role: "member" },
    create: { roomId: room.id, userId: her.id, role: "member" }
  });

  await prisma.agent.upsert({
    where: { slug: "life-assistant" },
    update: {
      displayName: "小助手",
      enabled: true
    },
    create: {
      slug: "life-assistant",
      displayName: "小助手",
      description: "A local runtime life assistant that can read room context and call whitelisted tools.",
      config: {
        defaultRoomId: room.id,
        locale: "zh-CN"
      }
    }
  });

  const existingMessages = await prisma.message.count({ where: { roomId: room.id } });
  if (existingMessages === 0) {
    await prisma.message.create({
      data: {
        roomId: room.id,
        senderType: "system",
        content: "欢迎来到你们的私密聊天室。可以输入 @小助手 明天提醒我给她发早安 来试试 Agent。",
        metadata: { seeded: true }
      }
    });
  }

  const [existingNotes, existingMemos] = await Promise.all([
    prisma.note.count({ where: { roomId: room.id } }),
    prisma.memo.count({ where: { roomId: room.id } })
  ]);

  if (existingNotes === 0) {
    await prisma.note.create({
      data: {
        roomId: room.id,
        createdById: me.id,
        content: "第一次部署后，试着让 @小助手 创建一个提醒。",
        color: "sage",
        metadata: { seeded: true }
      }
    });
  }

  if (existingMemos === 0) {
    await prisma.memo.create({
      data: {
        roomId: room.id,
        createdById: me.id,
        title: "适合联系的时间",
        content: "先默认双方当地时间 09:00-22:30 适合联系，之后可以让 Agent 帮忙调整。",
        pinned: true,
        metadata: { seeded: true }
      }
    });
  }

  await prisma.eventLog.create({
    data: {
      roomId: room.id,
      type: "seed.completed",
      payload: {
        roomId: room.id,
        userIds: [me.id, her.id]
      }
    }
  });

  console.log(`Seeded room ${room.slug} with demo users ${me.email} and ${her.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
