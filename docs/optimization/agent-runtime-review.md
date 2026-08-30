# Agent Runtime Review

## Overall

Score: 74 / 100

Level: L1 — Basic Runtime

Conclusion:
当前 Runtime 已补齐原子抢占、副作用重放幂等、高风险 Tool 持久化审批与 Scheduler 原子派生，形成可恢复的数据库副作用执行边界；但统一 Tool Timeout、Retry、Crash Recovery 与 Runtime Budget 仍缺失，因此尚不满足生产级 Runtime 要求，并被 L2 硬门槛限制在 L1。

---

## Score Breakdown

| Dimension | Score | Max | Finding |
|---|---:|---:|---|
| Execution Lifecycle | 11 | 12 | Q1：基本具备。`AgentTask.id` 贯穿状态与 Trace，Runtime 有 `pending → running → waiting_approval → completed / failed / cancelled` 生命周期，`ToolCall.stepKey` 是可关联的执行步骤；但规划、读取 Tool 与 Final 尚未统一为完整 Step/Turn 模型。[schema.prisma](../../prisma/schema.prisma#L28) [schema.prisma](../../prisma/schema.prisma#L204) |
| State Management | 14 | 14 | Q2：是。Run input、plan、result、状态、Tool/LLM/审批记录均持久化并按 `taskId` 隔离；`Session`、Run 与长期 `Memory` 继续使用独立模型和生命周期。[schema.prisma](../../prisma/schema.prisma#L204) |
| Checkpoint & Recovery | 12 | 14 | Q3：数据库副作用路径可以恢复。Runtime 读取已持久化 plan，稳定生成 `tool:n` step key；已完成写步骤从 `ToolCall` 恢复输出并跳过副作用，审批可跨重启暂停/恢复。扣分点是读取 Tool、规划与 Final 仍没有通用 Step checkpoint/current step。[agent-runtime.ts](../../agent/agent-runtime.ts#L63) [agent-runtime.ts](../../agent/agent-runtime.ts#L287) [tool-registry.ts](../../agent/tool-registry.ts#L97) |
| Tool Reliability | 9 | 18 | Q4：部分满足。Registry 白名单、资源权限、手工输入检查、部分 Adapter 超时、入口限流和容器隔离仍有效；数据库写 Tool 新增稳定幂等键与事务提交。Executor 仍缺统一输入/结果 Schema、覆盖全部 Tool 的 deadline、受控 Retry 与错误分类。[tool-registry.ts](../../agent/tool-registry.ts#L55) [schema.prisma](../../prisma/schema.prisma#L237) |
| Safety & HITL | 12 | 14 | Q5：当前 high-risk 操作已受保护。全部 Tool 显式分级，`memo.delete` 为 high；Runtime 在 ToolCall 前进入持久化 `waiting_approval`，受认证且校验房间成员资格的 API 支持 Approve/Reject，批准记录绑定 Tool 与输入并可恢复。扣分点是尚无 Edit 流程和更细的 capability policy。[tool-approval.ts](../../agent/tool-approval.ts#L22) [approvals/route.ts](../../app/api/agent/tasks/%5BtaskId%5D/approvals/route.ts#L42) |
| Observability | 12 | 14 | Q6：基本可以。Task、LLM、Tool、审批和 Scheduler Event 均持久化且可通过 Trace 查询，记录 token 与调用耗时；仍缺统一错误 taxonomy、成本核算、Run 总耗时和全局顺序号。[trace/route.ts](../../app/api/agent/tasks/%5BtaskId%5D/trace/route.ts#L10) |
| Runtime Budget | 0 | 8 | Q7：否。没有 `max_turns`、`max_tool_calls`、Run deadline、token/cost budget 或 `LIMIT_EXCEEDED` 终态。[agent-runtime.ts](../../agent/agent-runtime.ts#L63) |
| Deterministic Orchestration | 4 | 6 | Q8：基本做到。代码固定控制 Context、Plan 校验/修复、顺序 Tool、审批和 Final，LLM 负责语义规划；尚未形成完整可恢复 State Machine/DAG。[agent-runtime.ts](../../agent/agent-runtime.ts#L63) |

---

## Level Gate

Passed:

- Structured State：`AgentTask`、稳定 Tool step、审批、LLM/Tool/Event 均持久化并按 Run 关联。
- Agent Loop termination：执行链由代码限定为有限规划、修复、Tool 列表和 Final。
- Basic Trace：支持按 Task 查看 Model、Tool、审批事件和最终消息。
- Side-effect Idempotency：当前数据库写 Tool 以 `(taskId, stepKey)` 唯一约束和事务阻止重放。
- Runtime Permission Control / HIGH-risk HITL / Approval Recovery：high Tool 在执行前进入可恢复审批状态。
- Code + LLM 基础混合编排：确定性控制流由 Runtime 执行。

Failed:

- L2 Tool Timeout：只有 LLM 和部分 HTTP Adapter 有超时，Registry 没有覆盖所有 Tool 的统一 deadline；因此 Gate 最高为 L1。
- L3 Tool Retry 与 Runtime Budget 缺失；Checkpoint/Resume 尚未覆盖完整 Run/Step 生命周期。
- L4 Crash Recovery、完整 Tool Isolation、完整 Step Model 与 Cost Observability 缺失。

Final Level:
L1

---

## Critical Issues

### P0

- 本轮复审未发现仍开放的 P0。原报告的四项 P0 已分别由 feat-012 至 feat-015 修复，并有真实 PostgreSQL 回归证据：
  - 同一任务通过 `pending/failed → running` 单条条件更新获取执行权；12 路并发只有一个调用者 claim 成功。[task-claim.ts](../../agent/task-claim.ts#L7) [agent-task-claim.integration.test.ts](../../tests/integration/agent-task-claim.integration.test.ts#L37)
  - 数据库副作用、ToolCall 结果与事件在同一事务提交，重放复用稳定 step output；写后失败会整体回滚。[tool-registry.ts](../../agent/tool-registry.ts#L82) [agent-tool-idempotency.integration.test.ts](../../tests/integration/agent-tool-idempotency.integration.test.ts#L44)
  - `memo.delete` 在执行前进入持久化 Approve/Reject 流程，拒绝会取消任务，批准恢复后只删除一次。[tool-approval.ts](../../agent/tool-approval.ts#L22) [agent-tool-approval.integration.test.ts](../../tests/integration/agent-tool-approval.integration.test.ts#L22)
  - Scheduler 的 Job CAS、AgentTask 创建与 fired Event 写入位于同一事务；Event 故障注入证明不会留下孤儿 Task。[scheduler-tick.ts](../../agent/scheduler-tick.ts#L85) [scheduler-atomic-dispatch.integration.test.ts](../../tests/integration/scheduler-atomic-dispatch.integration.test.ts#L12)

### P1

- Worker Crash 后任务仍会永久停在 `running`：Dispatcher 只消费 `pending`，没有 lease、heartbeat、超时回收或启动恢复扫描。[task-dispatcher.ts](../../agent/task-dispatcher.ts#L4)
- Tool Executor 没有覆盖全部 Tool 的统一 deadline 和受控 Retry；数据库阻塞或 Tool 内部等待可能让 Run 长时间停在 `running`，也是当前 L2 Gate 的直接失败项。
- JSON Schema 仍主要作为 Planner 元数据；各 Tool 自行进行不一致的手工输入检查，输出进入后续流程前也没有统一契约校验。
- 当前 Checkpoint 重点覆盖数据库副作用与审批；读取 Tool、规划、Final 和未来的非数据库副作用尚未纳入通用 Durable Step 模型。

### P2

- Trace 可区分 LLM/Tool/Task/审批事件，但错误主要保存为字符串，无法可靠聚合 Validation、Permission、Timeout、Network、Tool 和 Runtime 错误。
- LLM Trace 保存完整 prompt、房间上下文和响应，未发现字段脱敏、保留周期或敏感数据分级策略。[agent-runtime.ts](../../agent/agent-runtime.ts#L92)
- 已有并发 claim、重放回滚、审批恢复和 Scheduler 故障注入集成测试；仍缺 Worker 进程中止、lease 接管、统一 Tool timeout/retry 与预算耗尽测试。

---

## Runtime Architecture

```text
User
→ Auth / Room Access / Rate Limit
→ Message 与 AgentTask(pending) 事务落库
→ Inline Runtime 或 agent-worker 轮询
→ AgentTask 条件更新原子 Claim 为 running
→ 读取已持久化 Plan；没有有效 Checkpoint 时调用 LLM 并校验/修复 Plan
→ 为 Tool 调用生成稳定 tool:n step key
→ Registry 白名单、资源权限与风险策略
→ HIGH：持久化 Approval 与 waiting_approval → Human Approve / Reject → Resume / Cancel
→ 数据库写 Tool：副作用 + ToolCall + Event 单事务提交；已完成 step 直接 Replay
→ Agent Message 与 AgentTask(completed / failed)
→ Trace / Status API
→ Final
```

Scheduler：`ScheduledJob` due → 单事务 Job 版本 CAS + `AgentTask` + fired Event → Worker。

---

## Recommended Improvements

1. 增加 `attempt_id`、`worker_id`、`lease_expires_at` 与 heartbeat，原子接管过期 `running` 任务，并补充 Worker 强制退出后的 Crash Recovery 集成测试。
2. 将 Tool Registry 升级为统一执行中间件：Zod 输入/输出校验、覆盖全部 Tool 的 deadline/AbortSignal、错误分类，以及仅对可重试且幂等的 Tool 执行有限退避 Retry；优先解除 L2 Timeout Gate。
3. 把 Plan、读取 Tool、写 Tool、审批与 Final 收敛为通用 Durable Step 状态机，持久化 `current_step`、attempt 和 checkpoint；未来外部写操作必须使用供应商幂等键或 Outbox。
4. 增加 `max_tool_calls`、Run deadline、token/cost budget 与明确超限终态，并补齐成本聚合、敏感 Trace 脱敏和保留策略。
