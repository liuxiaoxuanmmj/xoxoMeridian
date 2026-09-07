# QAM-07 专注学习与伙伴状态工程质量审查

## 元数据

| 项目 | 内容 |
| --- | --- |
| QAM | QAM-07 专注学习与伙伴状态 |
| 快照日期 | 2026-09-06 |
| 审查 Skill | [`xoxo-qam-07-study-review`](../../.agents/skills/xoxo-qam-07-study-review/SKILL.md) |
| 标准版本 | [`module-quality-review-standard.md`](./module-quality-review-standard.md) v1.0.0 |
| 范围来源 | [`PROJECT_VIEW.md`](../../PROJECT_VIEW.md) 的 QAM-07、Cross-cutting Concerns、共享映射、BU-02 与 Quality Tracking Index；[`AGENTS.md`](../../AGENTS.md) |
| 本轮 Delta | `baseline`（初审） |
| 当前基线命令 | `npm run check:quick`：本轮未重复执行；当前会话交接记录为通过（TypeScript、ESLint、58 个文件/344 项 Vitest） |
| 风险匹配命令 | `npm run test:unit -- tests/lib/study.test.ts tests/lib/study-productization.test.ts tests/server/study-api.test.ts tests/server/study-product-api.test.ts`：4 文件/24 项通过；`npm run test:unit -- tests/server/study-dashboard.test.ts tests/server/chat-left-rail-study-status.test.ts`：2 文件/11 项通过；`npm run test:component -- tests/component/study*.test.tsx`：无 QAM-07 component 测试文件，退出 1；`node --import tsx --input-type=module -e '…buildStudyStats…'`：America/New_York DST 回退实验复现 `streakDays: 3`（应为 2） |
| 证据纪律 | E3 为本轮实际执行的测试或可复现实验；E2 为源码、schema、迁移与测试交叉证据；未把 Prisma mock、静态渲染或单元 helper 结果写成真实 PostgreSQL 并发、事务或浏览器生命周期证据 |
| 工作区说明 | 审查前已有 AGENTS/Harness、PROJECT_VIEW、共享标准及其他 QAM 报告未提交改动；本报告未将其作为业务基线改动，且只新增本文件 |

## Overall

| 指标 | 结果 |
| --- | --- |
| Score | **62 / 100** |
| Score Level | **L1** |
| Gate Level | **L1** |
| Final Level | **L1** |
| Trend | `baseline` |
| Evidence Confidence | 中等（正常状态、Goal ownership、统计 helper 和静态 Dashboard 有 E3；并发 stop/状态恢复、真实 PostgreSQL 事务、DST 页面聚合和浏览器 timer 生命周期没有风险匹配 E3） |
| 当前开放问题 | 4 项（P1×2、P2×2） |

Study 具备认证、输入校验、单用户 FocusState 唯一键、正常 start/pause/resume/stop 路由和时区统计 helper，伙伴 presence 也有固定 heartbeat/超时投影。可是状态转移和 stop 完成记录没有数据库线性化或幂等边界，浏览器关闭会留下过期 running 状态；DST 回退和 Goal 并发顺序也有可定位的事实偏差。最高风险路径缺少真实 PostgreSQL 并发/生命周期验证，开放 P1 将最终等级限制为 L1。

## Score Breakdown

| 维度 | Score | Max | Finding / Evidence |
| --- | ---: | ---: | --- |
| 架构与责任边界 | 9 | 14 | Study Route、`lib/study.ts` 与 Study UI 可导航，Focus/Goal 责任基本集中；但 `lib/study.ts` 反向调用 Room snapshot，而 snapshot 又 import `normalizeFocusStatus`，并在一个页面重复装配 Study 与 Chat 读模型（[`lib/study.ts`](../../lib/study.ts#L1-L3)、[`lib/study.ts`](../../lib/study.ts#L164-L303)、[`lib/room-snapshot.ts`](../../lib/room-snapshot.ts#L1-L5)）（E2）。 |
| 代码结构与复杂度 | 8 | 10 | 单个状态 Route 的控制流短且错误响应统一；停止计算、状态读取/写入和 UI 四套操作边界未收敛，复杂度主要来自失败交错而非计时模式数量（[`start`](../../app/api/study/start/route.ts#L12-L66)、[`stop`](../../app/api/study/stop/route.ts#L12-L93)）（E2）。 |
| 抽象与复用 | 5 | 8 | `serializeFocusState`、`normalizeFocusStatus`、`getLocalDateKey` 和 `buildStudyStats` 提供有效共享；状态转移没有共享领域服务，DST 日期运算和页面/Room snapshot projection 仍各自维护（[`lib/study.ts`](../../lib/study.ts#L47-L164)）（E2）。 |
| 数据流与状态一致性 | 6 | 12 | FocusState 的状态、剩余秒数和 expected end 在正常路径可回读；stop 先建 completed Session、再独立更新 idle，过期状态没有 durable settlement，Goal sortOrder 也不是稳定事实（QAM-07-001/002/004，E2）。 |
| 接口与依赖关系 | 7 | 10 | 主要 Route 先认证、成员查找并使用 Zod，Goal PATCH/DELETE 明确按 userId ownership；Study payload 以类型断言接入完整 RoomSnapshot，Study 与 Chat 的 snapshot contract 形成循环依赖（[`validation.ts`](../../lib/validation.ts#L116-L136)、[`goals/[goalId]/route.ts`](../../app/api/study/goals/%5BgoalId%5D/route.ts#L6-L35)、[`lib/study.ts`](../../lib/study.ts#L276-L302)）（E2）。 |
| 健壮性、并发与生命周期 | 5 | 14 | 同一标签页 `busyRef` 可减少重复点击，interval 有 cleanup；服务端没有条件状态更新、stop 事务/幂等，多个标签页可重复写 Session，页面卸载后也没有完成结算（QAM-07-001/002，E2；相关正常测试 E3）。 |
| 性能与资源使用 | 6 | 8 | Study 查询有近期 Session 上限，FocusState/Session/Goal 有用户、房间和时间索引；但页面先执行 6 路 Study 查询，再执行成员 Session 查询和 Room snapshot（后者还含 Room list），重复读取 FocusState/participants 会放大请求成本（[`lib/study.ts`](../../lib/study.ts#L177-L246)、[`lib/room-snapshot.ts`](../../lib/room-snapshot.ts#L5-L99)、[`lib/room-list.ts`](../../lib/room-list.ts#L15-L30)）（E2）。 |
| 安全与隐私 | 8 | 10 | Study 入口统一 `requireCurrentUser`，Goal 资源按 userId 检查，FocusState 以 userId 唯一；Room snapshot 的 FocusState 查询仅按参与者 userId 而未带 roomId，若用户加入多个房间，可能把另一房间的专注状态投影到当前房间，该共享边界由 QAM-02 snapshot 负责复核（[`lib/room-snapshot.ts`](../../lib/room-snapshot.ts#L84-L121)、[`prisma/schema.prisma`](../../prisma/schema.prisma#L559-L580)）（E2，关联观察不另记 QAM-07 问题）。 |
| 可测试性与验证可信度 | 4 | 8 | 本轮 Node 定向测试 6 文件/35 项通过，覆盖正常 API、统计、ownership 和静态呈现；没有真实 PostgreSQL 并发 stop/事务回滚、Goal 顺序、DST 页面聚合或 Playwright timer/presence 生命周期测试，且没有 Study 专用 component 测试（E3/E2）。 |
| 可维护性、演进与技术债 | 4 | 6 | 计时状态字段和迁移可追踪，UI 操作也有局部落点；迁移遗留的 `currentSessionKey` 未被 start/stop 使用，Study↔snapshot 循环和重复 projection 使状态字段变化需要同步多个 QAM 边界（[`prisma/migrations/20260629120000_add_study_room_models/migration.sql`](../../prisma/migrations/20260629120000_add_study_room_models/migration.sql#L15-L24)、[`app/api/study/start/route.ts`](../../app/api/study/start/route.ts#L31-L58)）（E2）。 |
| **合计** | **62** | **100** | 算术核对：9+8+5+6+7+5+6+8+4+4 = 62。 |

## Level Gate

| 门禁 | 结果 | 证据与原因 |
| --- | --- | --- |
| 开放 P0 | 通过 | 未发现权限突破、不可恢复数据库损坏、重复高风险外部副作用或支持启动路径整体不可用。 |
| 开放 P1 且涉及权限、不可恢复错误、并发重复副作用或持续故障 | 未通过 | QAM-07-001 的并发 stop 可创建多个 completed FocusSession 或把已完成事实与 paused 状态交错；QAM-07-002 在浏览器离开后可留下过期 running 状态并阻塞下一次 start，均使 Gate 不高于 L1（E2）。 |
| 最高风险不变量有风险匹配行为验证 | 未通过 | 现有测试使用 Prisma mock，未覆盖真实 PostgreSQL 的 stop 交错、事务回滚/幂等、过期结算或 Goal sortOrder；DST 仅有 helper 的可复现实验，页面成员聚合未验证，故该条件也不高于 L2。 |
| L4 要求 | 未通过 | 存在开放 P1，且状态并发、完成恢复和客户端生命周期没有完整 E3。 |
| **最终判定** | **L1** | Score Level=L1；Gate Level=L1；Final Level=min(L1,L1)=L1。 |

## Critical Issues

### P0

当前无开放项。

### P1

#### QAM-07-001：Focus 状态转移与 stop 完成记录不是原子或幂等的

- **状态**：`open`
- **问题**：`start` 先按 `userId` 读取 FocusState，再在没有条件状态版本的情况下 `upsert`；`pause`、`resume`、`stop` 都是先 `findUnique`，再以只有 `userId` 的 `update` 写回。`stop` 更先 `focusSession.create`，成功后才 `focusState.update` 为 idle，两个写入不在同一事务。`FocusState.currentSessionKey` 虽在初始迁移和 schema 中存在，却没有被 start/stop 设置、校验或用于去重（[`start/route.ts`](../../app/api/study/start/route.ts#L12-L66)、[`pause/route.ts`](../../app/api/study/pause/route.ts#L10-L50)、[`resume/route.ts`](../../app/api/study/resume/route.ts#L10-L49)、[`stop/route.ts`](../../app/api/study/stop/route.ts#L12-L93)、[`schema.prisma`](../../prisma/schema.prisma#L559-L580)）（E2）。
- **证据**：两个并发 stop 都可以在第一个 update 前读到同一 running 状态，各自创建一条 completed FocusSession；pause 与 stop 交错时，后到的无条件 update 还能把已写入 Session 的状态重新写成 paused。若 Session 已创建而 state update 失败，会留下完成记录和 running state；重试仍无 idempotency key。现有 [`study-product-api.test.ts`](../../tests/server/study-product-api.test.ts#L156-L213) 只 mock 单请求顺序，本轮没有真实 PostgreSQL 交错测试（E2/E3）。
- **质量影响**：重复点击、网络重放或多标签页会把一次专注计入多条完成记录，统计、近期记录和伙伴可见状态互相矛盾；部分失败还会使恢复路径无法判断 Session 是否已结算，错误从一个用户的按钮操作扩散到持久化事实。
- **最小修正**：将状态转移收敛到 Study service，在事务内用当前状态/`currentSessionKey` 条件完成 pause/resume/stop；stop 在同一事务内完成唯一 Session 结算和 FocusState idle，并让重复 stop 返回既有结算结果或稳定 409。保留现有三种模式和统计定义，不新增离线能力。
- **验收证据**：真实 PostgreSQL 并发两个 stop、pause+stop 和 stop 后注入 state update 失败，最终每个 session key 至多一条 completed Session，FocusState 与 Session 事实一致；旧 attempt 重试得到稳定结果。补 Route 行为测试和真实数据库集成测试，不能只断言 mock 调用。
- **影响范围**：QAM-07 直接受影响；QAM-02 的 Room snapshot 只消费 FocusState 投影，需在其 snapshot 回归中确认不会呈现已完成 Session 的旧状态，不重复登记 snapshot 事务责任。

#### QAM-07-002：完成结算只由挂载中的客户端 auto-stop 触发

- **状态**：`open`
- **问题**：服务端只保存 `expectedEndAt`，没有到期结算或恢复入口；FocusSession 仅在 `POST /api/study/stop` 中创建。客户端依靠 `StudyDashboard` 的 `useEffect` 在 `isRunning && remainingSeconds <= 0` 时调用 stop，页面关闭、网络失败、后台冻结或浏览器崩溃都会跳过该调用（[`StudyDashboard.tsx`](../../components/study/StudyDashboard.tsx#L241-L247)、[`StudyDashboard.tsx`](../../components/study/StudyDashboard.tsx#L278-L288)、[`stop/route.ts`](../../app/api/study/stop/route.ts#L32-L71)）（E2）。
- **证据**：`POST /api/study/start` 对 running/paused state 直接返回既有 state，不检查 `expectedEndAt` 是否已过期（[`start/route.ts`](../../app/api/study/start/route.ts#L16-L27)）；因此离开页面后 FocusState 可长期 running、没有对应 completed FocusSession，下一次 start 只会继续返回旧状态。现有 E2E 仅在同一页面点击 start 后立即 stop，未覆盖到期、刷新、关闭或网络失败（[`authenticated.spec.ts`](../../tests/e2e/authenticated.spec.ts#L24-L31)）（E2）。
- **质量影响**：一次正常完成但未留在页面的专注不会进入统计/近期记录，还会阻塞该用户重新开始计时；伙伴状态可能在 presence 超时后显示离线，但 FocusState 仍显示 running，事实与可见性脱节。
- **最小修正**：在现有 Study service 增加到期 state 的单事务 reconciliation，并由 GET/start/stop 等现有入口复用；对已结算 key 返回既有结果，确保再次访问不会重复 Session。若保留浏览器 auto-stop，它只作为及时 UI 路径，不再是唯一事实提交者；不引入通知或离线学习功能。
- **验收证据**：真实 PostgreSQL 中创建已过 `expectedEndAt` 的 running state，首次 Study GET/start 只生成一条 completed FocusSession 并返回 idle；重复请求、页面刷新和 stop 重放都不重复，统计和伙伴投影随之更新。浏览器测试需覆盖离开/刷新后的可观察恢复。
- **影响范围**：QAM-07 直接受影响；QAM-02 只关联 FocusState 在 Chat snapshot 中的过期显示，QAM-01 的 Session heartbeat 不负责学习计时结算。

### P2

#### QAM-07-003：时区统计在 DST 回退和本地午夜边界使用了不稳定的日期运算

- **状态**：`open`
- **问题**：伙伴“今日分钟”边界用当前时刻的 timezone offset 拼接当天 `00:00`；DST 切换当天，当前 offset 可能与当地午夜 offset 不同。连续天数则对绝对时间调用运行时本地时区的 `Date#setDate`，不是按目标 IANA timezone 的本地日历递减（[`lib/study.ts`](../../lib/study.ts#L47-L67)、[`lib/study.ts`](../../lib/study.ts#L105-L126)、[`lib/study.ts`](../../lib/study.ts#L170-L176)、[`lib/study.ts`](../../lib/study.ts#L239-L246)）（E2）。
- **证据**：本轮执行 `node --import tsx --input-type=module -e '…buildStudyStats…'`，以 `America/New_York`、now=`2026-11-02T04:30:00Z`、Nov 1 与 Oct 31 各一条 completed focus session，结果为 `{ todayCount: 1, weekCount: 1, streakDays: 3 }`；同一日期 Nov 1 被 fallback 的 24 小时步长重复计数，正确 streak 应为 2（E3）。现有 `tests/lib/study.test.ts` 只覆盖 Asia/Shanghai 普通周界，未覆盖 DST、跨午夜或页面成员分钟边界（[`study.test.ts`](../../tests/lib/study.test.ts#L7-L42)、[`study-productization.test.ts`](../../tests/lib/study-productization.test.ts#L36-L83)）。
- **质量影响**：少数 IANA timezone 的回退周会显示错误 streak，DST 午夜附近伙伴今日分钟也可能漏算/多算；该错误不会损坏 Session，但会使统计和伙伴聚合难以复核。
- **最小修正**：统一使用 timezone-aware 的本地日期 key 递减/范围计算，或先求目标本地午夜对应的正确 offset；不要依赖服务器运行时 timezone 的 `setDate`。保持现有“按 startedAt 本地日期、只统计 completed focus”的定义。
- **验收证据**：补 `America/New_York`、`Europe/London` 的 spring-forward/fall-back、跨午夜、周日周界测试，分别验证 streak、today/week 统计和成员 todayFocusMinutes；使用真实时间固定值的 helper/服务测试即可，若改变 SQL range 再补 PostgreSQL 读取证据。
- **影响范围**：QAM-07 直接受影响；QAM-01 只提供 profile timezone，不负责统计算法；QAM-02 仅消费成员 Study projection。

#### QAM-07-004：StudyGoal sortOrder 是非原子、跨房间计数且无稳定 tie-breaker

- **状态**：`open`
- **问题**：Goal POST 先按 `{ userId, localDate }` count，再把结果作为 `sortOrder` create，没有 `roomId` 条件；两个标签页可得到同一 count，多个房间还会互相污染当前房间的初始序号。GET 只按 `sortOrder asc`，数据库既无 `(userId, roomId, localDate, sortOrder)` 唯一约束，也没有第二排序键（[`goals/route.ts`](../../app/api/study/goals/route.ts#L7-L35)、[`lib/study.ts`](../../lib/study.ts#L190-L193)、[`schema.prisma`](../../prisma/schema.prisma#L604-L620)）（E2）。
- **证据**：同一浏览器的 `busyRef` 只保护当前组件，不能覆盖多标签页/重放；现有测试 mock `count` 返回 2 并断言一次 create，没有真实 PostgreSQL 并发或相同 sortOrder 的读取顺序测试（[`study-product-api.test.ts`](../../tests/server/study-product-api.test.ts#L220-L243)、[`StudyDashboard.tsx`](../../components/study/StudyDashboard.tsx#L364-L385)）（E2/E3）。Goal PATCH/DELETE 按 `userId` 检查，因此本问题不是跨用户 ownership 绕过。
- **质量影响**：同日新增清单在并发下可能出现并列且顺序不稳定，重载后项目位置抖动；多房间用户的序号会产生空洞。它不越过用户 ownership 边界，但增加用户可见顺序与持久值不一致的修改成本。
- **最小修正**：在现有 Goal 写入 service 中按 `userId + roomId + localDate` 事务化分配下一个序号，并让读取使用 `sortOrder` 加稳定 `id` tie-breaker；保留现有可编辑 `sortOrder` 和 Goal 数量/文本规则，不新增排序产品能力。
- **验收证据**：真实 PostgreSQL 并发创建同一用户/房间/本地日的 Goal，读取顺序稳定且每条只出现一次；多房间同日创建互不影响；PATCH/DELETE 仍只允许 owner。补 Route 行为和数据库并发测试。
- **影响范围**：QAM-07 直接受影响；QAM-02 不拥有 Goal 排序，QAM-01 仅提供用户 timezone/身份。

## Architecture and Data Flow

```text
当前用户 / profile.timezone
  ├─ Study page/API
  │    └─ getStudyRoomForUser → FocusState / StudyGoal / FocusSession / members
  │         └─ buildStudyStats(local timezone) + presence projection
  │
  ├─ POST start/pause/resume/stop
  │    └─ FocusState（单 user 唯一） ── stop ──> FocusSession（当前无原子/幂等键）
  │
  └─ StudyDashboard
       ├─ client countdown / auto-stop（仅挂载时）
       ├─ 15s presence heartbeat → FocusState.lastStudySeenAt
       └─ MiniRoomChat → useRoomChat(initial RoomSnapshot)
                              └─ RoomSnapshot 聚合 Chat/Life/Agent/Focus status
```

FocusState 是当前计时事实，FocusSession 是完成历史，StudyGoal 是用户/房间/本地日清单，`lastStudySeenAt` 是 Study 页面 presence 事实；它们的正常读取路径清楚，但 stop 的两阶段写入使三者可能不同步。Room snapshot 是共享派生读模型：`getStudyPageData()` 已直接查询 members/member FocusState 后再调用完整 snapshot，形成重复查询和 Study↔QAM-02 循环依赖。另有一个应由 QAM-02 负责的共享观察：snapshot 的 FocusState 查询按 participant userId 而未按 roomId 过滤，Study 不能把该责任重复登记，但后续跨房间 snapshot 复审必须覆盖。

## Verified Strengths

- 主要 Study Route 都先调用 `requireCurrentUser()`；Goal PATCH/DELETE 用 `{ id, userId }` 查找 owner，未发现跨用户 Goal 更新/删除路径（E2；ownership 行为测试 E3）。
- `FocusState.userId` 有数据库唯一键；start 对已有 running/paused state 返回既有状态，pause/resume 对非法状态返回 409，形成正常状态机的基础保护（E2/E3）。
- `serializeFocusState` 统一 ISO/null 字段，`buildStudyStats` 只计 completed focus，并按传入 IANA timezone 计算 today/week/streak；普通 Asia/Shanghai 统计、模式/状态过滤测试通过（E3）。
- Dashboard 的 countdown 使用 `expectedEndAt`/`remainingSeconds` 重新计算而非单纯递减本地计数，running interval 和 15 秒 presence interval 都在 effect cleanup 中清理；同一标签页 busy guard 也能抑制重复点击（E2）。
- Study page 的 Room 成员与 FocusState 直接按 roomId 聚合；Mini Room Chat 复用现有 `useRoomChat`，本报告不把 Chat/SSE 基础协议问题移入 QAM-07（E2）。

## Recommended Improvements

1. **先修 QAM-07-001（P1）**：建立带状态条件与 `currentSessionKey` 的事务化 transition service，补真实 PostgreSQL 并发 stop/pause、失败回滚和幂等测试。
2. **再修 QAM-07-002（P1）**：在现有 Study 读写入口增加过期状态 reconciliation，使浏览器 auto-stop 不再是唯一完成事实来源，并补刷新/重放生命周期测试。
3. **修复 QAM-07-003/004（P2）**：先补 DST 日期 helper 与页面成员统计边界，再将 Goal 序号分配限定到 room 并加入稳定 tie-breaker；两项都保持既有统计与清单定义。
4. **关联复审 BU-02**：由 QAM-02 owner 统一 Room snapshot 的 FocusState room scope/allow-list；QAM-07 只提供明确的 Focus projection contract，避免继续扩大循环依赖和重复查询。

以上均为既有 Focus/Session/Goal/presence 语义的最小修正，不新增通知、离线学习、计时模式或聊天能力。

## Sustainable Review Record

### 当前开放问题

| ID | Priority | 状态 | 首次发现 | 直接责任 | 关联责任 |
| --- | --- | --- | --- | --- | --- |
| QAM-07-001 | P1 | `open` | 2026-09-06 | Study transition/stop service 与 FocusState/Session 事务 | QAM-02 snapshot 状态投影 |
| QAM-07-002 | P1 | `open` | 2026-09-06 | Study 到期结算与 Dashboard 生命周期 | QAM-02 snapshot 过期状态显示 |
| QAM-07-003 | P2 | `open` | 2026-09-06 | Study timezone stats/member aggregation | QAM-01 profile timezone 来源 |
| QAM-07-004 | P2 | `open` | 2026-09-06 | StudyGoal 序号分配与读取排序 | QAM-01 用户身份；QAM-02 不拥有 Goal 排序 |

### 复审触发条件

- 修改 `app/api/study/*`、`lib/study.ts`、FocusState/FocusSession/StudyGoal schema/migration 或 StudyDashboard 的 timer/presence effect。
- 新增 transition service、`currentSessionKey`/Session 幂等约束、过期 state reconciliation，或对 stop/页面刷新/浏览器关闭行为增加真实 PostgreSQL/Playwright 证据。
- 修改 profile timezone contract、统计窗口、Goal sortOrder 或 Study 与 `lib/room-snapshot.ts` 的边界；同时复核 QAM-01 timezone ownership 与 QAM-02 snapshot scope，不把同一根因重复登记。
- 新增 DST spring/fall、跨午夜/周界、Goal 并发和多标签页行为测试，或 Playwright 环境恢复后重跑 Study 关键旅程。

### 验证记录

- 本轮实际执行：`npm run test:unit -- tests/lib/study.test.ts tests/lib/study-productization.test.ts tests/server/study-api.test.ts tests/server/study-product-api.test.ts`（4 文件/24 项通过）；`npm run test:unit -- tests/server/study-dashboard.test.ts tests/server/chat-left-rail-study-status.test.ts`（2 文件/11 项通过）。
- `npm run test:component -- tests/component/study*.test.tsx`：component 项目没有 Study 测试文件，原始结果为 `No test files found, exiting with code 1`；不视为代码失败，也不替代缺失的 component 行为证据。
- `node --import tsx --input-type=module -e '…buildStudyStats…'`：DST 回退实验复现 `streakDays: 3`；该命令只验证 helper 可复现实验，不是数据库或浏览器证据。
- 本轮未运行 `npm run check:quick`、`npm run check`、真实 PostgreSQL integration 或完整 Playwright E2E；交接文件记录的 quick 基线仍为通过。由于本轮只写审查报告，不运行 Compose smoke。

### 只追加评分历史

| 日期 | Score | Score Level | Gate | Final | Delta | 变更证据 |
| --- | ---: | --- | --- | --- | --- | --- |
| 2026-09-06 | 62 | L1 | L1 | L1 | `baseline` | 初审；Study 定向 Node 测试 6 文件/35 项通过，DST helper 实验复现回退日 streak 错误；Focus 并发/事务、过期结算、Goal 并发、DST 页面聚合和浏览器生命周期未验证。 |

复审时保留上述 ID 和历史行；仅在当前代码或风险匹配证据变化时重算受影响维度，并重新核对 100 分合计、Gate、Final 与问题状态。
