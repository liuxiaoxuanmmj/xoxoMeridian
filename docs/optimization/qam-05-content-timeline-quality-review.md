# QAM-05 内容发布与时间线工程质量审查

## 元数据

| 项目 | 内容 |
| --- | --- |
| QAM | QAM-05 内容发布与时间线 |
| 快照日期 | 2026-09-14 |
| 审查 Skill | [`xoxo-qam-05-content-timeline-review`](../../.agents/skills/xoxo-qam-05-content-timeline-review/SKILL.md) |
| 标准版本 | [`module-quality-review-standard.md`](./module-quality-review-standard.md) v1.0.0 |
| 范围来源 | [`PROJECT_VIEW.md`](../../PROJECT_VIEW.md) 的 QAM-05、Cross-cutting Concerns、共享映射、BU-05 与 Quality Tracking Index；[`AGENTS.md`](../../AGENTS.md) |
| 本轮 Delta | `0（QAM-05-009 resolved；其余维度与 Gate 保持）` |
| 当前基线命令 | 收尾 `VITEST_MAX_WORKERS=1 ./init.sh` 正常权限边界 exit 0（79 文件/685 项，含类型、lint、资产校验）；SearchInput 旧 1 failed/4 passed→5/5，连同 Timeline/SSR 共 3 文件/23 项通过；原始命令见 [feat-067](../../progress.md#feat-067) |
| 风险匹配命令 | `NODE_OPTIONS=--max-old-space-size=4096 VITEST_MAX_WORKERS=1 E2E_APP_MODE=development ./scripts/run-node22.sh npm run check:full` 单次 exit 0：79/685、生产构建、覆盖率 51.58/45.39/56.06/52.25、29/110 真实 PostgreSQL、42/42 Playwright（5.0m）；最终生产搜索/分页与 Focus 定向 6/6，完整命令及历史失败见 [progress.md](../../progress.md#feat-063) |
| 证据纪律 | 本轮 E3 确认首次挂载输入/StrictMode 重放与取消语义；搜索投影、成员和同时间分页既有证据保持。全程 trace/软件 WebGL、浏览器性能计时错误归 feat-068，不能借定向通过关闭；slug、Agent projection 和 Post/Atlas 交错仍限制 Gate |
| 工作区说明 | 只修正 feat-067 的 SearchInput 防抖生命周期及其回归；用户已授权先处理本项再返回 feat-063。保留既有 Post 读取/分页、空间和其他未提交改动，未修改 API、schema、依赖、Next 配置或错误断言 |

## Overall

| 指标 | 结果 |
| --- | --- |
| Score | **80 / 100** |
| Score Level | **L3** |
| Gate Level | **L2** |
| Final Level | **L2** |
| Trend | `0（QAM-05-009 resolved）` |
| Evidence Confidence | 中高（StrictMode 单次原生输入旧实现无导航，修正后导航一次；清空、卸载、URL 参数与外部查询保持。完整开发 42/42、最终生产定向 6/6；其他并发/派生恢复缺口保持） |
| 当前开放问题 | 5 项（P2×5） |

SearchInput 的防抖创建与清理现在属于同一个 effect，首次挂载期间收到的输入在开发重放后仍可提交，清空/卸载仍取消待提交查询；已提交草稿不会因后续 effect 恢复而重复提交。旧组件稳定复现输入保留但导航 0 次，修正后 5/5；完整开发门禁与最终生产搜索/分页对照通过，QAM-05-009 已关闭。本轮恢复既有搜索契约并补齐生命周期证据，共享展示投影、成员可见性、两键排序和复合 cursor 保持；其余五个 P2 与关键并发验证缺口没有变化，因此维持 80 分、Score L3、Gate/Final L2。

## Score Breakdown

| 维度 | Score | Max | Finding / Evidence |
| --- | ---: | ---: | --- |
| 架构与责任边界 | 11 | 14 | 页面、Route、Server Action、Post helper 和组件职责基本可导航，读取授权已下沉到共享领域条件；但首页仍直接拥有 Post 查询，Timeline 又复用 Home spatial shell，且 QAM-05/QAM-06 没有单向 composition boundary（[`post-visibility.ts`](../../lib/post-visibility.ts#L1-L18)、[`app/home/page.tsx`](../../app/home/page.tsx#L13-L30)、BU-05，E2/E3）。 |
| 代码结构与复杂度 | 8 | 10 | CRUD 与呈现控制流局部简单，首页/搜索已共用展示 select；复杂度仍来自 HTTP/Action 两套写路径及 Agent completion 后置投影（[`post-timeline.ts`](../../lib/post-timeline.ts#L18)、QAM-05-001/004，E2/E3）。 |
| 抽象与复用 | 7 | 8 | 位置快照、ownership、可见性、最小展示字段和排序键有共享入口；首页/API 复用 select/orderBy，Timeline 消费同一时间/ID 约定。Post body、其余 query 字段与写入服务仍待收敛（[`post-timeline.ts`](../../lib/post-timeline.ts#L18)、QAM-05-001，E2/E3）。 |
| 数据流与状态一致性 | 11 | 12 | 共享投影与搜索失败恢复保持；复合 cursor 严格排除已读位置，真实 PostgreSQL 证明同毫秒跨页无遗漏或重复，首页/搜索集合一致，Timeline 输入重排后仍稳定。Agent log 派生恢复仍开放（[`分页集成回归`](../../tests/integration/post-pagination.integration.test.ts#L82)、QAM-05-004，E3/E2）。 |
| 接口与依赖关系 | 8 | 10 | 首页/搜索同时复用 Post 可见性与最小展示 select，只有合法成功空集合显示无匹配；401/500 不再被伪装为空结果。HTTP/Action 输入、空字段和错误返回仍重复（[`posts route`](../../app/api/posts/route.ts#L35)、QAM-05-001/006，E2/E3）。 |
| 健壮性、并发与生命周期 | 9 | 14 | 搜索取消/迟到响应保护保持；防抖 timer 的创建/清理收归同一 effect，首次输入重放、清空和卸载有组件红/绿证据（QAM-05-009）；畸形及旧 cursor 返回验证错误，非正或无效页大小不会进入查询，游标记录删除后仍按原位置续读。slug race、Agent projection 和 Home anchor 删除交错仍缺恢复或并发证明（[`post-pagination.ts`](../../lib/post-pagination.ts#L4)、[`删除游标回归`](../../tests/integration/post-pagination.integration.test.ts#L123)、QAM-05-002/004/008，E2/E3）。 |
| 性能与资源使用 | 6 | 8 | 首页/API 各限制 50/100 条，Post 有 type/author/room 索引；搜索对 title/content 使用 contains，首页还为每次访问执行 board 查询和 anchor 补齐，规模增长时查询与重复装配成本可见，但当前没有凭数量直接扣分（[`schema.prisma`](../../prisma/schema.prisma#L517-L539)、[`home-board.ts`](../../lib/home-board.ts#L18-L54)，E2）。 |
| 安全与隐私 | 8 | 10 | 认证、ownership 和 Markdown 防护保持；本轮真实 PostgreSQL 重证成员/孤儿过滤，首页/搜索只返回作者公开身份与 city/country/timezone，明确排除 email、passwordHash、IP、preferences 和 profileNote。通用错误泄漏仍由 QAM-05-006 跟踪（[`投影集成回归`](../../tests/integration/post-timeline-projection.integration.test.ts#L33)，E2/E3）。 |
| 可测试性与验证可信度 | 7 | 8 | StrictMode 单次原生输入先复现导航 0 次再验证导航一次，取消/清空和外部 q 回归保持；真实 PostgreSQL 先红后绿确认漏读和顺序；组件验证可访问标题的 DOM 顺序，production Chromium 以 53 条乱序写入记录验证首页/刷新/搜索与真实 API 分页。slug、Agent projection 和 Post/Atlas 交错仍缺对应 E3，不以测试数量代替风险覆盖（[`分页回归`](../../tests/integration/post-pagination.integration.test.ts#L82)、[`浏览器旅程`](../../tests/e2e/authenticated.spec.ts#L1280)，E3）。 |
| 可维护性、演进与技术债 | 5 | 6 | 展示字段与排序各有单一落点，cursor 编解码/验证/比较留在服务层；写入和 Agent log 等规则仍跨 Route/Action/服务，整体演进债务未消除（QAM-05-001/004，E2/E3）。 |
| **合计** | **80** | **100** | 算术核对：11+8+7+11+8+9+6+8+7+5 = 80。 |

## Level Gate

| 门禁 | 结果 | 证据与原因 |
| --- | --- | --- |
| 开放 P0 | 通过 | 未发现已确认的 P0；既有 Markdown 防护与 Post 删除 FK 级联保持。 |
| 开放 P1 且涉及权限、不可恢复错误、并发重复副作用或持续故障 | 通过 | QAM-05-005 已由共享成员条件关闭并在本轮真实数据库重验；当前没有开放 P0/P1，QAM-05-001/002/004/006/008 继续保持 P2。 |
| 最高风险不变量有风险匹配行为验证 | 部分通过 | 成员/孤儿可见性、展示投影、搜索恢复、同时间分页及稳定排序有当前 E3；slug 并发、Agent projection 失败恢复及 Post/Atlas FK 交错仍缺专项真实数据库证据，Gate 不高于 L2。 |
| L4 要求 | 未通过 | 当前无开放 P0/P1，但关键并发、失败恢复和跨写生命周期仍未全部达到 E3。 |
| **最终判定** | **L2** | Score Level=L3；Gate Level=L2；Final Level=min(L3,L2)=L2。 |

## Critical Issues

### P0

当前无开放项。

### P1

#### QAM-05-005：room-scoped Agent log 未按当前用户成员资格过滤（resolved）

- **原问题**：`createAgentLogPost` 为 Agent log 写入 `roomId`，但列表、搜索、详情和首页只检查登录态，任一已登录非成员都能读取其他房间的 Agent 摘要和 metadata。
- **已实施修正**：[`getPostVisibilityWhere()`](../../lib/post-visibility.ts#L3-L18) 定义唯一读取规则：`user_post` 保持全局可见；`agent_log` 必须仍有关联 Room 且该 Room 的 `participants` 包含当前用户。列表/搜索、API 详情、页面详情和首页全部复用该 Prisma 条件；详情在同一查询中返回记录或 404，不先暴露其存在性（[`posts route`](../../app/api/posts/route.ts#L11-L43)、[`detail route`](../../app/api/posts/%5Bslug%5D/route.ts#L11-L44)、[`home page`](../../app/home/page.tsx#L13-L30)、[`detail page`](../../app/posts/%5Bslug%5D/page.tsx#L12-L37)，E2）。
- **验收证据**：[`post-visibility.integration.test.ts`](../../tests/integration/post-visibility.integration.test.ts#L54-L179) 在真实 PostgreSQL 创建 A/B 两个成员隔离的 Room、全局 `user_post`、双方 `agent_log` 与删除 Room 后 `roomId=null` 的孤儿日志。修复前 A 的列表实际返回四条；修复后 A/B 各只见全局文章及自己的 Room 日志，type/search 不能绕过，成员详情 200、非成员/孤儿详情 404，首页集合与 API 一致（E3）。
- **影响范围**：QAM-05 直接受影响；QAM-02/QAM-01 提供成员/身份 contract，QAM-08 的 task/trace 生成不因本问题改造。

### P2

#### QAM-05-001：HTTP Route 与 Server Action 绕过统一 Post 输入契约

- **状态**：`open`
- **优先级复核**：由 P1 降为 P2。它确实违反运行时输入边界并造成双入口维护扩散，但当前证据只显示 malformed body 可能返回不稳的 500/错误信息或接受无界文本；没有权限绕过、已证明的不可恢复持久化损坏或持续故障，因此不满足 P1 门槛。
- **问题**：`POST /api/posts` 与 `PUT /api/posts/:slug` 直接从 `request.json()` 解构 title/content，只检查 truthy/`trim()`；`createPost`、`updatePost` Server Action 也只做同样的局部判断。没有复用 [`lib/validation.ts`](../../lib/validation.ts#L1-L221) 的 Zod schema，未限制字符串类型、长度、对象形状或空更新；Action 的参数同样是客户端可构造的边界，不应以 TypeScript 类型代替运行时校验。两个写入口还分别维护成功返回和错误语义（[`app/api/posts/route.ts`](../../app/api/posts/route.ts#L52-L86)、[`Post detail route`](../../app/api/posts/%5Bslug%5D/route.ts#L43-L74)、[`app/actions/posts.ts`](../../app/actions/posts.ts#L17-L103)）（E2）。
- **证据**：仓库通用 Route 已使用 `readJsonBody`/Zod（[`validation.ts`](../../lib/validation.ts#L208-L221)），而 Post Route/Action 没有；`tests/server/posts-api.test.ts` 的写入场景只覆盖空字符串和正常创建，没有 malformed body、超长内容、PUT 或 Action 行为（[`posts-api.test.ts`](../../tests/server/posts-api.test.ts#L83-L183)）（E2）。
- **质量影响**：畸形或无界请求可进入 Prisma、触发不稳定 500 或造成不受控内容存储；新字段/规则必须在两个写入口重复同步，已形成契约漂移和回归扩散面。
- **最小修正**：增加 Post create/update/list query 的同域 Zod contract；HTTP 与 Server Action 均在进入 slug/Prisma 前解析同一 contract，统一 trim、长度、禁止空 patch 和稳定错误响应。保留现有 user_post/Markdown 功能，不新增发布能力。
- **验收证据**：Route 与 Action 对非对象、非字符串、超长、空 patch 返回同一可观察验证错误且不调用 Prisma；合法中文/Markdown 仍创建或更新。补 `tests/server` Route 行为测试和 Server Action Node 测试；若验证字段持久化边界，再加真实 PostgreSQL。
- **影响范围**：QAM-05 直接受影响；QAM-01 提供认证但不拥有 Post body contract，QAM-06 只消费 Post→Atlas 映射。

#### QAM-05-002：slug 唯一性是 check-then-create，合法并发发布会失败

- **状态**：`open`
- **优先级复核**：由 P1 降为 P2。并发时后到请求可能被数据库 unique 拒绝，但 unique constraint 仍保证数据不重复；当前没有重复副作用、错误状态或跨用户影响的 E3 证据，属于可见性/可用性与重试债务而非 P1 数据一致性破坏。
- **问题**：`ensureUniqueSlug` 先 `findUnique` 再返回候选 slug；随后 API/Action `post.create` 或 update，Agent log 也走相同 helper（[`lib/posts.ts`](../../lib/posts.ts#L24-L36)、[`app/api/posts/route.ts`](../../app/api/posts/route.ts#L65-L78)、[`lib/agent-posts.ts`](../../lib/agent-posts.ts#L13-L38)）。两个请求可同时观察 slug 不存在并写入同一候选，数据库 unique index 只能让后到者报错，不能为请求提供可重试的唯一 slug 结果。
- **证据**：`Post.slug` 只有数据库 `@unique`/唯一索引（[`schema.prisma`](../../prisma/schema.prisma#L517-L539)、[`20260613120000_add_post_model/migration.sql`](../../prisma/migrations/20260613120000_add_post_model/migration.sql#L24-L34)）（E2）；现有测试 mock `findUnique`，没有并发真实 PostgreSQL 行为测试（[`agent-posts.test.ts`](../../tests/agent/agent-posts.test.ts#L41-L74)、[`posts-api.test.ts`](../../tests/server/posts-api.test.ts#L95-L116)）（E2）。
- **质量影响**：同时发相同标题、同时改成相同标题或高并发 Agent log 时，合法操作随机返回 500/`Server error`，用户重试还可能生成更多重复尝试；唯一约束成为错误出口而不是服务内部的并发事实来源。
- **最小修正**：保留数据库 unique index，并将候选分配收敛到可重试的 atomic insert/unique-violation retry（或等价的数据库序列化/锁定边界）；API、Action 和 Agent projection 共用该实现。更新 slug 时也需在冲突后重新生成后缀，不扩大 slug 产品规则。
- **验收证据**：真实 PostgreSQL 并发创建/更新相同标题，所有成功记录 slug 唯一且失败请求按稳定冲突/重试策略返回；Agent log 高并发不会因候选相同而随机 500。测试需包含同毫秒创建和唯一约束冲突恢复。
- **影响范围**：QAM-05 直接受影响；QAM-08 仅关联 Agent log 调用时的投影失败，不重复登记 Agent Task lease/Tool 问题。

#### QAM-05-003：cursor 与时间线排序没有稳定的第二排序键（resolved）

- **原问题与直接证据**：仅按 `publishedAt DESC` 排序且以 `publishedAt < cursor` 续读，会跳过同毫秒未返回的记录；Timeline 仅按时间升序也依赖输入顺序。旧实现真实 PostgreSQL 创建 59 条可见文章（57 条同毫秒、前后各 1 条）后，以 50 条分页仅返回 51 条，四项集成回归全部失败；组件实际标题顺序为 `older,c,a,b,newer`，与稳定键预期不符（E3）。原 P2 优先级保持：影响检索完整性，触发需同毫秒记录跨页，不改变持久数据。
- **读取与展示契约**：[`postTimelineOrderBy`](../../lib/post-timeline.ts#L4) 统一首页/API 的 `(publishedAt DESC,id DESC)`，[`compareTimelinePosts`](../../lib/post-timeline.ts#L11) 使 Timeline 按两键升序呈现，保持原有旧→新方向。`getPostCursorWhere` 查询时间更小或时间相等且 ID 更小的记录，并与成员过滤放在 `AND` 中；title/content 的搜索 `OR` 单独保留。比较使用 cursor 保存的值，不依赖对应 Post 仍存在，删除锚点后仍可继续读取（E2/E3）。
- **cursor 与兼容规则**：[`post-pagination.ts`](../../lib/post-pagination.ts#L4) 使用 Base64url 编码的版本 1 `publishedAt/id` 对象；严格校验版本、UTC 毫秒日期、ID、对象字段、长度和规范编码。旧时间字符串、空值、畸形编码/JSON、无效字段或未知版本稳定返回 `400 {error:"Invalid request",issues:[{path:"cursor",…}]}`，调用方应使用返回的 `nextCursor`；仓库 UI 未消费旧 cursor。页大小限定正整数，保留默认 50/最多 100；满页继续返回 cursor，刚好到尾时允许下一页为空。未引入新分页界面或快照隔离语义（E2/E3）。
- **PostgreSQL 验收**：[`post-pagination.integration.test.ts`](../../tests/integration/post-pagination.integration.test.ts#L82) 在真实查询中验证 1/17/50 三种页大小、列表和不区分大小写的 title/content 搜索，每次重复读取均恰好返回 59 条且顺序相同；首页与搜索取同一最新 50 条；type/author/member 条件不被 cursor 覆盖，私有及孤儿日志隐藏；删除已返回页的末项后剩余记录仍完整。旧 0/4→修复后 4/4，连同投影与跨房间可见性为 3 文件/6 项（E3）。
- **Route/组件验收**：[`Post API 回归`](../../tests/server/posts-api.test.ts#L118) 旧 27 failed/13 passed；新增校验修复后全部通过，额外覆盖空白和控制字符 ID。无效 cursor/limit 在 Post 查询前返回 400，同毫秒不同末项生成不同不透明 cursor 且可回传续读；[`Timeline 组件`](../../tests/component/timeline-order.test.tsx#L23) 验证 Date/字符串时间、用户文章/Agent 日志混合、输入重排和原数组不变，旧 0/1→1/1，连同搜索恢复组件 16/16（E3）。
- **浏览器与门禁**：[`production Chromium`](../../tests/e2e/authenticated.spec.ts#L1280) 乱序写入 53 条同毫秒记录，首页/刷新/搜索均稳定呈现最新 50 条的反向顺序，17 条一页的真实 API 搜索读回全部 53 条且无重复，旧时间 cursor 返回 400；未 mock 搜索或服务端排序。完整生产门禁单次通过：78/653 Vitest、build/coverage、28/101 PostgreSQL、40/40 Playwright。命令、测试编写阶段的两类修正及未运行边界见 [progress.md](../../progress.md)（E3）。
- **影响范围**：QAM-05；QAM-06 继续消费相同 Post/anchor 映射。共享比较模块仅含纯函数和 Prisma 类型导入，cursor/Zod/Buffer 留在服务端。未改 schema/index、slug、Post 写入、Agent projection、空间生命周期或既有搜索恢复。

#### QAM-05-004：Agent log 投影在完成事务外 best-effort，失败后无 durable retry/idempotency

- **状态**：`open`
- **优先级复核**：由 P1 降为 P2。异常时可能永久丢失派生 timeline log，但 AgentTask、final Message 和 Trace 事实已在前一事务中完成，没有任务状态损坏或重复高风险副作用的证据；这是派生可见性/恢复债务，除非运行数据证明持续丢失，否则不升为 P1。
- **问题**：`ExecutionTracer.completeWithMessage` 先在 lease 事务内完成 final Message、AgentStep、AgentTask 和 EventLog，随后再查询 Task 并调用 `createAgentLogPost`；projection 异常被 catch 后只写 console，throttle 达到 3 条/10 分钟也直接返回 null（[`agent/execution-tracer.ts`](../../agent/execution-tracer.ts#L40-L129)、[`lib/agent-posts.ts`](../../lib/agent-posts.ts#L13-L38)）。Post 没有 `agentTaskId`/幂等约束，且没有 pending/failed projection 状态或 Worker 补偿入口。
- **证据**：AgentTask final 状态已在事务内完成后才进入 Post 写入（[`execution-tracer.ts`](../../agent/execution-tracer.ts#L47-L102)）（E2）；现有测试只验证 throttle 返回 null 和 under-limit create，未验证 Post create 失败、进程重启或同一 task 重试（[`tests/agent/agent-posts.test.ts`](../../tests/agent/agent-posts.test.ts#L41-L74)）（E2）。
- **质量影响**：数据库短暂故障、slug 冲突、进程在两段写入间退出或节流都会让已完成 Agent 任务没有 timeline entry，且用户无法区分“没有重要日志”和“投影丢失”；补偿重试若直接重放又可能产生重复 Post。
- **最小修正**：为任务投影建立以 taskId 为键的 durable/idempotent 边界：最小可行方案是在同一完成事务中写入唯一 projection/outbox 记录，由 Worker 重试 Post 创建并记录失败；保留现有降噪策略，但把跳过原因持久化。不要把 Trace 生成、Tool lease 或新的内容类型移入 QAM-05。
- **验收证据**：真实 PostgreSQL 注入 Post 写失败后，任务完成事实仍可查询且 projection 会重试；同一 task 多次恢复最多一个 agent_log；重启/重复消费不会重复；达到节流上限时有可审计的 skipped 状态。Agent Task 状态机与 Trace 仍按 QAM-08 验收。
- **影响范围**：QAM-05 直接受影响；QAM-08 只负责调用时机和任务完成事实，QAM-09 负责 Worker 生命周期，不重复登记其运行时问题。

#### QAM-05-006：Server Action 与开发环境 API 错误响应泄漏内部异常

- **状态**：`open`
- **问题**：Server Action 的 `serverError` 把 `Error.message` 直接拼入返回值并呈现给编辑器；API `errorToResponse` 在非 production 返回原始异常 message（[`app/actions/posts.ts`](../../app/actions/posts.ts#L11-L15)、[`lib/api.ts`](../../lib/api.ts#L23-L45)）。异常也带 stack 写入 console；Post 路由没有自己的稳定错误分类。
- **证据**：正常 Route 已有 `ValidationError` 与 production generic 分支，但 Action 不使用该 contract；本轮没有注入 Prisma 错误的端到端响应测试（E2）。
- **质量影响**：数据库约束、字段名或内部依赖信息可进入用户界面/开发代理响应，增加隐私与故障处理耦合；错误内容变化会成为客户端隐式契约。
- **最小修正**：客户端始终收到稳定的通用错误/ValidationError，服务端日志使用 request/task correlation id 和必要的安全上下文，不把 Prisma/provider message 作为用户 payload。保留现有可观察成功结果。
- **验收证据**：注入 unique、JSON parse、数据库异常时 API/Action 不返回表名、SQL、stack 或原始 provider message；日志仍能定位失败，生产/开发响应契约一致。
- **影响范围**：QAM-05；共享错误响应由 Cross-cutting 提供，但不改变 QAM-01 认证边界。

#### QAM-05-007：首页、搜索和 API 的 Post read projection 及失败语义漂移（resolved）

- **原问题与证据**：首页包含作者公开位置，搜索 API 缺少 profile；旧 Post 的快照为空时，同一记录在两入口显示不同位置。客户端未检查 `response.ok`，把错误 JSON 的缺失 `posts` 转为空集合；网络失败则丢掉已有搜索结果。旧实现组件 15 项中 12 项失败，真实 PostgreSQL 对两入口结果做深比较失败，确认搜索缺少作者 profile（E3）。
- **已实施修正**：[`postTimelineSelect`](../../lib/post-timeline.ts#L18) 是首页/API 的同一最小 Post/author 字段白名单；继续复用 [`getPostVisibilityWhere`](../../lib/post-visibility.ts#L3)，不改变搜索范围和成员语义。位置仍按 [`resolveAuthorLocation`](../../lib/post-time.ts#L26) 的逐字段快照优先规则回退，不复制 resolver。读取不再包含 roomId、createdAt、updatedAt，也不读取私有 User/Profile 字段。
- **失败与生命周期**：[`HomeTimelineBoard`](../../components/home/HomeTimelineBoard.tsx#L34) 在非 2xx、无效 JSON 或缺失/非数组 posts 时显示稳定错误，保留最近成功结果；401 提示重新登录。只有当前成功空数组显示原无匹配文案，空首页搜索中/失败时不提前显示无内容。每个请求的 AbortController 在清空、切换和卸载时取消；成功与失败回写都检查 signal，故传输无法取消的迟到响应也不能覆盖新结果。主内容区有 `role=alert` 和键盘可操作的重试按钮（E2/E3）。
- **验收证据**：[`组件回归`](../../tests/component/home-timeline-board-search.test.tsx#L48) 使用真实 Timeline/PostCard 与 MSW，旧实现 12 failed/3 passed→15/15；覆盖 401/500/断网、无效 JSON、缺失/null posts、空集合后的失败、键盘重试/清空、迟到成功/失败和卸载取消。[`真实 PostgreSQL`](../../tests/integration/post-timeline-projection.integration.test.ts#L33) 旧 0/1→1/1，验证成员/非成员、孤儿隐藏、完整两入口投影一致、快照优先、旧快照回退、无作者/无档案及字段白名单；连同 Post 可见性/Home 授权回归 3/3。Server 定向 2 文件/16 项通过，保留 200 空集合/500/401 HTTP 语义（E3）。
- **浏览器与边界**：[`Playwright`](../../tests/e2e/authenticated.spec.ts#L1178) 在真实 Next.js/PostgreSQL/Chromium 搜索两篇文章，500/401/网络故障注入后两篇仍可见，键盘重试使用真实 API 恢复并进入原文章详情；Tokyo fallback 和 London 快照前后一致。故障仅在浏览器路由注入，成功查询和详情均为真实服务；401 注入不代表 Session 签发/失效流程已复验。首轮全局 alert 查询误中 Next 路由播报器，修正为 main 内查询后定向 2/2 通过。`E2E_APP_MODE=production ./scripts/run-node22.sh npm run check:full` 单次 exit 0：77 文件/607 项 Vitest、Next.js 16.3.3 production build、覆盖率 50.05/44.64/54.45/50.61、27 文件/97 项真实 PostgreSQL、37/37 Playwright（3.0 分钟，无跳过）；原始命令与失败摘要见 [progress.md](../../progress.md)。
- **影响范围**：QAM-05 直接受影响，QAM-06 的空间保存/锚点生命周期保持；feat-057 当时未合并 QAM-05-001 写入/query parser、QAM-05-003 cursor 或 QAM-05-006 通用错误契约；cursor 已由本轮 feat-059 独立修复。

#### QAM-05-008：Home Post anchor 补齐与 Post 删除存在跨写交错失败路径

- **状态**：`open`
- **问题**：首页先读取最多 50 个 Post，再单独调用 `ensureHomePostElements` 的 `findMany → createMany`；若用户在两次查询之间删除 Post，`createMany` 可能用已被 FK 删除的 postId 失败，导致首页请求失败。当前 `Post→AtlasElement` ON DELETE CASCADE 是正确的删除方向，但并没有覆盖这个“旧首页读结果补 anchor”的交错边界（[`app/home/page.tsx`](../../app/home/page.tsx#L15-L29)、[`lib/home-board.ts`](../../lib/home-board.ts#L18-L54)、[`20260614120000_add_home_post_atlas_links/migration.sql`](../../prisma/migrations/20260614120000_add_home_post_atlas_links/migration.sql#L1-L20)）。
- **证据**：`createMany` 使用 `skipDuplicates` 只能处理唯一冲突，不能把不存在的 Post FK 变成可见的稳定结果；现有 Home board 测试只验证正常缺失 anchor 补齐，未覆盖删除交错或真实 FK（[`tests/lib/home-board.test.ts`](../../tests/lib/home-board.test.ts#L35-L66)）（E2）。
- **质量影响**：删除自己的 Post 或清理任务与并发首页请求交错时，用户可能收到 500；错误重试再进入同一路径，形成首页时间线与空间 anchor 的暂时不可用窗口。
- **最小修正**：在 anchor 补齐前重新确认 Post 存在并过滤已删除 ID，或将读取/补齐设计为可重试且 FK 冲突被安全忽略；保留数据库删除级联和现有首页自动补 anchor 行为，不扩展空间功能。
- **验收证据**：真实 PostgreSQL 交错删除与首页补齐不会把已删除 Post 写入 Atlas，也不使首页返回 500；Post 删除后 anchor 被级联清除，下一次首页只显示剩余 Post。
- **影响范围**：QAM-05 与 QAM-06 共享的 Home composition；QAM-06 负责 Atlas 记录/坐标，但本问题的 Post 读取生命周期由 QAM-05 维护。

#### QAM-05-009：首次挂载期间的搜索输入被 effect 重放取消（resolved）

- **状态**：`resolved`（2026-09-14，feat-067）
- **问题与证据**：[`SearchInput`](../../components/blog/SearchInput.tsx) 原本在 onChange 创建 300ms 定时器，空依赖 effect 只清理。开发 StrictMode 在首次挂载期间收到输入后重放 effect 时，定时器被取消却没有重新创建，输入值和清除按钮仍保留，URL/搜索请求不再更新。完整开发浏览器两项搜索均超时；分步报告确认输入生效但导航/响应未到达。组件通过 StrictMode 下的一次原生输入稳定复现旧实现导航 0 次，5 项中仅该项失败（E3）。
- **质量影响**：搜索输入看似可用但没有结果更新，依赖后续再次编辑才能恢复；完整开发门禁中同一输入可能留下不可区分的长超时。
- **已实施修正**：待提交草稿驱动同一 effect 创建/清理 timer，使挂载重放恢复当前查询，提交后清除待提交标志；保持 300ms、立即清空、外部 q 更新及卸载取消。所属 QAM-05，不属于 QAM-07 Focus 或 QAM-10 入口生命周期。
- **验收证据**：[`SearchInput 回归`](../../tests/component/search-input.test.tsx) 旧 1 failed/4 passed→5/5，清空、卸载、参数保留及外部导航保持；连同 Timeline 错误恢复/SSR 为 3 文件/23 项。最终完整开发门禁 exit 0：79/685、生产构建/覆盖率、29/110 真实 PostgreSQL、42/42 Playwright；搜索恢复 7.4s、同时间分页 5.9s，500/401/网络失败、键盘重试与位置/分页断言保持。最终生产定向 6/6，搜索恢复 3.2s、分页 5.3s。关闭页面的临时失败对照保留原始错误且 User/Post/AtlasElement 均为 0；全部临时用例与工件已清理。完整命令和此前失败见 [feat-067](../../progress.md#feat-067)（E3）。
- **边界**：`Performance.measure` 的负时间戳及其他高开销配置现象保留在 feat-068，未据此关闭全局错误断言或扩大产品改动。

## Architecture and Data Flow

```text
当前用户
  ├─ getPostVisibilityWhere(userId)
  │    ├─ user_post：全局可见
  │    └─ agent_log：RoomParticipant 成员可见；roomId=null 隐藏
  ├─ /home 页面 ──> postTimelineSelect + 可见 Post 前 50 ──> ensureHomePostElements ──> Home board snapshot
  │                                      └─> HomeTimelineBoard ──> Timeline ──> PostCard/AgentLogCard
  ├─ GET /api/posts ──认证──> postTimelineSelect + Prisma Post(搜索/type/author/cursor)
  ├─ GET /api/posts/:slug ──认证──> Prisma Post detail
  └─ Server Action ──认证──> generateSlug/ensureUniqueSlug ──> Prisma Post

AgentTask completion
  └─ ExecutionTracer lease transaction
       ├─ final Message + AgentStep + AgentTask + EventLog（QAM-08 事实）
       └─ 事务外 createAgentLogPost(roomId) ──> Post(agent_log, metadata)
```

Post 是内容事实源，`publishedAt`/`slug`/作者位置快照在 Post 上；首页与搜索共享展示 select，失败保留最后成功结果，取消请求不再回写。`AtlasElement.postId` 是 QAM-06 消费的空间派生关系，数据库 FK cascade 负责 Post 删除后的 anchor 清理。Post 可见性现在由单一关系条件下沉到数据库查询，搜索/type/cursor 只是额外收窄，不能绕过成员资格；Room 删除后的孤儿 Agent log 因无关联 Room 而保持隐藏。其余主要失败路径仍是 raw body/未治理的 query 字段进入 Prisma、slug 竞态撞 unique、Agent Post 写失败被吞掉，以及旧 Post 列表与 anchor 补齐交错；不把 QAM-08 Trace 生成或 QAM-06 坐标算法移入本报告。

## Verified Strengths

- Post 页面、新建页面、API 和 Server Action 均经过当前用户认证；编辑页面、PUT/DELETE 和 Action 对 user_post 执行 author ownership 检查（[`Edit post page`](../../app/posts/edit/%5Bslug%5D/page.tsx#L16-L25)、[`lib/api-posts.ts`](../../lib/api-posts.ts#L4-L9)、[`app/actions/posts.ts`](../../app/actions/posts.ts#L51-L103)，E2）。
- Post 列表、搜索、API/页面详情和首页共享同一成员可见性条件；真实 PostgreSQL 证明全局 `user_post` 保持可见，非成员和孤儿 `agent_log` 不进入响应或首页投影（[`post-visibility.ts`](../../lib/post-visibility.ts#L3-L18)、[`post-visibility.integration.test.ts`](../../tests/integration/post-visibility.integration.test.ts#L124-L179)，E3）。
- `generateSlug` 对中文转拼音、ASCII、特殊字符、长度和全被清空的标题有纯函数测试；本轮 `tests/lib/posts.test.ts` 通过。数据库仍保留 Post slug unique index，提供最终唯一性底线（E3/E2）。
- Post 的 authorCity/Country/Timezone 快照优先于当前 profile，避免用户改档案后历史位置全部回写；相关 helper 和测试覆盖 snapshot fallback（[`lib/post-time.ts`](../../lib/post-time.ts#L16-L31)、[`tests/lib/posts.test.ts`](../../tests/lib/posts.test.ts#L70-L99)，E3）。
- `react-markdown` 使用 GFM/line-break 插件但未开启 raw HTML；2026-09-12 的渲染实验中 `[bad](javascript:...)` 输出空 href，`<script>` 被转义，未形成可执行脚本（[`MarkdownContent.tsx`](../../components/blog/MarkdownContent.tsx#L1-L35)，E3）。
- Post 删除的数据库关系方向明确：`AtlasElement.postId` 唯一且 FK `ON DELETE CASCADE`；Home anchor 创建使用 `skipDuplicates`，正常重复首页访问不会重复创建（[`schema.prisma`](../../prisma/schema.prisma#L475-L500)、[`home-board.ts`](../../lib/home-board.ts#L27-L54)、[`tests/lib/home-board.test.ts`](../../tests/lib/home-board.test.ts#L35-L66)，E2/E3）。
- Agent final Message/Step/Task 的完成事实在 lease 事务内提交，timeline projection 异常不会回滚已完成消息；这种失败隔离方向是合理的，当前缺口是 durable retry/idempotency，而非 QAM-08 的 lease 状态机（[`execution-tracer.ts`](../../agent/execution-tracer.ts#L47-L102)，E2）。
- 首页/搜索共享字段白名单；真实 PostgreSQL 对同一可见集合做深比较，证明公开位置和 null fallback 一致，私有档案没有进入投影（[`post-timeline.ts`](../../lib/post-timeline.ts#L18)、[`投影回归`](../../tests/integration/post-timeline-projection.integration.test.ts#L33)，E3）。
- 搜索失败、有效空集合和请求取消已分别有可观察结果；保留文章、键盘重试和详情导航通过真实浏览器，迟到成功/失败与卸载通过 MSW/组件回归（[`搜索回归`](../../tests/component/home-timeline-board-search.test.tsx#L48)、[`浏览器旅程`](../../tests/e2e/authenticated.spec.ts#L1178)，E3）。
- 搜索防抖的创建与清理保持对称；StrictMode 首次挂载的一次输入可提交，清空和卸载取消待提交查询，组件先红后绿且完整开发与生产定向浏览器通过（[`SearchInput`](../../components/blog/SearchInput.tsx)、[`生命周期回归`](../../tests/component/search-input.test.tsx)、QAM-05-009，E3）。

- 复合 cursor 与 UI 共享时间/ID 顺序约定；同时间跨页、重复读取、成员/筛选组合和锚点删除有真实 PostgreSQL 证据，production 浏览器证明首页/搜索/刷新顺序稳定（[`分页回归`](../../tests/integration/post-pagination.integration.test.ts#L82)、[`浏览器旅程`](../../tests/e2e/authenticated.spec.ts#L1280)，E3）。

## Recommended Improvements

1. **治理 QAM-05-001（P2）**：共享 Post Zod body/query、写入服务和稳定错误 view model，降低 malformed body 与双入口规则扩散；补 Route/Action 行为测试。
2. **治理 QAM-05-002/004（P2）**：补 slug 冲突重试和 AgentTask→Post 的 durable/idempotent projection；以真实 PostgreSQL 测试确认并发可用性和失败恢复。QAM-05-003 的复合 cursor 与稳定排序已关闭。
3. **治理 QAM-05-006（P2）**：统一 API/Action 通用错误契约；QAM-05-007 的展示投影与搜索错误反馈已经关闭，不扩大为通用错误治理。
4. **最后治理 QAM-05-008（P2）**：为首页 Post 与 Atlas anchor 的交错删除增加真实 FK 测试和安全重试；保留 Post 删除 cascade，不把空间坐标责任转给 QAM-05。

以上均为现有 Post/Agent log/首页时间线的边界修正，不新增内容类型、搜索能力、Trace 能力或空间交互。

## Sustainable Review Record

### 当前开放问题

| ID | Priority | 状态 | 首次发现/直接证据 | 复审触发 |
| --- | --- | --- | --- | --- |
| QAM-05-001 | P2 | `open` | Post API/Action raw body 与重复 CRUD 规则（E2；优先级复核降级） | Post schema、Route、Action、validation 或错误契约修改 |
| QAM-05-002 | P2 | `open` | `ensureUniqueSlug` check-then-write + DB unique（E2；优先级复核降级） | slug 算法、Post create/update、Agent log projection 或唯一迁移修改 |
| QAM-05-004 | P2 | `open` | final completion 后置 Post 写入，异常/节流只 console/null（E2；优先级复核降级） | ExecutionTracer completion、agent-posts、AgentTask/Post relation 或 Worker retry 修改 |
| QAM-05-006 | P2 | `open` | Action/API 原始异常 message 返回（E2） | `lib/api.ts`、Post Action 或错误响应策略修改 |
| QAM-05-008 | P2 | `open` | anchor 补齐与 Post 删除跨写 FK 交错（E2） | Post/Atlas FK、home-board 补齐、Home page 或 Post delete 生命周期修改 |

### 已解决问题

| ID | Priority | 状态 | 修正/证据 | 复审触发 |
| --- | --- | --- | --- | --- |
| QAM-05-005 | P1 | `resolved` | 统一 Post 可见性条件；真实 PostgreSQL 覆盖列表/type/搜索/详情/首页、双用户成员边界和 Room `SetNull` 孤儿隐藏（E2/E3） | Post read projection、RoomParticipant/Room 删除、首页查询或 Agent log roomId 语义修改 |
| QAM-05-007 | P2 | `resolved` | 共享最小展示 select；组件 12 failed→15/15、真实 PostgreSQL 0/1→1/1，当前成员可见性/Home 授权 3/3，Chromium 失败保留/键盘重试与位置一致（E3） | Home/Post select、位置 fallback、SearchInput/HomeTimelineBoard 或错误 UI 修改 |
| QAM-05-003 | P2 | `resolved` | 版本化复合 cursor、稳定两键排序；PostgreSQL 59→51 的旧遗漏修正为 59/59，分页/首页/成员/删除锚点 4/4；Route/组件及 production Chromium 53 条跨页通过（E3） | 搜索、cursor、首页/Timeline 排序、Post ID 或时间字段/索引修改 |
| QAM-05-009 | P2 | `resolved` | 防抖创建/清理同归 effect；StrictMode 首次输入旧导航 0 次→1 次，清空/卸载回归保持；完整开发 42/42、最终生产定向 6/6，失败清理零残留（E3） | SearchInput 防抖、清空、外部 q 或挂载生命周期修改 |

### 复审触发与证据规则

- 任一问题修复后保留原 ID，状态只改为 `resolved`、`accepted-risk` 或 `not-reproduced`，并附当前代码和风险匹配测试证据；不得删除历史结论。
- QAM-05 复审必须重新核对 HTTP/Action 规则是否同源、Agent log room 过滤是否覆盖列表/搜索/详情/home、Post→Atlas FK 是否仍为正确生命周期方向；QAM-06 的坐标/媒体问题和 QAM-08 的 Trace 生成/lease 问题只作为关联证据，不重复计分。
- 最高风险验证应至少包括真实 PostgreSQL 的并发 slug、同 timestamp cursor、跨房间 Post read、Agent projection 失败/恢复/幂等和 Post 删除与 anchor 补齐交错；本轮浏览器已重跑发帖与搜索旅程；完整编辑/删除生命周期仍需专项覆盖。
- 2026-09-12 根会话 `./init.sh` 通过 72 个测试文件/472 项；本模块定向 Node 7 文件/49 项、组件 2 文件/3 项通过。该轮未运行 Docker、真实 PostgreSQL、Playwright、`check:full` 或 Compose smoke；2026-09-08 的 `check:full` 曾单次通过生产构建、覆盖率、13 文件/30 项真实 PostgreSQL和 Playwright 9/9，不冒充本轮结果。

### 只追加评分历史

| 日期 | Score | Score Level | Gate | Final | Delta | 变更证据 |
| --- | ---: | --- | --- | --- | --- | --- |
| 2026-09-06 | 64 | L1 | L1 | L1 | `baseline` | 初审；Post/Agent/Markdown/Search 定向 Node 测试 6 文件/47 项通过，组件测试 3 文件/5 项通过；Markdown 危险链接/HTML 实验通过；并发、跨房间、PostgreSQL 生命周期和完整浏览器旅程未验证。 |
| 2026-09-06 | 64 | L1 | L1 | L1 | `优先级复核（0分）` | 重新核对原 5 个 P1：仅 QAM-05-005 的跨房间权限泄漏满足 P1；QAM-05-001/002/003/004 分别降为 P2，理由为 malformed body 不稳错误、unique 拒绝但数据一致、同毫秒边界漏读、派生 log 丢失均无当前跨用户/不可恢复状态/重复副作用/持续故障证据。 |
| 2026-09-08 | 73 | L2 | L2 | L2 | `+9（QAM-05-005 resolved）` | `getPostVisibilityWhere()` 统一列表、搜索、API/页面详情和首页的 Post read authorization；修复前真实 PostgreSQL 证明 A 可读 B 房间及孤儿 Agent log，修复后 1/1 覆盖成员可见、非成员/孤儿隐藏、user_post 全局语义和双用户切换。`npm run check:full` 单次通过 13 文件/30 项 PostgreSQL 与 Playwright 9/9。 |
| 2026-09-12 | 73 | L2 | L2 | L2 | `0（无影响评分的代码或证据变化）` | 当前工作树和 `668448b` 后续提交均未改变 QAM-05 业务实现、schema、迁移或定向测试；重新核对 Post API/Action、ownership、slug/search/Markdown、Agent log、Post/Atlas 生命周期、链接和稳定问题状态。根会话 `./init.sh` 通过 72 文件/472 项；本模块定向 Node 7 文件/49 项、组件 2 文件/3 项通过，未重跑 PostgreSQL/Playwright/`check:full`。 |
| 2026-09-13 | 77 | L2 | L2 | L2 | `+4（QAM-05-007 resolved）` | 展示 select 同源、搜索失败保留/键盘重试和取消后回写保护；抽象、状态、接口、健壮性各 +1，其余维度保持。组件旧 12/15 failed→15/15，PostgreSQL 旧 0/1→1/1、成员与 Home 授权共 3/3，开发 Chromium 2/2；`E2E_APP_MODE=production ./scripts/run-node22.sh npm run check:full` 单次 exit 0：77 文件/607 项 Vitest、Next.js 16.3.3 production build、覆盖率 50.05/44.64/54.45/50.61、27 文件/97 项真实 PostgreSQL、37/37 Playwright（3.0 分钟，无跳过）。其他六个 P2 保持开放。 |
| 2026-09-13 | 80 | L3 | L2 | L2 | `+3（QAM-05-003 resolved）` | 复合 cursor、共享第二排序键与校验边界；数据一致性、健壮性、验证可信度各 +1，其他维度保持。真实 PostgreSQL 旧 59 条仅返回 51 条、四项失败→4/4；同时间 Timeline 旧 0/1→1/1。production Chromium 53 条乱序写入后首页/搜索/刷新及分页完整，完整门禁单次 exit 0：78/653 Vitest、构建、覆盖率 50.43/45.03/55.02/50.99、28/101 PostgreSQL、40/40 Playwright。其余五个 P2 与 Gate L2 保持。 |
| 2026-09-14 | 80 | L3 | L2 | L2 | `0（QAM-05-009 resolved）` | feat-067 修复首次挂载输入被 effect 重放取消，恢复既有搜索契约；旧组件 1 failed/4 passed→5/5，相关组件/SSR 3/23。最终单 worker 开发 `check:full` exit 0：79/685、生产构建、覆盖率 51.58/45.39/56.06/52.25、29/110 PostgreSQL、42/42 Playwright；生产搜索/分页与 Focus 定向 6/6，收尾 init 79/685。其余五个 P2 及并发/派生恢复缺口保持，各维度、Gate 和 Final 不变；高开销环境与独立性能计时错误保留在 feat-068。 |

复审时只在代码或风险匹配证据变化时重算受影响维度，并重新核对 100 分合计、Gate、Final 和所有稳定问题状态。
