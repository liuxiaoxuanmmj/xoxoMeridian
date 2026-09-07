---
name: xoxo-qam-03-life-plan-review
description: 审查 XOXO Meridian QAM-03 双人生活信息与计划管理的既有实现质量并维护持续评分报告；用于 Memo、计划定义、cron/时区、天气或 UI/Agent 双路径质量审查，不用于增加生活功能。
---

# QAM-03 双人生活信息与计划管理质量审查

## 目标与必读资料

在功能范围不变的前提下，判断 Memo、ScheduledJob 定义、时区与天气能力在 UI 和 Agent 两条入口下是否保持统一的授权、规则和数据语义。不得因生活实体种类少或天气展示简单扣分。

完整读取 `AGENTS.md`、`docs/optimization/module-quality-review-standard.md`，以及 `PROJECT_VIEW.md` 的 QAM-03、Cross-cutting Concerns、共享映射、BU-03、BU-04。若报告已存在，读取并持续更新 `docs/optimization/qam-03-life-plan-quality-review.md`。

## 模块证据范围

- HTTP/UI：Memo、ScheduledJob、Weather routes，`LifePanel*`、`CronBuilder`、`TimezoneSelector`。
- 领域/Agent 边界：`agent/tools/memo-tool.ts`、`schedule-tool.ts`、`timezone-tool.ts`、`weather-tool.ts` 及其 Tool contracts。
- 数据：Prisma `Memo` 与 `ScheduledJob` 的定义字段；触发期字段与 QAM-04 共享。
- 验证：生活 Tool、Route、组件和真实 PostgreSQL 副作用测试。

重点核对 room ownership、UI/Tool 规则是否有单一来源、并发下数量上限、Memo 删除语义、cron/fireAt/DST/时区、天气 provider 的 timeout/fallback/cache 标识，以及 ScheduledJob 定义和触发状态的所有权。不得把 QAM-08 的通用 Tool executor 问题重复登记为本模块问题。

## 审查与交付

1. 分别追踪 UI 与 Agent 对 Memo/Job 的创建、修改、停用及天气读取，并对照同一业务不变量。
2. 先形成 E1～E3 证据，再按共享十维模型评分和 Gate；问题使用稳定 `QAM-03-nnn` ID。
3. 问题必须给出影响链、最小修正和风险匹配验收，不提出新的生活实体或产品能力。
4. 按固定格式创建或更新 `docs/optimization/qam-03-life-plan-quality-review.md`；初审 Delta 为 `baseline`。
5. 只修改该报告。未经另行授权，不修改业务代码、schema、总览或 Harness 状态。

完成前确认十维合计 100、等级/Gate 一致、链接可解析，并区分 QAM-04 调度执行与 QAM-08 Tool 治理责任。
