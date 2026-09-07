# QAM-08 Agent 任务执行与工具治理工程质量审查

## 元数据

| 项目 | 内容 |
| --- | --- |
| QAM | QAM-08 Agent 任务执行与工具治理 |
| 快照日期 | 2026-09-06 |
| 审查 Skill | [`xoxo-qam-08-agent-runtime-review`](../../.agents/skills/xoxo-qam-08-agent-runtime-review/SKILL.md) |
| 标准版本 | [`module-quality-review-standard.md`](./module-quality-review-standard.md) v1.0.0 |
| 范围来源 | [`PROJECT_VIEW.md`](../../PROJECT_VIEW.md) 的 QAM-08、Cross-cutting Concerns、共享映射、BU-03/BU-04/BU-07/BU-08 与 Quality Tracking Index；[`AGENTS.md`](../../AGENTS.md) |
| 本轮 Delta | `baseline`（初审） |
| 历史口径说明 | [`agent-runtime-review.md`](./agent-runtime-review.md) 的 97/100 属于旧专项评分口径，不能与统一标准 v1.0.0 的 74/100 计算 Delta；本报告 74/100 是 QAM-08 按统一十维评分与 Gate 协议的首个 baseline，旧报告仅作历史证据。 |
| 当前基线命令 | `npm run test:unit -- tests/agent/task-claim.test.ts tests/agent/task-dispatcher.test.ts tests/agent/tool-registry-reliability.test.ts tests/agent/runtime-budget.test.ts tests/agent/agent-runtime.test.ts`：5 文件/25 项通过；`sudo -n -g docker -u dadalv env PATH=/home/dadalv/.local/bin:/usr/local/bin:/usr/bin:/bin npm run test:integration -- tests/integration/agent-task-claim.integration.test.ts tests/integration/agent-tool-idempotency.integration.test.ts tests/integration/agent-tool-approval.integration.test.ts tests/integration/agent-durable-step.integration.test.ts tests/integration/agent-runtime-budget.integration.test.ts`：5 文件/13 项通过（真实 PostgreSQL，含 Worker SIGKILL 接管） |
| 未运行命令 | `npm run check:quick`、`npm run check`、`npm run check:full` 和 Compose smoke 本轮未重复运行；未将其标记为通过。首次按仓库记录命令运行集成测试时 `sudo: 'npm': command not found`，仅为 sudo PATH 环境问题，随后以同一 Node 22 的显式 PATH 重跑并通过。 |
| 证据纪律 | E3 仅用于本轮实际通过的 Node/真实 PostgreSQL 行为测试；E2 用于当前源码、Schema、迁移、API、配置和测试实现的交叉证据；未把 mock 或测试缺口写成真实恢复/并发证明。 |

## Overall

| 指标 | 结果 |
| --- | --- |
| Score | **74 / 100** |
| Score Level | **L2** |
| Gate Level | **L2** |
| Final Level | **L2** |
| Trend | `re-review`（Gate L1→L2） |
| Evidence Confidence | 中等（lease/claim、数据库 Tool 幂等、审批、Durable Step 和预算有真实 PostgreSQL E3；非写 Tool 的 in-flight crash、post-task 并发钩子、Trace 隐私和全量 Worker 生命周期主要为 E2/未验证） |
| 当前开放问题 | 5 项（P1×0、P2×5） |

当前 AgentTask 主路径已有较成熟的持久化执行协议：消息/任务进入后由 CAS claim 获得 attempt，Worker 通过 lease/heartbeat 执行，Plan、Tool、审批和 Final 由 Durable Step 恢复，数据库副作用与 ToolCall 在事务中重放幂等，预算也会在 Model/Tool 边界持久化累计。风险集中在两个没有被同一执行协议覆盖的边界：非写 Tool 的 Trace 行仍可被旧 attempt 写入，以及完成后的摘要/记忆钩子以进程内 fire-and-forget 方式并发运行。Trace payload 尚未脱敏或设置保留策略，当前证据不足以进入 L3/L4。

## Score Breakdown

| 维度 | Score | Max | Finding / Evidence |
| --- | ---: | ---: | --- |
| 架构与责任边界 | 11 | 14 | Runtime、claim、Step、预算、Tool Registry 和 tracer 的主边界清楚；但 Worker 同时承载 dispatch、Scheduler 和账号清理（[`agent-worker.ts#L1-L75`](../../agent/agent-worker.ts#L1-L75)），Scheduler 常量又被 Runtime/LLM adapter 直接引用，且摘要/记忆 hooks 另走 `lib/llm.ts`，对应 BU-04/BU-07/BU-08（E2）。 |
| 代码结构与复杂度 | 8 | 10 | `agent-runtime.ts` 对 claim→context→plan→tool→final 具有可追踪的线性控制流，错误分支集中；Tool Registry 同时处理校验、审批、retry、事务和 JSONL 记录，`ExecutionTracer` 又承担终态事务与 Post 投影，局部变化需同时理解多个生命周期（[`agent/agent-runtime.ts#L51-L480`](../../agent/agent-runtime.ts#L51-L480)、[`agent/tool-registry.ts#L48-L365`](../../agent/tool-registry.ts#L48-L365)）（E2）。 |
| 抽象与复用 | 6 | 8 | `withAgentTaskLease`、统一 Durable Step、Registry contract 和预算 helper 避免了主路径重复协议（[`agent/task-claim.ts#L132-L145`](../../agent/task-claim.ts#L132-L145)、[`agent/durable-step.ts#L28-L217`](../../agent/durable-step.ts#L28-L217)）；但非写 Tool tracer、Agent planning provider 与 `lib/llm.ts` 存在平行记录/adapter 路径，规则未完全同源（E2）。 |
| 数据流与状态一致性 | 9 | 12 | AgentTask/Step/ToolCall/LLMCall/Approval 状态和最终 Message 的关键事务边界清晰；真实 PostgreSQL 已证明数据库副作用、ToolCall、错误回滚和 Final 不重复。非写 Tool 的 ToolCall 没有 `stepKey`，而 post-task summary/memory 不属于 Task 事务或 checkpoint，导致 crash/并发时 Trace 与派生状态可能漂移（[`agent/execution-tracer.ts#L259-L335`](../../agent/execution-tracer.ts#L259-L335)、[`agent/post-task.ts#L5-L17`](../../agent/post-task.ts#L5-L17)）（E2/E3）。 |
| 接口与依赖关系 | 8 | 10 | Route 均通过认证/房间访问，Task、Approval、Trace API 契约可定位；Tool 的 Zod input/output 由 Registry 统一校验。QAM-03 生活 Tool、QAM-04 scheduler trigger、QAM-05 agent-log 投影和两个 LLM adapter 仍有直接跨边界依赖，改动会扩散到多个 QAM（[`PROJECT_VIEW.md#L659-L705`](../../PROJECT_VIEW.md#L659-L705)、[`agent/llm-provider.ts#L1-L3`](../../agent/llm-provider.ts#L1-L3)）（E2）。 |
| 健壮性、并发与生命周期 | 10 | 14 | CAS claim、attempt/worker lease、heartbeat、过期接管、Tool deadline/retry、预算 reservation 和审批恢复均有实现及 E3；但旧 attempt 在非写 Tool start/complete/fail 记录上没有原子 lease 栅栏，post-task hooks 也没有并发锁/恢复队列，Worker shutdown 只停止循环并清 timer，不等待 hooks/全部 in-flight 工作（[`agent/task-claim.ts#L147-L187`](../../agent/task-claim.ts#L147-L187)、[`agent/agent-worker.ts#L13-L79`](../../agent/agent-worker.ts#L13-L79)）（E2）。这些开放项对当前读取 Tool 主要是审计一致性债务；后处理重复派生仅在满足阈值且任务完成重叠时触发，未证明为核心 Task 状态故障。 |
| 性能与资源使用 | 6 | 8 | Context、Tool list、消息和 memory 查询有数量上限，AgentTask 关键扫描有索引；每次完成任务仍可能并发触发两次 LLM 后处理，Trace/API 可返回完整子记录且没有分页/保留策略，Worker dispatch 也按任务串行等待，当前规模可控但增长成本可见（[`agent/context-builder.ts#L4-L40`](../../agent/context-builder.ts#L4-L40)、[`app/api/agent/tasks/%5BtaskId%5D/trace/route.ts#L6-L28`](../../app/api/agent/tasks/%5BtaskId%5D/trace/route.ts#L6-L28)）（E2）。 |
| 安全与隐私 | 5 | 10 | 受保护 Agent API 具备认证和房间成员检查，Tool input 在执行/审批前解析，Validation 事件不保存原始无效载荷（[`app/api/agent/tasks/%5BtaskId%5D/trace/route.ts#L6-L28`](../../app/api/agent/tasks/%5BtaskId%5D/trace/route.ts#L6-L28)、[`agent/tool-registry.ts#L96-L121`](../../agent/tool-registry.ts#L96-L121)）（E2）。但 `LLMCall.requestPayload/responsePayload`、EventLog、AgentTask result、Message metadata 和 JSONL debug log 可保存完整 room context、profile/message、Tool 输出及错误；Trace route 还整体返回这些字段，未见字段级脱敏、敏感级别、保留/删除策略或 Tool capability sandbox（[`agent/runtime-budget.ts#L243-L277`](../../agent/runtime-budget.ts#L243-L277)、[`agent/agent-runtime.ts#L552-L577`](../../agent/agent-runtime.ts#L552-L577)、[`lib/chat-log-file.ts#L37-L61`](../../lib/chat-log-file.ts#L37-L61)）（E2）。 |
| 可测试性与验证可信度 | 6 | 8 | 本轮 25 项 Runtime Node 测试和 13 项真实 PostgreSQL 测试通过，覆盖并发 claim、Worker SIGKILL 接管、数据库 Tool 回滚/幂等、审批重建、Durable Step 和各类预算（E3）。没有行为测试覆盖非写 Tool 在外部调用返回后到 Step 完成前崩溃、post-task 并发摘要/记忆、Trace payload 脱敏/保留、跨进程 shutdown；这些缺口限制 Gate（E2/未验证）。 |
| 可维护性、演进与技术债 | 5 | 6 | 当前功能变化大多能落在 Runtime/Registry/Step/预算文件，稳定问题可局部追踪；长期演进仍需同步 scheduler trigger、生活 Tool adapter、两个 LLM provider、Worker 三类生命周期和未来外部副作用协议，旧的 `lib/llm.ts` 后处理路径没有预算/Trace 共用接口（BU-03/BU-04/BU-07/BU-08）（E2）。 |
| **合计** | **74** | **100** | 算术核对：11+8+6+9+8+10+6+5+6+5 = 74。 |

## Level Gate

| 门禁 | 结果 | 证据与原因 |
| --- | --- | --- |
| 开放 P0 | 通过 | 未发现已由当前实现和本轮测试证明的权限突破、不可恢复数据库损坏、重复高风险副作用或支持启动路径整体不可用。高风险 `memo.delete` 在批准前不写入，数据库副作用和 Final 有真实 PostgreSQL 回滚/重放证据。 |
| 开放 P1 且涉及权限绕过、不可恢复数据错误、并发重复副作用或支持启动路径失效 | 通过 | QAM-08-001/002 经本轮克制复核均为 P2：前者当前仅影响读取 Tool crash 窗口的 Trace/状态；后者需要 LLM 可用、同房间任务重叠且达到摘要/抽取阈值，影响派生数据和资源而非已证明的核心 Task 错误状态。 |
| 模块最高风险不变量有风险匹配行为验证 | 未通过 | 核心 Task claim/recovery、数据库副作用幂等和 Final 原子性有 E3；但非写 Tool in-flight crash、post-task 并发/恢复和 Trace 隐私没有对应行为验证，因此不能据此进入 L3。 |
| L4 要求 | 未通过 | Trace 隐私治理、完整跨进程生命周期和上述并发路径没有强 E3，且仍存在开放 P2。 |
| **最终判定** | **L2** | Score Level=L2；Gate Level=L2；Final Level=min(L2,L2)=L2。 |

## Critical Issues

### P0

当前无开放项。

### P1

当前无开放项。核心 claim/recovery、数据库 Tool 幂等、审批和 Final 原子性已有真实 PostgreSQL 证据；下列两个问题均按当前能力和触发条件克制归为 P2。

### P2

#### QAM-08-001：非写 Tool 的 ToolCall 绕过稳定 Step/lease 栅栏

- **状态**：`open`；**优先级**：P2
- **问题**：`executeDurableToolStep()` 为所有 Tool 建立 `AgentStep`，但非数据库 Tool 进入 `executeNonWrite()` 后调用 `ExecutionTracer.startToolCall()`；该方法只写 `taskId/toolName`，没有传入或保存 `stepKey`，也没有在创建、完成、失败更新时以当前 `attemptId/workerId` 做原子 lease 栅栏（[`agent/durable-step.ts#L220-L271`](../../agent/durable-step.ts#L220-L271)、[`agent/tool-registry.ts#L167-L210`](../../agent/tool-registry.ts#L167-L210)、[`agent/execution-tracer.ts#L259-L335`](../../agent/execution-tracer.ts#L259-L335)）。数据库 Tool 走另一条带 `(taskId, stepKey)` 的事务路径，因此两类 Tool 的 Durable Step/ToolCall 语义并不相同（E2）。
- **质量影响**：旧 Worker 在 lease 刚过期、但已通过前置 assert 后可能创建新的 `running` ToolCall；它在外部读取返回后又可能在 lease 丢失窗口更新该行，接管 Worker 会重新执行该 Step 并创建另一条 `stepKey=NULL` 的 ToolCall。当前内置 non-write Tool 仅为天气、搜索、时区读取，Durable AgentStep 已控制任务层的业务重放，尚未证明存在重复业务写入或跨用户影响；直接后果是 crash 窗口下 Trace 多行、永久 `running` 或旧 attempt completed 状态，降低执行历史、耗时和恢复审计可信度。因此这是需要计划治理的 P2 审计一致性债务，而不是当前 P1 错误状态（[`tests/integration/agent-durable-step.integration.test.ts#L111-L152`](../../tests/integration/agent-durable-step.integration.test.ts#L111-L152)，E2/E3）。
- **最小修正**：将稳定 `stepKey` 传入 ToolCall，并让非写 ToolCall 的 start/complete/fail 使用与当前 lease 同一事务栅栏；恢复时对 `running` 的未知读取调用明确记录为 abandoned/重试结果，保证一个 `(taskId, stepKey)` 只有一个可解释的 ToolCall 事实。保留当前天气、搜索和时区能力，不引入外部 Tool。
- **验收证据**：真实 PostgreSQL + 可控 deferred read Tool 在“外部调用已返回、Step 尚未完成”窗口杀死 Worker，接管后断言业务读取按既定 replay policy 执行、`taskId+stepKey` 只有一个最终 ToolCall，旧 attempt 不能写入新状态；另测 lease 在 start/complete/fail 之间失效时无永久 `running` 行。
- **影响范围**：QAM-08 Runtime/Tool trace；直接关联 QAM-09 Worker crash 生命周期和未来外部 Tool adapter，不重复登记 QAM-03 的天气/搜索业务规则。

#### QAM-08-002：post-task fire-and-forget hooks 可跨任务重叠并重复派生

- **状态**：`open`；**优先级**：P2
- **问题**：Final 事务完成后直接调用同步包装的 `runPostTaskHooks(task.roomId)`，其用 `void Promise.allSettled([checkAndSummarize, checkAndExtractMemories])` 脱离 AgentTask lease、attempt、预算、Trace 和 Worker shutdown 等待（[`agent/agent-runtime.ts#L336-L347`](../../agent/agent-runtime.ts#L336-L347)、[`agent/post-task.ts#L5-L17`](../../agent/post-task.ts#L5-L17)）。虽然当前 Worker 的 `dispatchPendingAgentTasks()` 对任务逐个 `await runAgentTask()`，但 `runAgentTask()` 在启动 hooks 后即返回；同一批后续任务、其他 Worker 或并发 inline 请求仍可在前一批 hooks 完成前启动。因此 Worker 的任务执行串行不等于 post-task hooks 串行。`checkAndSummarize()` 通过“最近 summary + message count”检查后直接 `MessageSummary.create()`，没有针对同一 range 的唯一键或 CAS；`checkAndExtractMemories()` 读取同一 `_system.extraction_state` 后执行多次 Memory 写入/删除，也没有 room 级 claim（[`agent/task-dispatcher.ts#L7-L34`](../../agent/task-dispatcher.ts#L7-L34)、[`agent/summarizer.ts#L11-L109`](../../agent/summarizer.ts#L11-L109)、[`agent/memory-extractor.ts#L25-L139`](../../agent/memory-extractor.ts#L25-L139)、[`prisma/schema.prisma#L386-L417`](../../prisma/schema.prisma#L386-L417)）（E2）。
- **质量影响**：该风险需要同时满足：LLM provider 可用、同一房间有两个以上任务的完成/inline 调用重叠，且房间达到摘要的 `>40` 条未摘要消息阈值（Memory 抽取则需达到其 cadence）；满足时两个 summarizer 可读到同一 `rangeEndId` 并各创建重复的持久 `MessageSummary`，后续上下文会看到重复摘要，并额外消耗 LLM/merge 资源。Memory 的 `(roomId,key)` 唯一键通常会把相同 key 合并为更新，但无 watermark CAS 时仍可能重复调用、交错覆盖或删除并把抽取状态推进到不确定顺序。Worker 单线程轮询降低了常规重叠概率，却不能消除 detached hooks 的跨任务重叠；进程在 hook 完成前重启时也没有可恢复工作项。当前证据显示这是受条件触发的派生数据/资源治理缺口，未达到高概率核心 Task 错误状态或不可恢复业务副作用的 P1 门槛，故归为 P2（E2）。
- **最小修正**：为每个 room 的摘要/记忆后处理增加持久化、可抢占的单次工作标识（或同等唯一/CAS），令同一范围只产生一个 summary、同一 extraction watermark 只推进一次；Worker 结束前不要求同步等待全部 LLM，但必须让未完成 hook 可由后续 Worker/任务安全重试。后处理的 LLM 调用至少记录关联 run/工作项并受独立上限约束，保持现有摘要和 Memory 能力不变。
- **验收证据**：真实 PostgreSQL 并发触发两个完成任务，断言同一 `rangeStartId/rangeEndId` 只有一条 range summary、Memory watermark 单调且无交错删除；在提交 Final 后立即终止 Worker，再由新 Worker 执行恢复扫描，断言未完成 hook 可重试且不会重复摘要/Memory。Node 行为测试还应确认 hook rejection 不改变已提交 Final。
- **影响范围**：QAM-08 post-task summary/memory；`lib/llm.ts` 是直接关联的共享 LLM adapter；QAM-02 仅消费摘要结果，QAM-03 不拥有摘要/Memory 一致性。

#### QAM-08-003：Trace 与错误 payload 缺少字段级隐私治理和生命周期

- **状态**：`open`
- **问题**：Planner 将 `roomContext`、prompt 和 available tools 作为 `requestPayload` 保存到 `LLMCall`，完成结果保存 `rawResponse`；错误路径把 provider/body 或 Tool error message 写入 AgentTask、AgentStep、ToolCall、EventLog 和失败消息 metadata。成功/失败 JSONL 也保存完整 request/response/input/output，Trace API 直接整体返回任务及所有子记录（[`agent/agent-runtime.ts#L161-L219`](../../agent/agent-runtime.ts#L161-L219)、[`agent/runtime-budget.ts#L243-L277`](../../agent/runtime-budget.ts#L243-L277)、[`agent/agent-runtime.ts#L423-L475`](../../agent/agent-runtime.ts#L423-L475)、[`lib/chat-log-file.ts#L37-L61`](../../lib/chat-log-file.ts#L37-L61)、[`app/api/agent/tasks/%5BtaskId%5D/trace/route.ts#L10-L28`](../../app/api/agent/tasks/%5BtaskId%5D/trace/route.ts#L10-L28)）（E2）。
- **质量影响**：Room context 中的近期消息、档案备注和 Memory 可能在多个存储副本、debug volume 与客户端响应中长期保留；外部 provider 的错误文本/完整响应还可能扩大载荷或带回不应进入 Trace 的内容。当前房间成员授权限制了跨房间读取，但没有字段最小化、敏感数据分级、保留/删除或全局顺序语义，排查与合规删除成本随 Run 数量增长。
- **最小修正**：定义 QAM-08 的 Trace view model 和字段分级：默认只持久化摘要、长度受限错误和结构化 usage/IDs；对 profile/message/memory/Tool payload 做字段级 allow-list/脱敏，并为 DB Trace 与 JSONL debug log 提供一致保留/删除边界。保持专门 Trace API 的现有可观察状态查询，不扩大用户能力。
- **验收证据**：带敏感 profile/message、无效 Tool payload 和 provider 超长错误的 Route/Node 行为测试，断言 DB、Trace API、JSONL 均不出现被禁止字段/未截断错误；真实房间成员仍可读取允许的状态和 usage，并验证达到保留期限后可删除。
- **影响范围**：QAM-08 Trace/LLM/Tool log；直接关联 QAM-01 档案隐私、QAM-02 消息投影和 QAM-09 debug volume，不重复登记各模块的授权规则。

#### QAM-08-004：LLM planner 与摘要/记忆 adapter 的治理契约分叉

- **状态**：`open`
- **问题**：Agent planner 使用 `agent/llm-provider.ts`，后处理摘要/记忆使用 `lib/llm.ts`；后者没有接收 `AbortSignal`、AgentTask/attempt、预算 reservation、统一 usage/Trace 或运行时 deadline，且由 fire-and-forget hooks 直接调用（[`agent/llm-provider.ts#L143-L293`](../../agent/llm-provider.ts#L143-L293)、[`lib/llm.ts#L3-L95`](../../lib/llm.ts#L3-L95)、[`agent/post-task.ts#L5-L17`](../../agent/post-task.ts#L5-L17)）（E2）。
- **质量影响**：同一环境的 LLM timeout、错误分类、成本统计和取消语义按调用路径漂移；将来修改 provider、价格或敏感字段时需要手动同步两套 adapter，后处理请求可能在任务 deadline 或 Worker stop 后继续占用资源。它是当前已有摘要/记忆路径的治理缺口，不是要求统一所有未来 LLM 用例。
- **最小修正**：抽取最小共享的 LLM transport/调用契约（signal、timeout、受限错误、usage），由 planner 和 post-task use case 各自保留 prompt/输出 schema；为 post-task 工作项设置独立的可观测 budget/取消边界。不要把摘要/记忆变成 Agent plan Tool 或扩展产品能力。
- **验收证据**：Node adapter 行为测试覆盖相同 timeout/abort、HTTP 错误截断和 usage 映射；post-task 工作项在 Worker stop/超时后不再产生未治理的 fetch，planner 既有 E3 流程不回归。
- **影响范围**：QAM-08 LLM/post-task；QAM-09 Worker shutdown 和配置传播为关联责任，QAM-01 profile refine 的直接调用路径不在本次报告范围内。

#### QAM-08-005：持久化/外部 Planner 结果没有完整的结构化计划校验

- **状态**：`open`
- **问题**：`createOpenAICompatibleProvider()` 的 `coercePlan()` 将未知 `required_tools` 静默过滤、对字段缺失使用默认值，并把 `tool_inputs` 直接保留为任意对象；`readPersistedAgentPlan()` 只检查顶层字段类型，不验证 confidence 范围、Tool 名称是否仍在当前 Registry、每个输入是否通过相应 schema，也不验证 completed plan 与当前 trigger 的完整契约（[`agent/llm-provider.ts#L297-L313`](../../agent/llm-provider.ts#L297-L313)、[`agent/agent-runtime.ts#L593-L620`](../../agent/agent-runtime.ts#L593-L620)、[`agent/agent-runtime.ts#L105-L147`](../../agent/agent-runtime.ts#L105-L147)）（E2）。
- **质量影响**：模型返回的未知/缺失动作可能被静默丢弃而仍使用其 `final_response_text` 完成任务，造成“回复声称已执行但实际上没有动作”的可观察语义错误；Tool 输入直到执行边界才失败，恢复后的 Registry/trigger 漂移也只能在运行中暴露，增加错误重试和审计成本。现有 Tool Registry input schema 能阻止不合法参数真正进入 Tool，因此本项是 P2 计划一致性债务而非已证明的权限旁路。
- **最小修正**：以同一 Zod/计划 schema 校验 planner output 和 persisted plan，未知 Tool、缺失必需字段或 trigger 不允许的 Tool 进入明确的 validation/clarify 终态，不静默过滤；保存规范化后的可重放计划并限制错误摘要长度。保留当前有限 Tool 集合与 fallback 能力。
- **验收证据**：Node 行为测试提交未知 Tool、confidence 越界、缺失 tool input 和恢复时 Registry 变化，断言不执行 Tool、不产生“已完成”误导消息并留下稳定 validation/clarify Trace；现有计划修复/Tool contract 集成测试继续通过。
- **影响范围**：QAM-08 planner/Step/Registry；Scheduler trigger 规则由 QAM-04 提供，生活领域 Tool 规则由 QAM-03 提供，本问题只维护 Runtime 的计划契约。

## Architecture and Data Flow

```text
Message / explicit dispatch / Scheduler atomic dispatch
  └─ AgentTask(pending) + source input + frozen budget
       └─ Worker or local inline → CAS claim(attemptId, workerId, lease)
            ├─ heartbeat + lease fence
            ├─ context → Durable plan Step → LLM planner + plan validation
            ├─ each Durable tool Step
            │    └─ Zod input → approval/risk → budget → deadline/retry
            │         ├─ database write: business row + ToolCall + EventLog transaction
            │         └─ non-write: ToolCall/tracer side writes outside a step-level transaction
            └─ Durable final Step → Message + final Step + AgentTask + EventLog transaction
                 └─ post-task hooks (摘要/Memory)
                      └─ fire-and-forget lib/llm.ts；无 lease/checkpoint/CAS/恢复队列

Scheduler：ScheduledJob due → QAM-04 Job CAS + AgentTask/EventLog transaction → 上述 Worker
Trace：AgentTask/Step/ToolCall/LLMCall/Approval/EventLog + JSONL debug log → room-member Trace API
```

`AgentTask` 是执行状态事实源，`AgentStep(taskId, stepKey)` 是 Plan/Tool/Final 的恢复事实源，当前数据库写 Tool 还以 `(taskId, stepKey)` 的 ToolCall 唯一键和事务保护业务副作用。claim/heartbeat/终态使用当前 attempt 栅栏，真实 PostgreSQL 已证明并发 claim、SIGKILL 接管、旧终态拒绝和数据库副作用 replay。非写 Tool 的 ToolCall 与 post-task hooks 位于这条事实链之外：前者没有稳定 step key/lease 原子更新，后者在 Final 之后才异步启动且没有持久工作项。Trace API 和 JSONL 又以完整子记录作为输出，形成执行可靠性、隐私和资源生命周期的共同风险面。未来邮件、支付、发布等外部写操作不作为当前缺陷；若新增，必须另行建立供应商幂等或 Outbox/relay 协议。

## Verified Strengths

- `claimAgentTask()` 用单条条件 `updateMany` 从 pending/failed 或过期 running 迁移到 running，生成新 attempt 并绑定 worker/lease；本轮真实 PostgreSQL 并发与 SIGKILL 接管测试通过（[`agent/task-claim.ts#L34-L80`](../../agent/task-claim.ts#L34-L80)、[`tests/integration/agent-task-claim.integration.test.ts#L73-L165`](../../tests/integration/agent-task-claim.integration.test.ts#L73-L165)，E3）。
- `withAgentTaskLease()` 在事务内续租并在续租失败时拒绝 operation；Final Message、Final Step 和 completed Task/EventLog 位于同一事务，旧 attempt 不能覆盖结果（[`agent/task-claim.ts#L132-L145`](../../agent/task-claim.ts#L132-L145)、[`agent/execution-tracer.ts#L40-L100`](../../agent/execution-tracer.ts#L40-L100)，E2；Final/旧 attempt E3）。
- Durable Step 对 Plan、Tool、审批和 Final 使用 `(taskId, stepKey)` 唯一记录，恢复会校验 kind/input 并复用 completed output；真实 PostgreSQL 已证明 completed Plan/read Tool 不重跑、审批可恢复和 Final 不重复（[`agent/durable-step.ts#L28-L159`](../../agent/durable-step.ts#L28-L159)、[`tests/integration/agent-durable-step.integration.test.ts#L38-L205`](../../tests/integration/agent-durable-step.integration.test.ts#L38-L205)，E3）。
- Tool Registry 是执行 allowlist，所有内置 Tool 有 Zod input/output contract、风险级别、deadline、AbortSignal 和显式 retry policy；Validation 错误不会调用 Tool 或重试，数据库写 Tool 的 output 失败会回滚副作用（[`agent/tool-registry.ts#L48-L165`](../../agent/tool-registry.ts#L48-L165)、[`agent/tool-contracts.ts#L25-L170`](../../agent/tool-contracts.ts#L25-L170)、[`tests/agent/tool-registry-reliability.test.ts#L39-L182`](../../tests/agent/tool-registry-reliability.test.ts#L39-L182)，E3）。
- high-risk Tool 进入持久化 `waiting_approval`，认证且房间成员可通过受校验 API Approve/Reject；真实 PostgreSQL 已证明拒绝保留 Memo、批准后只删除一次并可重建 Registry 恢复（[`agent/tool-approval.ts#L26-L139`](../../agent/tool-approval.ts#L26-L139)、[`tests/integration/agent-tool-approval.integration.test.ts#L27-L145`](../../tests/integration/agent-tool-approval.integration.test.ts#L27-L145)，E3）。
- Runtime Budget 在 Model 调用前 reservation、Tool retry attempt 前累计，并在 Crash Recovery 后继续计数；deadline、token/cost/turn/tool 上限以稳定 `limit_exceeded` 终态结束，真实 PostgreSQL 预算测试通过（[`agent/runtime-budget.ts#L160-L287`](../../agent/runtime-budget.ts#L160-L287)、[`tests/integration/agent-runtime-budget.integration.test.ts#L26-L220`](../../tests/integration/agent-runtime-budget.integration.test.ts#L26-L220)，E3）。

## Recommended Improvements

1. **修复 QAM-08-002（P2）**：给摘要/Memory 后处理增加持久化 room 级 CAS/唯一工作项和恢复扫描，补真实 PostgreSQL 并发、进程终止和重试证据；它是当前最值得优先治理的派生数据/资源问题，但本轮证据不足以把 Gate 降到 L1。
2. **修复 QAM-08-001（P2）**：统一非写 ToolCall 的稳定 `stepKey`、attempt/lease 栅栏和 crash 中间态，补 deferred Tool + Worker 接管测试；不改变天气、搜索、时区的功能边界。
3. **治理 QAM-08-003（P2）**：定义 Trace allow-list、错误截断、字段脱敏和 DB/JSONL 保留删除策略，补带敏感载荷的 Route/Node 行为证据。
4. **收敛 QAM-08-004（P2）**：为 planner 与 post-task 保留各自 use-case schema，但共享 timeout/signal/usage/error transport；将后处理放进可观测且可取消的工作边界。
5. **收紧 QAM-08-005（P2）**：对外部和持久化计划使用完整结构化 schema，未知 Tool/不合法输入转 validation/clarify，不静默滤掉动作。

以上修正均保持当前 Agent 能力和 Tool 集合不变；未来外部写操作的供应商幂等键/Outbox 只作为新增能力时的协议前提，不在本基线中虚构缺陷。

## Sustainable Review Record

### 当前开放问题

| ID | Priority | 状态 | 首次证据 | 直接责任 | 关联责任 |
| --- | --- | --- | --- | --- | --- |
| QAM-08-001 | P2 | `open` | 2026-09-06 复核；非写 ToolCall 未保存 stepKey，start/complete/fail 没有 lease 原子栅栏；当前内置 Tool 仅为读取类，直接后果是 crash 窗口 Trace/状态不一致（E2；in-flight crash 未验证） | QAM-08 non-write Tool executor/tracer | QAM-09 Worker crash 生命周期 |
| QAM-08-002 | P2 | `open` | 2026-09-06 复核；Worker 任务循环虽串行，但 detached hooks 可跨任务重叠；需 LLM 可用、同房间任务重叠且达到 summary/extraction 阈值才会重复持久化派生结果（E2） | QAM-08 post-task hooks | `lib/llm.ts` 共享 adapter、QAM-09 Worker lifecycle |
| QAM-08-003 | P2 | `open` | 2026-09-06；LLM/Tool/Event/JSONL/Trace API 保存并返回完整 payload，无脱敏/保留 contract（E2） | QAM-08 Trace/privacy | QAM-01 profile、QAM-02 message projection、QAM-09 debug volume |
| QAM-08-004 | P2 | `open` | 2026-09-06；planner 与 `lib/llm.ts` adapter 的 timeout/signal/usage/Trace 契约分叉（E2） | QAM-08 LLM transport boundary | QAM-09 config/shutdown |
| QAM-08-005 | P2 | `open` | 2026-09-06；`coercePlan`/`readPersistedAgentPlan` 未完整校验结构化计划，未知 Tool 静默过滤（E2） | QAM-08 planner/Step contract | QAM-03 Tool domain、QAM-04 trigger protocol |

### 复审触发条件

- 修改 `agent/task-claim.ts`、`agent/durable-step.ts`、`agent/tool-registry.ts`、`agent/execution-tracer.ts`、AgentTask/AgentStep/ToolCall/LLMCall 迁移，或改变 lease/attempt/replay/终态事务。
- 修改 post-task summarizer、memory extractor、`runPostTaskHooks`、`lib/llm.ts` 或 Worker stop/restart/dispatch 生命周期。
- 修改 Trace API、EventLog/LLMCall/ToolCall/JSONL payload、日志目录或房间成员可见的执行数据。
- 修改 planner output schema、plan repair/validation、scheduler trigger blocked tools 或 Tool contract/risk/retry/deadline。
- 新增风险匹配证据：真实 PostgreSQL 多 Worker claim/recovery、deferred non-write crash、post-task 并发/重启、Trace 脱敏/保留删除和 adapter abort/usage 行为。

### 只追加评分历史

| 日期 | Score | Score Level | Gate | Final | Delta | 变更证据 |
| --- | ---: | --- | --- | --- | --- | --- |
| 2026-09-06 | 74 | L2 | L1 | L1 | `baseline` | 独立初审；Node 5 文件/25 项和真实 PostgreSQL 5 文件/13 项通过，证明 claim/recovery、数据库 Tool 幂等、审批、Durable Step 与预算；非写 Tool in-flight crash、post-task 并发/恢复、Trace 隐私和完整 Worker shutdown 未验证，登记 P1×2/P2×3。 |
| 2026-09-06 | 74 | L2 | L2 | L2 | `re-review`（优先级复核） | 将 QAM-08-001 从 P1 调整为 P2：当前 non-write Tool 仅为读取类，Durable AgentStep 已控制任务层重放，直接后果是 crash 窗口 Trace 多行/旧状态；QAM-08-002 明确 Worker 串行 dispatch 仍因 detached hooks 跨任务重叠，但需 LLM 可用、同房间任务重叠及 summary/extraction 阈值，重复 Summary/Memory 是条件触发的派生数据治理缺口，调整为 P2；Gate 由 L1 上调为 L2。 |

复审时保留稳定问题 ID 和历史行；仅在当前代码或风险匹配证据变化时重算受影响维度，并重新核对十维合计 100、Gate 与 Final。问题状态只能使用 `open`、`resolved`、`accepted-risk`、`not-reproduced`。
