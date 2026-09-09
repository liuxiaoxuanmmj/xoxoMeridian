# QAM-07 专注学习与伙伴状态工程质量审查

## 元数据

| 项目 | 内容 |
| --- | --- |
| QAM | QAM-07 专注学习与伙伴状态 |
| 快照日期 | 2026-09-09 |
| 审查 Skill | [`xoxo-qam-07-study-review`](../../.agents/skills/xoxo-qam-07-study-review/SKILL.md) |
| 标准版本 | [`module-quality-review-standard.md`](./module-quality-review-standard.md) v1.0.0 |
| 范围来源 | [`PROJECT_VIEW.md`](../../PROJECT_VIEW.md) 的 QAM-07、Cross-cutting Concerns、共享映射、BU-02 与 Quality Tracking Index；[`AGENTS.md`](../../AGENTS.md) |
| 本轮 Delta | `+8（QAM-07-002 resolved）` |
| 当前基线命令 | `npm run check:full`：TypeScript、ESLint、60 个文件/360 项 Vitest、Next.js 16.3.3 production build、覆盖率、14 文件/40 项真实 PostgreSQL 与 10/10 Playwright 通过 |
| 风险匹配命令 | `npm run test:integration -- tests/integration/study-focus-transitions.integration.test.ts`：真实 PostgreSQL 10/10；`npm run test:e2e`：10/10；Study 定向 Node 回归 4 文件/31 项通过 |
| 证据纪律 | E3 为本轮实际执行的 Route/领域行为、真实 PostgreSQL GET/start/stop 并发与故障回滚、Playwright 离开/重访/刷新旅程；E2 为源码、schema、迁移与测试交叉证据；单元 mock 只补分支覆盖，不替代并发、事务或浏览器证据 |
| 工作区说明 | 复审前已有 QAM-01/QAM-05/QAM-07-001 修复及 Harness 状态未提交改动；本轮只重算 QAM-07-002 直接影响的维度，并保留所有前序改动与其他稳定问题状态 |

## Overall

| 指标 | 结果 |
| --- | --- |
| Score | **85 / 100** |
| Score Level | **L3** |
| Gate Level | **L2** |
| Final Level | **L2** |
| Trend | `+8` |
| Evidence Confidence | 高（手动状态转移与到期 reconciliation 均有服务行为、真实 PostgreSQL 并发/回滚和浏览器生命周期 E3；DST 与 Goal 排序仍缺风险匹配 E3） |
| 当前开放问题 | 2 项（P2×2） |

Focus start/pause/resume/stop 与到期 reconciliation 已收敛到统一事务服务：每次计时具有客户端绑定的 `currentSessionKey`，同一用户写入由 PostgreSQL 行锁线性化，显式 stop 或服务端发现过期 running state 时都在单事务内以唯一键结算 Session 与 idle 状态。Study GET/页面、start 和 stop 复用该语义；页面离开后重访或刷新只产生一条 completed Session，过期后直接 start 还能在同一事务开启新计时。当前无开放 P1；DST 回退和 Goal 并发顺序两个 P2 仍限制更高等级。

## Score Breakdown

| 维度 | Score | Max | Finding / Evidence |
| --- | ---: | ---: | --- |
| 架构与责任边界 | 11 | 14 | Focus 写入和到期恢复均收敛到 [`lib/study-transitions.ts`](../../lib/study-transitions.ts)，Route/页面读服务只负责调用统一边界；Study↔Room snapshot 的循环装配和重复读模型仍未拆分（E2/E3）。 |
| 代码结构与复杂度 | 10 | 10 | start/pause/resume/stop/reconcile 共用事务、锁、结算与冲突语义；GET/页面入口在读取统计前执行 reconciliation，Route 控制流保持短小（E2/E3）。 |
| 抽象与复用 | 7 | 8 | transition service、`serializeFocusState`、`normalizeFocusStatus` 与统计 helper 已形成清晰共享边界，四个状态 Route 不再各自维护写入；DST 日期运算和 Study/Room projection 仍重复（E2）。 |
| 数据流与状态一致性 | 10 | 12 | `currentSessionKey` 贯穿持久化、API 与客户端，`FocusSession(userId, sessionKey)` 唯一；stop 与过期恢复共用单事务结算，真实 PostgreSQL 证明 GET/start/stop 并发和故障下保持一致。Goal sortOrder 仍不稳定（QAM-07-004，E2/E3）。 |
| 接口与依赖关系 | 8 | 10 | pause/resume/stop 的 Zod contract 要求客户端提交当前 session key，旧标签页命令稳定 409；认证与 Goal ownership 保持不变。Study 与 Chat snapshot contract 的循环依赖仍在（E2/E3）。 |
| 健壮性、并发与生命周期 | 12 | 14 | 用户行锁线性化多标签页写入，条件 `updateMany` 防止状态倒退，唯一键与 replay 语义阻止重复 Session；服务端以持久化 `expectedEndAt` 结算过期 running state，页面离开、重访、刷新和事务故障均有 E3。DST/Goal 边界仍待加强。 |
| 性能与资源使用 | 6 | 8 | Study 查询有近期 Session 上限，FocusState/Session/Goal 有用户、房间和时间索引；但页面先执行 6 路 Study 查询，再执行成员 Session 查询和 Room snapshot（后者还含 Room list），重复读取 FocusState/participants 会放大请求成本（[`lib/study.ts`](../../lib/study.ts#L177-L246)、[`lib/room-snapshot.ts`](../../lib/room-snapshot.ts#L5-L99)、[`lib/room-list.ts`](../../lib/room-list.ts#L15-L30)）（E2）。 |
| 安全与隐私 | 8 | 10 | Study 入口统一 `requireCurrentUser`，Goal 资源按 userId 检查，FocusState 以 userId 唯一；Room snapshot 的 FocusState 查询仅按参与者 userId 而未带 roomId，若用户加入多个房间，可能把另一房间的专注状态投影到当前房间，该共享边界由 QAM-02 snapshot 负责复核（[`lib/room-snapshot.ts`](../../lib/room-snapshot.ts#L84-L121)、[`prisma/schema.prisma`](../../prisma/schema.prisma#L559-L580)）（E2，关联观察不另记 QAM-07 问题）。 |
| 可测试性与验证可信度 | 7 | 8 | transition service 13 项、Route/页面读回归、真实 PostgreSQL 10 项和 Playwright 离开/重访/刷新旅程共同覆盖手动与到期结算；Goal 并发、DST 页面聚合和专用组件生命周期仍无 E3（E3/E2）。 |
| 可维护性、演进与技术债 | 6 | 6 | session key schema、时间戳迁移、统一 settlement helper、reconciliation 入口和公开序列化均可追踪；新入口没有复制第二套完成事实源（E2/E3）。 |
| **合计** | **85** | **100** | 算术核对：11+10+7+10+8+12+6+8+7+6 = 85。 |

## Level Gate

| 门禁 | 结果 | 证据与原因 |
| --- | --- | --- |
| 开放 P0 | 通过 | 未发现权限突破、不可恢复数据库损坏、重复高风险外部副作用或支持启动路径整体不可用。 |
| 开放 P1 且涉及权限、不可恢复错误、并发重复副作用或持续故障 | 通过 | QAM-07-001/002 均由风险匹配 E3 证明关闭，当前没有开放 P1。 |
| 最高风险不变量有风险匹配行为验证 | 通过至 L2 | 手动状态转移与到期结算已有真实 PostgreSQL 并发、回滚、重放和 Playwright 生命周期 E3；两个开放 P2 仍主要依赖 E2，故 Gate 暂定 L2。 |
| L4 要求 | 未通过 | DST 本地日边界和 Goal 并发排序尚无完整风险匹配验证，且 Study↔Room snapshot 的共享读模型债务仍在。 |
| **最终判定** | **L2** | Score Level=L3；Gate Level=L2；Final Level=min(L3,L2)=L2。 |

## Critical Issues

### P0

当前无开放项。

### P1

#### QAM-07-001：Focus 状态转移与 stop 完成记录不是原子或幂等的（resolved）

- **原问题**：四个 Route 分别执行 check-then-write，stop 的 completed Session 与 idle state 不在同一事务，`currentSessionKey` 没有进入状态机或去重约束；并发 stop、pause/stop 交错和中途失败会制造重复或矛盾事实。
- **已实施修正**：[`lib/study-transitions.ts`](../../lib/study-transitions.ts) 统一 start/pause/resume/stop，在交互事务内先锁定当前 `User` 行，再以 status + `currentSessionKey` 条件更新。start 生成 UUID，API/客户端在后续命令中绑定该 key；[`FocusSession`](../../prisma/schema.prisma#L582-L603) 新增不可空 `sessionKey` 与 `(userId, sessionKey)` 唯一约束。stop 在同一事务内 upsert Session 并写 idle，重复 stop 返回既有 Session，旧 key 命令稳定 409（E2）。
- **验收证据**：[`study-focus-transitions.integration.test.ts`](../../tests/integration/study-focus-transitions.integration.test.ts) 修复前 0/3，分别观察到并发 stop 返回不同 Session、stop 后 pause 仍为 200、结算写状态失败后遗留 Session；修复后扩展为 5/5，覆盖完整 key 生命周期、旧命令隔离、并发重放、pause/stop 交错和 trigger 故障整体回滚。全量 PostgreSQL 14 文件/35 项与 Playwright 9/9 通过（E3）。
- **影响范围**：QAM-07 直接受影响；QAM-02 继续只消费 FocusState 投影。本修复没有实现到期 reconciliation、修改统计/Goal 或扩大 Room snapshot 责任。

#### QAM-07-002：完成结算只由挂载中的客户端 auto-stop 触发（resolved）

- **原问题**：服务端只保存 `expectedEndAt`，FocusSession 仅由显式 stop 创建；页面关闭、网络失败、后台冻结或浏览器崩溃会跳过客户端 auto-stop，留下过期 running state、漏记 Session 并阻塞下一次 start。
- **已实施修正**：[`lib/study-transitions.ts`](../../lib/study-transitions.ts) 抽取统一 settlement helper，并新增受用户行锁保护的 `reconcileExpiredFocusTimer()`；过期 running state 以持久化 `expectedEndAt` 作为完成时间，在同一事务 upsert `(userId, sessionKey)` Session 并写 idle。GET/服务端页面在查询统计前触发 reconciliation，start 在同一事务先结算旧计时再启动新 key，stop 对过期计时复用计划截止时间；未到期 running 与 paused 保持不变。活动 legacy state 缺 key 时会先修复稳定旧 key，不与新 start key 混用（E2）。
- **验收证据**：[`study-focus-transitions.integration.test.ts`](../../tests/integration/study-focus-transitions.integration.test.ts) 修复前 4/10 失败，分别观察到 GET 仍返回 running、start 仍保留旧 key、过期 stop 使用请求时间且 GET 故障回滚用例未触发；修复后 10/10，覆盖 GET 重访幂等、GET/start 并发、stop 重放、未到期/paused 不变及 trigger 故障整体回滚。Playwright 离开 Study 后由隔离数据库推进到期，再重访和刷新均只显示一条完成记录；数据库确认同 key 恰一条 Session。完整门禁为 14 文件/40 项 PostgreSQL 与 10/10 Playwright（E3）。
- **影响范围**：QAM-07 直接受影响；QAM-02 继续只消费 FocusState 投影。本修复没有修改 DST/Goal、Room snapshot、通知或离线学习产品语义。

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
  │    └─ reconcileExpiredFocusTimer（User 行锁 + keyed settlement）
  │         └─ getStudyRoomForUser → FocusState / StudyGoal / FocusSession / members
  │         └─ buildStudyStats(local timezone) + presence projection
  │
  ├─ POST start/pause/resume/stop
  │    └─ study-transitions（User 行锁 + status/sessionKey 条件）
  │         ├─ FocusState（单 user 当前事实 + currentSessionKey）
  │         └─ stop/reconcile 单事务 ──> FocusSession（userId + sessionKey 唯一）+ idle
  │
  └─ StudyDashboard
       ├─ client countdown / auto-stop（仅挂载时）
       ├─ 15s presence heartbeat → FocusState.lastStudySeenAt
       └─ MiniRoomChat → useRoomChat(initial RoomSnapshot)
                              └─ RoomSnapshot 聚合 Chat/Life/Agent/Focus status
```

FocusState 是当前计时事实，FocusSession 是完成历史，StudyGoal 是用户/房间/本地日清单，`lastStudySeenAt` 是 Study 页面 presence 事实。手动状态转移与服务端到期恢复共享受锁保护的 session identity 和 settlement helper，完成历史与 idle state 始终由同一事务提交或回滚。Room snapshot 仍是共享派生读模型：`getStudyPageData()` 直接查询 members/member FocusState 后再调用完整 snapshot，形成重复查询和 Study↔QAM-02 循环依赖。另有一个应由 QAM-02 负责的共享观察：snapshot 的 FocusState 查询按 participant userId 而未按 roomId 过滤，Study 不重复登记该责任。

## Verified Strengths

- 主要 Study Route 都先调用 `requireCurrentUser()`；Goal PATCH/DELETE 用 `{ id, userId }` 查找 owner，未发现跨用户 Goal 更新/删除路径（E2；ownership 行为测试 E3）。
- `FocusState.userId` 有数据库唯一键；每次 start 写入 `currentSessionKey`，pause/resume/stop 必须携带相同 key，延迟到新 Session 的旧命令会稳定返回 409（E2/E3）。
- 同一用户 transition 先取得 PostgreSQL `User` 行锁，状态写入再带 prior status/key 条件；`FocusSession(userId, sessionKey)` 唯一且 stop 单事务结算。并发 stop 返回同一 Session，pause/stop 不会让 idle 倒退，故障注入证明 Session 与 state 同时回滚（E3）。
- GET/服务端页面、start 与 stop 会在同一 transition 边界识别过期 running state；结算时间固定为持久化 deadline，重复、并发、离开后重访和刷新都不会重复 Session，客户端 auto-stop 只保留为及时 UI 路径（E3）。
- `serializeFocusState` 统一 ISO/null 字段，`buildStudyStats` 只计 completed focus，并按传入 IANA timezone 计算 today/week/streak；普通 Asia/Shanghai 统计、模式/状态过滤测试通过（E3）。
- Dashboard 的 countdown 使用 `expectedEndAt`/`remainingSeconds` 重新计算而非单纯递减本地计数，running interval 和 15 秒 presence interval 都在 effect cleanup 中清理；同一标签页 busy guard 也能抑制重复点击（E2）。
- Study page 的 Room 成员与 FocusState 直接按 roomId 聚合；Mini Room Chat 复用现有 `useRoomChat`，本报告不把 Chat/SSE 基础协议问题移入 QAM-07（E2）。

## Recommended Improvements

1. **修复 QAM-07-003/004（P2）**：先补 DST 日期 helper 与页面成员统计边界，再将 Goal 序号分配限定到 room 并加入稳定 tie-breaker；两项都保持既有统计与清单定义，并分别登记 feature。
2. **关联复审 BU-02**：由 QAM-02 owner 统一 Room snapshot 的 FocusState room scope/allow-list；QAM-07 只提供明确的 Focus projection contract，避免继续扩大循环依赖和重复查询。

以上均为既有 Focus/Session/Goal/presence 语义的最小修正，不新增通知、离线学习、计时模式或聊天能力。

## Sustainable Review Record

### 当前问题跟踪

| ID | Priority | 状态 | 首次发现 | 直接责任 | 关联责任 |
| --- | --- | --- | --- | --- | --- |
| QAM-07-001 | P1 | `resolved` | 2026-09-06 | Study transition/stop service 与 FocusState/Session 事务 | QAM-02 snapshot 状态投影 |
| QAM-07-002 | P1 | `resolved` | 2026-09-06 | Study 到期结算与 Dashboard 生命周期 | QAM-02 snapshot 过期状态显示 |
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
- 2026-09-08 修复前 `npm run test:integration -- tests/integration/study-focus-transitions.integration.test.ts` 为 0/3：并发 stop 生成不同 Session、pause/stop 状态倒退、state 写失败遗留 Session；修复后扩展为 5/5，覆盖 start→刷新→pause→resume→stop→重放、旧 key 隔离、并发结算、确定性交错和故障回滚。
- transition service 单元行为 8/8；Study 定向 Node 回归 6 文件/36 项通过；`npm run check:quick` 最终随完整门禁为 60 文件/355 项通过。
- 首次 `npm run check:full` 在新增服务未纳入单元覆盖率时失败于 branches `34.61% < 35%`；补充服务行为测试后为 statements 42.42%、branches 36.38%、functions 47.68%、lines 43.17%。
- 随后完整门禁首次 Playwright 为 8/9：冷编译时停止请求仍 pending，旧用例在响应前执行 5 秒 UI 断言；用例改为等待并校验 stop 响应后，定向 2/2，最终单次 `npm run check:full` 退出 0：14 文件/35 项 PostgreSQL、9/9 Playwright 与生产构建全部通过。
- 2026-09-09 到期 reconciliation 修复前定向 PostgreSQL 为 6/10，通过原有 keyed transition 与不变状态对照；4 项失败分别为过期 GET 未结算、过期后 start 未换新 key、过期 stop 结束时间偏移、GET 故障回滚路径未触发。修复后定向 10/10，Study 定向 Node 4 文件/31 项、`npm run check:quick` 60 文件/360 项、全量 integration 14 文件/40 项、全量 Playwright 10/10 均通过。
- 2026-09-09 受限权限边界直接执行 `npm run check` 时 quick 全通过，但 production build 原始失败为 `Error: Could not parse output from TypeScript's --showConfig.`；依 AGENTS.md 使用相同 Node 22 命令在获准正常权限边界复核后退出 0。最终 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full` 单次退出 0，覆盖率 statements 42.67%、branches 36.71%、functions 48.17%、lines 43.40%。

### 只追加评分历史

| 日期 | Score | Score Level | Gate | Final | Delta | 变更证据 |
| --- | ---: | --- | --- | --- | --- | --- |
| 2026-09-06 | 62 | L1 | L1 | L1 | `baseline` | 初审；Study 定向 Node 测试 6 文件/35 项通过，DST helper 实验复现回退日 streak 错误；Focus 并发/事务、过期结算、Goal 并发、DST 页面聚合和浏览器生命周期未验证。 |
| 2026-09-08 | 77 | L2 | L1 | L1 | `+15（QAM-07-001 resolved）` | keyed transition service、User 行锁、条件状态写与 `(userId, sessionKey)` 唯一约束使 stop 原子可重放；修复前 PostgreSQL 0/3、修复后 5/5，完整门禁为 14 文件/35 项 PostgreSQL 与 Playwright 9/9。QAM-07-002 仍开放，Gate 保持 L1。 |
| 2026-09-09 | 85 | L3 | L2 | L2 | `+8（QAM-07-002 resolved）` | GET/页面、start、stop 复用 keyed reconciliation 与统一 settlement；修复前 PostgreSQL 6/10、修复后 10/10，Playwright 离开/重访/刷新证明同 key 只结算一次，完整门禁为 14 文件/40 项 PostgreSQL 与 10/10 Playwright。当前仅余 P2×2。 |

复审时保留上述 ID 和历史行；仅在当前代码或风险匹配证据变化时重算受影响维度，并重新核对 100 分合计、Gate、Final 与问题状态。
