DO $$
BEGIN
  CREATE TYPE "FocusStatus" AS ENUM ('idle', 'focusing');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "FocusSessionStatus" AS ENUM ('completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "FocusState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "FocusStatus" NOT NULL DEFAULT 'idle',
  "plannedMinutes" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3),
  "expectedEndAt" TIMESTAMP(3),
  "currentSessionKey" TEXT,
  "roomId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FocusState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FocusSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "roomId" TEXT,
  "status" "FocusSessionStatus" NOT NULL DEFAULT 'completed',
  "plannedMinutes" INTEGER NOT NULL,
  "actualMinutes" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FocusSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FocusState_userId_key" ON "FocusState"("userId");
CREATE INDEX IF NOT EXISTS "FocusState_status_idx" ON "FocusState"("status");
CREATE INDEX IF NOT EXISTS "FocusState_roomId_idx" ON "FocusState"("roomId");
CREATE INDEX IF NOT EXISTS "FocusSession_userId_startedAt_idx" ON "FocusSession"("userId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "FocusSession_startedAt_idx" ON "FocusSession"("startedAt" DESC);
CREATE INDEX IF NOT EXISTS "FocusSession_roomId_idx" ON "FocusSession"("roomId");
CREATE INDEX IF NOT EXISTS "FocusSession_status_startedAt_idx" ON "FocusSession"("status", "startedAt" DESC);

DO $$
BEGIN
  ALTER TABLE "FocusState"
    ADD CONSTRAINT "FocusState_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "FocusState"
    ADD CONSTRAINT "FocusState_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "FocusSession"
    ADD CONSTRAINT "FocusSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "FocusSession"
    ADD CONSTRAINT "FocusSession_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
