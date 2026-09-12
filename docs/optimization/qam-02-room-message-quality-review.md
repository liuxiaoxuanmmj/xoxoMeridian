# QAM-02 私密房间与实时消息质量审查

## 元数据

- QAM：QAM-02 私密房间与实时消息
- 快照日期：2026-09-12
- 审查 Skill：`xoxo-qam-02-room-message-review`
- 共享标准：`docs/optimization/module-quality-review-standard.md` v1.0.0
- 范围来源：`PROJECT_VIEW.md` QAM-02、Cross-cutting Concerns、共享映射、BU-02、BU-06
- 当前基线命令：`./init.sh`；QAM-02 定向命令：`./scripts/run-node22.sh npm exec vitest run tests/server/room-stream.test.ts tests/server/agent-detection.test.ts tests/component/message-composer.test.tsx tests/server/chat-left-rail.test.ts tests/server/chat-left-rail-study-status.test.ts`
- 本轮 Delta：`0（当前 QAM-02 行为与风险证据无计分变化；90→90）`
- 工作区说明：本轮按含 feat-044～046 未提交改动的当前工作树复审。QAM-02 直接范围仅有 `ChatApp` 新增向 QAM-03 LifePanel 传递 `currentUser.id`；它未改变 RoomSnapshot transport、消息事实、成员授权或 SSE 协议，新增第二参与者 Playwright 也只验证 QAM-03 身份解析，因此不重复计分。QAM-02-002/005/006 的状态保持不变。

## Overall

- Score：90/100
- Score Level：L4
- Gate Level：L4
- Final Level：L4
- Trend：持平（本轮 Delta 0）
- Evidence Confidence：高（成员访问、Room snapshot 隐私、dispatch 原子幂等与最后房间并发删除已有风险匹配 E3；本轮 SSE 关闭、Agent 检测、编辑器与房间成员呈现定向 5 文件/17 项通过；SSE 周期重入与双消息 read model 漂移仍为 E2）
- 当前开放问题：2 项（P2×2）；QAM-02-001/003/004 已解决，QAM-02-005 保留为 `not-reproduced` 历史记录，均不计入开放项。

当前房间成员资格、公开 snapshot 和 SSE 中止路径已有清晰控制与行为证据。普通消息与显式 dispatch 复用同一预算化 Task/Event 创建边界；最后房间删除也通过稳定 User 行锁，把成员重查与 Room 删除收敛为同一事务。feat-044～046 未改变这些 QAM-02 不变量，当前工作树的定向测试继续通过。消息 GET 与 snapshot 的 trace/窗口 contract 漂移及 SSE 定时轮询重入仍是两个独立 P2；当前没有开放 P0/P1，因此总分和最终等级保持 90/L4。

## Score Breakdown

| 维度 | Score | Max | Finding / Evidence |
| --- | ---: | ---: | --- |
| 架构与责任边界 | 13 | 14 | Route、`lib/access.ts`、消息服务和客户端 Hook 分层清楚；普通消息与显式 dispatch 复用独立 Task/Event 派生服务，Route 只保留 HTTP 编排，但 snapshot 仍承载 QAM-02/03/07/08。[task derivation](../../lib/agent-task-dispatch.ts#L21-L122)、[dispatch](../../app/api/agent/dispatch/route.ts#L10-L63)（E2/E3） |
| 代码结构与复杂度 | 9 | 10 | Task/Event 创建、预算快照与 created payload 已从两条入口收敛为一个局部函数；房间删除/清空和 SSE 仍保留各自的异步一致性分支。[task derivation](../../lib/agent-task-dispatch.ts#L21-L56)、[messages](../../lib/messages.ts#L20-L72)（E2/E3） |
| 抽象与复用 | 7 | 8 | `assertRoomAccess`、`createAgentTaskWithCreatedEvent`、`stableMergeBy` 和共享 Room snapshot 均有真实复用；HTTP GET 与 SSE snapshot 仍分别实现 Message 查询，trace allow-list 和 80 条窗口方向已经漂移。[message GET](../../app/api/rooms/%5BroomId%5D/messages/route.ts#L18-L34)、[snapshot](../../lib/room-snapshot.ts#L16-L33)（E2/E3） |
| 数据流与状态一致性 | 11 | 12 | Message→Task→EventLog 与最后房间删除均有单事务事实边界；删除服务以 User 行锁串行同一用户的成员重查与 Room 删除。snapshot 的异步 tick 仍可能交错，且其最旧 80 条窗口与 refresh 的最新 80 条不一致。[room lifecycle](../../lib/room-lifecycle.ts#L22-L50)、[message merge](../../components/chat/useRoomChat.ts#L129-L140)（E2/E3） |
| 接口与依赖关系 | 9 | 10 | 输入经过 Zod、成员资格前置校验，显式 dispatch 首次创建返回 201、幂等命中返回 200 且资源 ID 稳定；消息 GET 的完整 trace/最新窗口与 `ChatMessage` 摘要类型、snapshot 最旧窗口仍有 contract 漂移。[dispatch](../../app/api/agent/dispatch/route.ts#L36-L59)、[types](../../components/chat/types.ts#L20-L60)（E2/E3） |
| 健壮性、并发与生命周期 | 13 | 14 | dispatch、最后房间删除与 SSE 关闭均有并发/失败 E3；删除触发器稳定放大旧窗口后证明 User 行锁使并发响应收敛为 200/409。剩余缺口是 interval 不防异步 snapshot 重入。[delete regression](../../tests/integration/room-delete-invariant.integration.test.ts#L59-L108)、[stream](../../app/api/rooms/%5BroomId%5D/stream/route.ts#L27-L120)（E2/E3） |
| 性能与资源使用 | 7 | 8 | 查询数量受消息/生活数据上限约束，participant 查询和周期性载荷不再读取完整 User/Profile；每个连接每 2 秒重新聚合多个模块，房间列表无上限，GET 的完整 trace 子关系也无独立分页。[snapshot](../../lib/room-snapshot.ts#L5-L159)、[room list](../../lib/room-list.ts#L12-L31)（E2） |
| 安全与隐私 | 8 | 10 | HTTP 入口普遍认证并复核成员；snapshot 与 Chat/Study Client Component 边界仅输出公开用户字段，PostgreSQL 和浏览器载荷已有 E3。消息 GET 仍暴露内部 Agent trace 摘要之外的完整载荷。[snapshot privacy](../../tests/integration/room-snapshot-privacy.integration.test.ts#L19-L123)、[browser privacy](../../tests/e2e/authenticated.spec.ts#L133-L253)（E3；剩余风险见 QAM-02-002） |
| 可测试性与验证可信度 | 8 | 8 | 成员/唯一/级联、snapshot 隐私、dispatch 并发/故障回滚和最后房间并发删除均有风险匹配 E3；本轮 SSE 关闭、Agent 检测、编辑器与成员呈现定向 5 文件/17 项通过。两个开放 P2 的慢 tick 与 80 条窗口交错仍缺专项行为证据。[stream tests](../../tests/server/room-stream.test.ts#L113-L158)（E2/E3） |
| 可维护性、演进与技术债 | 5 | 6 | 主要变化点有明确文件落点，稳定合并和 snapshot contract 便于局部修改；跨 QAM snapshot 与 Agent trace 载荷边界仍需治理（BU-02）。[PROJECT_VIEW BU-02](../../PROJECT_VIEW.md#L900-L904)（E2） |
| **合计** | **90** | **100** | 算术核对：13+9+7+11+9+13+7+8+8+5 = 90。 |

## Level Gate

- P0：通过。当前没有具备 E3 直接行为证据的开放 P0。
- 开放 P1：通过。QAM-02-001/003/004 均已由 E3 回归关闭；QAM-02-005 保持 `not-reproduced`，不计入开放项。
- 最高风险不变量行为验证：通过。成员访问、数据库级级联、Message/AgentTask/EventLog 原子派生，以及用户至少保留一个房间的并发删除语义均有真实 PostgreSQL E3；`/chat` 默认房间解析也在同一回归中执行。
- L4 条件：通过。当前没有开放 P0/P1，持久化一致性、权限和关键失败/并发路径均有 E3；QAM-02-002/006 是不改变持久化事实的独立 P2。
- 结论：Score Level=L4，Gate Level=L4，因此 Final Level=min(L4,L4)=L4。

## Critical Issues

### P1

#### QAM-02-001：Room snapshot 将私有 UserProfile 字段带入浏览器（resolved）

- 状态：`resolved`
- 原问题：`getRoomSnapshot()` 对 participant 使用完整 User/Profile include 并展开对象，Chat 页面又把完整认证用户传给 Client Component。修复前真实 PostgreSQL 与 Playwright RSC/HTML 载荷直接观察到 `email`、`passwordHash`、`sessionVersion`、`lastGeoIp`、`preferences`、`profileNote` 及其私有值。
- 已实施修正：[`getRoomSnapshot()`](../../lib/room-snapshot.ts#L67-L153) 以 Prisma `select` 只读取 Room `id/name`、用户 `id/displayName/avatarLabel` 和公开 `city/country/timezone`，并再构造显式 participant view model；[`ChatRoomPage`](../../app/chat/%5BroomId%5D/page.tsx#L21-L42) 与 [`StudyPage`](../../app/study/page.tsx#L15-L28) 只把各 Client Component 需要的公开 current-user 字段送入渲染上下文，`ChatUser` 不再声明 `preferences`（E2）。
- 验收证据：[`room-snapshot-privacy.integration.test.ts`](../../tests/integration/room-snapshot-privacy.integration.test.ts#L16-L126) 修复前 0/1，收到完整 User/Profile 和植入的两组私有值；修复后 1/1 精确匹配公开 view model。[`authenticated.spec.ts`](../../tests/e2e/authenticated.spec.ts#L18-L135) 修复前在 Chat 页面 RSC 载荷观察到密码 hash 与完整私有档案并失败，修复后定向 setup + 浏览器用例 2/2，Chat/Study 均保留双方显示名、头像、城市、国家和时区，且字段名及私有值均不出现在载荷（E3）。
- 影响范围：QAM-02；直接覆盖 QAM-01 的当前用户/伙伴档案隐私边界，以及 QAM-07 复用 `getRoomSnapshot()` 的 Study 页面。

#### QAM-02-003：显式 Agent dispatch 的 Task 与 EventLog 不是原子派生（resolved）

- 状态：`resolved`
- 原问题：`/api/agent/dispatch` 的 `sourceMessageId` 分支先 `agentTask.create`，再单独 `eventLog.create`；没有事务或幂等响应。修复前真实 PostgreSQL 回归直接观察到并发响应为 `201/500`，EventLog 注入失败后遗留 1 条孤儿 Task，清除故障后的相同请求也因唯一约束无法重试。
- 已实施修正：[`createAgentTaskWithCreatedEvent()`](../../lib/agent-task-dispatch.ts#L21-L56) 集中生成预算化 Task 与 `agent.task.created` Event；普通消息与显式 dispatch 均在各自单一 Prisma transaction 内复用。显式入口在事务中锁定同一 source Message，串行读取 `AgentTask.sourceMessageId @unique` 事实；首次创建返回 201，后续/并发命中返回同一 Task 的 200，唯一冲突捕获只作为跨入口兜底。[`dispatchAgentTaskForSourceMessage()`](../../lib/agent-task-dispatch.ts#L64-L122)、[`route`](../../app/api/agent/dispatch/route.ts#L36-L59)（E2）。
- 验收证据：[`agent-dispatch-atomicity.integration.test.ts`](../../tests/integration/agent-dispatch-atomicity.integration.test.ts#L85-L225) 修复前 0/2：并发得到 `201/500`，事件故障后 Task count=1；修复后扩展为 3/3，证明并发响应 `200/201` 且 Task ID 相同、数据库恰一 Task/一 created Event，事件 trigger 故障时二者均为 0、移除故障后同一请求 201 成功，并验证自动消息入口仍持久化相同预算/输入/Event 契约。最终完整门禁为 16 文件/44 项 PostgreSQL 与 11/11 Playwright（E3）。
- 影响范围：QAM-02；QAM-08 的 claim 后 Runtime/Trace 生命周期未修改，既有 lease、budget 与 durable step 集成回归保持通过。

#### QAM-02-004：删除最后房间的保护是 check-then-act，不能保持显式不变量

- 状态：`resolved`
- 原问题：删除 Route 在事务外先 count 当前用户其他房间，再执行 `room.delete`；真实 PostgreSQL 延迟 DELETE trigger 稳定证明两个请求可同时越过保护并返回 `[200,200]`，最终删除全部成员关系，使 `/chat` 无默认房间可解析。
- 已实施修正：[`deleteRoomPreservingUserMembership()`](../../lib/room-lifecycle.ts#L22-L50) 在 Prisma interactive transaction 中先锁定稳定的 User 行，再于同一临界区重新验证目标成员资格、统计该用户全部 RoomParticipant，并仅在数量大于 1 时删除 Room。Route 保留认证、事务外早期成员校验、按用户/IP 限流和 200/409 响应契约，只委托领域服务执行原子删除。[`room DELETE`](../../app/api/rooms/%5BroomId%5D/route.ts#L12-L35)（E2）。
- 验收证据：[`room-delete-invariant.integration.test.ts`](../../tests/integration/room-delete-invariant.integration.test.ts#L59-L108) 修复前 0/1，实际响应 `[200,200]`；修复后 1/1，响应稳定为 `[200,409]`，数据库恰一 RoomParticipant，409 保留原错误 contract，并直接执行 `ChatIndexPage` 证明重定向到剩余 `/chat/:roomId`。全量真实 PostgreSQL 为 17 文件/45 项通过（E3）。
- 影响范围：QAM-02；直接关联 QAM-01 注册创建的 RoomParticipant（BU-06）。

### P2

#### QAM-02-002：消息 GET 与 snapshot 的 ChatMessage read model 漂移

- 状态：`open`
- 问题：`GET /messages` 与 `getRoomSnapshot()` 分别实现消息查询。GET 按 `createdAt desc` 取最新 80 条再反转，却对 `finalTask` 的 `toolCalls/llmCalls` 使用完整 include；snapshot 按 `createdAt asc` 直接取最旧 80 条，只选择聊天所需 trace 摘要。`ChatMessage` 和详情面板只声明、消费摘要字段。
- 证据：[`messages GET`](../../app/api/rooms/%5BroomId%5D/messages/route.ts#L18-L38)、[`snapshot message query`](../../lib/room-snapshot.ts#L16-L33)、[`refresh/SSE merge`](../../components/chat/useRoomChat.ts#L129-L140)、[`MessageList rendering`](../../components/chat/MessageList.tsx#L70-L97)（E2）。本轮重新交叉核对两个查询，未执行植入敏感 trace 或超过 80 条消息的 HTTP/浏览器实验。
- 质量影响：重连 refresh 向房间成员返回内部 prompt/tool/LLM payload，响应体和客户端合并成本随 trace 增长；达到 80 条后，SSR/SSE 的最旧窗口与 refresh 的最新窗口也会形成两个消息视图，后续 snapshot 可能替换刚刷新的列表。Agent trace 执行语义归 QAM-08，但聊天 read model、窗口和浏览器投影由 QAM-02 负责。
- 最小修正：抽取单一 ChatMessage 查询/projection，统一为“最新 80 条、升序输出”的窗口与 allow-list；如需完整 trace，继续通过已有受授权的 QAM-08 trace 入口提供，不夹带到消息列表响应。
- 验收证据：植入超过 80 条消息及带敏感 trace 的行为测试，证明 SSR、SSE 与 refresh 返回相同 ID/顺序和 `ChatMessage` 摘要字段；消息列表仍呈现 task/tool/LLM 状态，完整 trace 仅在专门授权入口返回。
- 影响范围：QAM-02；直接关联 QAM-08 trace/隐私治理。

#### QAM-02-006：SSE interval 允许异步 snapshot 重入并乱序写出

- 状态：`open`
- 问题：初次 `sendSnapshot()` 完成后直接 `setInterval(sendSnapshot, 2000)`，没有 in-flight 标记或串行调度；一次 snapshot 查询超过 2 秒时，多个查询可并发，较旧查询可能在较新查询后 enqueue。客户端 `mergeSnapshot` 会接受每次完整列表，因而可能短暂回退消息/Agent 状态。
- 证据：[`stream sendSnapshot#L58-L103`](../../app/api/rooms/%5BroomId%5D/stream/route.ts#L58-L103)、[`setInterval#L105-L116`](../../app/api/rooms/%5BroomId%5D/stream/route.ts#L105-L116)、[`mergeSnapshot`](../../components/chat/useRoomChat.ts#L10-L57)。现有测试只覆盖断开时的 in-flight 关闭，不覆盖两个 tick 的交错（E2/E3）。
- 质量影响：数据库变慢时每个连接的查询数和响应压力增加，完整 snapshot 乱序会造成客户端视图抖动，并放大重连期间的临时消息丢失/恢复成本。
- 最小修正：用“完成后再排下一个 tick”的串行循环或 in-flight guard；保留 abort、roomDeleted 和 error 的现有关闭语义，并在发送前检查关闭状态。
- 验收证据：用 deferred snapshot 行为测试证明第二个 tick 不会在前一个完成前启动，恢复后事件顺序稳定；真实浏览器/服务器测试验证慢查询期间连接不会重入失控。
- 影响范围：QAM-02；不改变 QAM-07 状态或 QAM-08 Agent 执行规则。

## Architecture and Data Flow

```text
页面/浏览器
  ├─ GET /chat/:roomId
  │    └─ requirePageUser + participant check
  │         └─ getRoomSnapshot(roomId, userId)
  │              ├─ Room/Participant/UserProfile
  │              ├─ Message + AgentTask 摘要（SSE projection）
  │              ├─ Memo/ScheduledJob/Focus/Approval fragments
  │              └─ Room list
  ├─ POST /api/rooms/:roomId/messages
  │    └─ assertRoomAccess → createHumanMessage transaction
  │         └─ Message → shared Task/Event derivation
  ├─ POST /api/agent/dispatch（显式 UI/调用入口）
  │    └─ assertRoomAccess → source Message row lock → shared Task/Event transaction
  │         ├─ created → 201 + Task
  │         └─ existing → 200 + same Task
  └─ EventSource /api/rooms/:roomId/stream
       └─ initial auth/member check → session/member recheck
            └─ periodic full snapshot → client merge/reconnect
```

普通消息与显式 dispatch 都通过同一 helper 创建预算化 Task/Event；前者与新 Message 同事务，后者锁定既有 source Message 后与 created Event 同事务，`sourceMessageId` 唯一键提供幂等事实。Room/Message 的成员资格仍在 Route 前置检查，Room participant/profile 只沿公开 allow-list 进入 Chat、SSE 和 Study。房间删除使用 User 行作为同一用户所有 DELETE 的稳定串行化事实源，在一个事务内重查成员资格、成员数并删除；Event 写入失败会回滚 Task，SSE 对 abort/controller close 也已有保护。wipe 的额外 barrier 语义尚未由产品定义，当前保持 `not-reproduced`。BU-02 的 snapshot 聚合同时被 Chat 和 Study 使用；本报告只登记其对 QAM-02 读取 contract、隐私和实时成本的直接影响，不把 AgentTask claim 后的 Runtime 规则移入本 QAM。

## Verified Strengths

- 所有主要 Room/Message/Stream Route 都先取得当前用户并对 `roomId` 执行成员资格检查；RoomParticipant 的复合唯一键和 Room 外键级联在真实 PostgreSQL 测试中通过。
- 普通消息创建在单一 Prisma 事务内完成 Message、可选 AgentTask 和 `agent.task.created` EventLog 派生，检测结果也写入持久化 metadata；这条主路径是当前较强的事实来源。
- 普通消息与显式 dispatch 复用 `createAgentTaskWithCreatedEvent()`；真实 PostgreSQL 延迟 trigger 证明相同 source Message 并发派发只返回一个稳定 Task，失败 trigger 证明 Task/Event 原子回滚且可清洁重试。
- 最后房间删除复用独立领域服务和稳定 User 行锁；真实 PostgreSQL 删除延迟 trigger 证明旧实现可双成功，修复后并发请求严格收敛为 200/409、成员关系保留为 1，且 `/chat` 可解析默认房间。
- Room participant 查询与输出 view model 使用双重 allow-list；真实 PostgreSQL 和 Playwright 证明当前用户与伙伴的完整 User/Profile 私有字段不会进入 Chat/Study 浏览器载荷，显示名、头像、城市、国家与时区保持可用。
- SSE 使用统一 `write`/`stop`，对客户端 abort、reader cancel、首次 snapshot 未完成和 controller 已关闭均有显式保护；本轮 `tests/server/room-stream.test.ts` 的 2 项定向 Node 测试通过。
- 客户端 `stableMergeBy` 按 ID 合并并保留无变化引用，optimistic 消息在响应/重连时有替换和去重路径；消息编辑器的键盘提交、重复发送禁用和成功清空行为测试通过。
- 当前根基线 `./init.sh` 通过 72 个测试文件/472 项；本轮 QAM-02 定向 Node/组件测试 5 文件/17 项通过。当前工作树此前记录的完整门禁为 19 文件/60 项真实 PostgreSQL 与 29/29 Playwright；其中 QAM-02 的成员/唯一/级联、snapshot 隐私、dispatch 原子性及房间删除不变量回归均保持通过。

## Recommended Improvements

1. 修复 QAM-02-002：统一消息 query/view model、最新 80 条窗口和 trace allow-list，确保 SSR/SSE/refresh 不分叉，且 GET 不返回聊天 contract 之外的完整 Tool/LLM 载荷。
2. 修复 QAM-02-006：把 SSE timer 改为无重入串行循环，并补 deferred snapshot 和慢查询行为测试。

## Sustainable Review Record

### 当前开放问题

| ID | Priority | Status | 首次证据 | 下一次复审触发 |
| --- | --- | --- | --- | --- |
| QAM-02-002 | P2 | open | messages GET 的完整 trace/最新 80 条与 snapshot 摘要/最旧 80 条、ChatMessage 类型漂移（E2） | Message GET、snapshot、trace API、ChatMessage 类型或消息窗口改动 |
| QAM-02-005 | P1 | not-reproduced | Read Committed 交错分析未证明 wipe 后并发写违反既定语义；batch transaction 原子提交（E2） | 明确记录清空 barrier/线性化语义，或出现真实 PostgreSQL 交错导致清空集合被部分保留 |
| QAM-02-006 | P2 | open | SSE interval 无 in-flight guard（E2） | Stream timer、snapshot 查询或客户端 merge 改动 |

### 已解决问题

| ID | Priority | Status | 解决证据 | 下一次复审触发 |
| --- | --- | --- | --- | --- |
| QAM-02-001 | P1 | resolved | Prisma `select` + 显式 Room participant/current-user view model；真实 PostgreSQL 修复前完整 User/Profile 暴露、修复后精确公开字段，Playwright Chat/Study RSC 载荷修复前失败、修复后通过（E2/E3） | snapshot、Chat/Study Client props 或 QAM-01 profile contract 改动 |
| QAM-02-003 | P1 | resolved | 共享预算化 Task/Event helper + source Message 行锁 + `sourceMessageId` 幂等响应；真实 PostgreSQL 修复前并发 201/500 与孤儿 Task，修复后并发 200/201 同 Task、Event 故障全回滚并可重试（E2/E3） | Agent dispatch、Task 创建、EventLog created 事件或 sourceMessageId 约束改动 |
| QAM-02-004 | P1 | resolved | User 行锁 + 事务内成员资格/count/delete；真实 PostgreSQL 修复前并发 `[200,200]` 删除全部房间，修复后 `[200,409]`、保留一个成员关系并由 `/chat` 解析默认房间（E2/E3） | Room DELETE、默认房间或成员生命周期改动 |

### 复审触发与证据规则

- 任一问题修复后必须保留原 ID，状态只可改为 `resolved`、`accepted-risk` 或 `not-reproduced`，并附修复提交/测试证据；不得删除历史结论。
- 下一次复审必须重新核对 QAM-01 profile 隐私、QAM-07 Study snapshot 使用方和 QAM-08 Task/Trace 所有权，避免把共享文件的改善重复计入多个 QAM。
- 本轮定向验证：`./scripts/run-node22.sh npm exec vitest run tests/server/room-stream.test.ts tests/server/agent-detection.test.ts tests/component/message-composer.test.tsx tests/server/chat-left-rail.test.ts tests/server/chat-left-rail-study-status.test.ts` 单次退出 0，5 文件/17 项通过。根基线 `./init.sh` 已通过 72 文件/472 项；当前工作树在 feat-046 后已有单次 `npm run check:full` 记录：72 文件/472 项 Vitest、Next.js 16.3.3 production build、19 文件/60 项真实 PostgreSQL 与 29/29 Playwright 通过。因本轮不运行 Docker/全量门禁，后两项沿用当前工作树已有执行证据，不把 feat-044 的 QAM-03 第二参与者旅程重复计入本模块。

### 评分历史（只追加）

| 日期 | Score | Score Level | Gate | Final | Delta | 变更证据 |
| --- | ---: | --- | --- | --- | --- | --- |
| 2026-09-06 | 70 | L2 | L1 | L1 | baseline | 初审：`check:quick`、QAM-02 定向测试、PostgreSQL 访问/级联测试；浏览器 E2E 因 `libnspr4.so` 未验证。 |
| 2026-09-06 | 71 | L2 | L1 | L1 | +1（证据纪律复核） | 复核 QAM-02-005：Read Committed 下并发 POST 在无文档 barrier 时可合法线性化到 wipe 前/后，未证明部分清空或孤儿写入；移除开放项并将其标为 `not-reproduced`。 |
| 2026-09-09 | 78 | L2 | L1 | L1 | +7（QAM-02-001 resolved） | Room participant/profile 与 Chat/Study current-user props 改为 Prisma `select` 和显式公开 view model；真实 PostgreSQL 回归修复前观察完整 User/Profile、修复后 1/1，Playwright Chat/Study 页面载荷修复前失败、修复后 2/2；完整门禁通过 15 文件/41 项 PostgreSQL 与 11/11 Playwright。QAM-02-003/004 仍开放，Gate 保持 L1。 |
| 2026-09-09 | 86 | L3 | L1 | L1 | +8（QAM-02-003 resolved） | 普通消息与显式 dispatch 复用预算化 Task/Event 原子派生；显式入口以 source Message 行锁和唯一键返回同一 Task。PostgreSQL 回归修复前 0/2（并发 201/500、Event 故障遗留 Task），修复后 3/3（并发 200/201、同 Task/单 Event、故障全回滚并可重试）；完整门禁通过 16 文件/44 项 PostgreSQL 与 11/11 Playwright。QAM-02-004 仍开放，Gate 保持 L1。 |
| 2026-09-09 | 90 | L4 | L4 | L4 | +4（QAM-02-004 resolved） | 最后房间删除以 User 行锁串行，并在同一事务内重查成员资格/count/delete；PostgreSQL 回归修复前 0/1（并发 `[200,200]` 删除全部房间），修复后 1/1（`[200,409]`、保留一个成员关系且 `/chat` 解析默认房间）；完整门禁通过 17 文件/45 项 PostgreSQL 与 11/11 Playwright。开放项仅余 P2×2。 |
| 2026-09-12 | 90 | L4 | L4 | L4 | 0（当前快照复审） | feat-044～046 只在 QAM-02 直接范围增加 `ChatApp` 向 LifePanel 传递当前用户 ID，未改变消息、授权、snapshot transport 或 SSE 协议；本轮定向 5 文件/17 项通过，根 `./init.sh` 为 72/472。重新核对 QAM-02-002 的两个消息查询后补全最新/最旧 80 条窗口漂移证据，但该根因已计入原有 contract/复用扣分，问题优先级、十维分数与 Gate 均不变。 |
