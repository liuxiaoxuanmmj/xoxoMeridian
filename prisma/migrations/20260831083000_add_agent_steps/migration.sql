CREATE TYPE "AgentStepKind" AS ENUM ('plan', 'tool', 'final');
CREATE TYPE "AgentStepStatus" AS ENUM ('pending', 'running', 'waiting_approval', 'completed', 'failed');

ALTER TABLE "AgentTask" ADD COLUMN "currentStepKey" TEXT;

CREATE TABLE "AgentStep" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "stepKey" TEXT NOT NULL,
  "kind" "AgentStepKind" NOT NULL,
  "status" "AgentStepStatus" NOT NULL DEFAULT 'pending',
  "input" JSONB,
  "output" JSONB,
  "error" TEXT,
  "errorCategory" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentStep_taskId_stepKey_key" ON "AgentStep"("taskId", "stepKey");
CREATE INDEX "AgentStep_taskId_status_idx" ON "AgentStep"("taskId", "status");

ALTER TABLE "AgentStep"
ADD CONSTRAINT "AgentStep_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
