---
name: xoxo-qam-04-scheduler-review
description: 审查 XOXO Meridian QAM-04 定时任务触发与派生的既有实现质量并维护持续评分报告；用于调度 CAS、原子派生、timer、时间语义或 Worker scheduler loop 审查，不用于增加调度功能。
---

# QAM-04 定时任务触发与派生质量审查

## 目标与必读资料

在功能范围不变的前提下，判断到期计划能否在并发、重启、时间跳变和部分失败下可靠推进为 AgentTask。不得因没有外部队列或分布式调度平台而自动扣分；只评价当前多 Worker/进程模型的现实风险。

完整读取 `AGENTS.md`、`docs/optimization/module-quality-review-standard.md`，以及 `PROJECT_VIEW.md` 的 QAM-04、共享映射、BU-04、BU-07。若报告已存在，读取并持续更新 `docs/optimization/qam-04-scheduler-quality-review.md`。

## 模块证据范围

- 核心：`agent/scheduler-tick.ts` 和 `agent/agent-worker.ts` 中 scheduler lifecycle。
- 契约/数据：Prisma `ScheduledJob` 触发字段、`AgentTask`/`EventLog` 派生边界、Runtime budget/trigger contract。
- 验证：`tests/agent/scheduler-tick.test.ts`、真实 PostgreSQL 原子派生测试及 Worker/Compose 相关证据。

重点核对 due/near-term 两条路径是否共用原子语义、旧版本 CAS、Job/Task/Event 同事务、stale failure、一次性/周期性下一状态、missed window、DST/clock、timer 去重/清理/重启恢复、批次饥饿和 shutdown。协议双向依赖只有在造成漂移或修改扩散时才形成问题。

## 审查与交付

1. 追踪 polling、near-term timer、成功派生、事务失败、Worker 重启和多 Worker 竞争路径。
2. 使用 E1～E3 证据完成十维评分、Gate 和稳定 `QAM-04-nnn` 问题 ID；并发/原子结论优先要求真实 PostgreSQL 证据。
3. 只建议保持当前功能的最小修正，不把外部队列、监控平台或新调度能力当成必需项。
4. 按固定格式创建或更新 `docs/optimization/qam-04-scheduler-quality-review.md`；初审 Delta 为 `baseline`。
5. 只修改该报告，不修改共享文件或业务实现。

完成前确认总分 100、Gate 算法正确、未验证的 clock/DST/重启场景如实标注，并区分 QAM-03 计划定义、QAM-08 任务执行和 QAM-09 进程托管。
