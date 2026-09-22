import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const execFileAsync = promisify(execFile);
const PRIVATE_MIGRATION = "20260922120000_agent_private_conversation";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Agent 专属对话旧库升级", () => {
  it("保留旧共享数据、兼容无幂等键消息，数据库强制 owner/用途/人数约束并级联删除私聊", async () => {
    const databaseName = `xoxo_private_migration_${randomUUID().replaceAll("-", "")}`;
    const temporaryRoot = await mkdtemp(join(tmpdir(), "xoxo-private-migration-"));
    const stagedPrisma = join(temporaryRoot, "prisma");
    const stagedMigrations = join(stagedPrisma, "migrations");
    let database: PrismaClient | undefined;
    let created = false;
    try {
      // 数据库名仅来自固定前缀和 UUID；基础连接只由 integration globalSetup 指向 Testcontainer。
      await prisma.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
      created = true;
      const databaseUrl = new URL(requiredTestDatabaseUrl());
      databaseUrl.pathname = `/${databaseName}`;
      await stageHistoricalMigrations(stagedPrisma, stagedMigrations);
      await deploy(databaseUrl.toString(), join(stagedPrisma, "schema.prisma"));
      database = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
      await seedOldData(database);

      await cp(resolve("prisma/migrations", PRIVATE_MIGRATION), join(stagedMigrations, PRIVATE_MIGRATION), { recursive: true });
      await deploy(databaseUrl.toString(), join(stagedPrisma, "schema.prisma"));

      expect(await database.room.findUniqueOrThrow({ where: { id: "legacy-shared" } })).toMatchObject({
        kind: "shared", privateOwnerId: null, maxHumanUsers: 2, name: "原共享房间"
      });
      expect(await database.message.findUniqueOrThrow({ where: { id: "legacy-message" } })).toMatchObject({
        content: "升级前正文", senderId: "legacy-alice", clientMessageId: null
      });
      expect(await database.roomParticipant.count({ where: { roomId: "legacy-shared" } })).toBe(2);
      // PostgreSQL 的 nullable 唯一键必须容许原共享发送路径持续不传 clientMessageId。
      await database.message.createMany({ data: [
        { roomId: "legacy-shared", senderId: "legacy-alice", senderType: "human", content: "旧路径一" },
        { roomId: "legacy-shared", senderId: "legacy-alice", senderType: "human", content: "旧路径二" }
      ] });
      expect(await database.message.count()).toBe(3);

      const owner = await database.user.findUniqueOrThrow({ where: { id: "legacy-alice" } });
      for (const invalid of [
        { kind: "agent_private" as const, privateOwnerId: null, maxHumanUsers: 1 },
        { kind: "agent_private" as const, privateOwnerId: owner.id, maxHumanUsers: 2 },
        { kind: "shared" as const, privateOwnerId: owner.id, maxHumanUsers: 2 }
      ]) {
        await expect(database.room.create({ data: {
          slug: `invalid-${randomUUID()}`, name: "数据库必须拒绝", ...invalid
        } })).rejects.toThrow();
      }
      await expect(database.room.create({ data: {
        slug: "missing-owner", name: "不存在的 owner", kind: "agent_private", privateOwnerId: "missing-user", maxHumanUsers: 1
      } })).rejects.toMatchObject({ code: "P2003" });

      const privateRoom = await database.room.create({ data: {
        slug: "private-alice", name: "A 的私聊", kind: "agent_private", privateOwnerId: owner.id, maxHumanUsers: 1,
        participants: { create: { userId: owner.id, role: "owner" } }
      } });
      await expect(database.room.create({ data: {
        slug: "duplicate-private-alice", name: "重复 owner", kind: "agent_private", privateOwnerId: owner.id, maxHumanUsers: 1
      } })).rejects.toMatchObject({ code: "P2002" });
      const agent = await database.agent.create({ data: { slug: "private-migration-agent", displayName: "助手", description: "升级验证" } });
      const key = randomUUID();
      const message = await database.message.create({ data: {
        roomId: privateRoom.id, senderId: owner.id, senderType: "human", content: "私聊正文", clientMessageId: key
      } });
      await expect(database.message.create({ data: {
        roomId: privateRoom.id, senderId: owner.id, senderType: "human", content: "重复正文", clientMessageId: key
      } })).rejects.toMatchObject({ code: "P2002" });
      const task = await database.agentTask.create({ data: {
        roomId: privateRoom.id, agentId: agent.id, sourceMessageId: message.id, requestedById: owner.id, input: {}
      } });
      await database.memo.create({ data: { roomId: privateRoom.id, title: "私聊备忘", content: "私聊备忘" } });
      await database.memory.create({ data: { roomId: privateRoom.id, userId: owner.id, ownerKey: `user:${owner.id}`, key: "person.preference", value: "私聊记忆" } });
      await database.scheduledJob.create({ data: {
        roomId: privateRoom.id, agentId: agent.id, cron: "0 12 * * *", payload: {}, nextRunAt: new Date("2030-01-01")
      } });
      await database.user.delete({ where: { id: owner.id } });
      expect(await database.room.findUnique({ where: { id: privateRoom.id } })).toBeNull();
      expect(await database.message.findUnique({ where: { id: message.id } })).toBeNull();
      expect(await database.agentTask.findUnique({ where: { id: task.id } })).toBeNull();
      expect(await database.memo.count()).toBe(0);
      expect(await database.memory.count()).toBe(0);
      expect(await database.scheduledJob.count()).toBe(0);
      // owner 外键只管理私聊；既有 shared 房间和另一用户不受级联影响。
      expect(await database.room.findUnique({ where: { id: "legacy-shared" } })).not.toBeNull();
      expect(await database.user.findUnique({ where: { id: "legacy-bob" } })).not.toBeNull();
      expect(await database.roomParticipant.findMany()).toEqual([
        expect.objectContaining({ roomId: "legacy-shared", userId: "legacy-bob" })
      ]);
      expect(await database.message.findMany()).toHaveLength(3);
      expect(await database.message.findUniqueOrThrow({ where: { id: "legacy-message" } })).toMatchObject({ content: "升级前正文", senderId: null });
    } finally {
      await database?.$disconnect();
      if (created) {
        await prisma.$queryRawUnsafe("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", databaseName);
        await prisma.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`);
      }
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

async function stageHistoricalMigrations(directory: string, migrations: string) {
  await mkdir(migrations, { recursive: true });
  await copyFile(resolve("prisma/schema.prisma"), join(directory, "schema.prisma"));
  await copyFile(resolve("prisma/migrations/migration_lock.toml"), join(migrations, "migration_lock.toml"));
  for (const entry of await readdir(resolve("prisma/migrations"), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name >= PRIVATE_MIGRATION) continue;
    await cp(resolve("prisma/migrations", entry.name), join(migrations, entry.name), { recursive: true });
  }
}

async function deploy(databaseUrl: string, schema: string) {
  await execFileAsync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", schema], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl }
  });
}

function requiredTestDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url || new URL(url).pathname !== "/xoxo_meridian_test") {
    throw new Error("迁移回归仅允许 integration Testcontainer 数据库作为管理连接。");
  }
  return url;
}

async function seedOldData(database: PrismaClient) {
  await database.$executeRawUnsafe(`INSERT INTO "User" ("id", "email", "displayName", "avatarLabel", "passwordHash", "createdAt", "updatedAt") VALUES
    ('legacy-alice', 'legacy-alice@example.com', 'A', 'A', 'test-password', NOW(), NOW()),
    ('legacy-bob', 'legacy-bob@example.com', 'B', 'B', 'test-password', NOW(), NOW())`);
  await database.$executeRawUnsafe(`INSERT INTO "Room" ("id", "slug", "name", "createdAt", "updatedAt")
    VALUES ('legacy-shared', 'legacy-shared', '原共享房间', NOW(), NOW())`);
  await database.$executeRawUnsafe(`INSERT INTO "RoomParticipant" ("id", "roomId", "userId", "role") VALUES
    ('legacy-member-a', 'legacy-shared', 'legacy-alice', 'owner'), ('legacy-member-b', 'legacy-shared', 'legacy-bob', 'member')`);
  await database.$executeRawUnsafe(`INSERT INTO "Message" ("id", "roomId", "senderId", "senderType", "content", "updatedAt")
    VALUES ('legacy-message', 'legacy-shared', 'legacy-alice', 'human', '升级前正文', NOW())`);
}
