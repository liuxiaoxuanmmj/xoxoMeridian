# 进度日志

## Current State（当前状态）

Last Updated：2026-09-09。feat-035「修复 Focus 到期状态的服务端幂等结算」已完成，当前没有 `in-progress` 或 `blocked` feature。Study GET/服务端页面、start 与 stop 现在复用 keyed transition service 的到期 reconciliation：页面离开后，首次重访会按持久化 deadline 原子结算恰一条 FocusSession，刷新或并发入口不会重复，过期后 start 可直接开启新计时。QAM-07-002 已解决，QAM-07 当前为 85 分、Score L3、Gate/Final L2；组合开放问题为 P1×8/P2×31，模块平均分为 75.9。

## 2026-09-09 — feat-035 Focus 到期状态服务端幂等结算修复

### 已完成

- 按唯一下一步只关闭 `QAM-07-002`；没有修改 DST 统计、Goal 排序、Room snapshot、通知、离线学习或其他 QAM。
- `lib/study-transitions.ts` 抽取手动 stop 与到期恢复共用的 settlement helper；`reconcileExpiredFocusTimer()` 在 Prisma interactive transaction 中先锁定当前 `User`，仅处理 `running/focusing` 且 `expectedEndAt <= now` 的状态，以持久化 deadline 作为 `endedAt`，用 `(userId, sessionKey)` upsert completed Session 并将 state 写为 idle。
- `getStudyPageData()` 在读取 FocusState、Session 统计和 Room 数据前执行 reconciliation，因此 `/api/study` GET 与服务端 `/study` 页面共享恢复语义。`startFocusTimer()` 在同一事务先结算过期旧 key 再开启请求的新 key，`stopFocusTimer()` 对过期 running state 同样使用计划截止时间；未到期 running 和 paused 不会被误结算。
- 活动 legacy state 缺少 `currentSessionKey` 时先条件修复独立旧 key；过期后 start 的新 key 与旧完成记录不会混用。既有客户端 auto-stop 保留为及时 UI 路径，但不再是完成事实的唯一提交者。
- 新增 5 项真实 PostgreSQL 到期回归，覆盖重复 GET/刷新、GET 与新 start 并发、过期 stop 重放、未到期/paused 不变和 trigger 故障回滚；原有 5 项 keyed transition 回归保持通过。Playwright 在离开 Study 后直接推进隔离测试数据库中的 deadline，重访并刷新，从 UI 与数据库同时验证同 key 恰一条 completed Session。
- E2E 启动器只在本地 Testcontainers 模式下将隔离数据库 URL 以 `0600` 写入 `test-results/.e2e-database-url`，结束时删除；外部 `PLAYWRIGHT_BASE_URL` 必须显式提供匹配的隔离 `E2E_DATABASE_URL`。该测试桥接约束已写入 `docs/testing-standards.md`，不会读取开发、预发或生产数据库。
- 使用 `xoxo-qam-07-study-review` 只重算 reconciliation 直接影响的维度：`QAM-07-002` 转为 `resolved`，QAM-07 从 77 提升到 85、Score L2→L3、Gate/Final L1→L2；当前只剩 P2×2。使用 `harness-creator` 维持 feat-035 为唯一活动 feature，并同步验收、失败/通过证据和唯一下一步。

### 验证证据

- 开始与最终 `./init.sh` 均退出 0；最终结果为 Prisma Client、TypeScript、ESLint、60 文件/360 项 Vitest 全部通过。
- 修复前 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run test:integration -- tests/integration/study-focus-transitions.integration.test.ts` 为 6/10 通过：到期 GET 实际仍为 running；到期后 start 实际保留旧 key；过期 stop 的 `endedAt` 使用请求时间而非 deadline；GET settlement 故障用例预期 500、实际 200。修复后同一套测试为 10/10。
- Study 定向 Node 回归为 4 文件/31 项通过；`npm run check:quick` 为 60 文件/360 项通过；独立全量 `npm run test:integration` 为 14 文件/40 项通过；独立全量 `npm run test:e2e` 为 10/10，通过离开/重访/刷新到期恢复旅程。
- 受限权限边界直接执行 `npm run check` 时 quick 全通过，production build 原始失败为 `Error: Could not parse output from TypeScript's --showConfig.`；依 AGENTS.md 使用相同 Node.js 22 命令在获准正常权限边界复核后退出 0，不能将受限边界假失败记作代码阻塞。
- 最终 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full` 单次退出 0：TypeScript、ESLint、60 文件/360 项 Vitest、Next.js 16.3.3 production build、覆盖率、14 文件/40 项真实 PostgreSQL integration 和 10/10 Playwright 全部通过。覆盖率为 statements 42.67%、branches 36.71%、functions 48.17%、lines 43.40%，均高于门槛；故障注入用例中的 Prisma `P0001` 为预期回滚证据。
- `harness-creator` 校验为 100/100；`feature_list.json` 可解析，35 个 feature 全部为 `done`、活动/阻塞为 0；`git diff --check` 通过，`next-env.d.ts` 已恢复到会话开始时的 production types 引用。

### 范围、清理与下一步

- 未新增 npm 依赖、修改锁文件、Prisma schema/migration 或部署配置；本轮复用 feat-034 已有的 key、唯一约束和行锁事实源。前序 QAM-01/QAM-05/QAM-07-001 的未提交改动全部保留。
- 本轮生成的 `coverage/`、`playwright-report/` 和 `test-results/` 在最终状态检查前移入系统回收站，可恢复；E2E 数据库 URL 文件已由启动器删除，Docker 只保留既有 `xoxo-meridian-postgres`，无 Testcontainers 残留，`.next` 构建缓存保留。
- 唯一推荐下一步：另行登记并只处理 `QAM-02-001`，让 Room snapshot 使用 Prisma `select` 与显式公开字段 allow-list，阻止 `lastGeoIp`、`preferences`、未公开 `profileNote` 等私有 UserProfile 字段进入聊天/Study 浏览器载荷，并补真实页面或 Playwright 隐私回归；不要与消息 trace、dispatch、房间删除或 SSE 问题合并。

## 2026-09-08 — feat-034 Focus 状态转移与原子结算修复

### 已完成

- 按唯一下一步只关闭 `QAM-07-001`；没有实现到期自动 reconciliation `QAM-07-002`，也没有修改 DST 统计、Goal 排序、Room snapshot 或其他 QAM。
- 新增 `lib/study-transitions.ts`，start/pause/resume/stop 均在 Prisma interactive transaction 中先锁定当前 `User` 行，再以 prior status 与 `currentSessionKey` 条件写入。start 为新计时生成 UUID；pause/resume/stop 必须提交当前 key，旧标签页或延迟请求无法作用于后来启动的 Session。
- `FocusSession` 新增非空 `sessionKey` 和 `(userId, sessionKey)` 唯一约束；时间戳迁移为既有 Session 与活动 FocusState 回填稳定 legacy key。stop 以复合唯一键 upsert completed Session，并在同一事务内将 FocusState 写为 idle；重复 stop 返回既有 Session，任一步骤失败会整体回滚。
- 四个 Study 状态 Route 收敛为认证、Zod 输入校验、领域服务调用与响应映射；`serializeFocusState`、Study GET 和 `StudyDashboard` 贯穿公开 `sessionKey`。pause/resume/stop 的状态冲突统一返回 409。
- 新增 8 项 transition service 行为测试和 5 项真实 PostgreSQL 回归；后者覆盖 start→刷新→pause→resume→stop→重放、旧 key 隔离、并发 stop、确定性 pause/stop 交错和数据库 trigger 故障回滚。Playwright 停止旅程明确等待并校验 stop 响应，避免 Next.js 冷编译时在请求完成前提前断言 UI。
- 使用 `xoxo-qam-07-study-review` 只重算 QAM-07-001 直接影响的维度：问题转为 `resolved`，QAM-07 从 62 提升到 77、Score L1→L2；到期 reconciliation P1 仍开放，因此 Gate/Final 保持 L1。总览同步为平均 75.0、开放 P1×9/P2×31。
- 使用 `harness-creator` 保持 feat-034 为唯一活动 feature，并同步 feature 验收、失败/通过证据、清理与唯一下一步；该 Skill 没有扩大业务修改范围。

### 验证证据

- 开始与最终 `./init.sh` 均退出 0；最终结果为 Prisma Client、TypeScript、ESLint、60 文件/355 项 Vitest 全部通过。
- 修复前 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run test:integration -- tests/integration/study-focus-transitions.integration.test.ts` 为 0/3：并发 stop 返回不同 Session ID；stop/pause 交错中的 pause 实际为 200（期望 409）；state settlement 故障后 Session count 为 1（期望 0）。
- 修复后同一定向真实 PostgreSQL 测试扩展为 5/5；全量 integration 为 14 文件/35 项通过。Study 定向 Node 回归 6 文件/36 项通过，新增 transition service 行为 8/8，`npm run check:quick` 最终为 60 文件/355 项通过。
- 第一次完整门禁在生产构建与 347 项测试后失败于覆盖率 branches `34.61% < 35%`；补齐服务行为测试后四项覆盖率均过线。随后一次完整门禁进入 Playwright 后为 8/9：stop 请求在冷编译中仍 pending，旧 5 秒 UI 断言提前超时；修正等待边界后定向 Playwright 2/2 通过。
- 最终 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full` 单次退出 0：TypeScript、ESLint、60 文件/355 项 Vitest、Next.js 16.3.3 production build、覆盖率、14 文件/35 项真实 PostgreSQL integration 和 9/9 Playwright 全部通过。
- 最终覆盖率为 statements 42.42%、branches 36.38%、functions 47.68%、lines 43.17%，均高于门槛。故障注入用例中的 Prisma `P0001` 日志是预期响应/回滚证据，测试结果为通过。

### 范围、清理与下一步

- 未新增 npm 依赖或修改锁文件；schema 变更只增加 FocusSession 幂等键及时间戳迁移，不修改既有迁移。用户此前的 QAM-01/QAM-05 源码、测试与报告改动全部保留。
- 本轮生成的 `coverage/`、`playwright-report/` 和 `test-results/` 在最终状态检查前移入系统回收站，可恢复；`.next` 构建缓存保留。
- 唯一推荐下一步：另行登记并只处理 `QAM-07-002`，复用 keyed transition service，在 Study GET/start/stop 入口对已过 `expectedEndAt` 的 running state 做单事务 reconciliation，并用真实 PostgreSQL 与 Playwright 覆盖刷新/离开后的单次结算；不要与 DST 或 Goal P2 合并。

## 2026-09-08 — feat-033 Agent log 跨房间读取边界修复

### 已完成

- 按唯一下一步只关闭 `QAM-05-005`；没有修改 Post 写入、slug、cursor、Agent log durable projection、搜索失败 UI、Post/Atlas 生命周期或其他 QAM。
- 新增 `lib/post-visibility.ts` 的统一 `getPostVisibilityWhere(userId)`：`user_post` 保持既有全局可见语义；`agent_log` 必须仍有关联 Room，且该 Room 的 `participants` 中存在当前用户。`roomId=null` 的孤儿 Agent log 不会因 Room 删除而变成全局内容。
- `GET /api/posts` 将该条件作为 type、author、cursor 和搜索过滤之外的强制 `AND`；`GET /api/posts/:slug`、`/posts/:slug` 页面和 `/home` 首页复用同一条件。详情查询把 slug 与可见性放在同一数据库查询中，非成员稳定得到 404，不先泄漏记录存在性。
- 新增真实 PostgreSQL 回归：建立 A/B 两个用户与相互隔离的 Room、一个带 B roomId 的全局 `user_post`、双方 Agent log 及删除 Room 后 `SetNull` 的孤儿日志；覆盖列表、type、搜索、详情、首页投影和切换当前用户后的成员可见性。
- 使用 `xoxo-qam-05-content-timeline-review` 只重算读取授权直接影响的架构/复用、数据流、接口、安全与验证维度：`QAM-05-005` 转为 `resolved`，QAM-05 从 64/L1 提升到 73/L2；总览同步为平均 73.3、开放 P1×10/P2×31。
- 使用 `harness-creator` 保持 feat-033 为唯一活动 feature，并同步验收证据、验证、清理和唯一下一步；该 Skill 没有扩大业务修改范围。

### 验证证据

- 开始与最终 `./init.sh` 均退出 0；最终结果为 Prisma Client、TypeScript、ESLint、59 文件/346 项 Vitest 全部通过。
- 修复前 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run test:integration -- tests/integration/post-visibility.integration.test.ts` 为 0/1：用户 A 的列表实际返回 `global-user-post`、A/B 双方 Agent log 和 `orphan-agent-log`，期望只返回前者与 A 房间日志。
- 修复后同一定向真实 PostgreSQL 测试为 1/1：A/B 各只看到全局文章和自己 Room 的 Agent log；`type=agent_log` 与 `q` 搜索不能绕过成员条件；成员详情 200，非成员/孤儿详情 404；首页可见 Post 集合与 API 一致，数据库确认孤儿记录仍存在且 `roomId=null`。
- `npm run check:quick` 退出 0：TypeScript、ESLint、59 文件/346 项 Vitest 通过；旧 Post mock 测试已同步验证新增可见性条件与既有 type/search 组合。
- 独立全量 `npm run test:integration` 为 13 文件/30 项通过；`sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full` 随后单次退出 0：快速门禁、Next.js 16.3.3 production build、覆盖率、13 文件/30 项 PostgreSQL 和 9/9 Playwright 全部通过。
- 覆盖率为 statements 41.94%、branches 35.92%、functions 46.39%、lines 42.62%，均高于门槛。

### 范围、清理与下一步

- 未新增依赖、修改锁文件、Prisma schema/migration、Agent Runtime、Room 写入或部署配置；关系过滤复用既有 `RoomParticipant(userId)` 与 `(roomId,userId)` 索引，未引入第二套成员事实源。
- 本轮生成的 `coverage/`、`playwright-report/` 和 `test-results/` 已移入系统回收站，可恢复；`.next` 构建缓存及所有前序未提交改动保持不变。
- 唯一推荐下一步：另行登记并只处理 `QAM-07-001`，把 Focus start/pause/resume/stop 状态转移与 Session 结算收敛为使用 `currentSessionKey` 的原子、幂等事务，并用真实 PostgreSQL 覆盖并发 stop、pause/stop 交错与故障回滚；不要与到期自动 reconciliation `QAM-07-002` 或 DST/Goal P2 合并。

## 2026-09-08 — feat-032 并发注册房间容量竞态修复

### 已完成

- 按唯一下一步只关闭 `QAM-01-004`；没有修改已通过 E3 的 Session 签发或密码恢复，也没有处理代理头、日志、旧认证工件和其他 QAM。
- `POST /api/auth/register` 不再在事务外读取默认 Room。注册 Prisma transaction 现在先按 `DEMO_ROOM_SLUG` 执行 `SELECT ... FOR UPDATE`，再使用锁内 `maxHumanUsers` 重新统计 Participant；后到事务必须等先到事务提交后再判断剩余容量。
- Room 锁、容量判断、User + 嵌套 UserProfile 和 RoomParticipant 写入保持在同一事务。默认 Room 不存在仍返回 500，已满仍返回 409，首位/后续注册仍分别得到 owner/member，邀请码、响应体与 Session 签发契约不变。
- 新增真实 PostgreSQL Route Handler 回归：Participant insert delay trigger 稳定制造两个注册同时越过旧 count 窗口；insert failure trigger 验证跨写中途失败不会留下 User/Profile/Participant/Session，并证明移除故障后同一邮箱可重试成功。
- 使用 `xoxo-qam-01-identity-review` 只重算直接受影响的状态一致性、并发生命周期和验证可信度：`QAM-01-004` 转为 `resolved`，QAM-01 从 83 提升到 87，Gate/Final 从 L1 提升到 L4/L3。总览同步为平均 72.3、开放 P1×11/P2×31。
- 使用 `harness-creator` 保持 feat-032 为唯一活动 feature，并同步验收证据、清理和唯一下一步；该 Skill 没有扩大业务修改范围。

### 验证证据

- 开始与最终 `./init.sh` 均退出 0；最终结果为 Prisma Client、TypeScript、ESLint、59 文件/346 项 Vitest 全部通过。
- 修复前 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run test:integration -- tests/integration/registration-capacity.integration.test.ts` 为 1/2 通过、1/2 失败：两个并发注册实际均返回 200（期望 200/409），稳定证明最终槽位被重复消费；Participant 故障回滚对照通过。
- 受限沙箱内首次执行上述 Docker 命令退出 1，原始错误为 `sudo: The "no new privileges" flag is set`；在获准的正常权限边界使用同一 Node.js 22 命令后完成修复前后对照。
- 修复后同一定向真实 PostgreSQL 测试为 2/2 通过：已有 1 名成员时两个不同邮箱恰为 200/409、Participant 保持 2，loser 没有 User/Profile/Session；Participant insert trigger 故障返回 500 且全部跨写回滚，移除故障后同一邮箱成功注册为 owner 并获得 Session。
- `npm run check:quick` 退出 0：TypeScript、ESLint、59 文件/346 项 Vitest 通过；随后全量 `npm run test:integration` 为 12 文件/29 项通过，既有 Session、密码恢复、权限和 Agent/画布事务语义保持可用。
- `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full` 单次退出 0：快速门禁、Next.js 16.3.3 production build、覆盖率、12 文件/29 项 PostgreSQL 和 9/9 Playwright 全部通过。覆盖率为 statements 41.87%、branches 35.88%、functions 46.30%、lines 42.60%，均高于门槛。

### 范围、清理与下一步

- 未新增依赖、修改锁文件、Prisma schema/migration 或部署配置；Room 行锁只串行同一默认房间的注册容量临界区，不改变其他房间或注册后的 Session 事务。
- 已清理本轮生成的 `coverage/`、`playwright-report/` 和 `test-results/`；`.next` 作为启动/构建缓存保留，既有未提交改动和数据均未删除。
- 唯一推荐下一步：另行登记并只处理 `QAM-05-005`，为 room-scoped `agent_log` 的列表、搜索、详情和首页读取建立统一成员可见性条件，并用真实 PostgreSQL 跨房间回归证明非成员不可见；不要与 slug、cursor 或 durable projection P2 合并。

## 2026-09-07 — feat-031 Session 原子签发与单活跃语义修复

### 已完成

- 按唯一下一步只关闭 `QAM-01-001`；没有修改注册容量 `QAM-01-004`、代理头、日志、旧认证工件、认证产品策略或 Cookie 响应契约。
- `createSessionCookie()` 将当前浏览器可能切换出的旧用户与目标用户 ID 排序，并委托 `replaceActiveSession()` 在固定顺序取得 PostgreSQL `User` 行锁；相关旧 Session 删除、目标用户 Session 全量失效和新 Session 创建均在同一 Prisma transaction 内完成。
- 事务只对 Prisma `P2034` 冲突/死锁最多重试 3 次；普通业务或数据库错误直接上抛。登录、注册和 `setSessionCookie()` 均继续复用该统一签发入口，没有形成第二套 Session 状态事实源。
- 新增真实 PostgreSQL Route Handler 回归：insert delay trigger 强制两个登录同时越过旧实现的删除窗口；insert failure trigger 验证新记录创建失败时旧 Session 回滚保留；注册正向路径验证签发 Cookie 可访问 `/api/auth/me`。
- 使用 `xoxo-qam-01-identity-review` 只重算直接受影响的状态一致性、并发生命周期和验证可信度：`QAM-01-001` 转为 `resolved`，QAM-01 从 76 提升到 83、Score L2→L3；注册容量 P1 仍开放，因此 Gate/Final 保持 L1。总览同步为平均 71.9、开放 P1×12/P2×31。
- 使用 `harness-creator` 保持 feat-031 为唯一活动 feature，并同步验收证据、环境例外、清理与唯一下一步；该 Skill 没有扩大业务修改范围。

### 验证证据

- 开始与最终 `./init.sh` 均退出 0；最终结果为 Prisma Client、TypeScript、ESLint、59 文件/346 项 Vitest 全部通过。
- 修复前 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run test:integration -- tests/integration/session-issuance.integration.test.ts` 为 1/3 通过、2/3 失败：并发登录后的 Session count 实际为 2（期望 1），替换插入故障后的 Session 实际为 `[]`（期望保留旧记录）；注册签发正向对照通过。
- 修复后同一定向真实 PostgreSQL测试为 3/3 通过：两个登录响应均为 200、最终 Session count 为 1，两个响应 Cookie 请求 `/api/auth/me` 恰为 200/401；插入故障返回 500 且旧 Session 保留；注册 Cookie 请求受保护端点为 200。
- `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full` 没有虚记为单次退出 0：其中 `npm run check` 已通过 59 文件/346 项 Vitest、Next.js 16.3.3 production build与覆盖率，全量真实 PostgreSQL 为 11 文件/27 项通过；进入 Playwright 时用户既有 PID 140196 持有仓库 `.next`，原始错误为 `Another next dev server is already running`。
- 为避免终止或复用用户服务，在不包含 `.env`、`.git`、`.next` 和生成报告的 `/tmp/xoxo-meridian-e2e-copy.g8j6n5` 隔离副本运行完整 E2E。首次为 8/9，唯一失败仍是无关 Study 在冷编译时等待 `/专注中 ·/` 5 秒超时；同一副本缓存预热后完整复跑明确退出 0，9/9 通过。没有修改 Study。
- 覆盖率为 statements 41.93%、branches 35.92%、functions 46.30%、lines 42.60%，均高于门槛。

### 范围、清理与下一步

- 未新增依赖、修改锁文件或 Prisma schema/migration；PostgreSQL 行锁限定到本次签发涉及的用户，并按 ID 固定顺序获取，避免把不同账号登录全局串行化。
- 完整门禁生成的 `coverage/`、`playwright-report/`、`test-results/` 与 `/tmp/xoxo-meridian-e2e-copy.g8j6n5` 已清理，Docker 无 Testcontainers 残留；用户 PID 140196 与仓库 `.next` 未删除，所有既有数据保持不动。
- 唯一推荐下一步：另行登记并只处理 `QAM-01-004`，在注册事务中锁定默认 Room 容量事实源，用真实 PostgreSQL 并发注册证明 Participant 不超过 `maxHumanUsers` 且失败请求不留下 User/Profile 孤儿；不要与 P2 合并。

## 2026-09-07 — feat-030 密码重置 token 存储与原子消费修复

### 已完成

- 按 P1 优先级只关闭相互耦合的 `QAM-01-002` 与 `QAM-01-003`；没有修改 Session 签发、注册容量、可信代理、日志或旧认证工件。
- `PasswordResetToken` 从原始 `token` 改为带 `v1:sha256:` 版本前缀的不可逆 `tokenDigest`。创建流程仍把高熵原 token 返回给恢复链接，但数据库和查询只接触 digest。
- 新增时间戳迁移：先删除无法安全转换的既有 bearer token，使部署后所有旧恢复链接失效，再重命名列并重建唯一索引；没有修改或删除任何已应用迁移。
- `resetPasswordWithToken` 在同一 Prisma transaction 中按 `id + tokenDigest + expiresAt > now` 条件 claim token，随后更新 bcrypt 密码并删除该用户全部 Session。并发 loser、过期、未知和重放请求统一返回 400；更新或 Session 删除失败会连同 token claim 一起回滚。
- 新增真实 PostgreSQL Route Handler 回归，覆盖原 token 不落库、同 token 并发恰一成功、获胜密码可登录语义、全部旧 Session 删除、过期/未知拒绝、不可重放，以及数据库 trigger 注入 Session 删除故障时密码/token/Session 全量回滚。
- 使用 `xoxo-qam-01-identity-review` 只重算受影响维度：`QAM-01-002/003` 转为 `resolved`，QAM-01 从 68 提升到 76，Score Level 从 L1 提升到 L2；由于 `QAM-01-001/004` 仍是 P1，Gate/Final 保持 L1。总览同步为平均 71.1、开放 P1×13/P2×31。
- 使用 `harness-creator` 维持 feat-030 为唯一活动 feature，并同步完成证据、环境例外、清理与唯一下一步；该 Skill 没有扩大业务范围。

### 验证证据

- 开始 `./init.sh`：退出 0；Prisma Client、TypeScript、ESLint、59 文件/346 项 Vitest 通过。
- 修复前 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run test:integration -- tests/integration/password-reset-security.integration.test.ts`：3/3 失败，分别观察到数据库直接保存原 token、并发响应为 `[200,200]`（预期 `[200,400]`），以及 Session 删除故障后密码仍被提交，证明三个缺陷均可复现。
- 修复后同一定向真实 PostgreSQL 测试扩展为 4/4 通过：digest 格式为 `v1:sha256:<64 hex>`；并发状态为 200/400；旧 Session 和 token 均删除，重放为 400；过期/未知为 400；故障注入返回 500 且三类状态回滚，移除 trigger 后同一 token 可正常成功。
- `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full` 没有虚记为退出 0：其中 `npm run check` 已通过 59 文件/346 项 Vitest、Next.js 16.3.3 production build与覆盖率，10 文件/24 项真实 PostgreSQL 集成也通过；进入 Playwright 时因用户既有 `next dev` 持有仓库 `.next` 锁而失败，原始错误为 `Another next dev server is already running`。
- 为避免终止用户进程或复用其数据库，在不包含 `.env`、`.git`、`.next` 和生成报告的 `/tmp` 隔离副本运行完整 E2E。首次为 8/9，唯一失败是无关 Study “starts and stops a focus session” 在冷路由编译时等待 `/专注中 ·/` 5 秒超时；同一副本缓存预热后再次全量运行明确退出 0，9/9 通过，密码恢复入口也通过。没有借此修改 Study。
- `npm run check` 覆盖率为 statements 42.05%、branches 36.07%、functions 46.45%、lines 42.72%，均高于门槛。
- 最终 `./init.sh`：退出 0；Prisma Client、TypeScript、ESLint、59 文件/346 项 Vitest 全部通过。

### 范围、清理与下一步

- 未新增依赖或改变 API 成功/失败状态契约；没有处理 QAM-01-001/004/005/006/007，也没有扩展其他 QAM。迁移明确牺牲尚未使用的旧恢复链接，以避免把既有 bearer secret 继续作为数据库凭据保存。
- 已删除本轮 `/tmp/xoxo-meridian-e2e-copy.M0qKrS` 隔离副本及仓库内 `coverage/`、`playwright-report/`、`test-results/` 可再生成工件；用户既有开发服务器及所有已登记未提交改动保持不动。
- 唯一推荐下一步：另行登记并只处理 `QAM-01-001`，把 Session 失效与新 Session 创建收敛到原子签发语义，并用真实 PostgreSQL 并发登录和旧 Cookie 受保护请求回归覆盖登录与注册签发路径；不要与注册容量 `QAM-01-004` 合并。

## 2026-09-07 — feat-029 Home 空间拖动持久化收敛修复

### 已完成

- 按交接只处理 QAM-06-003，并以当前实际产品入口 `/home` 为准；没有恢复或扩展已弃用 Atlas 页面，也没有修改上传、建板、连接、缩放、标题、删除或 SSE P2。
- `HomeTimelineBoard` 为每个照片元素维护 latest-target 最终位置队列。同一元素的 PATCH 严格串行；等待期间继续拖动只替换下一目标，旧请求不能在新请求之后完成并覆盖最终坐标。
- 最终 PATCH 只有收到 2xx 才清除待保存状态；非 2xx 和网络异常会保留原目标坐标、显示 `role="alert"` 的失败提示，并提供有可访问名称、可键盘操作的“重试”按钮。重试成功后提示与待保存状态清除。
- 新增组件失败/竞态回归，以及真实 PostgreSQL + 两个独立 Node 观察进程的收敛回归。观察进程在写入前确认旧坐标，再各自调用实际 `getHomeBoardSnapshot()`，最终读取相同 PostgreSQL 坐标。
- 使用 `xoxo-qam-06-spatial-media-review` 只重算受影响维度：QAM-06-003 转为 `resolved`，QAM-06 从 64/L1 提升到 71/L2，开放项仅余 P2×6；总览同步为平均 70.2、Final L1×5/L2×4、开放 P1×15/P2×31。
- 使用 `harness-creator` 保持 feat-029 为唯一活动 feature，并同步 feature 状态、验证证据和清洁重启路径；该 Skill 没有扩大业务修改范围。

### 验证证据

- 开始 `./init.sh`：退出 0；Prisma Client、TypeScript、ESLint、58 文件/344 项 Vitest 通过。
- 修复前 `npm run test:component -- tests/component/home-timeline-board-drag.test.tsx`：1/1 失败，原始错误为 `Unable to find role="alert"`；DOM 已显示乐观 `(120,180)`，但 503 没有失败或重试反馈。
- 修复后同一组件文件 2/2 通过：覆盖 503→可访问重试→2xx 清除，以及 deferred 连续拖动请求最大并行数为 1、最终请求为最新 `(210,260)`。
- `npm run test:component`：11 文件/20 项通过；`npm run test:unit -- tests/server/home-board-routes.test.ts tests/lib/home-board.test.ts tests/lib/home-spatial.test.ts`：3 文件/15 项通过。
- `npm run test:integration -- tests/integration/home-drag-persistence.integration.test.ts`：1/1 通过；真实 PostgreSQL 中 Home Route 将坐标写为 `(420,315)`，两个写入前启动的独立 snapshot 进程均从旧坐标最终收敛。
- 最终 `./scripts/run-node22.sh npm run check`：退出 0；59 文件/346 项 Vitest、Next.js 16.3.3 production build 与覆盖率全部通过。覆盖率为 statements 42.03%、branches 35.94%、functions 46.38%、lines 42.76%，均高于门槛。
- 全量 `npm run test:integration`：9 文件/20 项真实 PostgreSQL 测试通过；独立 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run test:e2e`：退出 0，9/9 Playwright 通过。此前组合 `check:full` 在完成 `check` 与集成后进入 E2E，但命令会话句柄因用户消息切换丢失，故没有将该组合命令虚记为单次退出 0。
- 最终 `./init.sh`：退出 0；Prisma Client、TypeScript、ESLint、59 文件/346 项 Vitest 全部通过。

### 范围、清理与下一步

- 未修改 Route contract、Prisma schema/migration、依赖、锁文件或部署配置；旧 Atlas drag cache/SSE 不属于当前产品入口，本轮没有以修复 QAM-06-003 为由夹带其 P2 生命周期重构。
- Playwright/coverage 等可再生成工件在状态文件更新后统一清理并复核；既有用户改动全部保留。
- 唯一推荐下一步：另行登记并只处理 QAM-06-002，把 fixed-ID global board 的首次创建改为并发安全的 `upsert`，用真实 PostgreSQL 冷启动并发回归验证；不要与上传、连接或 SSE 合并。

## 2026-09-07 — feat-028 Node.js 22 PATH 持久化

### 已完成

- 新增 `.node-version` 固定 Node.js 22.23.2，在 `package.json` 以 `packageManager` 固定 npm 10.9.8、以 `engines` 固定 Node.js 22/npm 10，并通过 `.npmrc` 的 `engine-strict=true` 让安装环境遵守版本契约；锁文件根 package 同步 engines，未改变任何依赖版本。
- 新增 `scripts/run-node22.sh`：从仓库版本文件读取完整版本，优先验证当前 PATH，不匹配时只回退到对应的用户级 Node 22 安装，随后精确校验 Node/npm 再执行命令；`init.sh` 直接复用同一函数，不再只有 major 检查或依赖调用方手写 PATH。
- 将 `/usr/local/node` 的 v24.20.0 原位替换为已验证的 v22.23.2，并以 root 权限只创建 `/usr/local/bin/node`、`npm`、`npx`、`corepack` 四个系统链接；新运行时验证成功后清除了临时备份，因此系统不再保留 Node 24。用户级 `~/.local/node-v22.23.2` 与四个本地链接继续作为同版本兜底。
- `AGENTS.md` 与 `docs/testing-standards.md` 固化版本契约和 Docker 组包装命令。包装脚本不调用 sudo、不修改 group，也不扩大权限；权限切换仍由既有 `sudo -n -g docker -u dadalv` 边界负责。
- 使用 `harness-creator` 校验启动、状态、验证和交接协议，结构评分为 100/100；该 Skill 促使 Node 选择逻辑集中为一个可复用入口，并将错误版本失败与恢复步骤写入生命周期文档。

### 验证证据

- `/usr/local/node/bin/node`、`/usr/local/bin/node`、`~/.local/bin/node` 均为 v22.23.2；相应 npm 均为 10.9.8，系统 `npx` 为 10.9.8、`corepack` 为 0.34.6。扫描两个安装根只发现两份 v22.23.2 Node 二进制，`/tmp` 无 Node 24 临时备份。
- 当前 shell、`bash -lc`、`env -i HOME=/home/dadalv PATH=/usr/local/bin:/usr/bin:/bin` 与 `sudo -n -g docker -u dadalv /bin/bash -c ...` 均输出 v22.23.2/npm 10.9.8；Docker 组裸命令已经可用，包装器无需逐次手写 PATH。
- 缺失正确工具链的最小环境运行 `./scripts/run-node22.sh node --version` 退出 1，并明确报告需要 Node.js 22.23.2；`bash -n scripts/run-node22.sh init.sh` 通过。
- `node /home/dadalv/.agents/skills/harness-creator/scripts/validate-harness.mjs --target /home/dadalv/projects/xoxoMeridian`：100/100。
- `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full`：退出 0；TypeScript、ESLint、58 文件/344 项 Vitest、Next.js 16.3.3 production build、覆盖率、8 文件/19 项真实 PostgreSQL 集成测试和 9 项 Playwright 全部通过。
- 覆盖率：statements 42.03%、branches 35.94%、functions 46.38%、lines 42.76%，均高于门槛。
- 最终 `./init.sh` 退出 0：Prisma Client、TypeScript、ESLint、58 文件/344 项 Vitest 全部通过；`feature_list.json` 可解析且活动/阻塞 feature 为 0，`git diff --check` 通过。

### 范围、清理与下一步

- 未修改应用功能、Prisma schema/migration 或依赖版本；Dockerfile 的 Web/Worker/build stages 已全部使用 `node:22-alpine`，无需改动容器镜像定义。仓库历史中 feat-023 对旧 v24.20.0 的记录保留为当时真实证据，不代表当前运行时仍存在。
- Node 24 临时备份已在新运行时验证后删除，不可恢复；它只包含用户明确要求移除的旧工具链。本轮完整门禁生成的 `coverage/`、`playwright-report/` 与 `test-results/` 已清理且不可恢复，Docker 无残留测试容器；这些均为可再生成工件，既有用户改动保持不变。
- 唯一推荐下一步：另行登记并只修复 QAM-06-003，使 `/home` 使用的空间拖动最终写入可观察、可重试，并建立持久化失败与多实例最终收敛验证；不同时处理上传、建板、连接或 SSE P2。

## 2026-09-07 — feat-027 Home 空间画布跨 board mutation 边界修复

### 已完成

- 按交接优先级只处理 `QAM-06-001`。结合用户补充确认 `/home` 是当前空间画布产品入口，`/chat/:roomId/atlas` 已弃用；没有恢复旧页面、扩展画布功能或顺带处理 drag/upload/SSE。
- `lib/atlas-board.ts` 导出统一的 `ATLAS_GLOBAL_BOARD_ID`，避免 legacy mutation 各自重复硬编码 board 边界。
- Atlas element PATCH 使用单条条件 `updateMany` 同时限定 `id`、`boardId = atlas-global-board` 与 `postId = null`；element DELETE 先读取同一 scope 的清理元数据，再以相同条件 `deleteMany`；connection DELETE 以 `id + boardId` 条件删除。条件不匹配统一返回 404，实际写语句本身不可能命中 Home board 或 Post anchor。
- 新增真实 PostgreSQL Route Handler 回归，同时从 legacy Atlas API 请求 Home anchor/connection ID；修复前第一项 PATCH 实际返回 200，使保护用例按预期失败。修复后 PATCH、element DELETE、connection DELETE 均返回 404，Post、anchor 的 x/y/rotation/z-index/width/height 与 connection 全部保留；global board 的相同操作继续返回 200。
- 使用 `xoxo-qam-06-spatial-media-review` Skill 只重算受影响维度：`QAM-06-001` 转为 `resolved`，QAM-06 从 57/L0 提升到 64/L1，Gate 从 L1 提升到 L2；其余 1 个 P1 与 6 个 P2 均保持开放。模块总览同步为平均 69.4、Final L0×0/L1×6/L2×3、开放 P1×16/P2×31。

### 验证证据

- 开始与最终 `./init.sh` 均退出 0：Prisma Client 生成、TypeScript、ESLint、58 个文件/344 项 Vitest 全部通过；缺少 `.env` 的提示符合当前隔离测试路径。
- 修复前 `npm run test:integration -- tests/integration/atlas-board-scope.integration.test.ts`：1/2 失败，原始断言为 `expected 200 to be 404`，证明 legacy Atlas PATCH 可修改 Home anchor；global board 对照通过。
- 修复后同一真实 PostgreSQL命令：1 文件/2 项通过；预期拒绝没有 Prisma error 日志。
- `npm run test:unit -- tests/server/atlas-storage-routes.test.ts tests/lib/home-board.test.ts tests/lib/home-spatial.test.ts`：3 文件/13 项通过。
- `npm run check:full`：退出 0；TypeScript、ESLint、58 文件/344 项 Vitest、Next.js 16.3.3 production build、覆盖率、8 文件/19 项真实 PostgreSQL 集成测试和 9 项 Playwright 全部通过。
- 覆盖率：statements 42.03%、branches 35.94%、functions 46.38%、lines 42.76%，均高于门槛。

### 范围、清理与下一步

- 未修改 Prisma schema/migration、npm 依赖或锁文件；没有处理 `QAM-06-003` drag、P2 上传/建板/连接/SSE 问题，也没有改变 `/home` 的交互。
- 已清理本轮 `coverage/`、`playwright-report/` 与 `test-results/`；Testcontainers 结束后需在最终状态复核无残留容器。既有用户改动全部保留。
- 唯一推荐下一步：按用户新增要求另行登记 Node PATH 持久化 feature，先确认非登录/权限切换环境为何丢失 `~/.local/bin`，再以 Node.js 22 固化可复现入口；完成前不启动下一个 QAM P1。

## 2026-09-06 — feat-026 Playwright Chromium 系统依赖修复

### 已完成

- 对 Playwright 1.62.1 实际使用的 Chromium 与 headless shell 执行 `ldd` 并运行最小启动探针，确认错误不只是提示文本：`libnspr4.so`、`libnss3.so`、`libnssutil3.so`、`libsmime3.so` 和 `libasound.so.2` 均未解析；官方 dry-run 共报告 39 项系统依赖缺口。
- 普通 `sudo` 需要交互认证，因此使用当前 Ubuntu WSL 的受控 root 启动入口，在同一项目和 Node.js 22 PATH 下执行官方 `npx playwright install-deps chromium`；APT 新增 28 个包、升级 11 个包，包含 NSPR/NSS、ALSA、字体、Mesa、X11 与 Xvfb，未复制单个 `.so` 或写入本机库路径补丁。
- 安装后 `npx playwright install-deps --dry-run chromium` 返回 `All system dependencies are installed.`，两个 Chromium 可执行文件的 `ldd` 均无 `not found`；最小浏览器探针成功启动 Chromium 151.0.7922.34 并完成页面读写。
- 首轮 E2E 已正常启动浏览器并通过 8/9，唯一失败是文章 Server Action 首次冷编译时仍显示 `Saving...`，5 秒 URL 断言提前超时；定向复跑在 9.0 秒内通过，证明并非发布逻辑失败。将该特定导航断言调整为与现有异步边界一致的 15 秒，最终两次全量 E2E 均为 9/9。
- `docs/testing-standards.md` 新增 Linux/WSL 的 Chromium 用户态安装、官方系统依赖安装、dry-run 检查和最小启动探针，避免后续环境重建再次以逐个复制动态库的方式修补。
- `harness-creator` 影响了生命周期处理：feat-026 是本轮唯一活动 feature，完成后同步功能状态、进度和交接；环境故障与冷编译测试时序分别取证，没有扩大到应用功能修改。

### 验证证据

- 变更前与最终 `./init.sh` 均退出 0：Prisma Client 生成、TypeScript、ESLint、58 个文件/344 项 Vitest 全部通过。
- `npx playwright install-deps --dry-run chromium`：修复前报告 39 项缺失，修复后返回 `All system dependencies are installed.`。
- Chromium 最小探针：输出 `chromium-launch-ok 151.0.7922.34 xoxo chromium smoke`；普通 Chromium 与 headless shell 的 `ldd | rg 'not found'` 均无输出。
- 定向复核 `npx playwright test --project=authenticated --grep 'creates and displays a post'`：setup 与文章发布 2/2 通过。
- 最终独立 `npm run test:e2e`：9/9 通过；发布旅程耗时 9.5 秒，未再触发默认 5 秒 URL 超时。
- `npm run check:full`：退出 0；标准门禁、Next.js 16.3.3 production build、覆盖率、7 个文件/17 项真实 PostgreSQL 集成测试和 9 项 Playwright E2E 全部通过。
- 覆盖率：statements 42.09%、branches 36.01%、functions 46.38%、lines 42.77%，均高于基线。

### 范围、清理与下一步

- 系统变更限定为 Playwright 官方 Chromium 依赖；仓库仅修改测试规范、文章 E2E 的等待边界和 Harness 状态，没有修改业务实现、npm 依赖、锁文件、Prisma schema/migration 或生产部署配置。
- 本轮创建的 `playwright-report/`、`test-results/` 和 `coverage/` 已清理；Testcontainers 未留下运行容器，既有 `.agents/`、质量文档、`PROJECT_VIEW.md` 与前序用户改动均保留。
- 唯一推荐下一步恢复为 feat-025 总览中的首要工程风险：另行登记 QAM-06 `QAM-06-001` board mutation 边界修复，不与本次环境 feature 混合。

## 2026-09-06 — feat-025 全模块工程质量审查 Skill 与持续评分基线

### 已完成

- 使用 `skill-creator` 在 `.agents/skills/` 建立 QAM-01～QAM-09 九个项目级 Skill 及 `agents/openai.yaml`。每个 Skill 明确触发范围、`PROJECT_VIEW.md` 证据入口、专项风险、固定报告路径、写入边界和复审流程；审查不以功能数量、页面复杂度或产品完整度扣分。
- 新增 `docs/optimization/module-quality-review-standard.md`，固定十维 100 分权重、L0～L4、Score/Gate/Final 分离、E1～E3 证据纪律、P0/P1/P2、稳定问题 ID、最小修正和只追加评分历史。
- 按用户补充要求，为每个模块派发独立子 Agent，并要求先显式读取对应 Skill、只写自己的报告。首批三个 Agent 因平台用量上限在生成前失败，随后以新的独立 Agent 重新派发并完成；失败尝试没有形成报告，也不计作初审。
- 九份独立初审报告均已写入 `docs/optimization/`，当前分数/Final Level 为：QAM-01 68/L1、QAM-02 71/L1、QAM-03 69/L1、QAM-04 75/L2、QAM-05 64/L1、QAM-06 57/L0、QAM-07 62/L1、QAM-08 74/L2、QAM-09 78/L2。
- 主 Agent 只做证据纪律与格式验收，并把有疑点的结论退回原独立 Agent 修订：移除未证明的 wipe P1、核正 Post→AtlasElement 外键级联方向、下调只属于一般债务的问题优先级、为 Atlas SSE 建立独立问题 ID，并修正 Compose healthcheck 不会自动触发 restart 的表述；没有代写模块初审。
- 新增 `docs/optimization/module-quality-overview.md`，汇总简单平均分 68.7、Final 分布、开放 P1×17/P2×31、趋势、报告/Skill 链接和首要风险簇；QAM-02-005 的 `not-reproduced` 历史不计入 48 个开放项。
- `harness-creator` 影响了本轮生命周期处理：feat-025 始终是唯一活动 feature，完成后同步功能状态、进度和交接；独立 Agent 采用平铺 roster，不允许继续派生，避免报告所有权重叠。

### 验证证据

- 启动基线和最终 `./init.sh` 均退出 0；Prisma Client 生成、TypeScript、ESLint、58 个文件/344 项 Vitest 全部通过。未创建 `.env` 的提示符合当前文档/Skill 任务，不影响快速门禁。
- `npm run check` 退出 0；TypeScript、ESLint、58 个文件/344 项 Vitest、Next.js 16.3.3 webpack production build（22 个页面）和覆盖率门槛通过。覆盖率为 statements 42.04%、branches 35.96%、functions 46.38%、lines 42.77%。
- 九次 `skill-creator/scripts/quick_validate.py` 均返回 `Skill is valid!`；`feature_list.json` 可被 Node 解析。
- 统一文档检查确认九份报告均按顺序包含固定八个章节和十个评分维度，Overall 分数与合计相等，Score Level 映射正确，本地文件链接可解析；开放问题精确为 48 项（P1×17、P2×31）。
- `npm run check:compose-config` 由 QAM-09 独立 Agent 实际执行并退出 0；QAM-01～08 报告分别记录其实际执行的定向 Node、组件或真实 PostgreSQL 证据，未运行的层级均明确标注。
- 两个独立 Agent 曾执行 Playwright：setup 通过，但 Chromium 因环境缺少 `libnspr4.so` 而无法启动；该结果只作为对应报告的浏览器证据缺口，不冒充通过，也不阻断本轮仅文档/Skill 的标准门禁。
- `node /home/dadalv/.agents/skills/harness-creator/scripts/validate-harness.mjs --target /home/dadalv/projects/xoxoMeridian`：100/100，五个子系统均为 5/5。

### 范围、清理与下一步

- 本轮只新增项目级 Skill、质量标准、总览、九份报告并维护 Harness 状态；没有修改应用源码、依赖、锁文件、Prisma schema/migration、认证行为或部署实现，因此按风险不要求本轮重新通过 `check:full` / Compose smoke。
- `npm run check` 自动改写的 `next-env.d.ts` 已恢复到会话前内容；本轮生成的 `playwright-report/` 与 `coverage/` 已从工作区和临时隔离目录清理，没有删除既有 `.next`、依赖或用户改动。
- 会话开始时 `AGENTS.md`、`feature_list.json`、`progress.md`、`session-handoff.md` 和未跟踪的 `PROJECT_VIEW.md` 已有前序改动；本轮保留并在状态文件上增量维护 feat-025。
- 唯一推荐下一步：另行登记 QAM-06 board mutation 边界修复 feature，只处理 `QAM-06-001`——让 Atlas element/connection mutation 限定 `atlas-global-board`，并以真实 PostgreSQL 回归证明 Home anchor/connection 不可被跨 board 删除；不要同时重构拖动、上传或 SSE。

## 2026-09-06 — feat-024 项目质量责任模块视图

### 已完成

- 从系统目标、核心用例、外部参与者/系统和 Web/Worker/init 运行路径建立顶层上下文，再用 App Router 入口、TypeScript import、Prisma models/migrations、外部 adapter、客户端状态和测试反向校验模块边界。
- 新增 `PROJECT_VIEW.md`，将系统划分为 9 个可长期追踪的质量责任模块：身份与档案、房间与消息、生活信息与计划、定时触发、内容时间线、空间画布、专注学习、Agent Runtime、应用交付拓扑。
- 为每个 QAM 统一记录 Core Responsibility、In/Out of Scope、Interfaces、Owned Data/State、Dependencies/Dependents、Internal Components、Code Mapping、Change Drivers 和 Quality Risk Surface；风险面只界定审查范围，不进行评分。
- 使用 Mermaid 记录实际重要依赖，并单独登记 Cross-cutting Concerns、QAM code mapping、明确共享文件/状态和 Quality Tracking Index。
- 保留 10 项 `Boundary Uncertainty`，包括 Atlas URL room scope 与 global board、Room/Study 循环聚合、生活领域与 Agent Tool 重叠、Scheduler/Runtime 双向协议、Post/Home board 互相装配、注册跨写成员关系、Worker 多生命周期、LLM 多 adapter 路径、README 漂移和未接入运行路径的遗留工件。
- `harness-creator` 影响了本次生命周期处理：新增 feat-024 作为唯一活动 feature，完成后同步功能状态、进度和交接；没有修改既有业务实现或扩大到边界重构。

### 验证证据

- 变更前 `./init.sh`：退出 0；Prisma Client 生成、TypeScript、ESLint、58 个文件/344 项 Vitest 全部通过。
- `PROJECT_VIEW.md` 结构检查：961 行；8 个必需顶层章节齐全；9 个 QAM 均包含统一的 11 个规格字段；Boundary Uncertainties 为 10 项。
- `npm run check`：退出 0；TypeScript、ESLint、58 个文件/344 项 Vitest、Next.js 16.3.3 production build（22 个页面）与覆盖率门槛全部通过。
- 覆盖率：statements 42.09%、branches 36.01%、functions 46.38%、lines 42.77%。
- `feature_list.json` 经 Node JSON parse 成功；`git diff --check` 通过。
- `node /home/dadalv/.agents/skills/harness-creator/scripts/validate-harness.mjs --target /home/dadalv/projects/xoxoMeridian`：100/100，instructions、state、verification、scope、lifecycle 均为 5/5。

### 范围、风险与下一步

- 本轮只新增 `PROJECT_VIEW.md` 并维护 Harness 状态，没有修改应用源码、依赖、锁文件、Prisma schema/migration、认证行为或部署路径，因此未运行 `check:full` 或 Compose smoke。
- 会话开始时 `AGENTS.md`、`feature_list.json`、`progress.md`、`session-handoff.md` 已有前序未提交修改；本轮保留这些内容，只在后三个状态文件追加 feat-024 记录。
- 本文明确记录边界不确定性，不把共享文件直接判断为缺陷，也不包含模块质量评分。
- 唯一推荐下一步：另行登记 QAM-08 模块质量基线 feature，使用 `PROJECT_VIEW.md` 的范围生成独立追踪文档，先审查 Agent Task/Tool/Trace 边界，不在同一 feature 中实施重构。

## 2026-09-06 — feat-023 阻塞根因与 Node.js 22 环境修复

### 已完成

- 严格按启动工作流恢复 feat-023 为唯一 `in-progress` feature；确认依赖 feat-022 已为 `done`，未扩大到业务实现、数据库或部署改动。
- 当前 shell 原本解析到 `/usr/local/node/bin/node` v24.20.0，`./init.sh` 按预期立即拒绝。通过 Node.js 官方发布包和 `SHASUMS256.txt` 的一致 SHA-256 校验，将 v22.23.2 非破坏性安装到 `~/.local/node-v22.23.2`，并在 PATH 优先的 `~/.local/bin` 建立 `node`、`npm`、`npx`、`corepack` 入口；原 Node 24 安装保留。
- 从第一性原理拆分 TypeScript 配置内容、Next.js 调用层和执行权限：Node 22/24 直接运行 `tsc --showConfig` 均输出相同的 18400 字节合法 JSON；Next.js 16.3.3 默认用 `experimental.useTypeScriptCli` 捕获子进程输出，而相同 helper 在受限沙箱内得到空 stdout，最小 `spawnSync` 探针同时报告 `EPERM`，故 JSON 解析报错只是下游症状。
- 在正常权限边界运行完全相同的 Next.js helper，得到 `stdoutLength=18400`、`parsed=true`；随后生产构建和标准门禁均通过，证明原阻塞不是 `tsconfig.json` 或应用源码缺陷。
- 在 `AGENTS.md` 验证门禁中新增窄范围的权限型对照复核规则：只有同一 Node 版本、同一原命令在正常权限边界仍失败时，才把这类 `EPERM`、空 stdout 或 `--showConfig` 解析错误视为代码阻塞；两次原始结果都必须记录。

### 验证证据

- 修复前 `node --version`：v24.20.0；修复前 `./init.sh`：退出 1，原文为“需要 Node.js 22，当前为 v24.20.0。”
- 修复后 `command -v node && node --version && npm --version`：`/home/dadalv/.local/bin/node`、v22.23.2、npm 10.9.8；下载包 SHA-256 为 `d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307`，与官方清单一致。
- 修复后 `./init.sh`：退出 0；Prisma Client 生成、TypeScript、ESLint、58 个文件/344 项 Vitest 全部通过。
- Next.js helper 对照：受限沙箱内 `exitCode=0`、`stdoutLength=0`、`parsed=false`，沙箱外 `exitCode=0`、`stdoutLength=18400`、`parsed=true`；最小子进程探针在沙箱内报告 `spawnSync ... EPERM`。
- 沙箱外 `npm run build`：退出 0；Next.js 16.3.3 webpack 生产构建、TypeScript、22 个静态页面及 build trace 完成。
- 沙箱外 `npm run check`：退出 0；58 个文件/344 项 Vitest 两轮通过，生产构建通过，覆盖率 statements 42.09%、branches 36.01%、functions 46.38%、lines 42.77%，全部满足门槛。
- `node /home/dadalv/.agents/skills/harness-creator/scripts/validate-harness.mjs --target /home/dadalv/projects/xoxoMeridian`：100/100，instructions、state、verification、scope、lifecycle 均为 5/5；`AGENTS.md` 为 93 行，硬约束仍为 15 条。

### 风险与下一步

- Node.js 22 安装位于用户目录、不受 Git 管理；`~/.local/bin` 当前优先于 `/usr/local/node/bin`，但新会话仍应由 `./init.sh` 复核 major 版本。仓库依赖与锁文件未改变，因此本轮不触发依赖审计更新。
- 本 feature 只修改 Harness 文档和状态；没有 `.env`，也没有业务、数据库、认证或部署路径变更，因此按风险执行标准门禁，未重复运行 `check:full` 或 Compose smoke。
- 唯一推荐下一步：另行登记 Trace 隐私治理 feature，先定义字段级脱敏、敏感数据分级、保留/删除策略、Run 总耗时与全局顺序号；不要与 Tool 隔离或外部副作用协议合并。

## 2026-08-31 — feat-023 固化会话退出检查清单

### 已完成

- 在 `AGENTS.md` 新增“会话退出检查清单”，将构建、测试、进度、临时工件和启动路径五项全部满足定义为“完成”或“清洁退出”的前提。
- 清单规定未运行、失败或环境阻塞必须原样记录，失败诊断工件只能对应 `blocked` 交接；同时要求 `git diff --check` 与 `git status --short`，但不允许删除既有用户改动。
- 使用 `harness-creator` 审查：`AGENTS.md` 为 92 行，符合 feat-005 的 50-200 行标准；硬约束仍为 15 条，结构性验证为 100/100。

### 验证证据

- `./init.sh`：通过；Prisma Client 生成、TypeScript、ESLint、58 个文件/344 项 Vitest 测试全部通过。
- `node /home/dadalv/.agents/skills/harness-creator/scripts/validate-harness.mjs --target /home/dadalv/projects/xoxoMeridian`：100/100，五个 Harness 子系统均为 5/5。
- `wc -l AGENTS.md`：92，符合 50-200 行标准。
- `git diff --check`：通过；`git status --short` 仅显示本 feature 的 `AGENTS.md` 与 `feature_list.json`，随后会话记录也将成为预期改动。
- `npm run check`：失败；`typecheck`、`lint`、58 个文件/344 项 Vitest 通过，但 `npm run build` 在 Next.js 16.3.3 阶段以 `Could not parse output from TypeScript's --showConfig.` 退出 1，因此本 feature 不得标记为完成或清洁退出。

### 阻塞与下一步

- 阻塞：先独立复现并定位 `npm run build` 的 TypeScript `--showConfig` 解析失败；在构建通过前不得将 feat-023 由 `blocked` 改为 `done`。

## 2026-08-31 — feat-022 建立 Compose 部署烟雾验证

### 已完成

- 新增 `docker-compose.smoke.yml`，仅为测试覆盖固定 `container_name`、宿主端口和数据 bind mount：随机 project 为全部容器命名，PostgreSQL 不发布宿主端口，Web 使用临时 `127.0.0.1` 端口，chat log/Atlas 数据使用 `/tmp` 下独立目录，PostgreSQL 使用 project-scoped named volume；生产 Compose、Dockerfile 和镜像策略未改动。
- 新增 `scripts/compose-deployment-smoke.ts` 与 `npm run check:compose-config` / `npm run test:compose-smoke`。前者用临时非敏感 env 渲染并断言隔离 project、卷、端口、build target、production 环境和 `AGENT_TASK_INLINE_RUN=false`，不访问 Docker daemon；后者实际构建 Web/Worker 镜像。
- Smoke 按 `postgres → init → web + agent-worker` 运行：验证 init 以 exit 0 完成迁移/seed、Web Docker healthcheck 与 `/api/health`、Web PID 1 的 `/sbin/tini -- node server.js` standalone 命令（不是 `next dev`）、独立 Worker entry 运行。
- Harness 经 Compose Web 注册用户并创建 AgentTask，轮询受认证任务 API，验证最终消息、completed `plan`/`final` durable steps 与房间消息 API；再将 `agent.task.running` 事件中的 `workerId` 与 `agent-worker` 容器 hostname 匹配，证明不是 inline Runtime 消费。
- 失败时写入 `test-results/compose-smoke/` 的 Compose `ps`/日志，结束时执行 `down --volumes --remove-orphans --rmi local`，移除 project 专属 Worker/Web 测试镜像，并主动断言不存在同 project 的容器、网络、卷或测试镜像。

### 验证证据

- `npm run check:compose-config`：通过；只执行 Compose config 渲染和隔离断言，未访问 Docker daemon。
- `sudo -n -g docker -u dadalv npm run test:compose-smoke`：退出 0；实际构建 production Web/Worker，init exit 0，Web health 与 standalone 命令通过；任务 `cmtgyjlcb00099cmp78ie5axr` 由 `agent-worker` 容器 hostname 对应的 Worker 完成，durable `plan`/`final` 和房间可见消息均通过，随机 project 的容器、网络、卷和测试镜像清理后无残留。
- `npm run check:quick`：TypeScript、ESLint、58 个文件/344 项 Vitest 全部通过。
- `git diff --check`：通过。

### 风险与后续

- Compose smoke 需要 Docker Compose 2.24.4+ 以支持隔离 override 中的 `!reset` / `!override`；它应在 CI 或发布候选环境作为单独门禁运行，不能替代 `check:full` 的应用级覆盖。
- 当前生产 Compose 的固定 `container_name`、Worker `latest` 标签和缺少 Worker healthcheck 仍是独立运维改进项，未在本 feature 中变更。

### 下一步

在确定产品优先级后登记唯一的新 feature；如要继续提升 Runtime，优先单独规划 Trace 隐私治理，不与部署 smoke 或 Tool 隔离混合。

## 2026-08-31 — Compose 部署与测试环境复核（仅登记，未启动 feature）

### 结论

- `docker-compose.yml` 当前没有阻止单机部署的结构性错误：`postgres` 有健康检查，`init` 依赖 `service_healthy`，`web` 与 `agent-worker` 依赖 `init` 的 `service_completed_successfully`；Web 使用 non-root production standalone runner，Worker 独立消费任务。
- `docker compose config -q` 当前退出 0，但这只证明 Compose 插值和模型可渲染，不能证明镜像构建、init 的迁移/seed/挂载目录权限、Web healthcheck、Worker 消费或真实运行环境成功。
- `npm run check:full` 是有效的应用门禁，却不是部署门禁：Playwright 启动 PostgreSQL Testcontainer、迁移/seed 和本机 `next dev --webpack --hostname 127.0.0.1 --port 3100`；它不会构建或运行 `web-runner`、`worker-runner`、`init` 容器。
- E2E 明确设置 `AGENT_TASK_INLINE_RUN=false`，但不启动 `agent-worker`；现有浏览器用例仅发送普通房间消息，未验证 Worker 接管 AgentTask。因此不能依据现有测试宣称 `docker compose build web agent-worker init && docker compose up -d` 已获端到端覆盖。

### 已登记范围

- 新增 `feat-022`，状态为 `not-started`、依赖 `feat-021`。该 feature 只建立隔离 Compose smoke test：构建镜像、启动服务、检查 init/Web、提交 AgentTask 并证明独立 Worker 完成；不混入镜像标签、固定 container_name、Worker 健康探针或存储卷策略等后续运维增强。
- `harness-creator` 的结构性检查为 100/100，说明指令、状态、验证入口、范围与交接齐全；但仓库内未发现 GitHub Actions、GitLab CI、Jenkins 等受版本控制的 CI 配置，完整门禁尚未被强制为合并/发布门槛。

### 下一步

保持 `feat-022` 为唯一推荐下一项。开始时先将它改为 `in-progress`，再在不接触生产数据的独立 Compose project 中实现和验证。

## 2026-08-31 — feat-021 收紧生产 Agent 执行边界与预算部署配置

### 已完成

- `POST /api/agent/tasks/[taskId]/run` 在 `AGENT_TASK_INLINE_RUN=false` 时只返回 `202 queued`，不会导入或调用 `runAgentTask`；Docker Compose 生产环境因此只能由 `agent-worker` 消费任务。
- 手动执行仅在明确启用 inline 的本地开发/测试模式可用，并在执行前按用户与 IP 使用 10 次/分钟限流，避免该调试入口绕过入口保护后无界触发。
- Compose 的共享应用环境新增全部 Runtime Budget 配置：turn、Tool 调用、总时限、token、cost、completion token 与输入/输出价格快照；`web`、`agent-worker` 与 `init` 都继承该环境。
- 新增 Route Handler 行为测试，覆盖生产只排队、inline 执行、限流拒绝；测试先发现并修复了新限流代码对旧 `_request` 参数名的引用错误。

### 验证证据

- `./init.sh`：修改前基线通过，57 个文件/341 项 Vitest。
- `npm run test:unit -- tests/server/agent-task-run-route.test.ts`：1 个文件/3 项通过。
- `env ... docker compose config --quiet`：Compose 配置有效；用无敏感测试值渲染确认 web、agent-worker 与 init 均接收 8 项 Runtime Budget 覆盖变量。
- `npm run check:quick`：TypeScript、ESLint、58 个文件/344 项 Vitest 全部通过。

### 风险与后续

- 当前审查未发现开放 P0，因此本 feature 没有 P0 代码改动。
- 生产路径的 Worker 专属执行边界已恢复；inline 限流是进程内保护，仅面向本地开发/测试，生产仍应保持 `AGENT_TASK_INLINE_RUN=false`。
- Trace 隐私治理、Tool 隔离与未来外部副作用的供应商幂等/Outbox 协议不属于本 feature，必须单独登记。

### 下一步

登记并单独启动 Trace 隐私治理 P2 feature，先实现字段级脱敏、敏感数据分级、保留/删除策略、Run 总耗时与全局顺序号。

## 2026-08-31 — feat-020 持久化 Runtime Budget 与 L3 Gate

### 已完成

- 新增时间戳迁移 `20260831111500_add_agent_runtime_budget`：`AgentTask` 冻结 `maxTurns`、`maxToolCalls`、`maxRuntimeMs`、`maxTokens`、`maxCostMicros`、单次完成 token 上限和输入/输出价格快照，并累计 turns、Tool attempts、tokens 与 cost；新增 `deadlineAt`、`limitReason` 和不可重新 claim 的 `limit_exceeded` 终态。`LLMCall` 以 `(taskId, turnIndex)` 唯一记录 reservation、实际用量与 cost。
- 新增 `agent/runtime-budget.ts`。Run 首次执行才初始化 deadline；Model 在调用供应商前于 lease 栅栏事务内预留 turn、token/cost，未知用量或崩溃遗留的 running call 保持保守 reservation；成功后按供应商 usage 与每 Run 价格快照结算。Tool 的每次 retry attempt 在执行前原子累计，避免重试绕开 `maxToolCalls`。
- Runtime 将同一 deadline `AbortSignal` 传给 LLM 与 Tool，并在 Plan、Tool 与 Final 边界检查预算。任一上限耗尽由 tracer 以稳定中文提示、明确 `limitReason`、失败 final step 和 `agent.task.limit_exceeded` Event 原子提交，重复恢复或失权 attempt 不能覆盖该终态。
- 环境配置经 Zod 校验，采用避免过早触发终态的高默认值：16 turns、64 Tool attempts、24 小时、1,000,000 tokens 和 20 USD；创建消息、Scheduler 和 dispatch API 均在创建任务时冻结配置。Chat 状态类型与徽章同步识别 `limit_exceeded`。
- 使用 `agent-runtime-review` Skill 复审：Runtime Budget 从 0/8 提升到 8/8，总分由 88 提升到 97；L3 预算门槛通过，最终等级由 L2 提升到 L3。

### 验证证据

- `./init.sh`：feat-020 修改前基线通过，56 个文件/338 项 Vitest。
- `npm run test:unit -- tests/agent/runtime-budget.test.ts tests/agent/task-claim.test.ts tests/agent/agent-runtime.test.ts tests/agent/tool-registry-reliability.test.ts`：4 个文件/24 项测试通过。
- `sudo -n -g docker -u dadalv npm run test:integration -- tests/integration/agent-runtime-budget.integration.test.ts`：1 个文件/3 项真实 PostgreSQL 测试通过，覆盖用量累计、Crash Recovery、token/cost 结算、deadline 终态与不可重复执行。
- `npm run check:quick`：TypeScript、ESLint、57 个文件/341 项 Vitest 全部通过。
- `sudo -n -g docker -u dadalv npm run check:full`：退出 0；Prisma Client 生成与 Next.js 16.3.3 生产构建通过，覆盖率 statements 41.77%、branches 35.90%、functions 46.21%、lines 42.44%，7 个文件/17 项 PostgreSQL 集成测试及 9 项 Playwright E2E 全部通过。

### 风险与后续

- 预算累计为 crash-safe 而保守：供应商未返回 usage 或 Worker 在调用后崩溃时 reservation 不释放，可能较早耗尽预算，但不会低估消耗并继续执行。
- 本 feature 只关闭 Runtime Budget；Trace 仍需字段脱敏、敏感数据分级、保留/删除、全局顺序号和 Run 总耗时。Tool 仍无独立资源沙箱与 HITL Edit；未来邮件、支付、外部发布等副作用仍需供应商幂等键或 Outbox/relay。

### 下一步

登记并单独启动 Trace 隐私治理 P2 feature，先实现字段级脱敏、敏感数据分级、保留/删除策略、Run 总耗时与全局顺序号；不要与 Tool 隔离或外部副作用协议合并。

## 2026-08-31 — feat-019 通用 Durable Step 恢复模型与 P1 汇总复审

### 已完成

- 新增持久化 `AgentStep` 状态机和 `AgentTask.currentStepKey`；每个 Step 以 `(taskId, stepKey)` 唯一记录 `plan` / `tool` / `final` kind、输入输出、状态、attempt 次数与起止时间，并通过时间戳迁移保持部署兼容。
- 新增统一 Durable Step API，在 lease 栅栏内完成 Step 开始、恢复、完成和失败状态转移；Step kind 或规范化输入与既有 checkpoint 不一致时拒绝重放。
- Runtime 的 Plan、全部读取/写入 Tool 与 Final 均通过稳定 Step key 执行；completed Plan/Tool checkpoint 会先校验持久化输出再直接复用，不重复调用 LLM、读取 Tool 或副作用 Tool。
- high-risk Tool 请求审批时将对应 Step 持久化为 `waiting_approval`；批准后改为 `pending` 并由新 attempt 恢复，拒绝时 Step 与任务以 permission 类别终止。
- Final 消息、`final` Step 完成和 `AgentTask.completed` 在同一租约栅栏事务提交；旧 attempt 或重复 Final 无法创建第二条可见消息。
- `memory.recall` 的 `updatedAt` 统一输出 ISO 字符串，确保经过 Prisma JSON checkpoint 后仍能通过相同 output schema 的恢复校验。
- 使用 `agent-runtime-review` Skill 完成 P1 汇总复审：工程分由 74 提升至 88；四项 P1 全部关闭。分数落在 L3 区间，但 Runtime Budget 仍为 0/8，L3 Gate 未通过，最终等级为 L2。

### 验证证据

- `./init.sh`：feat-019 修改前基线通过，56 个文件/338 项 Vitest。
- `npm run test:unit -- tests/agent/tool-registry-reliability.test.ts tests/agent/agent-runtime.test.ts tests/agent/task-claim.test.ts`：3 个文件/21 项测试通过。
- `sudo -n -g docker -u dadalv npm run test:integration -- tests/integration/agent-durable-step.integration.test.ts`：1 个文件/2 项真实 PostgreSQL 测试通过，覆盖 Plan/read Tool checkpoint 恢复、审批继续、Final 栅栏与副作用重放。
- `sudo -n -g docker -u dadalv npm run test:integration -- tests/integration/agent-task-claim.integration.test.ts`：1 个文件/2 项通过，确认 Crash Recovery 接管后遵循统一 Final Step 协议。
- `sudo -n -g docker -u dadalv npm run test:integration`：6 个文件/14 项全部通过。
- `npm run check:quick`：TypeScript、ESLint、56 个文件/338 项 Vitest 全部通过。
- `sudo -n -g docker -u dadalv npm run check:full`：退出 0；快速门禁、Next.js 生产构建、覆盖率基线、6 个文件/14 项 PostgreSQL 集成测试与 9 项 Playwright E2E 全部通过。
- `git diff --check`：通过。

### 风险与后续

- 当前 P1 已全部完成；Runtime 仍没有 `max_turns`、`max_tool_calls`、Run deadline、token/cost budget 和明确的超限终态，因此不能越过 L3 Gate，也不能宣称生产就绪。
- Durable Step 已覆盖当前同库副作用；未来新增邮件、支付或外部发布等非数据库写操作时，仍必须提供供应商幂等键或 Outbox/relay，不能仅依赖数据库 checkpoint。
- Trace 仍保存较完整的 LLM payload，缺少字段级脱敏、保留周期、成本聚合与全局顺序号；Tool 隔离仍主要依赖应用/容器边界，尚无每 Tool 独立沙箱。

### 下一步

登记一个独立 P2 feature，实现 Runtime Budget：为 Run 增加 `max_turns`、`max_tool_calls`、统一 deadline、token/cost 上限与稳定 `LIMIT_EXCEEDED` 终态，并提供预算耗尽恢复测试。

## 2026-08-31 — feat-018 Tool 输入输出 Zod 契约

### 已完成

- 新增 13 个内置 Tool 的集中式 Zod input/output 契约；Registry 注册时必须解析出两类 schema，否则拒绝注册。Planner 使用的 JSON Schema 由同一 `inputSchema` 生成，不再以手写 JSON 元数据作为执行校验依据。
- Executor 在审批、Retry 与 Tool 执行前 `safeParse` 输入；解析结果会剥离未知字段，并作为审批绑定与 Tool 实际参数。失败只记录 direction、issue path/code/message，不把原始不可信载荷写入 Validation Event。
- 普通与数据库写 Tool 的 output 都在 ToolCall 完成、下游结果收集或事务提交前校验；已持久化的 replay output 复用前也重新校验。
- `ToolValidationError` 统一归类为 `validation` 且 `retryable=false`；即使 Tool 配置了瞬时错误 Retry，输入/输出契约错误也只执行一次。
- 真实 PostgreSQL 故障测试让数据库 Tool 先创建 Memo 再返回错误形状，证明 output 校验异常会回滚 Memo、留下失败 ToolCall，且不会提交无效结果。

### 验证证据

- `./init.sh`：feat-018 修改前基线通过，56 个文件/335 项 Vitest。
- `npm run test:unit -- tests/agent/tool-registry-reliability.test.ts tests/agent/agent-runtime.test.ts tests/agent/task-claim.test.ts`：3 个文件/21 项测试通过。
- `sudo -n -g docker -u dadalv npm run test:integration -- tests/integration/agent-tool-idempotency.integration.test.ts`：1 个文件/4 项真实 PostgreSQL 测试通过，覆盖重放幂等、普通失败回滚、deadline 回滚和无效 output 回滚。
- `npm run check:quick`：TypeScript、ESLint、56 个文件/338 项 Vitest 全部通过。
- `git diff --check`：通过。

### 风险与后续

- Zod 契约负责结构、类型、长度与枚举；房间所有权、资源存在性、cron 语义、Memory scope 等依赖数据库或业务上下文的规则仍由 Tool 内部领域校验执行，不能被静态 schema 替代。
- 既有 Tool 源文件中的手写 `schema` 字段仅作为未注册对象的旧元数据；Registry 注册后会以 Zod input contract 生成的 JSON Schema 覆盖它，Runtime 与 Planner 使用的有效 schema 已同源。后续可做纯维护性清理，但不属于本 feature 验收范围。

### 下一步

登记并单独启动通用 Durable Step feature，将 Plan、读取/写入 Tool、审批与 Final 统一为持久化 step 状态和 `currentStepKey`，恢复时跳过所有已完成步骤。

## 2026-08-30 — feat-017 统一 Tool Deadline 与受控 Retry

### 已完成

- 新增统一 `ToolExecutionError`、`ToolTimeoutError` 与错误分类，将 Executor 超时、Abort、常见 Node 网络错误和 Prisma 瞬时错误转换为稳定类别与 retryable 语义。
- `ToolRegistry` 为每次 Tool attempt 创建 `AbortController`，使用 `AGENT_TOOL_TIMEOUT_MS` 强制 deadline，并把同一 `AbortSignal` 传给 Tool；数据库写 Tool 同时设置 Prisma interactive transaction timeout，超时会拒绝事务并回滚副作用。
- 全部 13 个内置 Tool 显式声明 retry policy；Executor 仅在错误本身 retryable、类别在 Tool allowlist 内且尚未达到 `maxAttempts` 时执行指数退避，普通业务错误、权限/输入错误不会重试。
- 每次 Retry 记录 attempt、下一 attempt、退避、错误类别与 step key；最终失败 Event 也带 `errorCategory`。天气与搜索适配层复用 Executor signal，Runtime 超时不会被 provider fallback 吞掉。
- 新增行为测试覆盖统一超时中止、瞬时失败后成功、不可重试错误、重试耗尽，以及真实 PostgreSQL 中“先写 Memo、再等待超时”的事务回滚。

### 验证证据

- `./init.sh`：feat-017 修改前基线通过，55 个文件/330 项 Vitest。
- `npm run test:unit -- tests/agent/tool-registry-reliability.test.ts tests/agent/agent-runtime.test.ts tests/agent/task-claim.test.ts`：3 个文件/17 项测试通过。
- `sudo -n -g docker -u dadalv npm run test:integration -- tests/integration/agent-tool-idempotency.integration.test.ts`：1 个文件/3 项真实 PostgreSQL 测试通过；超时用例证明事务内 Memo 为 0 且失败 ToolCall 持久化。
- `npm run check:quick`：TypeScript、ESLint、56 个文件/335 项 Vitest 全部通过。
- `git diff --check`：通过。

### 风险与后续

- JavaScript 无法抢占同步阻塞 CPU 的 Tool；当前 Registry Tool 均为有限同步计算或异步 I/O，I/O 通过 Executor deadline 和 `AbortSignal` 受控。未来 CPU 密集 Tool 应放入受限 Worker/容器，而不是主 Runtime 进程。
- 天气与搜索保留 provider 失败时的既有 mock fallback；只有 Runtime signal 超时会穿透 fallback，由 Executor 统一分类。该产品降级语义不等同于 Retry。
- 当前 Tool 仍主要依靠给 Planner 的 JSON Schema 与各实现手工检查，下一 feature 将改为 Executor 运行时 Zod 输入/输出契约。

### 下一步

登记并单独启动 Tool schema feature，为每个 Registry Tool 提供 Zod input/output schema，并在 Executor 中统一校验和分类 Validation 错误。

## 2026-08-30 — feat-016 AgentTask Lease 与 Worker Crash Recovery

### 已完成

- 为 `AgentTask` 新增 `attemptCount`、`attemptId`、`workerId`、`heartbeatAt` 与 `leaseExpiresAt`，新增 `(status, leaseExpiresAt, createdAt)` 扫描索引及时间戳迁移；既有 `running` 且无 lease 的遗留任务被视为可恢复候选。
- Claim 通过单条条件更新获取 `pending`、`failed` 或 lease 已过期的 `running` 任务，每次生成新 attempt；heartbeat 只能为未过期且仍匹配 `attemptId + workerId` 的当前所有者续租。
- Dispatcher 同时扫描 `pending` 与过期 `running`，Worker 进程使用稳定 `workerId`；Runtime 在长异步边界、Tool 和 Final 前检查 lease，停止时清理 heartbeat timer。
- 数据库写 Tool 在原事务开头续租并锁定当前 attempt；high-risk 审批暂停、Plan checkpoint、成功/失败终态与最终消息均执行 attempt 栅栏，旧 Worker 失权后不能提交副作用或可见终态。
- 新增独立 Worker 子进程强制退出测试：子进程 claim 成功后由测试进程发送 `SIGKILL`，随后按 lease 到期时间接管，并证明旧 attempt 不能续租、不能创建终态消息或覆盖恢复结果。

### 验证证据

- `./init.sh`：变更前基线通过，54 个文件/329 项 Vitest。
- `npm run test:unit -- tests/agent/task-claim.test.ts tests/agent/task-dispatcher.test.ts`：2 个文件/3 项测试通过。
- `sudo -n -g docker -u dadalv npm run test:integration -- tests/integration/agent-task-claim.integration.test.ts`：1 个文件/2 项真实 PostgreSQL 测试通过，覆盖 12 路原子 claim、heartbeat 续租、未过期拒绝、Worker `SIGKILL`、过期接管与旧 attempt 终态栅栏。
- `sudo -n -g docker -u dadalv npm run test:integration -- tests/integration/agent-task-claim.integration.test.ts tests/integration/agent-tool-idempotency.integration.test.ts tests/integration/agent-tool-approval.integration.test.ts`：3 个文件/6 项通过，确认 lease 改动未破坏既有副作用重放幂等与审批恢复。
- `npm run check:quick`：TypeScript、ESLint、55 个文件/330 项 Vitest 全部通过。
- `git diff --check`：通过。

### 验证过程与风险

- 沙箱内首次运行 Docker 集成测试原始失败为 `sudo: The "no new privileges" flag is set`；授权后使用同一命令通过。
- 当前 Runtime 对 lease 的数据库栅栏已覆盖数据库写 Tool、审批暂停、Plan 与终态；读取 Tool 的外部请求可在失权后完成但其结果不会提交终态，下一 feature 的统一 deadline/AbortSignal 会进一步缩短该窗口。
- 锁定的 Prisma 5.22 在 Node 22.22.1 下再次出现 generator 静默不刷新；使用同属 Node.js 22 的临时 22.11.0 成功生成 Client，依赖与锁文件未改变。

### 下一步

登记并单独启动统一 Tool deadline/Retry feature，为全部 Tool 提供 Runtime deadline、AbortSignal、幂等感知的有限退避 Retry 与错误分类。

## 2026-08-30 — P0 汇总复审与完整门禁

### 已完成

- 使用 `agent-runtime-review` Skill 对 feat-012 至 feat-015 的实现、迁移与测试证据重新评分；`docs/optimization/agent-runtime-review.md` 已由原始 49/100 更新为 74/100，并明确记录 score level 为 L2、gate level/最终等级为 L1。
- 复审确认原报告四项 P0 均已关闭：AgentTask 原子 claim、数据库副作用 step 重放幂等、high-risk Tool 持久化 Approve/Reject、Scheduler Job/Task/Event 原子派生。
- 没有把复审中仍开放的 P1/P2 扩入本轮：Worker lease/heartbeat、统一 Tool timeout/retry/schema、通用 Durable Step、Runtime Budget 与成本/脱敏继续作为后续独立 feature。

### 最终验证证据

- `sudo -n -g docker -u dadalv npm run check:full`：退出 0。
- 快速门禁：TypeScript、ESLint、54 个文件/329 项 Vitest 全部通过。
- 生产构建：Prisma Client 生成与 Next.js 16.3.3 webpack 构建通过，包含审批 API 路由。
- 覆盖率：statements 42.88%、branches 37.36%、functions 48.85%、lines 43.68%，全部满足非回退门槛。
- PostgreSQL：5 个文件/9 项集成测试通过；覆盖 12 路 claim、Tool 重放/事务回滚、审批恢复/拒绝、Scheduler Event trigger 故障注入及既有约束/权限/级联。
- Playwright：1 条认证 setup + 8 条公共/认证旅程，共 9 项通过。

### 风险与下一步

- 完整门禁中锁定的 Prisma 5.22 已在当前 Node.js 22 环境正常生成 Client；此前一次 generator 子进程静默退出未在最终门禁复现，不作为当前阻塞。
- 唯一推荐下一步：登记独立 P1 feature，实现 AgentTask lease/heartbeat、过期 `running` 原子接管与 Worker Crash Recovery 集成测试。

## 2026-08-30 — feat-015 Scheduler 原子任务派生

### 已完成

- 抽取轮询与近时 timer 共用的 `claimAndDispatchScheduledJob`，在单个 Prisma 事务中执行 ScheduledJob 旧版本 CAS、下一运行状态、AgentTask 创建和 `scheduler.job.fired` Event 写入。
- Task 或 Event 任一步失败都会回滚整个事务，不再需要先创建 Task、再写 Event、最后尝试反向恢复 Job 的非原子流程。
- 事务外失败计数改为使用旧 `enabled`、`nextRunAt`、`lastRunAt` 与 `failCount` 的条件更新；若其他 Worker 已推进 Job，过期失败只记录 warning，不覆盖新状态。
- 扩展 Scheduler 单元测试事务 mock，覆盖 Event 写入失败后的孤儿 Task 回滚以及 stale failure 不覆盖新 claim。
- 新增真实 PostgreSQL trigger 故障注入集成测试，只让 fired Event 插入失败，验证 Task/Event 均不落库且 Job 恢复旧时间、`failCount` 原子递增。

### 验证证据

- `./init.sh`：变更前基线通过，54 个文件/327 项 Vitest 测试通过。
- `npm run test:unit -- tests/agent/scheduler-tick.test.ts`：1 个文件/12 项测试通过。
- `sudo -n -g docker -u dadalv npm run test:integration -- tests/integration/scheduler-atomic-dispatch.integration.test.ts`：1 个文件/1 项真实 PostgreSQL 测试通过；预期故障原文为 `P0001: simulated scheduler Event failure`，断言 Task=0、Event=0、Job nextRunAt/lastRunAt 回滚且 failCount=1。
- `npm run check:quick`：类型、ESLint、54 个文件/329 项 Vitest 测试通过。
- `git diff --check`：通过。

### 风险与后续

- 数据库事务解决了当前同库 Task/Event 派生的 P0；若未来向外部队列或消息总线发布，仍需独立 Outbox/relay feature，不能把网络发送视为数据库事务的一部分。
- Worker Crash 后 `running` 任务的 lease/heartbeat/回收仍是审查报告中的 P1，不属于本次 P0 范围。

### 下一步

完成 P0 汇总验证并更新 Agent Runtime Review、会话交接；后续新 feature 优先处理 P1 lease/heartbeat 与过期 `running` 回收。

## 2026-08-30 — feat-014 高风险 Tool 持久化审批

### 已完成

- 为全部 13 个 Registry Tool 增加显式 `low`/`medium`/`high` 风险等级；永久删除 `memo.delete` 为 `high`，其余读取与可恢复写入按影响分为 low/medium。
- 新增 `AgentToolApproval` 持久化模型、风险/审批枚举以及 `waiting_approval`、`cancelled` 任务状态；审批记录稳定绑定 `(taskId, stepKey)`、Tool 名称和规范化输入，批准不能转用于另一个 Tool 或不同参数。
- high Tool 首次执行只原子创建 approval、记录事件并把任务切到 `waiting_approval`，不会创建 ToolCall 或提交删除；Runtime 将该状态作为可恢复暂停而非失败。
- 新增受认证审批 API，先校验任务所在房间成员资格，再对 pending approval 做 CAS Approve/Reject；Approve 使任务回到 `pending` 并由 Worker/内联 Runtime 恢复，Reject 使任务终止为不可 claim 的 `cancelled`。
- Room snapshot、Agent 状态 API、任务详情与 Trace 均暴露审批状态；Chat 增加可键盘操作且有可访问名称的批准/拒绝面板。
- 新增真实 PostgreSQL 审批恢复测试与组件交互测试，并同步现有 snapshot 测试夹具。

### 验证证据

- `./init.sh`：变更前基线通过，53 个文件/325 项 Vitest 测试通过。
- `npm run test:unit -- tests/agent/agent-runtime.test.ts tests/agent/task-claim.test.ts`：2 个文件/13 项测试通过，验证所有 Tool 风险分级及 Runtime 恢复行为。
- `npm run test:component -- tests/component/tool-approval-panel.test.tsx`：1 个文件/1 项测试通过；批准按钮提交明确 decision、成功后移除待审批项并刷新。
- `sudo -n -g docker -u dadalv npm run test:integration -- tests/integration/agent-tool-approval.integration.test.ts`：1 个文件/2 项真实 PostgreSQL 测试通过；覆盖批准前保留数据/无 ToolCall、审批持久化、Registry 重建、批准输入绑定、只删除一次、拒绝后取消且不可 claim。
- `npm run check:quick`：类型、ESLint、54 个文件/327 项 Vitest 测试通过。
- `git diff --check`：通过。

### 风险与后续

- 当前唯一 high Tool 是 `memo.delete`；新增永久删除、外部发送、支付、部署等 Tool 时必须显式标 high，并复用同一审批策略。
- 本 feature 提供 Approve/Reject，不提供修改 Tool 输入的 Edit 流程；P0 的人工确认与恢复已满足，Edit 可作为后续独立增强。
- Prisma Client 继续使用临时 Node.js 22.11.0 运行锁定的 Prisma 5.22 generator；依赖和锁文件未改变。

### 下一步

登记并单独启动 Scheduler 原子派生 feature，把 Job claim、AgentTask 创建与 Event 写入收敛到同一事务，消除孤儿任务与重复派生。

## 2026-08-30 — feat-013 副作用 Tool 重放幂等

### 已完成

- 为 `ToolCall` 新增可空 `stepKey` 及 `(taskId, stepKey)` 唯一约束，并新增时间戳迁移 `20260830152500_add_tool_call_step_key`，未修改既有迁移。
- Runtime 会验证并恢复任务已经持久化的 plan，不再为已开始任务重新调用 LLM；Tool 及同 Tool 数组输入按确定性顺序获得 `tool:1`、`tool:2` 等稳定 step key。
- Registry 标记全部数据库写 Tool；其业务写入、ToolCall 完成结果及 started/completed Event 在同一 Prisma 事务提交。提交后重放会直接返回持久化 output，并记录 `agent.tool.replayed`。
- Tool 在业务写入后抛错时，事务会回滚副作用，再单独持久化 `failed` ToolCall；不会留下“资源已写入但步骤无结果”的窗口。
- 覆盖 `memo.create`、`memo.update`、`memo.delete`、`schedule.create`、`schedule.update`、`schedule.cancel` 与 `memory.set` 的数据库写标记。

### 验证证据

- `./init.sh`：变更前基线通过，53 个文件/322 项 Vitest 测试通过。
- `npm run test:unit -- tests/agent/task-claim.test.ts tests/agent/agent-runtime.test.ts`：2 个文件/12 项测试通过；持久化 plan 恢复时未创建 LLM provider，也未重写 plan。
- `sudo -n -g docker -u dadalv npm run test:integration -- tests/integration/agent-tool-idempotency.integration.test.ts`：1 个文件/2 项真实 PostgreSQL 测试通过；memo/schedule 各重放一次仍各只有 1 个资源，写后失败场景资源回滚且 ToolCall 为 `failed`。
- `npm run check:quick`：类型、ESLint、53 个文件/325 项 Vitest 测试通过。
- `git diff --check`：通过。

### 风险与后续

- 当前幂等事务覆盖 Registry 中声明的数据库副作用 Tool；未来接入邮件、支付等外部写操作时必须使用供应商幂等键或 Outbox，不能把外部调用长时间包在数据库事务里。
- 当前 Node 22.22.1 运行 Prisma 5.22 generator 时子进程会静默退出且不刷新 Client；本 feature 使用同属 Node.js 22 的临时 22.11.0 运行锁定 generator 成功。依赖与锁文件未改变，后续 schema feature 需复用该命令并在交接记录。
- 高风险删除仍会直接执行，属于下一独立 feature。

### 下一步

登记并单独启动高风险 Tool 持久化审批 feature，使删除操作在执行前进入可恢复的人工 Approve/Reject 流程。

## 2026-08-30 — feat-012 AgentTask 原子抢占

### 已完成

- 新增 `agent/task-claim.ts`，使用单条 `updateMany` 将同一任务从 `pending`/`failed` 原子迁移到 `running`，并在 claim 时统一清理旧失败终态字段。
- `runAgentTask` 在构建上下文、调用 LLM 和执行 Tool 前先获取 claim；竞争失败者只返回数据库当前状态，不会进入 Runtime 的成功或失败副作用路径。
- `ExecutionTracer.markRunning` 只记录已完成 claim 的事件，不再无条件改写任务状态，消除了 Worker、手动 `/run` 与内联入口之间的检查后执行竞态。
- 新增 Node 行为回归测试和真实 PostgreSQL 12 路并发集成测试。

### 验证证据

- `./init.sh`：变更前基线通过，52 个文件/321 项 Vitest 测试通过。
- `npm run test:unit -- tests/agent/task-claim.test.ts`：1 个文件/1 项测试通过，证明未获 claim 的调用不会创建 LLM provider。
- `sudo -n -g docker -u dadalv npm run test:integration -- tests/integration/agent-task-claim.integration.test.ts`：1 个文件/1 项真实 PostgreSQL 测试通过；同一任务 12 路并发只有 1 个 claim 成功。
- `npm run check:quick`：类型、ESLint、53 个文件/322 项 Vitest 测试通过。
- `git diff --check`：通过。

### 风险与后续

- 本 feature 只修复单次执行权的原子获取；Tool 已提交后 Runtime 失败的重放幂等属于下一独立 feature。
- 当前没有 feature 阻塞。

### 下一步

登记并单独启动副作用 Tool 重放幂等 feature，为持久化执行步骤建立稳定幂等键与回归测试。

## 2026-08-30 — feat-011 Agent Runtime 评分 Skill 与审查报告

### 已完成

- 使用 `$skill-creator` 创建 `agent-runtime-review` Skill；入口只保留证据边界、审查流程和评分纪律，完整八维评分、L0-L4 Gate、P0/P1/P2 风险定义与强制输出模板拆分到 reference。
- 通过标准初始化器生成 `agents/openai.yaml`，保持默认自动发现，并将 Skill 安装到 `~/.codex/skills/agent-runtime-review`。
- 将此前完整的 Agent Runtime 审查报告写入 `docs/optimization/agent-runtime-review.md`，保留 49/100、L1、八维评分、关键风险、架构和五项优化建议，并将代码证据转换为仓库相对链接。
- 本 feature 只新增审查资产与状态记录，没有修改 Agent Runtime 业务实现，也没有覆盖 feat-009/010 的既有未提交改动。

### 验证证据

- `./init.sh`：变更前基线通过，类型、ESLint、52 个文件/321 项 Vitest 测试通过。
- `python3 .../quick_validate.py ~/.codex/skills/agent-runtime-review`：输出 `Skill is valid!`。
- 临时构建目录与最终安装目录执行 `diff -qr`：无差异。
- `npm run check:quick`：最终类型检查、ESLint、52 个文件/321 项 Vitest 测试通过。
- `git diff --check`：通过。

### 风险与后续

- Skill 安装在个人 Codex 目录，不受当前仓库 Git 管理；迁移开发机时需要单独同步 `~/.codex/skills/agent-runtime-review`。
- 当前工作只沉淀评分与报告，没有实施报告中的 Runtime 修复；49/100、L1 结论仍然有效。

### 下一步

如要提升 Runtime 成熟度，优先登记独立 feature，实现 AgentTask 原子抢占、lease/heartbeat 与过期 `running` 任务回收。

## 2026-08-27 — feat-010 房间 SSE 关闭竞态

### 已完成

- 将房间事件流的 abort 监听移到首个 snapshot 之前，并兼容请求 signal 已经 aborted 的情况，消除初始 snapshot 期间漏接断开的窗口。
- 将 controller、interval 和关闭状态收敛到同一生命周期；客户端 abort 或响应流 consumer 取消时会移除监听、清理 interval，并以幂等方式结束流。
- 在 session、成员资格和 snapshot 的每个异步边界后检查关闭状态，通过统一安全写入函数发送 `snapshot`、`error`、`kicked` 与 `roomDeleted`，controller 已关闭时不再抛出未处理拒绝。
- 新增 `tests/server/room-stream.test.ts` 的 3 项 Route Handler 行为测试，覆盖初始 snapshot 成功/失败期间断开，以及 interval snapshot 在途失败时断开。

### 验证证据

- `./init.sh`：变更前基线通过，51 个文件/318 项 Vitest 测试通过。
- `npm run test:unit -- tests/server/room-stream.test.ts`：修复前 3 项均失败；其中在途 snapshot 原样复现 `TypeError: Invalid state: Controller is already closed` 与 `ERR_INVALID_STATE`，定位到原路由第 79 行；修复后 3/3 通过。
- `npm run check:quick`：类型、ESLint、52 个文件/321 项 Vitest 测试通过。
- `sudo -n -g docker -u dadalv npm run check:full`：完整退出 0；快速门禁、Next.js 16.3.3 webpack 生产构建、覆盖率、真实 PostgreSQL 集成测试与 Playwright 全部通过。
- 覆盖率：statements 42.98%、branches 37.40%、functions 48.79%、lines 43.81%，全部高于非回退门槛。
- PostgreSQL：1 个文件/3 项测试通过，继续验证唯一约束、持久化成员访问控制与级联删除。
- Playwright：1 条认证 setup + 8 条公共/认证核心旅程，共 9 项通过；WebServer 输出未再出现 `ERR_INVALID_STATE`、`Controller is already closed` 或 `unhandledRejection`。
- `git diff --check`：通过。

### 风险与后续

- 本 feature 只修改房间 SSE；Atlas 与认证 heartbeat 的独立 SSE 生命周期不在本次验收范围内，未发现对应失败证据时不扩展修改。
- 当前没有 feature 阻塞；`feature_list.json` 也没有剩余的未完成项。

### 下一步

根据下一项产品优先级先登记独立 feature、依赖与验收标准，再按单 feature 工作流启动实现。

## 2026-08-27 — feat-009 React Hooks 7 编译器诊断

### 已完成

- 移除 `eslint.config.mjs` 中 Next.js 16 迁移期的 14 个 `react-hooks/*` 关闭项，全部改为 `error`；最终全仓 ESLint 0 warning / 0 error。
- 将 About 页随机装饰数据改为模块级确定性数据；Study 计时器改为 state 驱动时钟，并将请求互斥 ref 同步为可渲染的 busy state。
- 修复 Atlas viewport、首页空间锚点与搜索参数的渲染期 ref 访问；Atlas 使用提交后同步的最新值，首页锚点使用不可变 Map state，搜索防抖从浏览器当前 URL 合并查询参数。
- 删除 effect 中的同步派生 state：AuthPanel 通过 `useSyncExternalStore` 订阅 reduced-motion，视觉索引在更新函数中约束；天气状态绑定 `roomId`；备忘录/任务弹窗和外部消息草稿通过挂载边界初始化；房间快照使用受保护的 prop 变化重置。
- 将 Timeline 的 Agent 卡片左右位置改为纯映射，避免渲染结束后修改闭包变量；首页搜索结果以查询字符串标记异步状态，避免清空查询时同步 effect 更新。
- 新增 `atlas-canvas`、`search-input`、`home-timeline-board-search`、`life-panel-weather`、`life-panel-modals`、`message-composer` 六个组件行为测试文件，并扩展 AuthPanel 测试；新增 11 项测试，覆盖最新 viewport/callback、URL 防抖与导航同步、搜索结果、切房间天气隔离、弹窗重开、外部草稿、重复发送锁和视觉清单缩减。
- 为本次修改的搜索、备忘录和任务表单字段补齐可查询 label 绑定。

### 验证证据

- `./init.sh`：变更前基线通过，45 个文件/307 项 Vitest 测试通过。
- `npm run test:component`：9 个文件/17 项组件行为测试通过。
- `npm run check:quick`：类型、ESLint、51 个文件/318 项 Vitest 测试通过。
- `git diff --check`：通过。
- `sudo -n -g docker -u dadalv npm run check:full`：最终工作树完整退出 0；快速门禁、Next.js 16.3.3 webpack 生产构建、覆盖率、真实 PostgreSQL 集成测试与 Playwright 全部通过。
- 覆盖率：statements 41.67%、branches 36.73%、functions 47.58%、lines 42.34%，全部高于非回退门槛。
- PostgreSQL：1 个文件/3 项测试通过，继续验证唯一约束、持久化成员访问控制与级联删除。
- Playwright：1 条认证 setup + 8 条公共/认证核心旅程，共 9 项通过；覆盖登录/注册、密码入口、匿名重定向、浏览器登录、首页导航、发帖、Study 启停与聊天发送。

### 验证过程与后续

- 沙箱内直接执行完整门禁时，`sudo` 原始失败为 `The "no new privileges" flag is set`；经用户授权后在沙箱外使用同一命令成功完成两次完整门禁，最终证据取自搜索参数边界修正后的第二次运行。
- 搜索组件测试初版因 fake timer 与 `user-event` 调度互相等待，两项测试各超时 5000ms；改为 `waitFor` 可观察路由替换后通过，产品代码未因此回退。
- 最终 E2E 9 项均通过，但 WebServer 记录 `unhandledRejection: TypeError: Invalid state: Controller is already closed`，定位到 `app/api/rooms/[roomId]/stream/route.ts:79`。该问题不属于 Hooks 诊断范围，已登记为 feat-010，未在 feat-009 中扩大修改范围。

### 下一步

单独启动 feat-010，修复房间 SSE 在客户端断开后的 controller 写入竞态，并用连接关闭行为测试保护。

## 2026-08-26 — feat-007 Next.js 16 主版本迁移

### 已完成

- 升级到 Next.js 16.3.3、React/React DOM 19.2.8、`@types/react` 19.2.18、`@types/react-dom` 19.2.5、ESLint 9.39.5 与 `eslint-config-next` 16.3.3，并更新 `package-lock.json`。
- 将旧 `.eslintrc.json`/`.eslintignore` 迁移为 `eslint.config.mjs` flat config；保留迁移前 `core-web-vitals` lint 语义，并把 React Hooks 7 编译器诊断重构登记为 feat-009。
- 按 Next.js 16 约定将 `middleware.ts`/`middleware` 迁移为 `proxy.ts`/`proxy`，同步测试与 README 引用。
- 将惰性加载的 `ali-oss` 声明为 `serverExternalPackages`，避免打包器追踪其可选 `proxy-agent`。
- 当前执行环境中 Turbopack CSS worker 无法建立内部进程连接；开发、生产构建和 E2E 测试服务使用 Next.js 官方支持的 `--webpack` 兼容模式，并继续保持开发服务器监听 `0.0.0.0`。
- 强化聊天 E2E 冷启动同步：等待 hydration/SSE 连接完成，断言消息 POST 成功后再验证时间线渲染。

### 验证证据

- `./init.sh`：迁移前基线通过，45 个文件/307 项测试通过。
- `npm audit --omit=dev --json` 与 `npm audit --json`：0 high、0 critical、0 moderate，仅剩 `tsx` 依赖链上的 1 个 esbuild low。
- `sudo -n -g docker -u dadalv npm run check:full`：最终状态完整退出 0；类型、ESLint、45 个文件/307 项 Vitest、Next.js 16.3.3 生产构建、覆盖率、真实 PostgreSQL 和 Playwright 全部通过。
- 覆盖率：statements 41.67%、branches 36.73%、functions 47.58%、lines 42.34%。
- PostgreSQL：1 个文件/3 项测试通过，验证唯一约束、持久化成员访问控制与级联删除。
- Playwright：1 条认证 setup + 8 条公共/认证核心旅程，共 9 项通过；聊天冷启动回归在最终完整门禁中通过。

### 风险与后续

- ESLint 10.9.1 与 `eslint-config-next` 16.3.3 所带 `eslint-plugin-react` 当前 rule context API 不兼容，因此使用 Next 16 peer 范围支持的 ESLint 9.39.5；审计无对应漏洞，待上游兼容后再升级。
- `tsx` 当前锁定的 esbuild 0.27.x 仍有 Windows 本地开发服务器场景 low；没有生产 high/critical。
- React Hooks 7 新增编译器诊断的业务组件重构已登记为 feat-009，未在本 feature 中扩大范围。

### 下一步

单独启动 feat-009，在行为测试保护下逐项启用 React Hooks 7 编译器诊断。

## 2026-08-26 — 测试 Harness 与 Next.js 15 兼容性重构

### 已完成

- 修复 `ali-oss` 顶层导入导致本地存储测试和生产构建崩溃的问题，并添加导入回归测试。
- 将 Vitest 升级到 4.1.11，拆分 Node 与 jsdom 项目，引入 Testing Library、user-event、jest-dom 和 MSW。
- 将 AuthPanel、LoginForm、PostEditor 测试迁移为可访问行为测试；为相关表单和交互控件补齐 label/aria/键盘能力。
- 建立 PostgreSQL 16 Testcontainers 集成层和 Prisma 数据重置工具，覆盖唯一约束、访问控制和级联删除。
- 建立 Playwright setup/public/authenticated 项目与 8 条核心旅程，配置 trace、截图和视频产物。
- 建立 V8 覆盖率门槛；当前结果为 statements 41.67%、branches 36.68%、functions 47.58%、lines 42.34%。
- 升级 Next.js 15.5.24、Nodemailer 9.0.5、PostCSS 8.5.26，并迁移异步 cookies/headers/params/searchParams 与 ESLint CLI。
- 清理全部 ESLint error/warning，修复可选存储副作用、Hook 依赖和 Next Link 问题。
- 建立 `AGENTS.md`、测试专题文档、功能状态、初始化脚本和会话交接。
- 完成 Docker Desktop Ubuntu WSL integration 下的真实运行验证；修复 E2E setup 缺少同源 `Origin`、locator 歧义及双用户 session 相互失效问题。
- 将 `npm run dev` 默认启动参数改为 `next dev --hostname 0.0.0.0`，修复 WSL mirrored networking 下默认仅监听 IPv6、Windows localhost 无法访问的问题。

### 验证证据

- `npm run typecheck`：通过。
- `npm run lint`：通过，0 warning / 0 error。
- `npm test`：45 个文件、307 项测试通过。
- `npm run test:coverage`：通过四项非回退门槛。
- `npm run build`：Next.js 15.5.24 生产构建通过；沙箱内字体下载被限制，授权联网后通过。
- `sudo -n -g docker -u dadalv npm run test:integration`：1 个文件、3 项测试通过；Testcontainer 成功执行 Prisma migrations，验证唯一约束、持久化成员访问控制与级联删除。
- `sudo -n -g docker -u dadalv npm run test:e2e`：1 条 setup 与 8 条业务旅程全部通过；生成两份隔离 storage state。
- E2E 调试失败时保留了 screenshot、video 与 `error-context.md`，验证失败产物配置有效；最终运行状态为 `passed`、`failedTests: []`。
- `npm run check:quick`：类型检查、lint、45 个文件/307 项 Vitest 测试全部通过。
- `npm run dev -- --port 3101`：实际执行 `next dev --hostname 0.0.0.0 --port 3101`；`ss` 确认 `0.0.0.0:3101` IPv4 监听，Windows `localhost:3101/api/health` 返回 `ok=true`、`db=true`。
- `npm audit --omit=dev`：3 项（1 low、1 moderate、1 high、0 critical）；Next 内置 PostCSS 与 tsx/esbuild 等待上游或独立主版本迁移。
- `./init.sh`：按用户本次明确要求未运行；以 `npm run check:quick` 完成快速门禁。

### 阻塞

- 无当前 feature 阻塞。
- 当前用户 `dadalv` 不在 `docker` 组；本次使用 `sudo -n -g docker -u dadalv` 临时赋予单次命令组权限，未修改长期系统配置。
- 本地 `.env` 当前按用户选择连接遗留 PostgreSQL 容器发布的 `127.0.0.1:15432`；该容器不属于当前 Compose 项目，若未来重建为 Compose 服务需同步恢复为 `5432`。

### 下一步

该阶段推荐的 feat-007 已在后续会话完成；当前唯一推荐下一步见顶部 Current State。
