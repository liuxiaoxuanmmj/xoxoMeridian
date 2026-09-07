---
name: xoxo-qam-08-agent-runtime-review
description: 审查 XOXO Meridian QAM-08 Agent 任务执行与工具治理的既有实现质量并维护持续评分报告；用于 Task lease/recovery、Durable Step、Tool、审批、预算、LLM 或 Trace 审查，不用于增加 Agent 能力。
---

# QAM-08 Agent 任务执行与工具治理质量审查

## 目标与必读资料

在功能范围不变的前提下，判断 AgentTask 从持久化输入到最终消息的执行是否可恢复、受权、受预算且可审计。不得因 Tool 数量、模型能力或 Agent 功能少而扣分。

完整读取 `AGENTS.md`、`docs/optimization/module-quality-review-standard.md`，以及 `PROJECT_VIEW.md` 的 QAM-08、Cross-cutting Concerns、共享映射、BU-03、BU-04、BU-07、BU-08。读取 `docs/optimization/agent-runtime-review.md` 作为历史专项证据，但按当前统一标准独立复核；若目标报告已存在，持续更新 `docs/optimization/qam-08-agent-runtime-quality-review.md`。

## 模块证据范围

- 入口/运行：`app/api/agent/`、`agent/agent-runtime.ts`、task runner/dispatcher/worker。
- 可靠性：claim/lease、durable step、budget、registry/contracts/errors/approval、tracer。
- 语义/外部：planner/provider、context/summary/memory/post-task、`agent/tools/`、`lib/llm.ts`、`lib/chat-log-file.ts`。
- 数据/验证：全部 Agent Prisma models/migrations、unit、真实 PostgreSQL、Route/component 和 Compose Worker smoke。

重点核对执行权、旧 attempt 栅栏、checkpoint/replay、数据库与外部副作用幂等、Tool allowlist/schema/risk/approval/deadline/retry、预算预留结算、plan 非确定性控制、终态原子性、Trace/JSONL 隐私保留，以及跨 QAM 协议耦合。不要把未存在的未来外部 Tool 当成当前缺陷。

## 审查与交付

1. 追踪 intake→claim→plan→Tool/approval→final，以及 crash、timeout、重试、预算耗尽和失权路径。
2. 使用 E1～E3 证据完成统一十维评分、Gate 和稳定 `QAM-08-nnn` ID；不得直接沿用旧 97 分。
3. 建议必须保持当前 Agent 能力不变，只降低执行、隐私或修改风险。
4. 按固定格式创建或更新 `docs/optimization/qam-08-agent-runtime-quality-review.md`；初审 Delta 为 `baseline`。
5. 只修改该报告，不修改 Runtime、共享总览或 Harness 状态。

完成前确认总分 100、Gate 有真实并发/恢复证据支撑，并避免重复登记 QAM-03 领域规则、QAM-04 调度和 QAM-09 部署问题。
