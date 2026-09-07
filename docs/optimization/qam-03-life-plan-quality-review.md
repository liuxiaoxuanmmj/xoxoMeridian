# QAM-03 双人生活信息与计划管理工程质量审查

## 元数据

| 项目 | 内容 |
| --- | --- |
| QAM | QAM-03 双人生活信息与计划管理 |
| 快照日期 | 2026-09-06 |
| 审查 Skill | [`xoxo-qam-03-life-plan-review`](../../.agents/skills/xoxo-qam-03-life-plan-review/SKILL.md) |
| 标准版本 | [`module-quality-review-standard.md`](./module-quality-review-standard.md) v1.0.0 |
| 范围来源 | [`PROJECT_VIEW.md`](../../PROJECT_VIEW.md) 的 QAM-03、Cross-cutting Concerns、共享映射、BU-03/BU-04 与 Quality Tracking Index；[`AGENTS.md`](../../AGENTS.md) |
| 本轮 Delta | `baseline`（初审） |
| 当前基线命令 | `npm run check:quick`：通过；TypeScript、ESLint、58 个文件/344 项 Vitest 通过 |
| 风险匹配命令 | `npm run test:unit -- tests/agent/schedule-tool.test.ts tests/agent/weather-tool.test.ts`：2 文件/22 项通过；`npm run test:component -- tests/component/life-panel-modals.test.tsx tests/component/life-panel-weather.test.tsx`：2 文件/3 项通过；`npm run check:full` 的 check、集成测试（7 文件/17 项）通过，Playwright 8 项因运行环境缺少 `libnspr4.so` 失败 |
| 证据纪律 | E3 为本轮实际执行的测试/可复现实验；E2 为源码、schema、迁移与测试交叉证据；未把 mock 结果写成真实 PostgreSQL 或浏览器验证 |

## Overall

| 指标 | 结果 |
| --- | --- |
| Score | **69 / 100** |
| Score Level | **L1** |
| Gate Level | **L1** |
| Final Level | **L1** |
| Trend | `baseline` |
| Evidence Confidence | 中等（授权与主要适配器有 E2/E3 支撑；QAM-03 Route、并发上限和关键浏览器旅程缺少有效 E3） |

当前结构具备清楚的房间授权入口、输入校验、cron 解析及天气缓存/降级控制，但生活规则在 Route、Agent Tool 和 UI 之间没有统一领域边界。一次性任务编辑存在已确认的请求契约丢字段；计划数量上限既非原子也未在 Agent 重启用路径统一执行。参与者按数组位置推断本人/伙伴，使第二位成员的天气与默认时区语义偏移。

## Score Breakdown

| 维度 | Score | Max | Finding / Evidence |
| --- | ---: | ---: | --- |
| 架构与责任边界 | 9 | 14 | Route 直接依赖 `agent/tools` 的规则与 helper，生活领域没有独立 service；BU-03 为 E2。QAM-04 的触发 CAS 与 QAM-08 的通用 Executor 已有边界，但 ScheduledJob 定义/触发状态仍共享。 |
| 代码结构与复杂度 | 8 | 10 | CRUD、cron、天气和客户端交互均可定位；主要复杂度来自 Route/Tool 平行分支，而非业务本身（E2）。 |
| 抽象与复用 | 5 | 8 | `MAX_JOBS_PER_ROOM`、cron/fireAt 规则由 Tool/Route 分别实现；天气 provider 通过共享函数复用，但没有统一生活写入服务（E2）。 |
| 数据流与状态一致性 | 8 | 12 | Memo/Job 以 `roomId` 持久化，snapshot 对启用 Job 有明确读取；一次性 PATCH 丢弃 `fireAt`，且 Job 上限检查与写入分离（QAM-03-001/002，E3/E2）。 |
| 接口与依赖关系 | 7 | 10 | Route 均有稳定 JSON/error 入口和 Zod body 校验；UI PATCH payload 与 schema 不一致，Route/Tool 对计划语义也不完全同源（QAM-03-001，E3/E2）。 |
| 健壮性、并发与生命周期 | 7 | 14 | 天气请求有 8 秒 timeout、AbortSignal、TTL cache 与 fallback；客户端切房间有取消保护。计划 cap 是 check-then-write，未有 QAM-03 真实并发验证（QAM-03-002，E2）。 |
| 性能与资源使用 | 7 | 8 | Memo/Job 查询有 room/index 和数量限制，天气 cache 限制 500 条并淘汰旧项；`who=both` 顺序请求天气是局部延迟成本（E2）。 |
| 安全与隐私 | 9 | 10 | 生活 Route 统一认证、成员校验和 roomId 归属检查；Memo/Job Tool 也检查资源所属房间，天气只读取房间参与者档案（E2）。 |
| 可测试性与验证可信度 | 4 | 8 | Schedule/Weather Tool 和两个 LifePanel 组件有行为测试；无 Memo/ScheduledJob/Weather Route 测试，也没有 QAM-03 的真实并发上限或 Playwright 生活旅程；`check:full` 浏览器阶段受环境阻塞（E3/E2）。 |
| 可维护性、演进与技术债 | 5 | 6 | 入口、数据模型和 helper 可导航，但新增规则需同步 UI、Route、Tool 多处，已有字段漂移已造成一次性编辑缺陷（QAM-03-001，E2）。 |
| **合计** | **69** | **100** | 算术精确合计。 |

## Level Gate

| 门禁 | 结果 | 证据与原因 |
| --- | --- | --- |
| 开放 P0 | 通过 | 未发现权限突破、不可恢复数据损坏、重复高风险副作用或支持启动路径整体失效。 |
| 开放 P1 且涉及权限、不可恢复错误、并发重复副作用或持续故障 | 未通过 | QAM-03-002 是计划数量上限的非原子检查；并发请求可共同通过 count 后创建/重启用，属于并发一致性风险，Gate 不高于 L1。 |
| 最高风险不变量有风险匹配行为验证 | 未通过 | 计划 cap 并发、一次性编辑和 QAM-03 Route 均没有真实 PostgreSQL/浏览器行为验证；仅有 E2 结构证据与 Tool mock 测试，故即使没有 P1，Gate 也不高于 L2。 |
| L4 要求 | 未通过 | 存在开放 P1，且关键并发/生命周期路径没有 E3。 |
| **最终判定** | **L1** | Score Level=L1；Gate Level=L1；Final Level=min(L1,L1)=L1。 |

## Critical Issues

### P0

当前无开放项。

### P1 — QAM-03-001：一次性任务编辑的 `fireAt` 被 PATCH 契约静默丢弃

- **问题**：`ScheduledJobModal` 在一次性模式编辑时发送 `fireAt`（[`LifePanelModals.tsx:163-185`](../../components/chat/LifePanelModals.tsx#L163)），但 [`scheduledJobPatchSchema`](../../lib/validation.ts#L84) 没有该字段；Zod 默认剥离未知字段。本轮执行 `node --import tsx -e '...scheduledJobPatchSchema.parse({fireAt:...,prompt:...,timezone:...})'` 的结果为 `{ timezone: "Asia/Shanghai", prompt: "x" }`（E3）。PATCH 仅在 cron/timezone/重启用时重算 `nextRunAt`，并且写入 data 不含 `fireAt`（[`route.ts:83-140`](../../app/api/rooms/%5BroomId%5D/scheduled-jobs/%5BjobId%5D/route.ts#L83)）。
- **质量影响**：用户在已有一次性任务中修改执行时间，界面请求成功但持久化时间保持旧值，造成可见计划定义与实际触发时间不一致；该错误还使 UI 与 Agent 的一次性计划修改语义分叉。
- **最小修正**：在同一 ScheduledJob authoring contract 中补齐一次性 `fireAt` 的解析和 `nextRunAt` 计算，并让 Route 与 UI 共用；若保留当前 UI 编辑能力，不能只依赖未知字段剥离。不要扩大为新的计划类型。
- **验收证据**：Route 行为测试提交一次性 PATCH 后断言 `nextRunAt` 等于合法 `fireAt`、cron 可回读且 prompt 未丢失；组件测试断言编辑后发送的 ISO 时间与所选时区语义一致。涉及日期/时区时补充真实 PostgreSQL 持久化检查；调度触发执行仍由 QAM-04 验收。
- **影响范围**：QAM-03 直接受影响；QAM-04 读取错误的 `nextRunAt` 后可能在错误时刻触发，属于关联影响而非 QAM-04 的 CAS 根因。

### P1 — QAM-03-002：计划数量上限是非原子且跨入口不一致

- **问题**：Route POST 先 count 再 create（[`scheduled-jobs/route.ts:81-130`](../../app/api/rooms/%5BroomId%5D/scheduled-jobs/route.ts#L81)），Route PATCH 重启用先 count 再 update（[`scheduled-jobs/[jobId]/route.ts:85-139`](../../app/api/rooms/%5BroomId%5D/scheduled-jobs/%5BjobId%5D/route.ts#L85)）；Agent `schedule.create` 也采用 count 后 create（[`schedule-tool.ts:129-151`](../../agent/tools/schedule-tool.ts#L129)），而 `schedule.update` 直接把 Job 设为 `enabled: true`，没有 cap 检查（[`schedule-tool.ts:311-324`](../../agent/tools/schedule-tool.ts#L311)）。本轮没有真实 PostgreSQL 并发 cap 测试，故并发结果为 E2 结构性结论，而不是已执行的数据库行为断言。
- **质量影响**：两个成员同时创建/重启用时可共同观察到同一剩余名额并超过 `MAX_JOBS_PER_ROOM=30`；Agent 更新还能绕过 UI 的重启用检查。超限记录会进入 QAM-04 的扫描和 timer 队列，形成可持续的房间状态违规与负载放大。
- **最小修正**：抽出一个 QAM-03 计划写入边界，在事务内用数据库可序列化/锁定的 count-and-write 方案统一处理 create 与 re-enable；Agent 与 Route 都调用该边界。保留现有 30 条功能规则，不引入新配额模型。
- **验收证据**：真实 PostgreSQL 集成测试以 30 条 active Job 为边界并发执行至少两个 create/re-enable，断言最终 active 数不超过 30、失败请求稳定返回冲突且没有孤儿记录；补一条 UI/Agent 共享规则行为测试。QAM-04 只需验证超限修正后扫描输入仍符合预期。
- **影响范围**：QAM-03 直接受影响；QAM-04 受超限 Job 数量和扫描负载影响；QAM-08 仅关联 `schedule.update` Tool 入口，不重复登记通用 Executor/审批问题。

### P1 — QAM-03-003：UI 与 Agent 以参与者数组位置推断本人/伙伴

- **问题**：[`ChatApp.tsx:59-60`](../../components/chat/ChatApp.tsx#L59) 只把按 `joinedAt` 排序的 participants 传给 LifePanel；LifePanel 直接以 `[0]`/`[1]` 命名 self/partner（[`LifePanel.tsx:91-92`](../../components/chat/LifePanel.tsx#L91)），计划默认时区也取第一个参与者（[`TimezoneSelector.tsx:56-61`](../../components/chat/TimezoneSelector.tsx#L56)）。Agent context 同样按 `joinedAt` 排序（[`context-builder.ts:9-16`](../../agent/context-builder.ts#L9)），Weather Tool 默认取 `[1]`（[`weather-tool.ts:126-134`](../../agent/tools/weather-tool.ts#L126)），没有使用 `requestedById`。本轮以 requester=`u2`、participants=`u1(Shanghai),u2(London)` 执行 `weather.get` mock，输出 city=`London`，即把本人城市当成伙伴城市（E3）；而 Weather Route 按当前用户 ID 查找 self/partner（[`weather/route.ts:32-50`](../../app/api/rooms/%5BroomId%5D/weather/route.ts#L32)）。
- **质量影响**：正常的第二位房间成员会看到错误的 Agent 天气目标和错误的计划默认时区；UI Weather 与 Agent Weather 对同一房间请求给出不同对象，时区建议/计划 authoring 也会发生隐式偏移。
- **最小修正**：将当前用户 ID 作为 LifePanel/计划 modal 的显式输入，按 ID 找 counterpart；Agent Tool 默认值按 `requestedById` 查找本人和另一参与者，保留显式 city/timezone 输入优先级。不要依赖数组顺序作为身份协议。
- **验收证据**：组件行为测试使用当前用户为第二位参与者并断言默认时区/天气请求目标；Agent 单元测试用 requester 为第二位断言默认城市为另一人；Route/Tool 对同一双人资料的 self/partner 结果需一致。
- **影响范围**：QAM-03 直接受影响；QAM-01 只负责身份/profile 来源，QAM-02 只负责成员资格和 snapshot transport，均不承担本问题的对象解析。

### P2

当前无开放项；未覆盖的 Route、并发和浏览器验证作为评分/门禁证据缺口记录，不另登记为没有直接代码机制的问题。

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

事实源是 Prisma `Memo` 与 `ScheduledJob`；RoomSnapshot、Agent context 和客户端 modal 是派生视图/输入。Route 在入口处认证并 `assertRoomAccess`，资源 Route 和生活 Tool 再校验目标记录的 `roomId`；天气使用进程内 location/weather TTL cache，并在 QWeather 失败时返回标识为 mock 的降级结果。主要失败路径是：一次性编辑在 Zod 解析阶段丢字段；Job cap 在写入前没有同一原子边界；参与者身份在 UI/Tool 以排序位置而非用户 ID 解析。ScheduledJob 到期 claim、任务派生和触发失败计数留给 QAM-04；Tool deadline、retry、审批和 trace 留给 QAM-08。

## Verified Strengths

- Memo、ScheduledJob、Weather Route 都先调用 `requireCurrentUser` 与 `assertRoomAccess`；Memo/Job 单记录 Route 和对应 Agent Tool 都再次核对 `roomId`，形成房间隔离的双重边界（E2）。
- Memo 输入、计划 body 和 Agent Tool 输入均有 Zod/运行时契约；cron-parser 按 IANA timezone 解析，`fireAt` 有五分钟宽限并强制 one-shot（E2；相关 Tool 正常/边界测试 E3）。
- Weather adapter 有 QWeather location/weather cache、500 条上限、8 秒无外部 signal 时 timeout；Agent signal 会传播，fallback 明确返回 `provider=mock` 和 `fallbackReason`（E2/E3）。
- LifePanel 的天气刷新在切房间时取消旧请求并清除 interval，且只接受当前 roomId 的结果；对应组件测试通过（E3）。
- QAM-04 的 Scheduler 已有独立 CAS/事务集成证据，本报告不把 scheduler 的触发执行问题重复登记为 QAM-03；QAM-08 的 Tool Executor/审批也不作为本模块缺陷。

## Recommended Improvements

1. **先修 QAM-03-002（P1）**：建立共享、事务化的 Job active-cap 写入边界，并用真实 PostgreSQL 并发集成测试锁定 30 条上限。
2. **再修 QAM-03-001（P1）**：统一 one-shot PATCH contract 与 fireAt/nextRunAt 计算，补 Route + 组件的可观察行为测试。
3. **修复 QAM-03-003（P1）**：把 current user ID 贯穿 LifePanel 和 Agent 默认对象解析，补第二位参与者的组件/Agent/Route 一致性测试。

以上均为既有 Memo/计划/天气边界的最小修正，不新增生活实体或产品能力。

## Sustainable Review Record

### 当前开放问题

| ID | Priority | 状态 | 首次发现 | 直接责任 | 关联责任 |
| --- | --- | --- | --- | --- | --- |
| QAM-03-001 | P1 | `open` | 2026-09-06 | QAM-03 UI/Job authoring/Route contract | QAM-04 触发时间输入 |
| QAM-03-002 | P1 | `open` | 2026-09-06 | QAM-03 Job authoring boundary | QAM-04 扫描输入；QAM-08 schedule Tool 入口 |
| QAM-03-003 | P1 | `open` | 2026-09-06 | QAM-03 UI/Tool participant resolution | QAM-01 profile source、QAM-02 snapshot transport |

### 复审触发条件

- 修改 Memo/ScheduledJob/Weather Route、LifePanel modal、`schedule-tool`/`weather-tool`/`timezone-tool` 或相关 validation/schema。
- QAM-04 修改 ScheduledJob trigger fields、timer/CAS，或 QAM-08 修改生活 Tool contract/执行边界。
- 新增真实 PostgreSQL 并发 cap、one-shot fireAt 和双人第二参与者浏览器旅程证据，或 Playwright 环境恢复后重跑生活旅程。

### 只追加评分历史

| 日期 | Score | Score Level | Gate | Final | Delta | 变更证据 |
| --- | ---: | --- | --- | --- | --- | --- |
| 2026-09-06 | 69 | L1 | L1 | L1 | `baseline` | 初审；定向 Agent/组件测试通过，`npm run check:quick` 通过；`npm run check:full` 的构建/真实 PostgreSQL 集成通过，Playwright 因 `libnspr4.so` 缺失未完成。 |

复审时保留上述 ID 和历史行；仅在当前代码或风险匹配证据变化时重算受影响维度，并重新核对 100 分合计、Gate 与 Final。
