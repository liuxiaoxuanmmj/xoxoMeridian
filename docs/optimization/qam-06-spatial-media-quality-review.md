# QAM-06 空间画布与媒体资产工程质量审查

## 元数据

| 项目 | 内容 |
| --- | --- |
| QAM | QAM-06 空间画布与媒体资产 |
| 快照日期 | 2026-09-12 |
| 审查 Skill | [`xoxo-qam-06-spatial-media-review`](../../.agents/skills/xoxo-qam-06-spatial-media-review/SKILL.md) |
| 标准版本 | [`module-quality-review-standard.md`](./module-quality-review-standard.md) v1.0.0 |
| 范围来源 | [`PROJECT_VIEW.md`](../../PROJECT_VIEW.md) 的 QAM-06、Cross-cutting Concerns、共享映射、BU-01/BU-05 与 Quality Tracking Index；[`AGENTS.md`](../../AGENTS.md) |
| 本轮 Delta | `+5（QAM-06-007 resolved；74→79）` |
| 当前基线命令 | 启动 `./init.sh` exit 0、72 文件/482 项；最终 `./scripts/run-node22.sh npm run check:full` 中的快速门禁 exit 0、73 文件/496 项，类型、lint 与两主题资产通过 |
| 风险匹配命令 | `./scripts/run-node22.sh npm run check:full` 单次 exit 0：73/496 Vitest、Next.js production build、覆盖率 47.76/42.59/52.56/48.54、24 文件/75 项真实 PostgreSQL、32/32 Playwright；新增 [组件回归](../../tests/component/home-timeline-board-mutations.test.tsx)、[数据库故障/重试](../../tests/integration/home-mutation-persistence.integration.test.ts) 与 [浏览器编辑/删除旅程](../../tests/e2e/authenticated.spec.ts#L11-L118) 均通过 |
| 证据纪律 | E3 为本轮实际执行的组件失败/竞态、PostgreSQL trigger 故障注入与真实 Chromium 重试/刷新；初始组件负向对照 12/12 failed，最终该文件 14/14 passed。Home 授权与双进程拖动通过完整门禁复核；Atlas 建板、DB/blob 补偿与 SSE 生命周期仍保留各自证据缺口 |

## Overall

| 指标 | 结果 |
| --- | --- |
| Score | **79 / 100** |
| Score Level | **L2** |
| Gate Level | **L2** |
| Final Level | **L2** |
| Trend | `+5（74→79；较 baseline +22）` |
| Evidence Confidence | 中高（Home 权限、编辑/删除失败恢复和串行写入已有真实 PostgreSQL/浏览器 E3；Atlas 首次建板、SSE、DB/blob 与上传生命周期仍缺对应验证） |
| 当前开放问题 | 5 项（P2×5；无开放 P0/P1） |

当前产品入口仍以 `/home` 中嵌入的空间画布为准。QAM-06-007 已关闭：大小、标注与位置共用按照片串行的保存队列，失败保留待保存内容；照片和连线只在删除确认后移除，迟到响应不会覆盖后续编辑或恢复已清除的错误提示。组件、真实 PostgreSQL 与 Chromium 重试/刷新证明 UI 和持久化记录一致，既有 Home 授权与拖动收敛继续通过。Atlas 首次建板、DB/blob 补偿、multipart 输入、连接约束与 SSE 生命周期仍是五个独立 P2。

## Score Breakdown

| 维度 | Score | Max | Finding / Evidence |
| --- | ---: | ---: | --- |
| 架构与责任边界 | 10 | 14 | Home 是当前空间画布产品入口；[`getHomeBoardElementAccessWhere()`](../../lib/home-board.ts#L18-L33) 与 connection 派生谓词把 QAM-05 Post 可见性显式提升为空间读写边界，Home page 与三个 mutation 入口共用，不再各自推断成员资格。legacy Atlas 与 Home board 的固定 ID 边界、BU-01 global Atlas 语义保持不变（E2/E3）。 |
| 代码结构与复杂度 | 8 | 10 | 本轮将 Home 保存/删除状态从页面装配抽取到 [`useHomeBoardMutations`](../../components/home/useHomeBoardMutations.ts#L27)，`HomeTimelineBoard` 保留组合与反馈，失败分支有单一落点；Atlas/Home 上传删除重复与旧 SSE/drag cache 分散状态仍在（E2/E3）。 |
| 抽象与复用 | 7 | 8 | 位置、大小、标注共享 [`runPhotoQueue`](../../components/home/useHomeBoardMutations.ts#L52) 的最新字段合并、2xx 确认和失败重试，照片 DELETE 复用同一串行边界；Home spatial access、storage key/helper 继续复用。Atlas/Home 上传和 DB/blob 补偿仍未统一（E2/E3）。 |
| 数据流与状态一致性 | 11 | 12 | 照片 PATCH 失败保留未确认字段，新的同名字段优先；成功响应不整体覆盖后续草稿。照片及连线 DELETE 只有 2xx 才移除，失败无需从旧 snapshot 恢复整张画布；真实 PostgreSQL 与浏览器逐操作重试/reload 证明尺寸、trim 标注和级联记录一致。DB/blob 的跨资源补偿仍开放（E3）。 |
| 接口与依赖关系 | 8 | 10 | JSON body 有 Zod 校验；Home snapshot、element Route 与 connection Route 共用 QAM-05 的 Post 可见性 contract，connection 还要求两端同时可见并保留 board/type 约束。multipart 字段未经过 schema，Atlas connection 反向重复仍会落入 500/重复记录（QAM-06-005/006，E2/E3）。 |
| 健壮性、并发与生命周期 | 10 | 14 | 照片 PATCH/DELETE 串行，失败可重试；deferred 成功/失败证明后续编辑不会被旧响应回退，照片已删除时迟到的连线失败不复活提示，卸载后不派发排队写入。组件四操作分别覆盖 500 与网络拒绝，PostgreSQL 故障验证保留记录/级联语义，Home 授权条件写保持。旧 Atlas 建板、SSE 和 DB/blob 生命周期仍有缺口（E2/E3）。 |
| 性能与资源使用 | 6 | 8 | board/坐标/z-index 索引和可见元素渲染路径合理；每个 Atlas SSE 连接每 800ms 做完整元素/连接查询，且没有 in-flight guard，慢查询时工作与连接数线性放大（E2）。 |
| 安全与隐私 | 7 | 10 | 主要入口均要求认证；Home 的 room-scoped `agent_log` anchor 与关联 connection 现按当前用户 RoomParticipant 事实过滤，未授权读写统一表现为 404，且实际数据库写条件也复核授权。legacy Atlas board/Post-anchor 隔离、storage key 与私有读取缓存仍有效；上传只信任客户端 MIME 仍由 QAM-06-005 追踪（E2/E3）。 |
| 可测试性与验证可信度 | 7 | 8 | 新增组件旧实现 12/12 failed、修复后扩为 14/14，覆盖可访问 pending/error、500/网络拒绝、重试、连续编辑、键盘与迟到响应；PostgreSQL 新 4/4 验证实际 Route 故障/重试/级联，Chromium 逐次刷新并回读真实数据库。全量 24/75 PostgreSQL、32/32 Playwright 通过；Atlas SSE、建板和 DB/blob/上传仍缺 E3，未给满分。 |
| 可维护性、演进与技术债 | 5 | 6 | Home 的 mutation queue 与保存状态现集中在单一 hook，UI 控件只提交意图并呈现反馈；修改保持 QAM-06 局部，未引入新的协作协议。旧 Atlas SSE、资源补偿与上传重复仍是可定位的独立技术债（E2/E3）。 |
| **合计** | **79** | **100** | 算术核对：10+8+7+11+8+10+6+7+7+5 = 79。 |

## Level Gate

| 门禁 | 结果 | 证据与原因 |
| --- | --- | --- |
| 开放 P0 | 通过 | 当前无开放 P0；`AtlasElement.post` 的 FK 方向仍为 `AtlasElement.postId → Post.id`，没有把删除 anchor 错写成删除 Post。 |
| 开放 P1 且涉及权限、不可恢复错误、并发重复副作用或持续故障 | 通过 | QAM-06-009 已解决，QAM-06 当前无开放 P1；未授权 snapshot 与三个 mutation 均由真实 PostgreSQL/HTTP 证据关闭。 |
| 最高风险不变量有风险匹配行为验证 | 未通过 | Home 跨房间授权、跨 board 条件写与最终拖动持久化已有 PostgreSQL/浏览器 E3，但上传 DB/blob 部分失败和 Atlas SSE 生命周期仍缺风险匹配验证，因此 Gate 不高于 L2。 |
| L4 要求 | 未通过 | 五个 P2 仍包含资源部分失败、输入信任和 SSE 生命周期缺口，且对应风险匹配 E3 不完整。 |
| **最终判定** | **L2** | Score Level=L2；Gate Level=L2；Final Level=min(L2,L2)=L2。 |

## Critical Issues

### P0

当前无开放项。`AtlasElement.post` 的 `onDelete: Cascade` 方向已核正：删除 Post 会删除子级 anchor，删除 anchor 不会删除 Post。

### P1

当前无开放项。

#### QAM-06-009：Home snapshot 与 mutation 未继承 room-scoped Post anchor 的成员授权

- **状态**：`resolved`（2026-09-12）
- **问题**：修复前，Home 的 Post 列表已按 Room 成员过滤，但 snapshot 仍返回固定 board 的全部 anchor/connection，element PATCH 和 connection POST/DELETE 也只按 board/type 或裸 connection ID 授权。非成员因此可观察隐藏 `agent_log` 的空间标识，并形成持久跨房间写入。
- **修复前负向证据**：新增的 [`home-board-authorization.integration.test.ts`](../../tests/integration/home-board-authorization.integration.test.ts#L88-L251) 在旧实现上一次性收集全部结果：A 的 snapshot 实际含 B 的隐藏 anchor 与 connection，PATCH/POST/DELETE 分别返回 200/201/200，隐藏 x 被写为 999、原 connection 被删除，并新增一条未授权 connection；测试按预期失败 0/1（E3）。
- **已实施修正**：[`getHomeBoardElementAccessWhere()`](../../lib/home-board.ts#L18-L33) 统一表达“固定 Home board + 共享 photo 或当前用户可见 Post”，[`getHomeBoardConnectionAccessWhere()`](../../lib/home-board.ts#L35-L46) 要求两端都满足同一谓词；[`getHomeBoardSnapshot()`](../../lib/home-board.ts#L95-L108) 在数据库查询阶段过滤。Home element PATCH/DELETE 的实际扩展 unique 条件、connection DELETE 的实际 `deleteMany` 和 connection POST 的实际 nested connect 均复用该谓词，竞争窗口内失配映射为 404（E2/E3）。
- **验收证据**：修复后同一真实 PostgreSQL A/B 回归 1/1：A snapshot 只含共享照片、全局 `user_post` 与 Room A anchor，隐藏 connection 被过滤，三个 mutation 全为 404 且数据库不变；B 仍可 PATCH/POST/DELETE，全局 anchor 与照片仍可 PATCH。Playwright [`authenticated.spec.ts`](../../tests/e2e/authenticated.spec.ts#L138-L315) 从真实 `/home` 响应验证隐藏 Post/anchor/connection ID 均不在载荷，并通过真实 HTTP 重证三个 404 与数据库终态；完整门禁为 20 文件/61 项 PostgreSQL、30/30 Playwright（E3）。
- **影响范围**：QAM-06 直接负责 Home snapshot 与空间 mutation 授权；QAM-05 提供 Post 可见性 contract，QAM-02 提供 RoomParticipant 事实，不重复登记内容读取缺陷。

#### QAM-06-001：Atlas mutation 缺少 board scope，可破坏 Home anchor 的位置与连接

- **状态**：`resolved`（2026-09-07）
- **问题**：修复前，已弃用 Atlas 页面遗留的 [`element PATCH/DELETE`](../../app/api/atlas/elements/%5BelementId%5D/route.ts#L8-L85) 与 [`connection DELETE`](../../app/api/atlas/connections/route.ts#L43-L65) 只按资源 ID 写入，仍可绕过 `/home` 专用 Route 的 board/Post anchor 防护。首页会把 Home snapshot 中的 anchor ID 序列化到浏览器（[`HomePage`](../../app/home/page.tsx#L23-L53)）；旧入口可修改 anchor 位置，或删除 anchor 并级联清理其 Home connections。Post 本身不会被反向级联删除，但重建 anchor 无法恢复原布局。
- **质量影响**：修复前，任一已认证请求都能通过 legacy API 破坏 Home 的空间事实；这是共享 Prisma 模型上缺失资源边界造成的持续数据错误。
- **已实施修正**：[`ATLAS_GLOBAL_BOARD_ID`](../../lib/atlas-board.ts#L3-L8) 提供单一边界常量；element PATCH/DELETE 的实际 `updateMany/deleteMany` 同时限定 `id`、`boardId = atlas-global-board` 与 `postId = null`，connection DELETE 的实际 `deleteMany` 同时限定 `id` 与 global board。条件不匹配统一返回 404，且未改变 `/home` 的交互或数据模型。
- **验收证据**：[`atlas-board-scope.integration.test.ts`](../../tests/integration/atlas-board-scope.integration.test.ts#L121-L209) 在真实 PostgreSQL 中从 Route Handler 发起 legacy Atlas PATCH/DELETE；修复前 Home PATCH 实际返回 200 并使测试失败，修复后 2/2 通过：三个跨 board 请求均返回 404，Post、anchor 的 x/y/rotation/z-index/尺寸和 connection 全部保留；global board 的 PATCH/DELETE 仍返回 200。`npm run check:full` 同时通过生产构建、8 文件/19 项 PostgreSQL 集成测试和 9 项 Playwright。
- **影响范围**：QAM-06 直接受影响；QAM-05 Post 生命周期与首页时间线为直接关联责任；QAM-01 仅提供认证，不承担 board 资源边界。

#### QAM-06-003：最终拖动坐标缺少可观察、可重试的持久化收敛

- **状态**：`resolved`（2026-09-07）
- **问题**：产品确认当前空间画布入口是 `/home`，该路径不消费 legacy Atlas drag `Map` 或 SSE；修复前 Home 拖动结束虽直接 PATCH PostgreSQL，但 [`HomeTimelineBoard`](../../components/home/HomeTimelineBoard.tsx#L186-L195) 对网络异常使用空 catch，且不检查非 2xx 响应。连续拖动还能并发发出最终 PATCH，使较旧请求后完成时覆盖较新坐标（E2；修复前组件回归因找不到失败提示而失败为 E3）。
- **质量影响**：瞬时失败时当前用户继续看到乐观位置却不知道 DB 仍是旧坐标，刷新或另一实例读取会回退；并发最终写乱序时所有实例会稳定收敛到错误的旧坐标。根因是客户端没有把最终位置写入建模为必须确认的持久化状态，而不是是否存在临时 cache。
- **已实施修正**：[`runPhotoQueue`](../../components/home/useHomeBoardMutations.ts#L52) 为每个元素串行发送最终 PATCH，并在等待期间把后续拖动合并为最新目标；只有 2xx 才清除状态，网络/非 2xx 失败保留同一坐标和 [`role="alert"` + 键盘按钮](../../components/home/HomeTimelineBoard.tsx#L231-L260) 供显式重试。该历史修复仅处理拖动；本轮 QAM-06-007 将队列扩展到照片编辑/删除，原拖动失败、串行与跨进程收敛回归继续通过。
- **验收证据**：[`home-timeline-board-drag.test.tsx`](../../tests/component/home-timeline-board-drag.test.tsx#L64-L158) 2/2 通过：503 后出现可访问失败/重试，成功后清除；deferred 双拖动证明最大并行 PATCH 为 1 且最终发送最新坐标。真实 PostgreSQL [`home-drag-persistence.integration.test.ts`](../../tests/integration/home-drag-persistence.integration.test.ts#L93-L135) 1/1 通过：Route 写入前启动的两个独立 Node 进程各自执行 [`getHomeBoardSnapshot`](../../tests/integration/fixtures/observe-atlas-element-position.ts#L12-L42)，均从旧坐标最终收敛到 `(420,315)`；数据库记录一致（E3）。
- **影响范围**：QAM-06；QAM-09 的多 Web 实例拓扑是部署关联，但位置写入与确认协议由 QAM-06 负责。

### P2

#### QAM-06-002：Atlas 首次建板使用 check-then-create，首个并发请求可失败

- **状态**：`open`
- **问题**：[`getOrCreateBoard`](../../lib/atlas-board.ts#L3-L9) 先 `findUnique`，缺失后再 `create`；并发的 Atlas 页面、GET 或 SSE 首次访问可同时看到不存在并争抢固定主键 `atlas-global-board`。Home board 使用原子语义更清楚的 [`upsert`](../../lib/home-board.ts#L10-L15)，但 Atlas 没有同等保护。当前没有真实 PostgreSQL 并发建板测试（E2）。
- **质量影响**：冷启动或迁移后多个已认证页面同时打开时，可能只有一个请求收到唯一约束 500；数据库仍只保留一个一致的 board，不会产生孤儿 board 或跨用户数据错误，失败请求通常重试即可。因此这是一般首访可靠性债务，而非持续错误状态或启动路径整体失效。
- **最小修正**：复用 `upsert({ where: { id }, update: {}, create: { id } })`，或捕获固定主键冲突后重新读取；保持单一 global board，不增加新的 board scope。
- **验收证据**：真实 PostgreSQL 从无 Atlas board 开始并发执行至少 10 次 `getOrCreateBoard()`，断言全部得到同一 board、无未处理唯一约束；Route 首次 GET、SSE 和上传各有冷启动覆盖。
- **影响范围**：QAM-06；QAM-09 只负责 init/deploy 是否已建 board 的交付语义，不重复登记运行时建板竞态。

#### QAM-06-004：上传先写 blob 后写 Atlas 记录，DB 失败会留下无法反向发现的孤儿对象

- **状态**：`open`
- **问题**：Atlas 与 Home upload Route 都在 [`storage.save`](../../app/api/atlas/uploads/route.ts#L28-L36) 后才执行 [`atlasElement.create`](../../app/api/atlas/uploads/route.ts#L44-L55)；Home 路径同样如此（[`home uploads`](../../app/api/home-board/uploads/route.ts#L28-L58)）。create 抛错时没有调用 `storage.delete(saved.key)`；delete 路径也把 blob cleanup 的异常静默吞掉（[`Atlas element DELETE`](../../app/api/atlas/elements/%5BelementId%5D/route.ts#L76-L79)）。当前 mock 测试只验证正常写删与 best-effort 顺序，未覆盖 DB 失败或 cleanup 重试（E2/E3）。
- **质量影响**：数据库拒绝、连接中断或进程崩溃发生在两步之间时，用户看到上传失败但 OSS/本地 volume 保留对象；这是只增加存储占用/清理成本的资源债务，当前没有证据表明会产生错误 Atlas 记录、跨用户读取或高概率持续故障，因此按 P2 处理。
- **最小修正**：在 create 失败分支立即 best-effort 删除刚保存的 key，并把删除失败作为可观测 cleanup 记录；保留删除记录先于 blob 的既有语义，但为失败提供受控重试/清理入口或等价维护机制，不引入新的用户功能。
- **验收证据**：注入 PostgreSQL create 失败和进程边界错误，断言 save 后会尝试删除且不会留下记录；注入 blob delete 失败，断言错误可被记录并由维护重试回收；Atlas/Home 两条上传路径均覆盖。
- **影响范围**：QAM-06；QAM-09 仅关联本地 volume 的持久性与部署清理，不承担 Route 的补偿事务。

#### QAM-06-005：上传只信任 multipart MIME，且位置/标题字段未经过服务端 schema

- **状态**：`open`
- **问题**：[`validateAtlasImageFile`](../../lib/storage/atlas-storage.ts#L338-L345) 只检查 `File.type` 和 `File.size`；`File.type` 来自请求元数据，不是文件内容。实际运行 `node --import tsx` 以 `File(["not-an-image"], "payload.jpg", { type: "image/jpeg" })` 调用该函数得到 `accepted: true`（E3）。两个上传 Route 还把 `x/y` 直接 `Number(...)`，把 caption 直接类型断言为 string（[`Atlas upload`](../../app/api/atlas/uploads/route.ts#L38-L53)、[`Home upload`](../../app/api/home-board/uploads/route.ts#L37-L56)），没有长度/有限数的统一服务端 contract。
- **质量影响**：伪造或损坏的字节可以进入图片存储并被当作图片回读；异常 multipart 字段可能静默归零、触发 Prisma 类型错误或带来不必要的大字段处理。当前 key 后缀和响应 content type 限制了直接 HTML 执行路径，但不能替代文件信任校验。
- **最小修正**：在 storage adapter 内按允许格式校验 magic bytes/可解码性；用同一 Zod/form-data 边界解析有限坐标和标题长度，拒绝非字符串字段和超长输入。保留 JPG/PNG/WebP、5MB 和现有 UI。
- **验收证据**：Route 行为测试提交 MIME 伪造、截断图片、Infinity 坐标、File 类型 caption 和超长 caption，断言稳定 400 且不调用 save；合法三种图片仍保存并以正确 content type 读取。
- **影响范围**：QAM-06；QAM-09 只负责存储配置，不承担上传内容校验。

#### QAM-06-006：Atlas connection 只约束有序唯一键，反向重复连接可写入

- **状态**：`open`
- **问题**：Atlas POST 只检查自连接及两端是否在 global board（[`Atlas connections POST`](../../app/api/atlas/connections/route.ts#L13-L35)），schema 仅有 `@@unique([boardId, fromId, toId])`（[`schema.prisma`](../../prisma/schema.prisma#L502-L515)）。因此 A→B 与 B→A 都能存在；同向重复则会产生 Prisma 唯一错误并由通用错误路径返回 500。Home endpoint 已实现双向 OR 检查并返回 409（[`Home connections POST`](../../app/api/home-board/connections/route.ts#L42-L70)），说明这是 Atlas 入口的约束漂移（E2）。
- **质量影响**：用户重试或从另一端连线会产生重叠视觉关系，精确重复却得到不稳定的内部错误；删除一个方向不能表达“该无向关系”的单一事实。
- **最小修正**：Atlas POST 在 create 前按无向 pair 检查，并将唯一冲突映射为稳定 409；如需数据库级保护，使用保持当前模型的规范化端点顺序或等价约束，不新增连接类型。
- **验收证据**：Route 行为测试覆盖 A→B、B→A、同向并发请求，断言最多一个记录、重复稳定 409；现有自连接和跨 board 拒绝继续通过。
- **影响范围**：QAM-06；不改变 QAM-05 Post 内容事实。

#### QAM-06-008：Atlas SSE 的初始 abort、异步 enqueue 和 interval 重入没有独立生命周期保护

- **状态**：`open`
- **问题**：Atlas stream 在 [`sendSnapshot()`](../../app/api/atlas/stream/route.ts#L43-L94) 完成后才注册 `request.signal` 的 abort listener（[`route.ts`](../../app/api/atlas/stream/route.ts#L96-L103)）；session 查询和元素/连接查询 `await` 返回后没有再次检查 `closed`，且多处直接 `controller.enqueue`，catch 分支还可能在 controller 已关闭时再次 enqueue。`setInterval(sendSnapshot, 800)` 不等待上一次查询完成，慢查询时会并发取快照并以完成顺序写出；客户端只按 ID 合并，没有 sequence/version 栅栏（[`AtlasApp`](../../components/atlas/AtlasApp.tsx#L117-L159)）。Room stream 是独立实现，已在建流前注册 abort、await 后检查 `closed` 并通过统一 `write` 防护（[`room stream`](../../app/api/rooms/%5BroomId%5D/stream/route.ts#L27-L120)）；本轮没有 Atlas SSE Route 或慢查询浏览器测试（E2）。
- **质量影响**：客户端在首个 snapshot 尚未完成时断开、session 检查或 DB 查询超过 800ms 时，Atlas 连接可能向已关闭 controller 写入并产生单连接 unhandled rejection/错误事件；重入快照可能以旧结果覆盖新位置/连接，造成短暂回退和额外 DB 工作。当前证据不能证明它会使 Web 进程整体不可用或造成持久数据库损坏，因此按 P2 处理，不触发 Gate L1。
- **最小修正**：在创建 stream 后立即安装 abort/cancel 处理，所有 await 边界和 enqueue 统一经过 `closed` 检查与安全写入；将 interval 改为完成后再调度下一次的串行循环，保留 session kicked/error/关闭语义。不要把 Room stream 的修复视作 Atlas stream 已修复。
- **验收证据**：Route deferred 测试覆盖初始 snapshot 期间 abort、session 查询/DB 查询返回后 abort、controller close 后 error；断言不再 enqueue 或产生未处理拒绝。另以 deferred snapshot 证明第二次查询不会在第一次完成前开始，旧快照不会覆盖新结果；补充真实浏览器连接重连验证。
- **影响范围**：QAM-06 直接受影响；QAM-02-006 仅记录 Room stream 的独立 interval 重入，不作为本问题的替代或共享修复证据；QAM-09 只关联 Web 进程观测，不承担 Route 生命周期。

### 已解决的 P2

#### QAM-06-007：首页非拖动照片 mutation 失败后保留乐观状态且无回滚/重试

- **状态**：`resolved`（2026-09-12）
- **修复前问题与影响**：大小/caption PATCH、照片/连线 DELETE 不检查 response.ok 并吞掉网络异常，页面错误呈现保存或删除成功，刷新后回退。初版[组件回归](../../tests/component/home-timeline-board-mutations.test.tsx)在旧实现 12/12 failed：四操作的 500/网络拒绝均无 alert，连续编辑同时发出 3 个 PATCH，DELETE 越过在途 PATCH；旧实现缺少可访问连线删除（E3）。
- **已实施修正**：[`useHomeBoardMutations`](../../components/home/useHomeBoardMutations.ts#L27) 统一按照片串行的 PATCH/DELETE、最新字段合并与失败重试；保留未确认草稿，caption 与服务端共同采用 trim。删除确认前保留照片/连线，失败仍可编辑或重试；照片成功级联后，迟到的 connection DELETE 响应不复活错误。控件具备 label、键盘操作和 pending/error 反馈，未修改 Home 协作协议、Route 授权或旧 Atlas SSE（E2/E3）。
- **验收证据**：[新增组件](../../tests/component/home-timeline-board-mutations.test.tsx) 14/14、包含既有拖动/搜索的定向 bundle 3 文件/18 项；[真实 PostgreSQL](../../tests/integration/home-mutation-persistence.integration.test.ts) 4/4，以 trigger 让四种写入返回 500，重读记录不变，清除故障重试 200 后尺寸、caption 与删除级联一致，未关联资源保留；[Chromium](../../tests/e2e/authenticated.spec.ts#L11-L118) 指针缩放、键盘编辑/重试/删除，注入 500/connectionreset 后放行真实 HTTP，每步 reload 并回读隔离 PostgreSQL，确认页面与记录一致（E3）。
- **验证范围**：`npm run check:full` 单次 exit 0，73/496 Vitest、production build/coverage、24/75 PostgreSQL、32/32 Playwright。保留既有客户端即时显示，失败草稿只在当前页面内供重试；没有增加跨页面草稿存储、自动补偿或多用户协作协议。
- **影响范围**：QAM-06 Home client state；QAM-05 仅共享首页组合，内容发布/搜索不属于本修复。

## Architecture and Data Flow

```text
已认证页面/浏览器
  ├─ /chat/:roomId/atlas（已弃用页面；legacy API 实际固定 atlas-global-board）
  │    ├─ AtlasApp optimistic ops ──> Atlas element/connection/upload Route ──> Prisma
  │    ├─ drag POST ──> 当前 Web 进程 Map ──> Atlas SSE 快照覆盖坐标
  │    └─ PATCH/DELETE ──> AtlasElement / AtlasConnection
  └─ /home
       ├─ getPostVisibilityWhere(userId) ──> 当前用户可见 Post
       ├─ 可见 Post ──> ensureHomePostElements ──> home-board AtlasElement(postId)
       ├─ Home spatial access predicate
       │      ├─ snapshot ──> 共享 photo + 可见 Post anchor + 两端可见 connection
       │      └─ element/connection actual write ──> 同一 board/Post/Room 条件 ──> 失配 404
       └─ useHomeBoardMutations：照片 PATCH/DELETE 串行队列
            ├─ PATCH 2xx ──> 确认字段保存，后续草稿继续串行提交
            ├─ DELETE 2xx ──> 移除照片及关联连线/待处理状态
            └─ 非 2xx/网络失败 ──> 保留草稿或原照片/连线 ──> 用户显式重试

Atlas/Home photo upload：File/FormData ──> storage.save(blob) ──> AtlasElement.create(record)
图片读取：认证 ──> /api/atlas/uploads/:filename ──> key normalize ──> local/OSS read
```

Prisma `AtlasBoard`、`AtlasElement` 和 `AtlasConnection` 是持久事实源。当前产品入口 `/home` 不消费 legacy Atlas drag Map/SSE；Home 的乐观位置、大小和标注只负责即时显示，必须经过串行 PATCH 的 2xx 确认；失败保留最新字段及重试状态。照片和连线在 DELETE 2xx 前持续显示，照片删除与在途 PATCH 串行；成功后移除对应本地记录与关联操作。两个独立进程已通过实际 Home snapshot 读取证明成功写入后以 PostgreSQL 坐标收敛。`AtlasElement.postId` 把 Home 空间锚点与 QAM-05 Post 生命周期和可见性相连；空间 snapshot 与 mutation 现通过单一谓词消费相同成员条件，connection 由两端可见性派生。legacy Atlas element/connection 写入口仍在实际条件写中限定 global board；其 URL room scope 不一致按 BU-01 保留，Atlas stream 的 abort/interval 问题继续由 QAM-06-008 追踪。

剩余主要失败路径是：首次 global board 并发 create 的唯一冲突；blob 已保存而 DB create 失败；multipart 内容信任不足；Atlas connection 冲突与 SSE 慢查询/关闭竞态。Home 拖动/大小/标注 PATCH 失败与乱序覆盖、照片/连线 DELETE 的虚假成功均已由队列、确认状态和重试关闭，旧 Atlas mutation 跨 board 路径与 Home anchor 跨房间路径也已由条件写关闭。存储 key 的 prefix、外域 URL、路径遍历和私有缓存头已有明确 adapter 约束；普通 global Atlas/共享照片读取只做认证仍符合当前 global 实现，room-scoped `agent_log` anchor 则由 RoomParticipant 事实授权。

## Verified Strengths

- Home board 使用固定 ID 的 `upsert`，`ensureHomePostElements` 依靠 `postId @unique` 与 `skipDuplicates` 避免同一 Post anchor 重复；相关 helper 测试通过（E3）。
- Home spatial access predicate 复用 `getPostVisibilityWhere()`，同时约束 snapshot、element 条件写与 connection 两端；真实 PostgreSQL 和浏览器证明非成员看不到隐藏标识、无法写入，成员、全局 `user_post` 与共享照片行为保持（E3）。
- Home 大小/标注/删除具备 pending/error 与具名重试，延迟响应、字段合并和级联清理有组件及 PostgreSQL/浏览器证据；重新进入标注编辑读取当前值，缩放/连线删除可通过键盘操作（E3）。
- Home 拖动最终写入按元素串行并合并最新目标；非 2xx/网络失败保留可访问错误与重试，连续拖动不会并发写回旧坐标。组件失败注入和 deferred 竞态 2/2 通过（E3）。
- Home Route 写入后，两个在变更前启动的独立 Node 进程分别执行 `getHomeBoardSnapshot()`，均最终读取 PostgreSQL 的目标坐标；这验证了当前产品路径不依赖进程内 cache 收敛（E3）。
- Post 列表/首页内容与 Home spatial 查询现在复用 `getPostVisibilityWhere()`，QAM-05 内容可见性与 QAM-06 派生空间资源之间只有一个成员规则，不把同一已解决根因重复计为缺陷（E2/E3）。
- legacy Atlas element PATCH/DELETE 和 connection DELETE 的实际数据库条件均绑定 `atlas-global-board`；Post anchor 还通过 `postId: null` 明确排除。真实 PostgreSQL Route Handler 回归证明 Home 的 Post、完整布局和 connection 不受影响，global board 正常写入保持可用（E3）。
- Home connection POST 验证两端均属 Home board、拒绝自连接和 Post-to-Post，并检查正反方向重复；连接外键 cascade 可清理删除元素后的关系（E2/E3 mock）。
- storage adapter 通过随机 UUID + 清理后的 basename 生成 key，统一拒绝 prefix 外、`..`、反斜杠和本地 root 外路径；本地 save/read/delete 与路径遍历测试通过（E3）。
- 图片读取要求当前认证会话，使用 `Cache-Control: private`、`Vary: Cookie` 和 immutable 响应，存储缺失/非法 key 映射 404；本轮定向 Route 测试通过（E3）。
- Atlas element/connection 创建的两端 board 检查、JSON 输入的有限数/长度约束、Home 照片尺寸 clamp 及 canvas 原生 wheel listener 清理均有清楚落点（E2）。
- 本轮最终标准与完整门禁通过：73/496 Vitest、24/75 PostgreSQL、32/32 Playwright；QAM-06-001/003/009 的原有授权及双进程拖动回归继续通过。QAM-06-005 的历史 MIME 伪造证据保持；Atlas SSE、建板和 DB/blob/上传仍需各自风险匹配验证。

## Recommended Improvements

1. 治理 **QAM-06-002/004/005（P2）**：按风险收益补 fixed-ID 建板幂等、DB/blob 补偿与文件内容/表单字段校验。
2. 治理 **QAM-06-006/008（P2）**：补稳定的无向连接冲突响应及 Atlas SSE 串行/关闭保护；QAM-02-006 仅作为 Room stream 的关联复审入口。

以上均保持现有 global Atlas、Home board、元素类型、连线类型和存储供应商边界，不新增画布或协作功能。

## Sustainable Review Record

### 当前开放问题

| ID | Priority | 状态 | 首次发现 | 直接责任 | 关联责任 |
| --- | --- | --- | --- | --- | --- |
| QAM-06-002 | P2 | `open` | global board read-then-create；单次首访唯一冲突但数据库保持一致（E2） | QAM-06 board service | QAM-09 运行拓扑启动并发 |
| QAM-06-004 | P2 | `open` | blob save 后 DB create 无补偿，形成孤儿资源债务（E2） | QAM-06 upload lifecycle | QAM-09 volume/OSS 运维 |
| QAM-06-005 | P2 | `open` | multipart MIME/字段未形成内容信任 contract（E2/E3） | QAM-06 storage/upload adapter | QAM-09 storage config |
| QAM-06-006 | P2 | `open` | Atlas connection 缺少反向 pair 约束（E2） | QAM-06 connection Route/schema | 无 |
| QAM-06-008 | P2 | `open` | Atlas SSE 初始 abort/await enqueue/800ms interval 无串行保护（E2） | QAM-06 Atlas stream lifecycle | QAM-09 Web 进程观测；QAM-02 Room stream 为独立实现 |

### 已解决问题

| ID | Priority | 状态 | 解决证据 | 直接责任 | 关联责任 |
| --- | --- | --- | --- | --- | --- |
| QAM-06-007 | P2 | `resolved` | Home 编辑串行保存与确认删除；组件 14/14、PostgreSQL trigger 故障/重试 4/4、Chromium 四操作重试/reload 与 DB 一致，迟到响应不覆盖新状态（E3） | QAM-06 Home client state | QAM-05 首页组合 |
| QAM-06-009 | P1 | `resolved` | 单一 Home spatial access predicate 约束 snapshot 与实际 element/connection 写；真实 PostgreSQL 负向对照复现 200/201/200 与持久副作用，修复后双 Room 1/1、真实载荷/HTTP 旅程通过，非成员统一 404 且数据库不变（E3） | QAM-06 Home snapshot/access | QAM-05 Post visibility；QAM-02 RoomParticipant |
| QAM-06-001 | P1 | `resolved` | Atlas element PATCH/DELETE 与 connection DELETE 使用 board-scoped 条件写；真实 PostgreSQL Route Handler 回归证明 Home anchor/布局/连接/Post 保留，global mutation 正常（E3） | QAM-06 Atlas mutation boundary | QAM-05 Post 生命周期 |
| QAM-06-003 | P1 | `resolved` | Home 最终拖动 PATCH 按元素串行、只保留最新目标；503/网络失败显示可访问错误并可重试，两个独立 Home snapshot 进程最终读取相同 PostgreSQL 坐标（E3） | QAM-06 drag/persistence protocol | QAM-09 多实例拓扑 |

Atlas SSE 的独立 abort/interval 重入与乱序风险由 **QAM-06-008** 追踪；QAM-02-006 只覆盖 Room stream 的 interval 重入。两者概念相似但不是共享实现，修复 QAM-02-006 时不会自动修复 [`app/api/atlas/stream/route.ts`](../../app/api/atlas/stream/route.ts#L23-L103)。

### 复审触发条件

- 修改 Atlas/Home board Route、`AtlasElement`/`AtlasConnection` schema 或迁移、global/home board service、Post/anchor 生命周期或上传/读取 key contract。
- 修改 `getPostVisibilityWhere()`、`agent_log.roomId`/RoomParticipant 语义、Home spatial predicate、initial snapshot 或 Home element/connection Route 时，必须复跑 QAM-06-009 的双 Room 可见性与 mutation 授权回归；只证明 `props.posts` 已过滤不能维持 resolved 结论。
- 修改 Atlas SSE、optimistic reconciliation、drag cache、Home mutation 状态、storage adapter 或 Web 多实例部署方式。
- 完成 QAM-06-002 的并发建板或 QAM-06-004 的 DB/blob 故障验证；若修改 Home 拖动队列/元素 PATCH，复跑 QAM-06-003 的失败、串行与跨进程收敛回归；若修改 legacy Atlas mutation 条件，复跑 QAM-06-001 的真实 PostgreSQL 跨 board 回归。
- 修改或修复 QAM-06-008 后，重新执行 Atlas stream 的 abort、慢查询重入、乱序和 controller close 验收；QAM-02-006 的 Room SSE 测试不能代替 Atlas 验证。

### 只追加评分历史

| 日期 | Score | Score Level | Gate | Final | Delta | 变更证据 |
| --- | ---: | --- | --- | --- | --- | --- |
| 2026-09-06 | 57 | L0 | L1 | L0 | `baseline` | 初审纠错后基线；`npm run check:quick` 通过；QAM-06 定向 Node/Route/组件测试 42 项通过；伪造 MIME 实验可复现接受非图片字节；Atlas 跨 board anchor/connection 破坏、首次建板并发、SSE/多实例和 DB/blob 失败仍为 E2/未验证；已核正 Post FK cascade 方向，Post 不会因删除 anchor 被反向删除。 |
| 2026-09-06 | 57 | L0 | L1 | L0 | `0（优先级复核）` | 重新核对影响证据：QAM-06-002 仅为 fixed-ID 首次并发下的单次 unique 失败且数据库保持一致，QAM-06-004 为低频 DB/blob 窗口下的资源债务，均由 P1 降为 P2；QAM-06-001 的 endpoint board-scope 绕过仍触发 Gate L1。 |
| 2026-09-06 | 57 | L0 | L1 | L0 | `0（SSE 归属复核）` | 对比 Room stream 与 Atlas stream：两者为不同 Route/实现；Atlas 的初始 abort、await 后 closed 检查、raw enqueue 和 800ms async interval 独立登记为 QAM-06-008 P2；分数与 Gate 不变。 |
| 2026-09-07 | 64 | L1 | L2 | L1 | `+7（QAM-06-001 resolved）` | legacy Atlas element PATCH/DELETE 与 connection DELETE 以条件写限定 `atlas-global-board`，并排除 Post anchor；真实 PostgreSQL Route Handler 测试修复前复现 Home PATCH 返回 200，修复后 2/2 证明 Home anchor/完整布局/connection/Post 保留且 global mutation 正常。`npm run check:full` 通过：58 文件/344 项 Vitest、生产构建、覆盖率、8 文件/19 项 PostgreSQL、9 项 Playwright。 |
| 2026-09-07 | 71 | L2 | L2 | L2 | `+7（QAM-06-003 resolved）` | 当前产品 `/home` 的最终拖动写入改为 per-element latest-target 串行队列；组件回归修复前因无失败提示而失败，修复后 2/2 覆盖 503→重试与 deferred 连续拖动最大并行数 1。真实 PostgreSQL 1/1 证明两个独立 Home snapshot 进程从旧坐标最终收敛到 `(420,315)`。`npm run check`、9 文件/20 项集成测试和 9 项 Playwright 分别通过。 |
| 2026-09-12 | 65 | L1 | L1 | L1 | `-6（新增 QAM-06-009）` | 2026-09-08 建立的 Post 房间可见性只约束 `posts` 查询；复审确认 Home snapshot 仍序列化全部 board anchor/connection，Home element/connection mutation 也未复核关联 Post 成员资格，形成跨房间空间资源写入（E2）。根会话 `./init.sh` 通过 72 文件/472 项；本轮定向 Node 7 文件/40 项、组件 3 文件/5 项通过，MIME 伪造仍可复现；未运行 Docker/PostgreSQL/Playwright/`check:full`。 |
| 2026-09-12 | 74 | L2 | L2 | L2 | `+9（QAM-06-009 resolved）` | 单一 Home spatial predicate 复用 Post/Room 可见性并约束 snapshot、connection 两端和实际 element/connection 写。未修复 PostgreSQL 负向对照 0/1：隐藏 ID 可见，PATCH/POST/DELETE 为 200/201/200，坐标与连接发生持久变化；修复后同场景 1/1、真实浏览器载荷/HTTP 旅程通过。`npm run check:full` 单次退出 0：72/472 Vitest、production build/coverage、20/61 PostgreSQL、30/30 Playwright。 |
| 2026-09-12 | 79 | L2 | L2 | L2 | `+5（QAM-06-007 resolved）` | Home 编辑/删除队列与显式失败重试，结构 +1、复用 +1、状态一致性 +1、健壮性 +2；旧组件 12/12 failed→扩展后 14/14 passed，真实 PostgreSQL 故障/重试 4/4，Chromium 指针/键盘四操作重试与刷新记录一致。完整门禁 exit 0：73/496 Vitest、production build/coverage、24/75 PostgreSQL、32/32 Playwright；其余五个 P2 与 Gate L2 保持。 |

复审时保留上述稳定 ID 和历史行；仅在当前代码或风险匹配证据变化时重算受影响维度，并重新核对 100 分合计、Gate 与 Final。
