ALTER TABLE "AgentTask"
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "attemptId" TEXT,
ADD COLUMN "workerId" TEXT,
ADD COLUMN "heartbeatAt" TIMESTAMP(3),
ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);

CREATE INDEX "AgentTask_status_leaseExpiresAt_createdAt_idx"
ON "AgentTask"("status", "leaseExpiresAt", "createdAt");
