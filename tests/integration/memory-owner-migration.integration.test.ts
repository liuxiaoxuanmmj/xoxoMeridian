import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFile, cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const execFileAsync = promisify(execFile);
const OWNER_MIGRATION = "20260912175500_add_memory_owner_key";

type MigratedMemory = {
  id: string;
  userId: string | null;
  ownerKey: string;
  key: string;
  value: string;
  metadata: unknown;
};

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Memory owner migration", () => {
  it("normalizes known owners and retains ambiguous or conflicting legacy rows", async () => {
    const databaseName = `xoxo_memory_migration_${randomUUID().replaceAll("-", "")}`;
    const databaseIdentifier = quoteDatabaseIdentifier(databaseName);
    const temporaryRoot = await mkdtemp(join(tmpdir(), "xoxo-memory-migration-"));
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

      migrationPrisma = new PrismaClient({
        datasources: { db: { url: databaseUrl } }
      });
      await seedHistoricalMemories(migrationPrisma);

      await cp(
        resolve("prisma/migrations", OWNER_MIGRATION),
        join(temporaryMigrations, OWNER_MIGRATION),
        { recursive: true }
      );
      await deployMigrations(databaseUrl, join(temporaryPrisma, "schema.prisma"));

      const rows = await migrationPrisma.$queryRawUnsafe<MigratedMemory[]>(`
        SELECT
          "id",
          "userId",
          "ownerKey",
          "key",
          "value",
          "metadata"
        FROM "Memory"
        ORDER BY "id"
      `);

      expect(rows).toHaveLength(8);
      expect(rows).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "memory-alice-preference",
          userId: "user-alice",
          ownerKey: "user:user-alice",
          key: "person.preference",
          value: "Alice 喜欢安静的餐厅"
        }),
        expect.objectContaining({
          id: "memory-bob-preference",
          userId: "user-bob",
          ownerKey: "user:user-bob",
          key: "person.preference",
          value: "Bob 喜欢热闹的餐厅"
        }),
        expect.objectContaining({
          id: "memory-bob-language-new",
          userId: "user-bob",
          ownerKey: "user:user-bob",
          key: "person.language",
          value: "Bob 后来改学英语"
        }),
        expect.objectContaining({
          id: "memory-shared",
          userId: null,
          ownerKey: "scope:shared",
          key: "shared.anniversary"
        }),
        expect.objectContaining({
          id: "memory-system",
          userId: null,
          ownerKey: "scope:system",
          key: "_system.extractor.last_processed"
        })
      ]));

      expect(rowById(rows, "memory-bob-language-old")).toMatchObject({
        userId: "user-bob",
        ownerKey: "legacy:memory-bob-language-old",
        key: "me.language",
        metadata: {
          ownerMigration: {
            version: "20260912175500",
            status: "normalization-conflict",
            originalKey: "me.language",
            normalizedKey: "person.language",
            selectedId: "memory-bob-language-new"
          }
        }
      });
      expect(rowById(rows, "memory-ambiguous")).toMatchObject({
        userId: null,
        ownerKey: "legacy:memory-ambiguous",
        key: "me.secret",
        metadata: {
          ownerMigration: {
            status: "ambiguous-personal-owner",
            originalKey: "me.secret"
          }
        }
      });
      expect(rowById(rows, "memory-unsupported")).toMatchObject({
        ownerKey: "legacy:memory-unsupported",
        key: "unscoped.note",
        metadata: {
          ownerMigration: {
            status: "unsupported-key",
            originalKey: "unscoped.note"
          }
        }
      });

      await expect(migrationPrisma.$executeRawUnsafe(`
        INSERT INTO "Memory" (
          "id", "roomId", "userId", "ownerKey", "key", "value", "createdAt", "updatedAt"
        ) VALUES (
          'memory-duplicate', 'room-one', 'user-bob', 'user:user-bob',
          'person.preference', 'duplicate', NOW(), NOW()
        )
      `)).rejects.toThrow();
      await expect(migrationPrisma.$executeRawUnsafe(`
        INSERT INTO "Memory" (
          "id", "roomId", "userId", "ownerKey", "key", "value", "createdAt", "updatedAt"
        ) VALUES (
          'memory-invalid-owner', 'room-one', 'user-alice', 'user:user-bob',
          'person.invalid', 'invalid', NOW(), NOW()
        )
      `)).rejects.toThrow();
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

async function stageHistoricalMigrations(
  temporaryPrisma: string,
  temporaryMigrations: string
) {
  await mkdir(temporaryMigrations, { recursive: true });
  await copyFile(
    resolve("prisma/schema.prisma"),
    join(temporaryPrisma, "schema.prisma")
  );
  await copyFile(
    resolve("prisma/migrations/migration_lock.toml"),
    join(temporaryMigrations, "migration_lock.toml")
  );

  const entries = await readdir(resolve("prisma/migrations"), {
    withFileTypes: true
  });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name >= OWNER_MIGRATION) continue;
    await cp(
      resolve("prisma/migrations", entry.name),
      join(temporaryMigrations, entry.name),
      { recursive: true }
    );
  }
}

async function deployMigrations(databaseUrl: string, schemaPath: string) {
  const prismaCli = resolve("node_modules/prisma/build/index.js");
  await execFileAsync(
    process.execPath,
    [prismaCli, "migrate", "deploy", "--schema", schemaPath],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DIRECT_URL: databaseUrl
      }
    }
  );
}

async function seedHistoricalMemories(database: PrismaClient) {
  await database.$executeRawUnsafe(`
    INSERT INTO "User" (
      "id", "email", "displayName", "avatarLabel", "passwordHash", "createdAt", "updatedAt"
    ) VALUES
      ('user-alice', 'alice-migration@example.com', 'Alice', 'A', 'hash', NOW(), NOW()),
      ('user-bob', 'bob-migration@example.com', 'Bob', 'B', 'hash', NOW(), NOW())
  `);
  await database.$executeRawUnsafe(`
    INSERT INTO "Room" ("id", "slug", "name", "createdAt", "updatedAt")
    VALUES ('room-one', 'migration-room', 'Migration Room', NOW(), NOW())
  `);
  await database.$executeRawUnsafe(`
    INSERT INTO "Memory" (
      "id", "roomId", "userId", "key", "value", "metadata", "createdAt", "updatedAt"
    ) VALUES
      (
        'memory-alice-preference', 'room-one', 'user-alice', 'me.preference',
        'Alice 喜欢安静的餐厅', NULL, '2026-09-10T10:00:00Z', '2026-09-10T10:00:00Z'
      ),
      (
        'memory-bob-preference', 'room-one', 'user-bob', 'her.preference',
        'Bob 喜欢热闹的餐厅', NULL, '2026-09-10T10:01:00Z', '2026-09-10T10:01:00Z'
      ),
      (
        'memory-bob-language-old', 'room-one', 'user-bob', 'me.language',
        'Bob 原来学习日语', '{"source":"old"}', '2026-09-10T10:02:00Z', '2026-09-10T10:02:00Z'
      ),
      (
        'memory-bob-language-new', 'room-one', 'user-bob', 'her.language',
        'Bob 后来改学英语', NULL, '2026-09-10T10:03:00Z', '2026-09-10T10:03:00Z'
      ),
      (
        'memory-shared', 'room-one', 'user-alice', 'shared.anniversary',
        '纪念日是 10 月 12 日', NULL, '2026-09-10T10:04:00Z', '2026-09-10T10:04:00Z'
      ),
      (
        'memory-system', 'room-one', NULL, '_system.extractor.last_processed',
        'message-42', NULL, '2026-09-10T10:05:00Z', '2026-09-10T10:05:00Z'
      ),
      (
        'memory-ambiguous', 'room-one', NULL, 'me.secret',
        '无法确定归属', NULL, '2026-09-10T10:06:00Z', '2026-09-10T10:06:00Z'
      ),
      (
        'memory-unsupported', 'room-one', NULL, 'unscoped.note',
        '旧版无命名空间数据', NULL, '2026-09-10T10:07:00Z', '2026-09-10T10:07:00Z'
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

function rowById(rows: MigratedMemory[], id: string) {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`Migrated Memory row not found: ${id}`);
  return row;
}
