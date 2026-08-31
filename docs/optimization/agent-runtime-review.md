# Agent Runtime Review

## Overall

Score：97 / 100

Score Level：L4 — Mature Runtime 区间

Gate Level / Final Level：L3 — Production Runtime

结论：
当前 Runtime 已具备 Worker lease/heartbeat 与崩溃接管、统一 Tool deadline/Retry、同源 Zod 输入输出契约，以及覆盖 Plan、全部 Tool、审批和 Final 的 Durable Step 状态机。新增持久化 Runtime Budget 后，Run 会冻结较高默认值并强制 turns、Tool attempts、deadline、token 与 cost 上限；预算在 Crash Recovery 后继续累计并以 `limit_exceeded` 原子终止。L3 硬门槛全部通过，最终等级为 L3；Trace 隐私治理、Tool 隔离与 HITL Edit 仍是独立 P2，不满足 L4。

---

## Score Breakdown

| Dimension | Score | Max | Finding |
|---|---:|---:|---|
| Execution Lifecycle | 12 | 12 | Q1：是。`AgentTask.id` 贯穿 Run，`AgentStep` 以稳定 `stepKey` 持久化 Plan、Tool、审批与 Final；任务、Step 和审批均有明确状态与终态。[schema.prisma](../../prisma/schema.prisma#L218) [schema.prisma](../../prisma/schema.prisma#L259) |
| State Management | 14 | 14 | Q2：是。Run input、plan、result、current step、Step checkpoint、Tool/LLM/审批记录均持久化并按 `taskId` 隔离；Session、Run 与长期 Memory 保持独立生命周期。[schema.prisma](../../prisma/schema.prisma#L218) |
| Checkpoint & Recovery | 14 | 14 | Q3：是。统一 Step API 在 lease 栅栏内开始、恢复、完成或失败；恢复会校验 kind、输入与持久化输出，并跳过已完成的 Plan、读取/写入 Tool 与 Final。审批可跨进程暂停和继续，最终消息与任务终态原子提交。[durable-step.ts](../../agent/durable-step.ts#L27) [agent-runtime.ts](../../agent/agent-runtime.ts#L97) [agent-durable-step.integration.test.ts](../../tests/integration/agent-durable-step.integration.test.ts#L30) |
| Tool Reliability | 17 | 18 | Q4：基本完整。Registry 白名单、资源权限、同源 Zod input/output、全 Tool deadline/AbortSignal、错误分类、幂等感知的有限退避 Retry、结果校验与数据库事务重放均已落地。扣分点是 Tool 仍在 Runtime 进程内执行，缺少每 Tool 独立的 CPU/内存/文件系统/网络沙箱。[tool-registry.ts](../../agent/tool-registry.ts#L55) [tool-contracts.ts](../../agent/tool-contracts.ts#L20) [tool-errors.ts](../../agent/tool-errors.ts#L1) |
| Safety & HITL | 12 | 14 | Q5：当前 high-risk 操作已受保护。全部 Tool 显式分级，`memo.delete` 在执行前进入持久化 `waiting_approval`；认证且校验房间成员资格的 API 支持 Approve/Reject，决定绑定 Tool 与规范化输入并可恢复。扣分点是尚无 Edit 流程和更细的 capability policy。[tool-approval.ts](../../agent/tool-approval.ts#L35) [approvals/route.ts](../../app/api/agent/tasks/%5BtaskId%5D/approvals/route.ts#L42) |
| Observability | 14 | 14 | Q6：是。Task、Step、LLM、Tool、Retry、审批、lease 与 Scheduler Event 均持久化且可通过 Trace 查询；Tool/Step 具有稳定错误类别，LLM 按 turn 记录 reservation、实际 token/cost 与耗时，`AgentTask` 按 Run 聚合 token/cost 用量。[runtime-budget.ts](../../agent/runtime-budget.ts#L64) [trace/route.ts](../../app/api/agent/tasks/%5BtaskId%5D/trace/route.ts#L10) |
| Runtime Budget | 8 | 8 | Q7：是。Run 在创建时冻结高默认值的 turns、Tool attempts、最大运行时长、token/cost 与价格快照；Model 先持久化 reservation 再调用供应商，Tool 每次 retry attempt 原子计数，deadline 的 `AbortSignal` 传给 LLM/Tool，任一上限都以不可 claim 的 `limit_exceeded` 终态完成。[runtime-budget.ts](../../agent/runtime-budget.ts#L64) [agent-runtime.ts](../../agent/agent-runtime.ts#L82) [agent-runtime-budget.integration.test.ts](../../tests/integration/agent-runtime-budget.integration.test.ts#L26) |
| Deterministic Orchestration | 6 | 6 | Q8：是。代码固定控制 Context、Plan 校验/修复、有限 Tool 顺序、审批和 Final；LLM 只负责语义规划，Runtime 通过可恢复的 Step 状态机决定转移与终止。[agent-runtime.ts](../../agent/agent-runtime.ts#L63) [durable-step.ts](../../agent/durable-step.ts#L27) |

总分：`12 + 14 + 14 + 17 + 12 + 14 + 8 + 6 = 97`。

---

## Level Gate

Passed：

- L1 Structured State、有限 Agent Loop 与 Basic Trace：Task、Step、LLM/Tool/审批/Event 均按 Run 持久化，控制流由代码保证终止。
- L2 Tool Timeout：全部 Registry Tool 由 Executor deadline 包围并接收同一 `AbortSignal`；数据库写 Tool 超时会回滚事务。
- L2 Checkpoint/Resume 与 Side-effect Idempotency：Plan、读取/写入 Tool、审批和 Final 都有稳定 checkpoint；数据库副作用通过 `(taskId, stepKey)`、事务与 output replay 阻止重复提交。
- L2 Runtime Permission Control：Registry 白名单、资源权限、房间访问控制和 Tool 风险等级均在执行前校验。
- L3 Tool Retry：只有显式允许的 retryable 类别和可安全重放 Tool 才执行有上限的指数退避。
- L3 HIGH-risk HITL / Approval Recovery：high Tool 在副作用前进入持久化 Approve/Reject，并可由新 Worker attempt 恢复。
- L3 Persistent Trace：Step、attempt、lease、LLM、Tool、Retry、审批和终态均可追溯。
- L3 Runtime Budget：每个 Run 冻结较高默认值 `maxTurns=16`、`maxToolCalls=64`、`maxRuntimeMs=24h`、`maxTokens=1,000,000` 与 `$20` cost budget；Model reservation、Tool retry attempt、deadline AbortSignal、usage reconciliation 和 `limit_exceeded` 终态均持久化，并由 PostgreSQL 覆盖 Crash Recovery 后继续计数。
- Code + LLM 混合编排：确定性控制与恢复由 Runtime 执行，语义规划由 LLM 提供。

Failed：

- L4 Complete Trace / Privacy Governance：尚无全局顺序号、字段级脱敏、敏感数据分级与保留/删除策略。
- L4 Tool Isolation / Policy：Tool 共享 Runtime 进程和应用权限，尚无独立资源沙箱、细粒度 capability policy 与审批 Edit。

Final Level：
L3

---

## Critical Issues

### P0

- 当前无开放 P0。feat-012 至 feat-015 已分别完成 AgentTask 原子 claim、数据库副作用重放幂等、high-risk Tool 持久化审批与 Scheduler 原子派生，并由真实 PostgreSQL 测试覆盖。

### P1

- 当前无开放 P1。原报告四项 P1 已按一次一个 feature 的顺序关闭：
  - feat-016：`attemptId`、`workerId`、lease、heartbeat、过期 `running` 扫描与旧 attempt 栅栏；Worker `SIGKILL` 后可接管。[task-claim.ts](../../agent/task-claim.ts#L24) [agent-task-claim.integration.test.ts](../../tests/integration/agent-task-claim.integration.test.ts#L64)
  - feat-017：全部 Tool 的统一 deadline/AbortSignal、稳定错误分类和幂等感知的有限 Retry；超时数据库写整体回滚。[tool-registry.ts](../../agent/tool-registry.ts#L97) [tool-registry-reliability.test.ts](../../tests/agent/tool-registry-reliability.test.ts#L1)
  - feat-018：13 个内置 Tool 的同源 Zod input/output 契约；无效输入不执行，无效输出不提交事务。[tool-contracts.ts](../../agent/tool-contracts.ts#L20) [agent-tool-idempotency.integration.test.ts](../../tests/integration/agent-tool-idempotency.integration.test.ts#L220)
  - feat-019：Plan、全部 Tool、审批与 Final 的统一 Durable Step；恢复跳过 completed checkpoint，Final 与可见消息原子且不可重复。[durable-step.ts](../../agent/durable-step.ts#L27) [agent-durable-step.integration.test.ts](../../tests/integration/agent-durable-step.integration.test.ts#L30)

### P2

- Trace 隐私治理不足：LLM Trace 保存较完整 prompt、房间上下文和响应，仍缺少字段脱敏、敏感数据分级、保留周期、删除策略与全局顺序号；本轮已经补齐 Run token/cost 聚合和价格快照。[agent-runtime.ts](../../agent/agent-runtime.ts#L121) [runtime-budget.ts](../../agent/runtime-budget.ts#L52)
- Tool 隔离与授权粒度不足：当前依赖应用/容器边界，没有每 Tool 的 CPU、内存、文件系统和网络策略；HITL 只支持 Approve/Reject，不支持 Edit。
- 当前数据库 Tool 可依赖事务与 checkpoint；未来邮件、支付、外部发布等非数据库写操作仍需供应商幂等键或 Outbox/relay，不能把网络副作用视为数据库事务的一部分。

---

## Runtime Architecture

```text
User
→ Auth / Room Access / Rate Limit
→ Message 与 AgentTask(pending) 事务落库
→ Inline Runtime 或 agent-worker 扫描 pending / lease 已过期的 running
→ CAS Claim：生成 attemptId，绑定 workerId 与 leaseExpiresAt
→ Heartbeat 续租；全部 checkpoint、Tool 副作用与终态受当前 attempt 栅栏保护
→ Runtime Budget：冻结高默认值，持久化 Model reservation / Tool attempt 用量，deadline AbortSignal
→ Durable Step(plan)：恢复并校验 completed output，否则调用 LLM、校验/修复 Plan 后 checkpoint
→ Durable Step(tool:n)：Zod input → 权限/风险 → deadline + retry → Zod output
   → HIGH：Step(waiting_approval) → Human Approve / Reject → pending 恢复 / terminal cancel
   → 数据库写：业务副作用 + ToolCall + Event 单事务；completed Step 直接 replay
→ Durable Step(final)：消息 + Step(completed) + AgentTask(completed) 同一事务
→ Task / Step / LLM / Tool / Approval / Event Trace API
→ Final
```

Scheduler：`ScheduledJob` due → 单事务 Job 版本 CAS + `AgentTask` + fired Event → Worker。

---

## Recommended Improvements

1. 建立 Trace 隐私治理：字段级脱敏、敏感数据分级、保留/删除策略、Run 总耗时与全局顺序号；保留本轮已实现的 Run token/cost 聚合与价格快照。
2. 强化 Tool 隔离与 capability policy：对高风险或第三方 Tool 使用独立 Worker/容器和 CPU、内存、文件系统、网络配额，并为 HITL 增加受 schema 校验的 Edit 流程。
3. 为未来非数据库外部写操作制定统一幂等协议：优先使用供应商幂等键；无法保证时使用 Outbox/relay、可查询交付状态和补偿操作。
