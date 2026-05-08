# Scheduler Tick "空走早退" 设计

> 状态：草案，待用户 review
> 范围：`agent/scheduler-tick.ts` + `agent/agent-worker.ts`
> 上线影响：worker 容器，重启即生效，零 schema 变更

## Context

agent-worker 容器里有一个 setInterval-driven 的 scheduler tick：每 3s±0.5s 触发一次 `schedulerTick()`，内部并行执行 4 个查询（fireDueReminders / fireDueScheduledJobs / scheduleNearTermReminders / scheduleNearTermJobs）。在双人小型房间的真实使用频率下，**绝大多数 tick 都是 4 个查询全部空集**，浪费在 idle 上。

用户的初始提案是"无短期任务时关闭 scheduler tick，agent 工具创建第一个 reminder 时把开关打开，全部触发完关回去"。该方案在小项目体量下成本远高于收益：

- API 路径（`app/api/rooms/[roomId]/reminders/route.ts`）能绕过工具直接 INSERT，flag 不会被翻起 → reminder 永远不触发
- flag 与 `Reminder` 表是双源真相，必然漂移
- "关闭瞬间"与"刚 INSERT"之间有 race
- 跨容器（web 创建 / worker 触发）必须 LISTEN/NOTIFY 或仍然 polling，节约不下来真正的开销

放弃 flag 方案，采用**最小改动的早退路径**。

## Goals

- Worker 在 idle 时单 tick 的 DB 查询从 4 降到 2。
- 短期 reminder 触发偏差 ≤ 6s（从原方案 ≤ 5s 微调，换简洁）。
- 周期 cron job 触发偏差 ≤ 1min（保持）。
- **零重复触发**（继承上一轮已交付的原子 claim / CAS 机制，不动）。
- 不引入新的状态、新的存储字段、新的 wake-up 机制。

## Non-Goals

- 不做 LISTEN/NOTIFY 事件驱动（推迟到未来若房间数 / reminder 频率显著提升再上）。
- 不彻底关闭 setInterval 循环（保留循环本身，只在循环内做轻量探测后早退）。
- 不动 ScheduledJob 的 polling 模型。
- 不改 reminder/job 的创建路径与 schema。

## Approach

### 1. tick 间隔回调到 5s

`agent/agent-worker.ts`：

```ts
const SCHEDULER_TICK_MS = 5_000;     // 上版 3_000
const SCHEDULER_JITTER_MS = 1_000;   // 上版 500
```

短期 reminder 的 polling fallback 路径下，最大延迟 = 5s + 1s 抖动 + 处理时间 ≈ 6s。配合"近 5 分钟内"已经走 setTimeout 精度路径，对真正接近 due 的任务影响为 0。

### 2. 在 `schedulerTick` 顶层做早退

当前 `schedulerTick` 一次会跑 4 个查询：

- `fireDueReminders` → `findMany WHERE pending AND dueAt <= now`
- `fireDueScheduledJobs` → `findMany WHERE enabled AND nextRunAt <= now`
- `scheduleNearTermReminders` → `findMany WHERE pending AND dueAt in (now, now+5min]`
- `scheduleNearTermJobs` → `findMany WHERE enabled AND nextRunAt in (now, now+2min]`

改成在 `schedulerTick` 编排函数顶部先并行做两个轻量探测：

```ts
const [hasReminder, hasJob] = await Promise.all([
  prisma.reminder.findFirst({ where: { status: "pending" }, select: { id: true } }),
  prisma.scheduledJob.findFirst({ where: { enabled: true }, select: { id: true } })
]);

if (!hasReminder && !hasJob) {
  return { reminders: { fired: 0, skipped: 0, failed: 0 }, jobs: { fired: 0, skipped: 0, failed: 0 } };
}
```

然后只对存在的那一类继续跑 fireDue + scheduleNearTerm：

- `hasReminder` 真 → 跑 `fireDueReminders` + `scheduleNearTermReminders`
- `hasJob` 真 → 跑 `fireDueScheduledJobs` + `scheduleNearTermJobs`

idle 状态：4 query → 2 query（且都是 LIMIT 1 命中索引）。两类全有：4 query → 6 query（多 2 次探测，但代价可忽略）。中间情形（只有 reminder）：4 query → 3 query。

### 3. tick 入口保持静默

`agent/agent-worker.ts` 当前 `if (moved > 0) console.log(...)` 已是仅在有工作时打日志，无需改动。idle 状态本就静默，本次确认即可。


## Files Modified

| 文件 | 改动 |
|---|---|
| `agent/agent-worker.ts` | `SCHEDULER_TICK_MS=5_000`、`SCHEDULER_JITTER_MS=1_000` |
| `agent/scheduler-tick.ts` | `schedulerTick` 顶部加两个并行 `findFirst` 探测，按结果分支调用对应的 fireDue + scheduleNearTerm |
| `tests/agent/scheduler-tick.test.ts` | 新增两条测试：① 两表均空时不调用任何 `findMany`/`updateMany` ② 仅 reminder 有任务时不调用 ScheduledJob 相关查询 |

无 schema、无 migration、无 UI、无 API、无 docker-compose 改动。已确认 `Reminder` 有 `(status, dueAt)` 索引、`ScheduledJob` 有 `(enabled, nextRunAt)` 索引，`findFirst` 直接命中。

## Trade-offs

**收益**

- idle 状态下 DB 查询：4 个 `findMany` → 2 个 `findFirst LIMIT 1`，工作量降一个量级
- tick 间隔 3s → 5s，idle wake-up 频率减半
- 总实施成本 ≈ 40 行代码 + 2 条测试

**代价**

- 短期 reminder polling 偏差从 ≤ 5s 放宽到 ≤ 6s（仍优于上线前的 ≤ 12s；且接近 due 的任务走 setTimeout 精度路径，实际偏差为百毫秒级）
- 顶层探测引入 2 个轻 query；当两类资源都活跃时 query 数从 4 → 6（活跃场景下 2 次 LIMIT 1 探测的成本仍可忽略）

**预期外的发现**

prep 时确认 `agent-worker.ts:45` 已经是 `if (moved > 0) console.log(...)`——idle 状态**本来就不打 tick 心跳日志**。原始诉求里"日志干净"那部分已经满足，本次主要收益落在 DB 工作量。

## 风险与回退

- 改动范围只限 `schedulerTick` 编排函数 + 两个常量，回退仅需 git revert 一个 commit
- `findFirst` 与 `findMany` 走同一个索引，不引入新的查询模式
- 测试集成在已有 `tests/agent/scheduler-tick.test.ts`，CI 自动覆盖

## Verification

1. `npx tsc --noEmit` 通过。
2. `npm test` 全绿（原 37 + 新增 2 = 39 条）。
3. 集成验证：
   - 重启 worker 容器，`docker logs -f xoxo-meridian-agent-worker` 静默若干分钟（仅启动横幅 + 优雅退出日志）。
   - 通过聊天创建一个 8s 后的 reminder，观察从创建到 `EventLog` 中 `scheduler.reminder.fired` 记录的时间差应 ≤ 6s。
   - 创建一个 `*/1 * * * *` cron job，观察连续 3 分钟内 fire 时间偏差 ≤ 1min（实际期望百毫秒级，因为 setTimeout 精度路径仍在）。
   - 删除所有 reminder 与 ScheduledJob，观察 worker 日志再次回归静默。
4. DB explain：在 idle 状态对 `Reminder` 与 `ScheduledJob` 各运行一次 `EXPLAIN`，确认 `findFirst` 命中索引（非 seq scan）。

## Out of Scope

- LISTEN/NOTIFY 事件驱动改造
- 跨进程 leader election / advisory lock
- ScheduledJob "近 2min 精度路径"复用 reminder 的 setTimeout 模式（已在上一轮交付）
- agent debug 文件日志（已在上一轮交付）
