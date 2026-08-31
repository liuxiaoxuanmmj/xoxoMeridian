ALTER TYPE "AgentTaskStatus" ADD VALUE 'limit_exceeded';
ALTER TYPE "LLMCallStatus" ADD VALUE 'running';

CREATE TYPE "AgentTaskLimitReason" AS ENUM (
  'max_turns',
  'max_tool_calls',
  'max_runtime',
  'max_tokens',
  'max_cost'
);

ALTER TABLE "AgentTask"
ADD COLUMN "maxTurns" INTEGER NOT NULL DEFAULT 16,
ADD COLUMN "maxToolCalls" INTEGER NOT NULL DEFAULT 64,
ADD COLUMN "maxRuntimeMs" INTEGER NOT NULL DEFAULT 86400000,
ADD COLUMN "maxTokens" INTEGER NOT NULL DEFAULT 1000000,
ADD COLUMN "maxCostMicros" INTEGER NOT NULL DEFAULT 20000000,
ADD COLUMN "maxCompletionTokens" INTEGER NOT NULL DEFAULT 8192,
ADD COLUMN "inputCostMicrosPerMillionTokens" INTEGER NOT NULL DEFAULT 1000000,
ADD COLUMN "outputCostMicrosPerMillionTokens" INTEGER NOT NULL DEFAULT 4000000,
ADD COLUMN "turnsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "toolCallsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "tokensUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "costUsedMicros" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "deadlineAt" TIMESTAMP(3),
ADD COLUMN "limitReason" "AgentTaskLimitReason";

ALTER TABLE "LLMCall"
ADD COLUMN "turnIndex" INTEGER,
ADD COLUMN "reservedTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "reservedCostMicros" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "costMicros" INTEGER;

CREATE UNIQUE INDEX "LLMCall_taskId_turnIndex_key" ON "LLMCall"("taskId", "turnIndex");

ALTER TABLE "AgentTask"
ADD CONSTRAINT "AgentTask_runtime_budget_limits_check" CHECK (
  "maxTurns" > 0
  AND "maxToolCalls" > 0
  AND "maxRuntimeMs" > 0
  AND "maxTokens" > 0
  AND "maxCostMicros" > 0
  AND "maxCompletionTokens" > 0
  AND "inputCostMicrosPerMillionTokens" >= 0
  AND "outputCostMicrosPerMillionTokens" >= 0
),
ADD CONSTRAINT "AgentTask_runtime_budget_usage_check" CHECK (
  "turnsUsed" >= 0
  AND "toolCallsUsed" >= 0
  AND "tokensUsed" >= 0
  AND "costUsedMicros" >= 0
);

ALTER TABLE "LLMCall"
ADD CONSTRAINT "LLMCall_runtime_budget_usage_check" CHECK (
  ("turnIndex" IS NULL OR "turnIndex" > 0)
  AND "reservedTokens" >= 0
  AND "reservedCostMicros" >= 0
  AND ("costMicros" IS NULL OR "costMicros" >= 0)
);
