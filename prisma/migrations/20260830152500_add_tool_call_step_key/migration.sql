ALTER TABLE "ToolCall"
ADD COLUMN "stepKey" TEXT;

CREATE UNIQUE INDEX "ToolCall_taskId_stepKey_key"
ON "ToolCall"("taskId", "stepKey");
