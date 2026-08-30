ALTER TYPE "AgentTaskStatus" ADD VALUE 'waiting_approval';
ALTER TYPE "AgentTaskStatus" ADD VALUE 'cancelled';

CREATE TYPE "AgentToolRisk" AS ENUM ('low', 'medium', 'high');
CREATE TYPE "AgentToolApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE "AgentToolApproval" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "stepKey" TEXT NOT NULL,
  "toolName" TEXT NOT NULL,
  "risk" "AgentToolRisk" NOT NULL,
  "input" JSONB NOT NULL,
  "status" "AgentToolApprovalStatus" NOT NULL DEFAULT 'pending',
  "decidedById" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),

  CONSTRAINT "AgentToolApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentToolApproval_taskId_stepKey_key"
ON "AgentToolApproval"("taskId", "stepKey");

CREATE INDEX "AgentToolApproval_status_requestedAt_idx"
ON "AgentToolApproval"("status", "requestedAt");

CREATE INDEX "AgentToolApproval_decidedById_idx"
ON "AgentToolApproval"("decidedById");

ALTER TABLE "AgentToolApproval"
ADD CONSTRAINT "AgentToolApproval_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentToolApproval"
ADD CONSTRAINT "AgentToolApproval_decidedById_fkey"
FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
