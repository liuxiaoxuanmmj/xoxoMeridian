# QAM-04 定时任务触发与派生工程质量审查

## 元数据

| 项目 | 内容 |
| --- | --- |
| QAM | QAM-04 定时任务触发与派生 |
| 快照日期 | 2026-09-06 |
| 审查 Skill | [`xoxo-qam-04-scheduler-review`](../../.agents/skills/xoxo-qam-04-scheduler-review/SKILL.md) |
| 标准版本 | [`module-quality-review-standard.md`](./module-quality-review-standard.md) v1.0.0 |
| 范围来源 | [`PROJECT_VIEW.md`](../../PROJECT_VIEW.md) 的 QAM-04、Cross-cutting Concerns、共享映射、BU-04/BU-07 与 Quality Tracking Index；[`AGENTS.md`](../../AGENTS.md) |
| 本轮 Delta | `baseline`（初审） |
| 当前基线命令 | `npm run test:unit -- tests/agent/scheduler-tick.test.ts`：1 文件/12 项通过；`npm run test:integration -- tests/integration/scheduler-atomic-dispatch.integration.test.ts`：1 文件/1 项通过（真实 PostgreSQL Testcontainer） |
| 未运行命令 | `npm run check:quick`、`npm run check`、`npm run check:full` 和 Compose smoke 本轮未重复运行；未将其标记为通过 |
| 证据纪律 | E3 为本轮实际执行的单元/真实 PostgreSQL 测试；E2 为源码、schema、迁移、Route/Tool 和测试实现交叉证据；没有把 mock 并发测试写成真实多 Worker 证明 |

## Overall

| 指标 | 结果 |
| --- | --- |
| Score | **75 / 100** |
| Score Level | **L2** |
| Gate Level | **L2** |
| Final Level | **L2** |
| Trend | `baseline` |
| Evidence Confidence | 中等（CAS/事务失败回滚有 E3；timer 竞态、真实多 Worker、DST/clock、重启和 shutdown 生命周期主要为 E2/未验证） |
| 当前开放问题 | 3 项（P1×2、P2×1） |

Scheduler 的 due 扫描、旧字段 CAS 及 Job→AgentTask→EventLog 事务边界清楚，失败时事务回滚并有 stale-failure 条件更新；当前主要风险集中在进程内 near-term timer 与持久化 Job 修改/系统时钟的语义脱节。一次性 Job 错过窗口后仍可能按合成 cron 的下一次时间触发，且 Worker 停止只清理尚未执行的 timer，不等待已进入的异步回调。单元测试覆盖正常、失败、回滚、近时 timer 和 mock race，真实 PostgreSQL 仅覆盖 EventLog 写入失败回滚，尚不足以证明多 Worker 至多一次、重启/DST 或关闭恢复。

## Score Breakdown

| 维度 | Score | Max | Finding / Evidence |
| --- | ---: | ---: | --- |
| 架构与责任边界 | 11 | 14 | `scheduler-tick.ts` 集中承担扫描、CAS、派生、失败回写和 timer；Worker 仅负责 loop/lifecycle。BU-07 的 Worker 同时承载 dispatch、scheduler 与认证清理，BU-04 的 trigger/blocked-tools 常量由 Scheduler 提供、QAM-08 消费，边界可追踪但仍有共享生命周期/协议耦合（E2）。 |
| 代码结构与复杂度 | 8 | 10 | due、near-term、事务派生和 stale failure 分段清晰，控制流短且可定位；timer callback 与 polling 分成两条路径，导致时间条件没有在共同入口重新验证（[`scheduler-tick.ts`](../../agent/scheduler-tick.ts#L41-L229)，E2）。 |
| 抽象与复用 | 6 | 8 | `claimAndDispatchScheduledJob` 复用两条触发入口的 CAS/事务语义，runtime budget 初始化也复用 QAM-08 helper；timer registry 仍是文件私有状态，Job authoring/trigger 状态共享同一模型且没有失效通知（E2）。 |
| 数据流与状态一致性 | 9 | 12 | `ScheduledJob.updateMany` 以 enabled/nextRunAt/lastRunAt/failCount 做旧值 CAS，并在同一事务写 AgentTask 与 fired EventLog；事务失败后保留旧 nextRunAt、外部 stale failure 也有 CAS。timer callback 可对已被改期的 Job 直接以 `inWindow=true` 派生，一次性 missed-window 状态也可能错误保留（QAM-04-001/002，E2；原子回滚 E3）。 |
| 接口与依赖关系 | 8 | 10 | `schedulerTick()`/`clearAllTimers()` 和 `SchedulerTickResult` 明确，Prisma 索引及 `TRIGGER_SCHEDULED_JOB` 契约可导航；`agent-runtime.ts`、`llm-provider.ts` 直接依赖 Scheduler 常量，协议改动需跨 QAM-04/QAM-08 同步（[`agent-runtime.ts`](../../agent/agent-runtime.ts#L20-L24)、[`llm-provider.ts`](../../agent/llm-provider.ts#L1-L1)，E2）。 |
| 健壮性、并发与生命周期 | 8 | 14 | 数据库 CAS 和事务能抵御同一快照的竞争，失败计数有上限且 stale failure 不覆盖新 claim；但 timer 旧快照/clock backward、真实多 Worker CAS、重启 timer 恢复、SIGTERM 中 in-flight `fireJobNow` 等没有完整控制或 E3（[`agent-worker.ts`](../../agent/agent-worker.ts#L16-L75)，QAM-04-001/003，E2）。 |
| 性能与资源使用 | 6 | 8 | enabled/nextRunAt 有索引，due 批次 20、near-term 查询最多 100，timer map 防止同一进程重复注册；每次 Worker tick 仍先查 `findFirst` 再查 due/near-term，且 due/job 派生串行执行，当前规模可控但无多 Worker/批次饥饿实验（E2）。 |
| 安全与隐私 | 9 | 10 | 派生使用持久化 roomId/agentId 外键，任务只通过已注册的 scheduled trigger 进入 QAM-08，prompt 进入受控 AgentTask input；错误消息会写日志但未发现跨房间授权旁路。Scheduler 依赖 Job 已由 QAM-03 授权创建，非本模块重复评价（schema [`ScheduledJob`](../../prisma/schema.prisma#L435-L455)，E2）。 |
| 可测试性与验证可信度 | 5 | 8 | 12 项 Scheduler 单元测试通过，覆盖 CAS race mock、run-once、失败回写、事务回滚和 near-term fake timer；真实 PostgreSQL 1 项确认 EventLog 失败时 Task/Job 一起回滚，但没有真实并发、多 Worker、DST/clock、改期/停用 timer、重启或 shutdown 行为测试（E3/E2）。 |
| 可维护性、演进与技术债 | 5 | 6 | 主要变化点集中在 `scheduler-tick.ts`，问题修正可局部落点；trigger marker/blocked tools 被 QAM-08 多处直接引用，Worker 三种 lifecycle 共用 stopped 状态，未来修正需保持协议与关闭语义一致（BU-04/BU-07，E2）。 |
| **合计** | **75** | **100** | 算术核对：11+8+6+9+8+8+6+9+5+5 = 75。 |

## Level Gate

| 门禁 | 结果 | 证据与原因 |
| --- | --- | --- |
| 开放 P0 | 通过 | 未发现权限突破、不可恢复数据库损坏、已证明的重复高风险副作用或支持启动路径整体不可用。Job/Task/EventLog 事务回滚有真实 PostgreSQL 证据。 |
| 开放 P1 且涉及权限绕过、不可恢复数据错误、并发重复副作用或支持启动路径失效 | 通过 | QAM-04-001/002 是错误时间/错误一次性语义，当前证据未证明属于上述四类硬门禁；它们仍按 P1 记录，因为常见改期或长停机可造成错误触发状态/副作用。 |
| 最高风险不变量有风险匹配行为验证 | 未通过 | 至多一次依赖数据库 CAS，但本轮真实 PostgreSQL 只验证 EventLog 失败回滚；并发测试使用内存 mock，缺少真实多 Worker 竞争、旧 claim 和重启恢复验证。因此 Gate 不高于 L2。 |
| L4 要求 | 未通过 | 关键并发、timer、clock/DST、重启和关闭生命周期没有完整 E3，且有开放 P1。 |
| **最终判定** | **L2** | Score Level=L2；Gate Level=L2；Final Level=min(L2,L2)=L2。 |

## Critical Issues

### P0

当前无开放项。

### P1

#### QAM-04-001：near-term timer 使用旧 Job 快照并绕过 due 时间复核

- **状态**：`open`
- **问题**：`scheduleNearTermJobs()` 把查询时的 `nextRunAt` 变成 timer delay，仅在 `activeJobTimers` 中按 `job.id` 去重；回调删除 timer 后只传 `jobId` 给 `fireJobNow()`。`fireJobNow()` 重新读取 Job，但不检查当前 `nextRunAt <= now`，直接调用 `claimAndDispatchScheduledJob(job, now, true)`（[`scheduler-tick.ts:197-229`](../../agent/scheduler-tick.ts#L197-L229)）。QAM-03 的 HTTP PATCH/DELETE 和 Agent schedule.update 可以在 timer 已注册后修改 `nextRunAt` 或停用 Job，却没有 timer 版本/期望时间校验（[`scheduled-jobs/[jobId]/route.ts:94-142`](../../app/api/rooms/%5BroomId%5D/scheduled-jobs/%5BjobId%5D/route.ts#L94)、[`schedule-tool.ts:281-325`](../../agent/tools/schedule-tool.ts#L281)）。系统时钟向后跳变时，Node timer 仍按已计算的延迟回调，当前 wall clock 同样可能早于 Job 的 `nextRunAt`。以上为 E2 结构证据；本轮 fake timer 只验证未改期的正常路径，未执行该交错行为。
- **质量影响**：用户把近时计划改到更晚、停用/重启用，或运行环境发生 wall-clock backward 后，旧 timer 仍可能在新计划时间之前派生 AgentTask；调度“正确时间触发”与 polling 路径不一致，错误任务已经进入 QAM-08 执行后只能取消/失败处理，增加副作用和排查成本。
- **最小修正**：timer registry 保存 `nextRunAt`（或等价版本）并在 callback 重新读取后要求 Job 仍 enabled、`nextRunAt` 与期望值一致且 `nextRunAt <= now`；不满足时丢弃旧 timer 并让当前 tick/near-term registration 按新值重新安排。把相同检查置于 timer 与 polling 共用的 claim 边界，保留现有 CAS/功能范围。
- **验收证据**：Node 行为测试先注册近时 timer，再通过可观察的 Job 更新/停用与 fake clock backward 交错，断言提前时刻没有 AgentTask、改期后的时间才至多派生一次；真实 PostgreSQL 测试断言旧 `nextRunAt` claim 不会覆盖新值。无需引入外部队列。
- **影响范围**：QAM-04 直接受影响；QAM-03 的 Job authoring/update 是触发条件；QAM-08 仅消费错误时间产生的 AgentTask，不重复登记执行器问题。

#### QAM-04-002：run-once Job 错过窗口后仍按下一次 cron 保持启用

- **状态**：`open`
- **问题**：due Job 超过 `MISSED_WINDOW_MS` 时，`claimAndDispatchScheduledJob()` 仍按 `computeNextRun(job.cron, job.timezone, now)` 推进 `nextRunAt`，但只在 `runOnce && inWindow` 时禁用；因此 `runOnce=true` 的 fireAt（由 QAM-03/Tool 合成一个可解析的日 cron）或手动 cron one-shot 在停机/轮询中断超过一小时后会被标记为 skipped 却继续 enabled，下一次 cron 到期又会触发（[`scheduler-tick.ts:68-115`](../../agent/scheduler-tick.ts#L68-L115)、[`schedule-tool.ts:114-118`](../../agent/tools/schedule-tool.ts#L114)）。现有测试仅覆盖窗口内 run-once 成功和失败重试，没有长停机/超过窗口行为（E2）。
- **质量影响**：本应只执行一次的绝对时间计划在长停机后可能被延迟到下一日/下一 cron 周期执行，造成错误提醒或 Agent 副作用；Job 的 `enabled`、用户可见计划和实际 missed-window 政策也不一致。
- **最小修正**：在当前 missed-window 分支对 `runOnce` 明确写入一次性终态（禁用；保留当前不创建 AgentTask 的 skipped 结果）；周期 Job 仍按当前 `computeNextRun` 推进。不要把该修正扩展为新的重放策略或外部调度能力。
- **验收证据**：使用 fake clock 或真实 PostgreSQL 持久化一个已超过一小时的 `runOnce=true` Job，执行 tick 后断言不创建 Task、Job disabled 且不会在下一 cron 时间再次派生；窗口内失败仍保留当前 failCount/retry 语义。补充 fireAt 合成 cron 的真实时间边界测试。
- **影响范围**：QAM-04 的 missed-window/one-shot 状态；QAM-03 负责 fireAt/cron 定义，不重复登记定义入口；QAM-08 不拥有触发政策。

### P2

#### QAM-04-003：Worker shutdown 不等待已进入的 Scheduler 异步工作

- **状态**：`open`
- **问题**：SIGINT/SIGTERM handler 只设置模块级 `stopped=true` 并调用 `clearAllTimers()`（[`agent-worker.ts:13-17`](../../agent/agent-worker.ts#L13-L17)）。timer callback 一旦开始就以 `void fireJobNow(job.id)` 脱离 `activeJobTimers`，没有 in-flight 集合或 shutdown promise；`schedulerLoop()`/`dispatchLoop()` 在当前操作后还会无条件 sleep，最长可能等待 dispatch backoff 60 秒（[`agent-worker.ts:21-69`](../../agent/agent-worker.ts#L21-L69)）。Compose 未声明额外 stop grace，且 Worker 不显式等待/关闭 Prisma（[`docker-compose.yml:158-177`](../../docker-compose.yml#L158-L177)）。本轮没有发送信号并观察 commit/退出顺序，故为 E2/未验证的生命周期风险。
- **质量影响**：容器停止或滚动重启期间，已开始的 timer 派生可能在进程退出前未提交，或后台 promise 的失败回写未完成；依赖 restart 后 due 扫描可恢复大部分情况，但退出耗时和恢复窗口不可预测，日志/失败计数也可能丢失。该问题不改变 QAM-08 任务执行 lease 的所有权。
- **最小修正**：维护 Scheduler timer callback 的 in-flight promise 集合；shutdown 时停止新 tick、清 timer、等待既有 scheduler promise 完成并设置有界超时，再由 Worker 统一结束 loop。dispatch loop 的等待应可被同一 stop signal 唤醒；不要把其扩展成新的进程托管系统。
- **验收证据**：Node Worker 生命周期行为测试在 timer callback 卡在 deferred DB 操作时发送 SIGTERM，断言不再注册新 timer、既有事务完成或按明确有界超时退出；重启后的真实 PostgreSQL 测试断言未提交 claim 可被重新扫描且不会重复已提交 Task/EventLog。
- **影响范围**：QAM-04 timer/shutdown；QAM-09 仅负责 Compose stop/restart 拓扑，QAM-08 负责 AgentTask lease/recovery，不把其执行器生命周期重复归入本问题。

## Architecture and Data Flow

```text
ScheduledJob (Prisma: enabled/nextRunAt/lastRunAt/failCount)
  ├─ Worker schedulerLoop (约 5 秒 jitter polling)
  │    └─ due <= now ──> CAS claim ──> 同一事务：AgentTask + scheduler.job.fired EventLog
  └─ near-term <= 2 分钟 ──> activeJobTimers ──> fireJobNow(jobId)
                                      └─> 重新读 Job，但当前强制 inWindow=true

事务失败 ──> Job/Task/EventLog 回滚 ──> 外部 stale-failure CAS 增 failCount/达到 3 次禁用
成功提交 ──> AgentTask pending ──> QAM-08 Worker dispatch/lease/runtime
```

Prisma `ScheduledJob` 是 QAM-03 的定义输入和 QAM-04 的触发期状态事实源；`activeJobTimers` 只是进程内优化缓存，不应替代数据库时间/CAS。正常 due 与近时路径最终共用 `claimAndDispatchScheduledJob()`，因此任务派生与 fired EventLog 的原子边界一致；但 timer 在进入该函数前把 `inWindow` 固定为 true，造成与 polling 的 due/missed-window 语义漂移。QAM-04 只负责发现、推进和派生；QAM-08 接管提交后的 AgentTask，QAM-03 负责 Job 创建/编辑，QAM-09 负责 Worker/Compose 托管。

## Verified Strengths

- Job claim 使用 `id + enabled + nextRunAt + lastRunAt + failCount` 的旧值条件更新；两个并发 tick 在单元测试中只派生一个 Task（E3，但该测试是内存 mock，不替代 PostgreSQL 并发证据）。
- Job 推进、AgentTask 创建和 `scheduler.job.fired` EventLog 写入位于同一 Prisma transaction；真实 PostgreSQL 触发器故障实验通过，确认 EventLog 插入失败时 Job claim 与 AgentTask 一起回滚（[`scheduler-atomic-dispatch.integration.test.ts`](../../tests/integration/scheduler-atomic-dispatch.integration.test.ts#L20-L85)，E3）。
- 失败路径保留旧 `nextRunAt`，以旧字段 stale CAS 回写 `failCount`，不会覆盖更新后的 Job；连续失败达到 3 次禁用，且对应单元测试通过（[`scheduler-tick.test.ts`](../../tests/agent/scheduler-tick.test.ts#L203-L283)，E3）。
- due 批次按 `nextRunAt` 升序、near-term 只注册窗口内 timer、同一进程用 map 去重，正常近时 fake-timer 测试和超窗口不注册测试通过（[`scheduler-tick.test.ts`](../../tests/agent/scheduler-tick.test.ts#L286-L312)，E3）。
- 任务 input 写入 `scheduled.job` trigger、jobId、原始/包裹 prompt，并给 QAM-08 过滤 schedule mutation tools，降低 Agent 自调度循环风险；budget create data 由共享 runtime helper 提供（E2）。

## Recommended Improvements

1. 先修复 QAM-04-001：让 timer 携带期望 `nextRunAt`/版本，在 callback 和共享 claim 边界复核当前 wall-clock due 条件；补改期、停用、clock backward 与 PostgreSQL 旧 claim 行为测试。
2. 修复 QAM-04-002：明确 run-once missed-window 的禁用终态，补长停机/下一 cron 周期不重放的行为测试；周期 Job 保持现有跳过窗口政策。
3. 修复 QAM-04-003：跟踪并等待 Scheduler in-flight promise，stop signal 唤醒 loop；补 Worker 信号、重启和真实 PostgreSQL 恢复证据。
4. 在上述修改后补一条真实 PostgreSQL 多 Worker/多进程竞争测试，覆盖“一个 claim 只生成一个 Task 和 fired EventLog”；该证据是 Gate 从 L2 上调的必要条件，不要求引入外部队列。

以上均为当前调度边界的最小修正，不增加新的调度能力、外部队列或监控平台；QAM-03 的计划定义、QAM-08 的任务执行和 QAM-09 的进程托管只通过直接影响范围关联。

## Sustainable Review Record

### 当前开放问题

| ID | Priority | 状态 | 首次发现 | 直接责任 | 关联责任 |
| --- | --- | --- | --- | --- | --- |
| QAM-04-001 | P1 | `open` | 2026-09-06；timer callback 不复核当前 `nextRunAt`（E2） | QAM-04 Scheduler timer/claim boundary | QAM-03 Job update/cancel；QAM-08 消费错误时间 Task |
| QAM-04-002 | P1 | `open` | 2026-09-06；run-once missed-window 保持 enabled（E2） | QAM-04 missed-window policy | QAM-03 fireAt/cron 定义 |
| QAM-04-003 | P2 | `open` | 2026-09-06；Worker shutdown 不等待 timer in-flight（E2） | QAM-04 scheduler lifecycle | QAM-09 Worker 托管；QAM-08 Task recovery |

### 复审触发条件

- 修改 `agent/scheduler-tick.ts`、Worker scheduler loop、`ScheduledJob` trigger fields、missed-window/failure policy 或 `clearAllTimers()` 生命周期。
- 修改 QAM-03 ScheduledJob PATCH/Tool update/cancel、fireAt/cron 计算，尤其会改变 `nextRunAt` 的时间或 enabled 语义。
- 修改 QAM-08 scheduled trigger/blocked-tools/budget initialization contract，或 QAM-09 Worker stop/restart/Compose 配置。
- 新增或重跑真实 PostgreSQL 多 Worker CAS、timer 改期/停用、DST/clock jump、长停机 missed-window、SIGTERM in-flight 和重启恢复证据。

### 只追加评分历史

| 日期 | Score | Score Level | Gate | Final | Delta | 变更证据 |
| --- | ---: | --- | --- | --- | --- | --- |
| 2026-09-06 | 75 | L2 | L2 | L2 | `baseline` | 初审；Scheduler 单元测试 1 文件/12 项通过；真实 PostgreSQL 原子派生失败回滚测试 1 文件/1 项通过；改期 timer、run-once missed-window、真实多 Worker、DST/clock、重启与 shutdown 生命周期仍未验证。 |

复审时保留上述问题 ID 和历史行；只在当前代码或风险匹配证据变化时重算受影响维度，并重新核对 100 分合计、Gate 与 Final。问题状态只能使用 `open`、`resolved`、`accepted-risk`、`not-reproduced`。
