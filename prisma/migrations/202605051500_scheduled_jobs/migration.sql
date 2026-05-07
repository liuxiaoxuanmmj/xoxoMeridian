-- Extend ReminderStatus enum (PG 12+ supports ADD VALUE inside a transaction;
-- the new values just can't be referenced in the same statement, which we don't).
ALTER TYPE "ReminderStatus" ADD VALUE IF NOT EXISTS 'fired';
ALTER TYPE "ReminderStatus" ADD VALUE IF NOT EXISTS 'skipped';

CREATE TABLE "ScheduledJob" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "cron" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "payload" JSONB NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "lastRunAt" TIMESTAMP(3),
  "failCount" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduledJob_enabled_nextRunAt_idx" ON "ScheduledJob"("enabled", "nextRunAt");
CREATE INDEX "ScheduledJob_roomId_idx" ON "ScheduledJob"("roomId");

ALTER TABLE "ScheduledJob"
  ADD CONSTRAINT "ScheduledJob_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduledJob"
  ADD CONSTRAINT "ScheduledJob_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduledJob"
  ADD CONSTRAINT "ScheduledJob_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
