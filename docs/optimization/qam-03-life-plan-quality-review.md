# QAM-03 双人生活信息与计划管理工程质量审查

## 元数据

| 项目 | 内容 |
| --- | --- |
| QAM | QAM-03 双人生活信息与计划管理 |
| 快照日期 | 2026-09-10 |
| 审查 Skill | [`xoxo-qam-03-life-plan-review`](../../.agents/skills/xoxo-qam-03-life-plan-review/SKILL.md) |
| 标准版本 | [`module-quality-review-standard.md`](./module-quality-review-standard.md) v1.0.0 |
| 范围来源 | [`PROJECT_VIEW.md`](../../PROJECT_VIEW.md) 的 QAM-03、Cross-cutting Concerns、共享映射、BU-03/BU-04 与 Quality Tracking Index；[`AGENTS.md`](../../AGENTS.md) |
| 本轮 Delta | `+12`（QAM-03-002 resolved；69→81） |
| 当前基线命令 | `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full`：单次退出 0；TypeScript、ESLint、60 文件/360 项 Vitest、Next.js 生产构建、覆盖率、18 文件/48 项真实 PostgreSQL 与 11/11 Playwright 通过 |
| 风险匹配命令 | 定向 `tests/integration/scheduled-job-active-cap.integration.test.ts`：去掉 Room 行锁的负向对照为 0/2（Route/Agent create 和 re-enable 均为 `success/success`），恢复锁后扩展为 3/3；全量 PostgreSQL 为 18 文件/48 项通过，包含 QAM-04 Scheduler 原子派生回归 |
| 证据纪律 | E3 为本轮实际执行的测试/可复现实验；E2 为源码、schema、迁移与测试交叉证据；未把 mock 结果写成真实 PostgreSQL 或浏览器验证 |

## Overall

| 指标 | 结果 |
| --- | --- |
| Score | **81 / 100** |
| Score Level | **L3** |
| Gate Level | **L2** |
| Final Level | **L2** |
| Trend | `+12`（QAM-03-002 resolved） |
| Evidence Confidence | 中高（active cap 已有 Route/Agent 真实 PostgreSQL 并发 E3 和完整门禁；one-shot 编辑与第二位参与者语义仍缺风险匹配高层证据） |

房间 ScheduledJob active cap 现已有单一 QAM-03 authoring 边界：Route 与 Agent 的 create/re-enable 均在同一事务内锁定 Room、重算 active count 并写入，且真实 PostgreSQL 并发回归证明 30 条上限不可绕过。一次性任务编辑的 `fireAt` 契约丢失与参与者数组位置推断仍是两项独立 P1，本轮未扩大修改范围。

## Score Breakdown

| 维度 | Score | Max | Finding / Evidence |
| --- | ---: | ---: | --- |
| 架构与责任边界 | 10 | 14 | `lib/scheduled-job-authoring.ts` 现拥有 cap 常量、领域错误与原子写入边界，Route/Tool 不再各自实现数量规则（E2/E3）；cron/fireAt 仍由 Route 直接依赖 `agent/tools`，BU-03 未完全消除。 |
| 代码结构与复杂度 | 8 | 10 | CRUD、cron、天气和客户端交互均可定位；主要复杂度来自 Route/Tool 平行分支，而非业务本身（E2）。 |
| 抽象与复用 | 7 | 8 | 30 条 active cap 、Room 锁、capacity error 和 create/re-enable 判定由一个 service 复用；cron/fireAt 规则仍未完全同源（E2）。 |
| 数据流与状态一致性 | 10 | 12 | Memo/Job 以 `roomId` 持久化；active count 与 create/re-enable 现在同一 PostgreSQL transaction 内提交，负向对照和修复后并发 E3 证明上限不可绕过。one-shot PATCH 仍丢弃 `fireAt`。 |
| 接口与依赖关系 | 8 | 10 | Route 和 Agent Tool 现通过相同领域错误表达 cap 冲突，Route 稳定映射为 409；UI `fireAt` PATCH payload 与 schema 不一致的 QAM-03-001 仍开放。 |
| 健壮性、并发与生命周期 | 11 | 14 | Room 行锁为全部 authoring 入口提供稳定串行化事实源，create/re-enable 在 29→30 竞争中恰一成功，满额时已启用 Job 仍可编辑（E3）；天气 timeout/cache/fallback 保持。 |
| 性能与资源使用 | 7 | 8 | Memo/Job 查询有 room/index 和数量限制，天气 cache 限制 500 条并淘汰旧项；`who=both` 顺序请求天气是局部延迟成本（E2）。 |
| 安全与隐私 | 9 | 10 | 生活 Route 统一认证、成员校验和 roomId 归属检查；Memo/Job Tool 也检查资源所属房间，天气只读取房间参与者档案（E2）。 |
| 可测试性与验证可信度 | 6 | 8 | 新增真实 PostgreSQL Route/Agent 混合回归，覆盖 create、re-enable、稳定 409/Tool conflict、无孤儿 Job 与已启用编辑，并有无锁 0/2 负向对照（E3）；one-shot 与参与者语义仍缺高层回归。 |
| 可维护性、演进与技术债 | 5 | 6 | 入口、数据模型和 helper 可导航，但新增规则需同步 UI、Route、Tool 多处，已有字段漂移已造成一次性编辑缺陷（QAM-03-001，E2）。 |
| **合计** | **81** | **100** | 算术精确合计。 |

## Level Gate

| 门禁 | 结果 | 证据与原因 |
| --- | --- | --- |
| 开放 P0 | 通过 | 未发现权限突破、不可恢复数据损坏、重复高风险副作用或支持启动路径整体失效。 |
| 开放 P1 且涉及权限、不可恢复错误、并发重复副作用或持续故障 | 通过 | 触发 L1 上限的 QAM-03-002 已 resolved；剩余 QAM-03-001/003 可被后续编辑或显式对象输入纠正，当前证据不支持权限绕过、不可恢复错误或并发重复副作用。 |
| 最高风险不变量有风险匹配行为验证 | 部分通过 | active cap 已有真实 PostgreSQL 并发 E3；one-shot 编辑与第二位参与者语义仍缺 Route/浏览器风险匹配验证，Gate 不高于 L2。 |
| L4 要求 | 未通过 | 仍有两项开放 P1，且它们的关键错误路径没有 E3 高层证据。 |
| **最终判定** | **L2** | Score Level=L3；Gate Level=L2；Final Level=min(L3,L2)=L2。 |

## Critical Issues

### P0

当前无开放项。

### P1 — QAM-03-001：一次性任务编辑的 `fireAt` 被 PATCH 契约静默丢弃

- **问题**：`ScheduledJobModal` 在一次性模式编辑时发送 `fireAt`（[`LifePanelModals.tsx:163-185`](../../components/chat/LifePanelModals.tsx#L163)），但 [`scheduledJobPatchSchema`](../../lib/validation.ts#L84) 没有该字段；Zod 默认剥离未知字段。本轮执行 `node --import tsx -e '...scheduledJobPatchSchema.parse({fireAt:...,prompt:...,timezone:...})'` 的结果为 `{ timezone: "Asia/Shanghai", prompt: "x" }`（E3）。PATCH 仅在 cron/timezone/重启用时重算 `nextRunAt`，并且写入 data 不含 `fireAt`（[`route.ts:83-140`](../../app/api/rooms/%5BroomId%5D/scheduled-jobs/%5BjobId%5D/route.ts#L83)）。
- **质量影响**：用户在已有一次性任务中修改执行时间，界面请求成功但持久化时间保持旧值，造成可见计划定义与实际触发时间不一致；该错误还使 UI 与 Agent 的一次性计划修改语义分叉。
- **最小修正**：在同一 ScheduledJob authoring contract 中补齐一次性 `fireAt` 的解析和 `nextRunAt` 计算，并让 Route 与 UI 共用；若保留当前 UI 编辑能力，不能只依赖未知字段剥离。不要扩大为新的计划类型。
- **验收证据**：Route 行为测试提交一次性 PATCH 后断言 `nextRunAt` 等于合法 `fireAt`、cron 可回读且 prompt 未丢失；组件测试断言编辑后发送的 ISO 时间与所选时区语义一致。涉及日期/时区时补充真实 PostgreSQL 持久化检查；调度触发执行仍由 QAM-04 验收。
- **影响范围**：QAM-03 直接受影响；QAM-04 读取错误的 `nextRunAt` 后可能在错误时刻触发，属于关联影响而非 QAM-04 的 CAS 根因。

### P1 — QAM-03-003：UI 与 Agent 以参与者数组位置推断本人/伙伴

- **问题**：[`ChatApp.tsx:59-60`](../../components/chat/ChatApp.tsx#L59) 只把按 `joinedAt` 排序的 participants 传给 LifePanel；LifePanel 直接以 `[0]`/`[1]` 命名 self/partner（[`LifePanel.tsx:91-92`](../../components/chat/LifePanel.tsx#L91)），计划默认时区也取第一个参与者（[`TimezoneSelector.tsx:56-61`](../../components/chat/TimezoneSelector.tsx#L56)）。Agent context 同样按 `joinedAt` 排序（[`context-builder.ts:9-16`](../../agent/context-builder.ts#L9)），Weather Tool 默认取 `[1]`（[`weather-tool.ts:126-134`](../../agent/tools/weather-tool.ts#L126)），没有使用 `requestedById`。本轮以 requester=`u2`、participants=`u1(Shanghai),u2(London)` 执行 `weather.get` mock，输出 city=`London`，即把本人城市当成伙伴城市（E3）；而 Weather Route 按当前用户 ID 查找 self/partner（[`weather/route.ts:32-50`](../../app/api/rooms/%5BroomId%5D/weather/route.ts#L32)）。
- **质量影响**：正常的第二位房间成员会看到错误的 Agent 天气目标和错误的计划默认时区；UI Weather 与 Agent Weather 对同一房间请求给出不同对象，时区建议/计划 authoring 也会发生隐式偏移。
- **最小修正**：将当前用户 ID 作为 LifePanel/计划 modal 的显式输入，按 ID 找 counterpart；Agent Tool 默认值按 `requestedById` 查找本人和另一参与者，保留显式 city/timezone 输入优先级。不要依赖数组顺序作为身份协议。
- **验收证据**：组件行为测试使用当前用户为第二位参与者并断言默认时区/天气请求目标；Agent 单元测试用 requester 为第二位断言默认城市为另一人；Route/Tool 对同一双人资料的 self/partner 结果需一致。
- **影响范围**：QAM-03 直接受影响；QAM-01 只负责身份/profile 来源，QAM-02 只负责成员资格和 snapshot transport，均不承担本问题的对象解析。

### P2

当前无开放项；未覆盖的 Route、并发和浏览器验证作为评分/门禁证据缺口记录，不另登记为没有直接代码机制的问题。

### Resolved — QAM-03-002：计划数量上限非原子且跨入口不一致

- **状态**：`resolved`。
- **修正**：[`scheduled-job-authoring.ts`](../../lib/scheduled-job-authoring.ts) 将 30 条 cap、Room `FOR UPDATE` 锁、active count、create 以及 disabled→enabled 判定收敛为单一事务服务。Route POST/PATCH 显式开启 Prisma interactive transaction，Agent `schedule.create/update` 复用 Tool Registry 已有的副作用事务；Agent update 不再可绕过 cap。
- **验收证据**：[`scheduled-job-active-cap.integration.test.ts`](../../tests/integration/scheduled-job-active-cap.integration.test.ts) 在真实 PostgreSQL 中对 enabled INSERT/UPDATE 注入延迟。去掉 Room 行锁的负向对照 0/2，Route/Agent create 与 re-enable 都同时成功；恢复锁后 3/3，两类竞争均恰一成功/恰一冲突、active count=30、无孤儿 Job，已启用 Job 在满额时仍可由 Route/Agent 编辑（E3）。全量 PostgreSQL 18 文件/48 项及 `check:full` 通过，QAM-04 Scheduler 回归未变。
- **影响范围**：QAM-03 直接受影响；QAM-04 只获得受 cap 保护的扫描输入，触发 CAS/派生未改；QAM-08 只复用现有 Tool 事务边界。

## Architecture and Data Flow

```text
当前用户
  ├─ ChatApp(initial RoomSnapshot)
  │    └─ LifePanel / Modal ──HTTP──> Memo/Job/Weather Routes ──> Prisma / weather adapter
  └─ AgentTask Runtime
       └─ buildAgentContext ──> memo/schedule/timezone/weather Tool ──> Prisma / weather adapter

ScheduledJob definition (QAM-03) ──> scheduler-tick CAS/dispatch (QAM-04)
Tool registration/deadline/retry/approval (QAM-08) 包裹生活 Tool，但不拥有生活规则。
```

事实源是 Prisma `Memo` 与 `ScheduledJob`；RoomSnapshot、Agent context 和客户端 modal 是派生视图/输入。Route 在入口处认证并 `assertRoomAccess`，资源 Route 和生活 Tool 再校验目标记录的 `roomId`；天气使用进程内 location/weather TTL cache，并在 QWeather 失败时返回标识为 mock 的降级结果。ScheduledJob create/re-enable 经 QAM-03 authoring service 进入 Room 行锁串行化的 count-and-write；Route 自己开启 transaction，Agent Tool 使用 QAM-08 Executor 已有 transaction。剩余主要失败路径是一次性编辑在 Zod 解析阶段丢字段，以及参与者身份在 UI/Tool 以排序位置而非用户 ID 解析。ScheduledJob 到期 claim、任务派生和触发失败计数留给 QAM-04；Tool deadline、retry、审批和 trace 留给 QAM-08。

## Verified Strengths

- Memo、ScheduledJob、Weather Route 都先调用 `requireCurrentUser` 与 `assertRoomAccess`；Memo/Job 单记录 Route 和对应 Agent Tool 都再次核对 `roomId`，形成房间隔离的双重边界（E2）。
- ScheduledJob active cap 已由共享 service 统一应用于 Route POST/PATCH 和 Agent create/update；真实 PostgreSQL 延迟触发器将原竞争窗口稳定放大，修复后证明 30 条上限、冲突语义和非 re-enable 编辑行为（E3）。
- Memo 输入、计划 body 和 Agent Tool 输入均有 Zod/运行时契约；cron-parser 按 IANA timezone 解析，`fireAt` 有五分钟宽限并强制 one-shot（E2；相关 Tool 正常/边界测试 E3）。
- Weather adapter 有 QWeather location/weather cache、500 条上限、8 秒无外部 signal 时 timeout；Agent signal 会传播，fallback 明确返回 `provider=mock` 和 `fallbackReason`（E2/E3）。
- LifePanel 的天气刷新在切房间时取消旧请求并清除 interval，且只接受当前 roomId 的结果；对应组件测试通过（E3）。
- QAM-04 的 Scheduler 已有独立 CAS/事务集成证据，本报告不把 scheduler 的触发执行问题重复登记为 QAM-03；QAM-08 的 Tool Executor/审批也不作为本模块缺陷。

## Recommended Improvements

1. **修复 QAM-03-001（P1）**：统一 one-shot PATCH contract 与 fireAt/nextRunAt 计算，补 Route + 组件的可观察行为测试。
2. **修复 QAM-03-003（P1）**：把 current user ID 贯穿 LifePanel 和 Agent 默认对象解析，补第二位参与者的组件/Agent/Route 一致性测试。

以上均为既有 Memo/计划/天气边界的最小修正，不新增生活实体或产品能力。

## Sustainable Review Record

### 问题登记

| ID | Priority | 状态 | 首次发现 | 直接责任 | 关联责任 |
| --- | --- | --- | --- | --- | --- |
| QAM-03-001 | P1 | `open` | 2026-09-06 | QAM-03 UI/Job authoring/Route contract | QAM-04 触发时间输入 |
| QAM-03-002 | P1 | `resolved` | 2026-09-06 | QAM-03 Job authoring boundary | QAM-04 扫描输入；QAM-08 schedule Tool 入口 |
| QAM-03-003 | P1 | `open` | 2026-09-06 | QAM-03 UI/Tool participant resolution | QAM-01 profile source、QAM-02 snapshot transport |

### 复审触发条件

- 修改 Memo/ScheduledJob/Weather Route、LifePanel modal、`schedule-tool`/`weather-tool`/`timezone-tool` 或相关 validation/schema。
- QAM-04 修改 ScheduledJob trigger fields、timer/CAS，或 QAM-08 修改生活 Tool contract/执行边界。
- 新增真实 PostgreSQL 并发 cap、one-shot fireAt 和双人第二参与者浏览器旅程证据，或 Playwright 环境恢复后重跑生活旅程。

### 只追加评分历史

| 日期 | Score | Score Level | Gate | Final | Delta | 变更证据 |
| --- | ---: | --- | --- | --- | --- | --- |
| 2026-09-06 | 69 | L1 | L1 | L1 | `baseline` | 初审；定向 Agent/组件测试通过，`npm run check:quick` 通过；`npm run check:full` 的构建/真实 PostgreSQL 集成通过，Playwright 因 `libnspr4.so` 缺失未完成。 |
| 2026-09-10 | 81 | L3 | L2 | L2 | +12（QAM-03-002 resolved） | ScheduledJob authoring service 以 Room 行锁和单 transaction 统一 Route/Agent create/re-enable；真实 PostgreSQL 负向对照 0/2（无锁时均 `success/success`），修复后 3/3（恰一成功/冲突、active=30、无孤儿且 active edit 可用）；`check:full` 通过 18 文件/48 项 PostgreSQL 和 11/11 Playwright。QAM-03-001/003 仍开放，Gate/Final 为 L2。 |

复审时保留上述 ID 和历史行；仅在当前代码或风险匹配证据变化时重算受影响维度，并重新核对 100 分合计、Gate 与 Final。
