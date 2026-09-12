# QAM-05 内容发布与时间线工程质量审查

## 元数据

| 项目 | 内容 |
| --- | --- |
| QAM | QAM-05 内容发布与时间线 |
| 快照日期 | 2026-09-12 |
| 审查 Skill | [`xoxo-qam-05-content-timeline-review`](../../.agents/skills/xoxo-qam-05-content-timeline-review/SKILL.md) |
| 标准版本 | [`module-quality-review-standard.md`](./module-quality-review-standard.md) v1.0.0 |
| 范围来源 | [`PROJECT_VIEW.md`](../../PROJECT_VIEW.md) 的 QAM-05、Cross-cutting Concerns、共享映射、BU-05 与 Quality Tracking Index；[`AGENTS.md`](../../AGENTS.md) |
| 本轮 Delta | `0（当前复审无影响评分的代码或证据变化）` |
| 当前基线命令 | 根会话 `./init.sh`：退出 0，72 个测试文件/472 项通过；本模块另执行 `./scripts/run-node22.sh npm run test:unit -- tests/lib/posts.test.ts tests/agent/agent-posts.test.ts tests/server/posts-api.test.ts tests/server/markdown-content.test.ts tests/server/timeline-empty-message.test.ts tests/server/home-timeline-board-search.test.ts tests/lib/home-board.test.ts`：7 文件/49 项通过，以及 `./scripts/run-node22.sh npm run test:component -- tests/component/post-editor.test.tsx tests/component/home-timeline-board-search.test.tsx`：2 文件/3 项通过；React SSR Markdown 危险链接/原始 HTML 实验退出 0，`javascript:` href 被清空且 `<script>` 被转义 |
| 风险匹配命令 | 本轮未运行 Docker、真实 PostgreSQL、Playwright 或 `check:full`；2026-09-08 的 `post-visibility.integration.test.ts` 修复后 1/1 与 `check:full`（PostgreSQL 13 文件/30 项、Playwright 9/9）是既有 E3，当前已重新核对对应实现、测试与链接且 QAM-05 范围代码未变化，但不冒充本轮重跑 |
| 证据纪律 | E3 为当前定向 Node/组件测试以及 2026-09-08 明确标注日期的 PostgreSQL/浏览器历史执行；E2 为本轮重新核对的源码、schema、迁移与测试交叉证据；既有跨房间回归只支持 QAM-05-005，未据此宣称 slug/cursor/projection 等 P2 已验证 |
| 工作区说明 | 当前工作树存在 QAM-03/QAM-04 等并行实现与文档改动；QAM-05 业务代码、schema、迁移和定向测试在复审前均无工作树改动，本轮只修改本报告，未把其他模块变化计入分数 |

## Overall

| 指标 | 结果 |
| --- | --- |
| Score | **73 / 100** |
| Score Level | **L2** |
| Gate Level | **L2** |
| Final Level | **L2** |
| Trend | `0` |
| Evidence Confidence | 中高（本轮 7 文件/49 项 Node 与 2 文件/3 项组件定向测试通过，且 QAM-05 范围代码相对 2026-09-08 PostgreSQL/浏览器 E3 未变化；本轮未重跑真实 PostgreSQL/Playwright，slug/cursor、Agent projection 恢复和 Post/Atlas 交错仍主要为 E2） |
| 当前开放问题 | 7 项（P2×7） |

Post 页面、所有权编辑入口、中文 slug 与 Markdown 组件均有可定位的分层实现，数据库也提供 slug 唯一键和 Post→AtlasElement 级联。`getPostVisibilityWhere()` 让列表、搜索、API/页面详情和首页共享同一成员可见性条件，保留全局 `user_post`，并隐藏非成员及 Room 删除后的孤儿 `agent_log`；2026-09-08 的真实 PostgreSQL 已覆盖该权限边界。当前代码与证据变化没有关闭或新增问题，HTTP Route/Server Action 写入、slug/cursor、Agent projection 恢复和 Post/Atlas 交错仍有 7 个 P2，因此保持 73 分、L2。

## Score Breakdown

| 维度 | Score | Max | Finding / Evidence |
| --- | ---: | ---: | --- |
| 架构与责任边界 | 11 | 14 | 页面、Route、Server Action、Post helper 和组件职责基本可导航，读取授权已下沉到共享领域条件；但首页仍直接拥有 Post 查询，Timeline 又复用 Home spatial shell，且 QAM-05/QAM-06 没有单向 composition boundary（[`post-visibility.ts`](../../lib/post-visibility.ts#L1-L18)、[`app/home/page.tsx`](../../app/home/page.tsx#L13-L30)、BU-05，E2/E3）。 |
| 代码结构与复杂度 | 8 | 10 | CRUD 与呈现控制流局部简单，复杂度主要来自 HTTP/Action 两套写路径、首页/搜索两套读投影和 Agent completion 后置投影，而非内容功能本身（[`posts route`](../../app/api/posts/route.ts#L9-L88)、[`posts actions`](../../app/actions/posts.ts#L17-L103)，E2）。 |
| 抽象与复用 | 6 | 8 | `generateSlug`、`ensureUniqueSlug`、位置快照、ownership 和 Post read visibility 均有单一复用入口；Post body/query schema、写入服务、cursor 编解码和读取 view model 仍没有单一来源（[`post-visibility.ts`](../../lib/post-visibility.ts#L3-L18)、QAM-05-001/006/007，E2/E3）。 |
| 数据流与状态一致性 | 9 | 12 | Post 持久化字段、Atlas 外键级联及 `agent_log` 的成员/Room `SetNull` 读取语义已明确；但 slug/cursor 只以时间或 check-then-write 推进，Agent log 投影失败/节流仍没有持久事实（QAM-05-002/003/004/008，E2/E3）。 |
| 接口与依赖关系 | 7 | 10 | 列表、搜索、API/页面详情和首页共享相同可见性 contract；HTTP 与 Action 的输入、空字段和错误返回仍重复，首页和搜索 API 的 author projection 也不同（[`posts route`](../../app/api/posts/route.ts#L11-L43)、[`Post detail route`](../../app/api/posts/%5Bslug%5D/route.ts#L11-L44)、QAM-05-001/006/007，E2/E3）。 |
| 健壮性、并发与生命周期 | 7 | 14 | Prisma unique/FK、Atlas `skipDuplicates` 和 final step 栅栏提供基础保护；slug race、Agent projection 丢失、Home anchor 与 Post 删除交错、无稳定 cursor 没有恢复或并发证明（QAM-05-002/003/004/008，E2）。 |
| 性能与资源使用 | 6 | 8 | 首页/API 各限制 50/100 条，Post 有 type/author/room 索引；搜索对 title/content 使用 contains，首页还为每次访问执行 board 查询和 anchor 补齐，规模增长时查询与重复装配成本可见，但当前没有凭数量直接扣分（[`schema.prisma`](../../prisma/schema.prisma#L517-L539)、[`home-board.ts`](../../lib/home-board.ts#L18-L54)，E2）。 |
| 安全与隐私 | 8 | 10 | 认证、编辑/删除 ownership、Markdown 防护和 room-scoped Agent log 成员过滤均有效；2026-09-08 的真实 PostgreSQL 证明非成员无法经列表、搜索、详情或首页读取秘密日志，孤儿日志也不会转为全局内容，本轮 Markdown SSR 安全实验通过。Server Action/开发错误响应仍可能泄漏内部异常（QAM-05-006，E2/历史与当前 E3）。 |
| 可测试性与验证可信度 | 6 | 8 | slug/位置、Markdown、搜索交互、编辑防重复提交和 Agent helper 有当前定向测试；2026-09-08 的真实 PostgreSQL 跨房间回归覆盖四条读取路径、双用户和 `SetNull`，当时完整门禁通过，本轮未重跑。Post Route PUT/DELETE ownership、slug/cursor、Agent projection 恢复和 Post/Atlas 交错仍缺少风险匹配 E3（[`post-visibility.integration.test.ts`](../../tests/integration/post-visibility.integration.test.ts#L54-L179)，E2/历史 E3）。 |
| 可维护性、演进与技术债 | 5 | 6 | 变化落点大体明确，Post schema 的快照字段和 Atlas 关系可追踪；新增输入、排序、隐私或 Agent log 规则仍需同步 Route、Action、Home、API 与 projection 多处（QAM-05-001/004/007，E2）。 |
| **合计** | **73** | **100** | 算术核对：11+8+6+9+7+7+6+8+6+5 = 73。 |

## Level Gate

| 门禁 | 结果 | 证据与原因 |
| --- | --- | --- |
| 开放 P0 | 通过 | 未发现已确认的 P0；Markdown 危险链接/原始 HTML 的本轮渲染实验未执行脚本，Post 删除的 FK 级联存在。 |
| 开放 P1 且涉及权限、不可恢复错误、并发重复副作用或持续故障 | 通过 | QAM-05-005 已由共享成员条件与真实 PostgreSQL 跨房间回归关闭；当前没有开放 P0/P1，QAM-05-001/002/003/004/006/007/008 继续保持 P2。 |
| 最高风险不变量有风险匹配行为验证 | 部分通过 | Agent log 成员边界与 Room `SetNull` 孤儿语义有 2026-09-08 的真实 PostgreSQL E3，且当前相关实现未变化；本轮未重跑。slug/cursor、Agent projection 失败恢复及 Post/Atlas FK 交错仍缺少真实 PostgreSQL 行为证据，故 Gate 不高于 L2。 |
| L4 要求 | 未通过 | 当前无开放 P0/P1，但关键并发、失败恢复和跨写生命周期仍未全部达到 E3。 |
| **最终判定** | **L2** | Score Level=L2；Gate Level=L2；Final Level=min(L2,L2)=L2。 |

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
- **证据**：仓库通用 Route 已使用 `readJsonBody`/Zod（[`validation.ts`](../../lib/validation.ts#L208-L221)），而 Post Route/Action 没有；`tests/server/posts-api.test.ts` 只覆盖空字符串和正常创建，没有 malformed body、超长内容、PUT 或 Action 行为（[`posts-api.test.ts`](../../tests/server/posts-api.test.ts#L83-L183)）（E2）。
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

#### QAM-05-003：cursor 与时间线排序没有稳定的第二排序键

- **状态**：`open`
- **优先级复核**：由 P1 降为 P2。同毫秒边界确实可能跳过一部分分页结果，但需要记录落在同一毫秒且恰好跨页的边界条件；它影响检索完整性而不改变持久数据，也没有当前高概率或持续故障证据。
- **问题**：`GET /api/posts` 仅按 `publishedAt DESC` 查询，并把最后一条的时间字符串作为 cursor，再以 `publishedAt < cursor` 过滤（[`app/api/posts/route.ts`](../../app/api/posts/route.ts#L19-L44)）。首页也是 `publishedAt DESC`，客户端 Timeline 仅按 `publishedAt` 升序排序（[`app/home/page.tsx`](../../app/home/page.tsx#L15-L21)、[`components/blog/Timeline.tsx`](../../components/blog/Timeline.tsx#L98-L114)）。同一毫秒的记录没有 `(publishedAt,id)` tie-breaker，下一页会排除所有相同时间的记录；数据库对同值行的相对顺序也没有契约。
- **证据**：Post schema 只有 type/author/room 普通索引，没有按 `(publishedAt,id)` 为 cursor 设计的稳定查询契约（[`schema.prisma`](../../prisma/schema.prisma#L517-L539)）（E2）；测试只断言 type/search where 和一条结果，没有同时间 cursor/排序行为（[`posts-api.test.ts`](../../tests/server/posts-api.test.ts#L42-L80)、[`posts-api search tests`](../../tests/server/posts-api.test.ts#L185-L243)）（E2）。
- **质量影响**：Agent log 或批量发帖在同一时间窗口时，滚动/调用下一页会漏内容或在边界顺序抖动；Timeline 的作者侧别和空间 anchor 也会随未定义的 tie 顺序变化，搜索结果难以复现。
- **最小修正**：定义不透明的 `(publishedAt,id)` cursor；查询使用相同方向的复合比较和 `orderBy: [{publishedAt:"desc"},{id:"desc"}]`，Timeline 采用同一稳定键（展示方向可保持当前旧→新）。首页、搜索 API 和 cursor 响应共用该读取 contract，不新增分页能力。
- **验收证据**：真实 PostgreSQL 写入至少两条相同 `publishedAt` 的 Post，分页串联返回每条恰好一次且顺序稳定；搜索、首页和 Timeline 对同一集合顺序一致。补 Route/服务行为测试，不能只断言 Prisma 调用字符串。
- **影响范围**：QAM-05 直接受影响；QAM-06 只消费 Timeline 的稳定 Post 顺序和 anchor 映射，不负责内容分页语义。

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

#### QAM-05-007：首页、搜索和 API 的 Post read projection 及失败语义漂移

- **状态**：`open`
- **问题**：首页查询给 author include profile，搜索 API 只选择 id/displayName/avatarLabel；PostCard 的 location resolver 会因此对快照为空的旧 Post 显示不同位置。`HomeTimelineBoard` 的 fetch 也不检查 `response.ok`，任何 401/500 JSON 都可能被当成 `{posts: []}`，搜索失败看起来像“没有匹配”（[`app/home/page.tsx`](../../app/home/page.tsx#L15-L21)、[`app/api/posts/route.ts`](../../app/api/posts/route.ts#L32-L39)、[`components/home/HomeTimelineBoard.tsx`](../../components/home/HomeTimelineBoard.tsx#L39-L65)）。
- **证据**：`TimelinePost.author.profile` 是可选且 `resolveAuthorLocation` 明确有 profile fallback（[`components/blog/Timeline.tsx`](../../components/blog/Timeline.tsx#L24-L41)、[`lib/post-time.ts`](../../lib/post-time.ts#L25-L31)）；测试只模拟 200 且只断言空结果/匹配结果，没有非 2xx 和 projection 一致性行为（[`home-timeline-board-search.test.tsx`](../../tests/component/home-timeline-board-search.test.tsx#L64-L105)）（E2）。
- **质量影响**：同一 Post 在初始首页与搜索结果中呈现不同作者位置；后端故障被伪装成合法空集合，用户可能重复提交查询或误判数据消失，且 API/home 规则修改需要多处同步。
- **最小修正**：抽出单一 Post timeline view/select 和 query parser，首页与 API 共用；客户端先检查 `response.ok`，显示稳定搜索错误并保留旧结果。保持现有搜索范围和时间线 UI，不新增搜索能力。
- **验收证据**：同一快照/旧位置为空的 Post 在首页与搜索中返回相同 author projection；模拟 401/500 时不显示“无匹配”，而显示可观察错误且旧结果不被覆盖；补 server/component 行为测试。
- **影响范围**：QAM-05；QAM-06 只消费 Timeline/anchor projection，不负责搜索错误 UI。

#### QAM-05-008：Home Post anchor 补齐与 Post 删除存在跨写交错失败路径

- **状态**：`open`
- **问题**：首页先读取最多 50 个 Post，再单独调用 `ensureHomePostElements` 的 `findMany → createMany`；若用户在两次查询之间删除 Post，`createMany` 可能用已被 FK 删除的 postId 失败，导致首页请求失败。当前 `Post→AtlasElement` ON DELETE CASCADE 是正确的删除方向，但并没有覆盖这个“旧首页读结果补 anchor”的交错边界（[`app/home/page.tsx`](../../app/home/page.tsx#L15-L29)、[`lib/home-board.ts`](../../lib/home-board.ts#L18-L54)、[`20260614120000_add_home_post_atlas_links/migration.sql`](../../prisma/migrations/20260614120000_add_home_post_atlas_links/migration.sql#L1-L20)）。
- **证据**：`createMany` 使用 `skipDuplicates` 只能处理唯一冲突，不能把不存在的 Post FK 变成可见的稳定结果；现有 Home board 测试只验证正常缺失 anchor 补齐，未覆盖删除交错或真实 FK（[`tests/lib/home-board.test.ts`](../../tests/lib/home-board.test.ts#L35-L66)）（E2）。
- **质量影响**：删除自己的 Post 或清理任务与并发首页请求交错时，用户可能收到 500；错误重试再进入同一路径，形成首页时间线与空间 anchor 的暂时不可用窗口。
- **最小修正**：在 anchor 补齐前重新确认 Post 存在并过滤已删除 ID，或将读取/补齐设计为可重试且 FK 冲突被安全忽略；保留数据库删除级联和现有首页自动补 anchor 行为，不扩展空间功能。
- **验收证据**：真实 PostgreSQL 交错删除与首页补齐不会把已删除 Post 写入 Atlas，也不使首页返回 500；Post 删除后 anchor 被级联清除，下一次首页只显示剩余 Post。
- **影响范围**：QAM-05 与 QAM-06 共享的 Home composition；QAM-06 负责 Atlas 记录/坐标，但本问题的 Post 读取生命周期由 QAM-05 维护。

## Architecture and Data Flow

```text
当前用户
  ├─ getPostVisibilityWhere(userId)
  │    ├─ user_post：全局可见
  │    └─ agent_log：RoomParticipant 成员可见；roomId=null 隐藏
  ├─ /home 页面 ──> 可见 Post 前 50 ──> ensureHomePostElements ──> Home board snapshot
  │                                      └─> HomeTimelineBoard ──> Timeline ──> PostCard/AgentLogCard
  ├─ GET /api/posts ──认证──> Prisma Post(搜索/type/author/cursor)
  ├─ GET /api/posts/:slug ──认证──> Prisma Post detail
  └─ Server Action ──认证──> generateSlug/ensureUniqueSlug ──> Prisma Post

AgentTask completion
  └─ ExecutionTracer lease transaction
       ├─ final Message + AgentStep + AgentTask + EventLog（QAM-08 事实）
       └─ 事务外 createAgentLogPost(roomId) ──> Post(agent_log, metadata)
```

Post 是内容事实源，`publishedAt`/`slug`/作者位置快照在 Post 上；`AtlasElement.postId` 是 QAM-06 消费的空间派生关系，数据库 FK cascade 负责 Post 删除后的 anchor 清理。Post 可见性现在由单一关系条件下沉到数据库查询，搜索/type/cursor 只是额外收窄，不能绕过成员资格；Room 删除后的孤儿 Agent log 因无关联 Room 而保持隐藏。其余主要失败路径仍是 raw body/query 进入 Prisma、slug 竞态撞 unique、同 timestamp cursor 排除记录、Agent Post 写失败被吞掉，以及旧 Post 列表与 anchor 补齐交错；不把 QAM-08 Trace 生成或 QAM-06 坐标算法移入本报告。

## Verified Strengths

- Post 页面、新建页面、API 和 Server Action 均经过当前用户认证；编辑页面、PUT/DELETE 和 Action 对 user_post 执行 author ownership 检查（[`Edit post page`](../../app/posts/edit/%5Bslug%5D/page.tsx#L16-L25)、[`lib/api-posts.ts`](../../lib/api-posts.ts#L4-L9)、[`app/actions/posts.ts`](../../app/actions/posts.ts#L51-L103)，E2）。
- Post 列表、搜索、API/页面详情和首页共享同一成员可见性条件；真实 PostgreSQL 证明全局 `user_post` 保持可见，非成员和孤儿 `agent_log` 不进入响应或首页投影（[`post-visibility.ts`](../../lib/post-visibility.ts#L3-L18)、[`post-visibility.integration.test.ts`](../../tests/integration/post-visibility.integration.test.ts#L124-L179)，E3）。
- `generateSlug` 对中文转拼音、ASCII、特殊字符、长度和全被清空的标题有纯函数测试；本轮 `tests/lib/posts.test.ts` 通过。数据库仍保留 Post slug unique index，提供最终唯一性底线（E3/E2）。
- Post 的 authorCity/Country/Timezone 快照优先于当前 profile，避免用户改档案后历史位置全部回写；相关 helper 和测试覆盖 snapshot fallback（[`lib/post-time.ts`](../../lib/post-time.ts#L16-L31)、[`tests/lib/posts.test.ts`](../../tests/lib/posts.test.ts#L70-L99)，E3）。
- `react-markdown` 使用 GFM/line-break 插件但未开启 raw HTML；本轮实际渲染中 `[bad](javascript:...)` 输出空 href，`<script>` 被转义，未形成可执行脚本（[`MarkdownContent.tsx`](../../components/blog/MarkdownContent.tsx#L1-L35)，E3）。
- Post 删除的数据库关系方向明确：`AtlasElement.postId` 唯一且 FK `ON DELETE CASCADE`；Home anchor 创建使用 `skipDuplicates`，正常重复首页访问不会重复创建（[`schema.prisma`](../../prisma/schema.prisma#L475-L500)、[`home-board.ts`](../../lib/home-board.ts#L27-L54)、[`tests/lib/home-board.test.ts`](../../tests/lib/home-board.test.ts#L35-L66)，E2/E3）。
- Agent final Message/Step/Task 的完成事实在 lease 事务内提交，timeline projection 异常不会回滚已完成消息；这种失败隔离方向是合理的，当前缺口是 durable retry/idempotency，而非 QAM-08 的 lease 状态机（[`execution-tracer.ts`](../../agent/execution-tracer.ts#L47-L102)，E2）。
- 本轮定向 Node 测试 7 文件/49 项和组件测试 2 文件/3 项通过；编辑器在 action pending 时阻止重复提交，搜索在请求完成后替换结果、空结果有明确文案（[`tests/component/post-editor.test.tsx`](../../tests/component/post-editor.test.tsx#L29-L56)、[`tests/component/home-timeline-board-search.test.tsx`](../../tests/component/home-timeline-board-search.test.tsx#L64-L105)，E3）。

## Recommended Improvements

1. **治理 QAM-05-001（P2）**：共享 Post Zod body/query、写入服务和稳定错误 view model，降低 malformed body 与双入口规则扩散；补 Route/Action 行为测试。
2. **治理 QAM-05-002/003/004（P2）**：依次补 slug 冲突重试、`(publishedAt,id)` 不透明 cursor 和 AgentTask→Post 的 durable/idempotent projection；以真实 PostgreSQL 测试确认可用性、无漏项和失败恢复。
3. **治理 QAM-05-006/007（P2）**：统一错误响应与 Home/API 读取 projection，补非 2xx 搜索行为测试。
4. **最后治理 QAM-05-008（P2）**：为首页 Post 与 Atlas anchor 的交错删除增加真实 FK 测试和安全重试；保留 Post 删除 cascade，不把空间坐标责任转给 QAM-05。

以上均为现有 Post/Agent log/首页时间线的边界修正，不新增内容类型、搜索能力、Trace 能力或空间交互。

## Sustainable Review Record

### 当前开放问题

| ID | Priority | 状态 | 首次发现/直接证据 | 复审触发 |
| --- | --- | --- | --- | --- |
| QAM-05-001 | P2 | `open` | Post API/Action raw body 与重复 CRUD 规则（E2；优先级复核降级） | Post schema、Route、Action、validation 或错误契约修改 |
| QAM-05-002 | P2 | `open` | `ensureUniqueSlug` check-then-write + DB unique（E2；优先级复核降级） | slug 算法、Post create/update、Agent log projection 或唯一迁移修改 |
| QAM-05-003 | P2 | `open` | API cursor/Home/Timeline 仅按 publishedAt（E2；优先级复核降级） | 搜索、分页、首页排序、Timeline 或 Post index 修改 |
| QAM-05-004 | P2 | `open` | final completion 后置 Post 写入，异常/节流只 console/null（E2；优先级复核降级） | ExecutionTracer completion、agent-posts、AgentTask/Post relation 或 Worker retry 修改 |
| QAM-05-006 | P2 | `open` | Action/API 原始异常 message 返回（E2） | `lib/api.ts`、Post Action 或错误响应策略修改 |
| QAM-05-007 | P2 | `open` | Home/API author projection 与搜索非 2xx 语义漂移（E2） | Home query、Post API projection、SearchInput/HomeTimelineBoard 或错误 UI 修改 |
| QAM-05-008 | P2 | `open` | anchor 补齐与 Post 删除跨写 FK 交错（E2） | Post/Atlas FK、home-board 补齐、Home page 或 Post delete 生命周期修改 |

### 已解决问题

| ID | Priority | 状态 | 修正/证据 | 复审触发 |
| --- | --- | --- | --- | --- |
| QAM-05-005 | P1 | `resolved` | 统一 Post 可见性条件；真实 PostgreSQL 覆盖列表/type/搜索/详情/首页、双用户成员边界和 Room `SetNull` 孤儿隐藏（E2/E3） | Post read projection、RoomParticipant/Room 删除、首页查询或 Agent log roomId 语义修改 |

### 复审触发与证据规则

- 任一问题修复后保留原 ID，状态只改为 `resolved`、`accepted-risk` 或 `not-reproduced`，并附当前代码和风险匹配测试证据；不得删除历史结论。
- QAM-05 复审必须重新核对 HTTP/Action 规则是否同源、Agent log room 过滤是否覆盖列表/搜索/详情/home、Post→Atlas FK 是否仍为正确生命周期方向；QAM-06 的坐标/媒体问题和 QAM-08 的 Trace 生成/lease 问题只作为关联证据，不重复计分。
- 最高风险验证应至少包括真实 PostgreSQL 的并发 slug、同 timestamp cursor、跨房间 Post read、Agent projection 失败/恢复/幂等和 Post 删除与 anchor 补齐交错；Playwright 发帖/编辑/删除/搜索旅程应在浏览器运行环境可用后补跑。
- 2026-09-12 根会话 `./init.sh` 通过 72 个测试文件/472 项；本模块定向 Node 7 文件/49 项、组件 2 文件/3 项通过。本轮未运行 Docker、真实 PostgreSQL、Playwright、`check:full` 或 Compose smoke；2026-09-08 的 `check:full` 曾单次通过生产构建、覆盖率、13 文件/30 项真实 PostgreSQL和 Playwright 9/9，不冒充本轮结果。

### 只追加评分历史

| 日期 | Score | Score Level | Gate | Final | Delta | 变更证据 |
| --- | ---: | --- | --- | --- | --- | --- |
| 2026-09-06 | 64 | L1 | L1 | L1 | `baseline` | 初审；Post/Agent/Markdown/Search 定向 Node 测试 6 文件/47 项通过，组件测试 3 文件/5 项通过；Markdown 危险链接/HTML 实验通过；并发、跨房间、PostgreSQL 生命周期和完整浏览器旅程未验证。 |
| 2026-09-06 | 64 | L1 | L1 | L1 | `优先级复核（0分）` | 重新核对原 5 个 P1：仅 QAM-05-005 的跨房间权限泄漏满足 P1；QAM-05-001/002/003/004 分别降为 P2，理由为 malformed body 不稳错误、unique 拒绝但数据一致、同毫秒边界漏读、派生 log 丢失均无当前跨用户/不可恢复状态/重复副作用/持续故障证据。 |
| 2026-09-08 | 73 | L2 | L2 | L2 | `+9（QAM-05-005 resolved）` | `getPostVisibilityWhere()` 统一列表、搜索、API/页面详情和首页的 Post read authorization；修复前真实 PostgreSQL 证明 A 可读 B 房间及孤儿 Agent log，修复后 1/1 覆盖成员可见、非成员/孤儿隐藏、user_post 全局语义和双用户切换。`npm run check:full` 单次通过 13 文件/30 项 PostgreSQL 与 Playwright 9/9。 |
| 2026-09-12 | 73 | L2 | L2 | L2 | `0（无影响评分的代码或证据变化）` | 当前工作树和 `668448b` 后续提交均未改变 QAM-05 业务实现、schema、迁移或定向测试；重新核对 Post API/Action、ownership、slug/search/Markdown、Agent log、Post/Atlas 生命周期、链接和稳定问题状态。根会话 `./init.sh` 通过 72 文件/472 项；本模块定向 Node 7 文件/49 项、组件 2 文件/3 项通过，未重跑 PostgreSQL/Playwright/`check:full`。 |

复审时只在代码或风险匹配证据变化时重算受影响维度，并重新核对 100 分合计、Gate、Final 和所有稳定问题状态。
