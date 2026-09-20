BEGIN;

-- 时间线投影的持久化与恢复：
--   1. AgentTask.timelineProjectedAt 记录投影的终态决策（已创建条目、或按节流规则判定不创建）；
--   2. Post.agentTaskId 作为幂等键，保证一个 AgentTask 至多派生一条时间线 Post。
ALTER TABLE "AgentTask" ADD COLUMN "timelineProjectedAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN "agentTaskId" TEXT;

-- 回填：本项上线前已完成的任务一律视为已决策。否则恢复扫描会把历史上所有带 ToolCall 的
-- 已完成任务当作待补投影，一次性补发大量陈旧时间线条目。
-- COALESCE 兜底：completedAt 可空，若历史行恰好为空则回填会落空，等于把该行重新暴露给恢复扫描。
UPDATE "AgentTask"
SET "timelineProjectedAt" = COALESCE("completedAt", "updatedAt")
WHERE "status" = 'completed';

CREATE UNIQUE INDEX "Post_agentTaskId_key" ON "Post"("agentTaskId");
CREATE INDEX "AgentTask_status_timelineProjectedAt_idx" ON "AgentTask"("status", "timelineProjectedAt");
ALTER TABLE "Post" ADD CONSTRAINT "Post_agentTaskId_fkey" FOREIGN KEY ("agentTaskId") REFERENCES "AgentTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
