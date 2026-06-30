DO $$ BEGIN
  CREATE TYPE "StudyTimerMode" AS ENUM ('focus', 'short', 'long');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "FocusStatus" ADD VALUE 'running';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "FocusStatus" ADD VALUE 'paused';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "FocusState"
  ADD COLUMN IF NOT EXISTS "mode" "StudyTimerMode" NOT NULL DEFAULT 'focus',
  ADD COLUMN IF NOT EXISTS "remainingSeconds" INTEGER,
  ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastStudySeenAt" TIMESTAMP(3);

ALTER TABLE "FocusSession"
  ADD COLUMN IF NOT EXISTS "mode" "StudyTimerMode" NOT NULL DEFAULT 'focus';

CREATE TABLE IF NOT EXISTS "StudyGoal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "roomId" TEXT,
  "localDate" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "done" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudyGoal_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "StudyGoal" ADD CONSTRAINT "StudyGoal_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "StudyGoal" ADD CONSTRAINT "StudyGoal_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "FocusState_lastStudySeenAt_idx" ON "FocusState"("lastStudySeenAt");
CREATE INDEX IF NOT EXISTS "FocusSession_mode_status_startedAt_idx" ON "FocusSession"("mode", "status", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "StudyGoal_userId_localDate_sortOrder_idx" ON "StudyGoal"("userId", "localDate", "sortOrder");
CREATE INDEX IF NOT EXISTS "StudyGoal_roomId_localDate_idx" ON "StudyGoal"("roomId", "localDate");
