import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readdir, rm, copyFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const execFileAsync = promisify(execFile);
const PROJECTION_MIGRATION = "20260920120000_agent_timeline_projection";

type MigratedTask = {
  id: string;
  status: string;
  completedAt: Date | null;
  updatedAt: Date;
  timelineProjectedAt: Date | null;
};

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Agent 时间线投影迁移", () => {
  it("历史完成任务一律记为已决策，恢复扫描不再补发陈旧时间线条目", async () => {
    const databaseName = `xoxo_timeline_migration_${randomUUID().replaceAll("-", "")}`;
    const databaseIdentifier = quoteDatabaseIdentifier(databaseName);
    const temporaryRoot = await mkdtemp(join(tmpdir(), "xoxo-timeline-migration-"));
    const temporaryPrisma = join(temporaryRoot, "prisma");
    const temporaryMigrations = join(temporaryPrisma, "migrations");
    let migrationPrisma: PrismaClient | null = null;
    let databaseCreated = false;

    try {
      await prisma.$executeRawUnsafe(`CREATE DATABASE ${databaseIdentifier}`);
      databaseCreated = true;

      const databaseUrl = databaseUrlFor(databaseName);
      await stageHistoricalMigrations(temporaryPrisma, temporaryMigrations);
      await deployMigrations(databaseUrl, join(temporaryPrisma, "schema.prisma"));

      migrationPrisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
      await seedHistoricalTasks(migrationPrisma);

      await cp(
        resolve("prisma/migrations", PROJECTION_MIGRATION),
        join(temporaryMigrations, PROJECTION_MIGRATION),
        { recursive: true }
      );
      await deployMigrations(databaseUrl, join(temporaryPrisma, "schema.prisma"));

      const tasks = await migrationPrisma.$queryRawUnsafe<MigratedTask[]>(`
        SELECT "id", "status", "completedAt", "updatedAt", "timelineProjectedAt"
        FROM "AgentTask"
        ORDER BY "id"
      `);

      // 已完成任务：无论当时是否真的写出了 Post，都记为已决策。
      for (const id of ["task-projected", "task-missed", "task-no-completion-time", "task-no-tools"]) {
        expect(rowById(tasks, id).timelineProjectedAt, `${id} 未被回填为已决策`).not.toBeNull();
      }
      expect(rowById(tasks, "task-projected").timelineProjectedAt).toEqual(
        new Date("2026-09-19T10:00:00.000Z")
      );
      expect(rowById(tasks, "task-missed").timelineProjectedAt).toEqual(
        new Date("2026-09-19T11:00:00.000Z")
      );
      // completedAt 为空的历史行也必须落到非空，否则它会被恢复扫描重新当作待补投影。
      expect(rowById(tasks, "task-no-completion-time").timelineProjectedAt).toEqual(
        rowById(tasks, "task-no-completion-time").updatedAt
      );
      // 非完成任务不在恢复范围内，保持原样。
      expect(rowById(tasks, "task-running").timelineProjectedAt).toBeNull();

      // 恢复扫描的候选集合在迁移后必须为空：没有历史任务会被补发。
      const pending = await migrationPrisma.$queryRawUnsafe<{ id: string }[]>(`
        SELECT t."id"
        FROM "AgentTask" t
        WHERE t."status" = 'completed'
          AND t."timelineProjectedAt" IS NULL
          AND EXISTS (SELECT 1 FROM "ToolCall" c WHERE c."taskId" = t."id")
      `);
      expect(pending).toEqual([]);

      // 迁移只做标记：已有时间线条目不变，也不新增任何 Post。
      const posts = await migrationPrisma.$queryRawUnsafe<{ id: string; agentTaskId: string | null }[]>(
        `SELECT "id", "agentTaskId" FROM "Post" ORDER BY "id"`
      );
      expect(posts).toEqual([{ id: "post-historical", agentTaskId: null }]);
    } finally {
      await migrationPrisma?.$disconnect();
      if (databaseCreated) {
        await prisma.$queryRawUnsafe(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
          databaseName
        );
        await prisma.$executeRawUnsafe(`DROP DATABASE ${databaseIdentifier}`);
      }
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

async function stageHistoricalMigrations(temporaryPrisma: string, temporaryMigrations: string) {
  await mkdir(temporaryMigrations, { recursive: true });
  await copyFile(resolve("prisma/schema.prisma"), join(temporaryPrisma, "schema.prisma"));
  await copyFile(
    resolve("prisma/migrations/migration_lock.toml"),
    join(temporaryMigrations, "migration_lock.toml")
  );

  const entries = await readdir(resolve("prisma/migrations"), { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name >= PROJECTION_MIGRATION) continue;
    await cp(resolve("prisma/migrations", entry.name), join(temporaryMigrations, entry.name), {
      recursive: true
    });
  }
}

async function deployMigrations(databaseUrl: string, schemaPath: string) {
  const prismaCli = resolve("node_modules/prisma/build/index.js");
  await execFileAsync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl }
  });
}

async function seedHistoricalTasks(database: PrismaClient) {
  await database.$executeRawUnsafe(`
    INSERT INTO "Room" ("id", "slug", "name", "createdAt", "updatedAt")
    VALUES ('room-hist', 'hist-room', 'Historical Room', NOW(), NOW())
  `);
  await database.$executeRawUnsafe(`
    INSERT INTO "Agent" ("id", "slug", "displayName", "description", "createdAt", "updatedAt")
    VALUES ('agent-hist', 'hist-agent', '历史助手', '迁移测试', NOW(), NOW())
  `);
  await database.$executeRawUnsafe(`
    INSERT INTO "AgentTask" (
      "id", "roomId", "agentId", "status", "input", "result",
      "completedAt", "createdAt", "updatedAt"
    ) VALUES
      (
        'task-projected', 'room-hist', 'agent-hist', 'completed', '{}', '{"summary":"已投影"}',
        '2026-09-19T10:00:00Z', '2026-09-19T09:59:00Z', '2026-09-19T10:00:00Z'
      ),
      (
        'task-missed', 'room-hist', 'agent-hist', 'completed', '{}', '{"summary":"当时没写出来"}',
        '2026-09-19T11:00:00Z', '2026-09-19T10:59:00Z', '2026-09-19T11:00:00Z'
      ),
      (
        'task-no-completion-time', 'room-hist', 'agent-hist', 'completed', '{}', '{"summary":"缺完成时间"}',
        NULL, '2026-09-19T11:59:00Z', '2026-09-19T12:00:00Z'
      ),
      (
        'task-no-tools', 'room-hist', 'agent-hist', 'completed', '{}', '{"summary":"无工具"}',
        '2026-09-19T13:00:00Z', '2026-09-19T12:59:00Z', '2026-09-19T13:00:00Z'
      ),
      (
        'task-running', 'room-hist', 'agent-hist', 'running', '{}', NULL,
        NULL, '2026-09-19T14:00:00Z', '2026-09-19T14:01:00Z'
      )
  `);
  await database.$executeRawUnsafe(`
    INSERT INTO "ToolCall" ("id", "taskId", "stepKey", "toolName", "status", "createdAt")
    VALUES
      ('call-1', 'task-projected', 'weather.get', 'weather.get', 'completed', NOW()),
      ('call-2', 'task-missed', 'weather.get', 'weather.get', 'completed', NOW()),
      ('call-3', 'task-no-completion-time', 'weather.get', 'weather.get', 'completed', NOW())
  `);
  await database.$executeRawUnsafe(`
    INSERT INTO "Post" (
      "id", "slug", "title", "content", "type", "roomId", "publishedAt", "metadata", "createdAt", "updatedAt"
    ) VALUES (
      'post-historical', 'agent-log-historical', 'Agent: 历史助手', '历史内容', 'agent_log', 'room-hist',
      '2026-09-19T10:00:00Z', '{"taskId":"task-projected"}', NOW(), NOW()
    )
  `);
}

function databaseUrlFor(databaseName: string) {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) throw new Error("DATABASE_URL is required for migration tests.");
  const databaseUrl = new URL(baseUrl);
  databaseUrl.pathname = `/${databaseName}`;
  return databaseUrl.toString();
}

function quoteDatabaseIdentifier(databaseName: string) {
  if (!/^[a-z0-9_]+$/.test(databaseName)) {
    throw new Error("Unsafe temporary database name.");
  }
  return `"${databaseName}"`;
}

function rowById(rows: MigratedTask[], id: string) {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`Migrated AgentTask row not found: ${id}`);
  return row;
}
