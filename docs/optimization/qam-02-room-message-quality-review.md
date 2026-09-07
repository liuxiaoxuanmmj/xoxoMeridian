# QAM-02 私密房间与实时消息质量审查

## 元数据

- QAM：QAM-02 私密房间与实时消息
- 快照日期：2026-09-06
- 审查 Skill：`xoxo-qam-02-room-message-review`
- 共享标准：`docs/optimization/module-quality-review-standard.md` v1.0.0
- 范围来源：`PROJECT_VIEW.md` QAM-02、Cross-cutting Concerns、共享映射、BU-02、BU-06
- 当前基线命令：`npm run check:quick`
- 初审 Delta：`baseline`
- 工作区说明：审查前 `git status --short` 显示 AGENTS/Harness、PROJECT_VIEW 和共享标准存在未提交改动；本报告未将其当作 QAM-02 业务基线改动，也未修改这些文件。

## Overall

- Score：71/100
- Score Level：L2
- Gate Level：L1
- Final Level：L1
- Trend：baseline
- Evidence Confidence：中等（主路径和部分生命周期有 E3；高风险并发、真实浏览器和完整跨模型清空仍为 E2/未验证）
- 当前开放问题：5 项（P1×3、P2×2）；QAM-02-005 保留为 `not-reproduced` 历史记录，不计入开放项。

当前房间成员资格在主要 HTTP 入口和数据库层有清晰控制，SSE 的中止/关闭路径也有针对性测试。快照和客户端合并结构可读，但快照边界没有过滤完整档案，重连消息接口还把内部 Agent trace 载荷带入浏览器。显式 Agent dispatch、最后房间删除以及 SSE 定时轮询存在可复现于代码结构的竞态或契约不一致；因此总分处于 L2，开放 P1 将最终门禁降为 L1。

## Score Breakdown

| 维度 | Score | Max | Finding / Evidence |
| --- | ---: | ---: | --- |
| 架构与责任边界 | 11 | 14 | Route、`lib/access.ts`、消息服务和客户端 Hook 分层清楚；但 snapshot 同时承载 QAM-02/03/07/08，且显式 dispatch 在 Route 中重复 Task/EventLog 编排。[snapshot](../../lib/room-snapshot.ts#L1-L125)、[dispatch](../../app/api/agent/dispatch/route.ts#L18-L75)（E2） |
| 代码结构与复杂度 | 8 | 10 | 房间、消息、SSE 控制流局部可读，客户端合并有单一入口；删除/清空和 dispatch 的异步分支仍把一致性责任散落在多个调用点。[messages route](../../app/api/rooms/%5BroomId%5D/messages/route.ts#L45-L108)（E2） |
| 抽象与复用 | 6 | 8 | `assertRoomAccess`、`createHumanMessage`、`stableMergeBy` 复用有效；显式 dispatch 未复用原子派生服务，HTTP GET 与 SSE 使用两套 Message/trace 投影。[messages](../../lib/messages.ts#L12-L93)、[merge](../../components/chat/useRoomChat.ts#L10-L57)（E2） |
| 数据流与状态一致性 | 8 | 12 | 正常消息的 Message→Task→EventLog 事务路径明确，wipe 的多表删除在单一事务中原子提交；dispatch Task/EventLog 分离仍会产生不一致，snapshot 与客户端暂存状态的交错需补验证。[messages](../../lib/messages.ts#L20-L72)、[wipe](../../app/api/rooms/%5BroomId%5D/messages/route.ts#L91-L103)（E2） |
| 接口与依赖关系 | 7 | 10 | 输入经过 Zod，访问入口有成员检查；`ChatMessage` 只声明摘要字段，而消息 GET 实际返回完整关系，形成可观察 contract 漂移。[types](../../components/chat/types.ts#L21-L61)、[GET messages](../../app/api/rooms/%5BroomId%5D/messages/route.ts#L18-L38)（E2） |
| 健壮性、并发与生命周期 | 8 | 14 | SSE 对 abort、controller close 和首次/进行中 snapshot 有保护并通过定向测试；interval 不防重入，最后房间删除存在 check-then-act 竞态。wipe 的并发线性化语义尚未验证/文档化，但本轮未证明缺陷。[stream](../../app/api/rooms/%5BroomId%5D/stream/route.ts#L27-L120)、[stream tests](../../tests/server/room-stream.test.ts#L113-L171)（E2/E3） |
| 性能与资源使用 | 6 | 8 | 查询数量受消息/生活数据上限约束，消息有索引；每个连接每 2 秒重新聚合多个模块，房间列表无上限且 trace 子关系无分页，后续连接数/房间数增长成本可见。[snapshot](../../lib/room-snapshot.ts#L5-L81)、[room list](../../lib/room-list.ts#L9-L31)（E2） |
| 安全与隐私 | 6 | 10 | HTTP 入口普遍认证、成员复核且真实 PostgreSQL 访问测试通过；snapshot 将完整 UserProfile 序列化到客户端，GET messages 还暴露内部 Agent trace 载荷。[page](../../app/chat/%5BroomId%5D/page.tsx#L10-L28)、[profile projection](../../lib/room-snapshot.ts#L66-L76)（E2；结构风险见 QAM-02-001/002） |
| 可测试性与验证可信度 | 6 | 8 | `npm run check:quick` 的 58 个测试文件/344 个测试通过；PostgreSQL 成员/唯一/级联 3 项通过，SSE 中止和消息编辑器有行为测试，但缺少高风险并发/路由事务测试，Playwright 被环境依赖阻塞。[integration](../../tests/integration/prisma-access.integration.test.ts#L16-L74)、[composer](../../tests/component/message-composer.test.tsx#L21-L70)（E3） |
| 可维护性、演进与技术债 | 5 | 6 | 主要变化点有明确文件落点，稳定合并和 snapshot contract 便于局部修改；跨 QAM snapshot 与 Agent trace 载荷边界仍需治理（BU-02）。[PROJECT_VIEW BU-02](../../PROJECT_VIEW.md#L900-L904)（E2） |
| **合计** | **71** | **100** | 算术核对：11+8+6+8+7+8+6+6+6+5 = 71。 |

## Level Gate

- P0：通过。当前没有具备 E3 直接行为证据的开放 P0。
- 开放 P1：未通过。QAM-02-001 的完整档案暴露属于房间 snapshot 的隐私边界问题；QAM-02-003/004 涉及重复派发或删除后的错误状态，Gate 不高于 L1。QAM-02-005 经本轮证据复核未能证明为缺陷，已标记 `not-reproduced`。
- 最高风险不变量行为验证：未通过。成员访问和数据库级级联有 E3，但 Message/AgentTask/EventLog 原子派生、房间 wipe 并发语义、last-room 删除竞态没有风险匹配的行为测试；该条件单独使 Gate 不高于 L2。
- L4 条件：未通过。存在开放 P1，且关键失败/并发路径没有完整 E3。
- 结论：Score Level=L2，Gate Level=L1，因此 Final Level=min(L2,L1)=L1。

## Critical Issues

### P1

#### QAM-02-001：Room snapshot 将私有 UserProfile 字段带入浏览器

- 状态：`open`
- 问题：`getRoomSnapshot()` 对 participant 使用 `user: { include: { profile: true } }`，随后展开整个 `user`；聊天页又把整个 snapshot `JSON.stringify` 后传给 Client Component。运行时类型只做 TypeScript 缩窄，不会删除 `lastGeoIp`、`preferences`、`profileNote` 等字段。
- 证据：[`lib/room-snapshot.ts#L66-L76`](../../lib/room-snapshot.ts#L66-L76)、[`app/chat/[roomId]/page.tsx#L14-L28`](../../app/chat/%5BroomId%5D/page.tsx#L14-L28)、[`UserProfile schema`](../../prisma/schema.prisma#L134-L152)（E2）。本轮未运行浏览器网络断言。
- 质量影响：房间成员和页面 JavaScript 可读取不应由聊天展示的档案元数据；QAM-01 的隐私边界被 QAM-02 的 read model 绕过，并扩大 snapshot payload 和后续 contract 漂移风险。
- 最小修正：在 QAM-02 snapshot projection 使用 Prisma `select` 和显式 allow-list，仅输出聊天确需的用户字段及公开城市/时区；不要依赖 `components/chat/types.ts` 进行运行时脱敏。保留 QAM-01 对档案字段的所有权。
- 验收证据：用真实房间页面/Playwright 或 Route 行为测试检查序列化 snapshot 不含 `lastGeoIp`、`preferences`、未公开 `profileNote` 等字段，同时确认成员仍可看到既定公开显示名、头像、城市和时区；补充 QAM-01 隐私回归证据。
- 影响范围：QAM-02；直接关联 QAM-01，`getRoomSnapshot()` 被 QAM-07 Study 页面复用时也需确认其 allow-list。

#### QAM-02-003：显式 Agent dispatch 的 Task 与 EventLog 不是原子派生

- 状态：`open`
- 问题：`/api/agent/dispatch` 的 `sourceMessageId` 分支先 `agentTask.create`，再单独 `eventLog.create`；没有事务或幂等响应。并发重复请求会竞争 `AgentTask.sourceMessageId @unique`，事件写入失败则留下无创建事件的任务且接口返回错误。
- 证据：[`dispatch route#L41-L75`](../../app/api/agent/dispatch/route.ts#L41-L75)、[`AgentTask unique sourceMessageId`](../../prisma/schema.prisma#L228-L268)。正常 content 分支使用 [`createHumanMessage` 事务](../../lib/messages.ts#L20-L72)，说明两条入口契约已分叉（E2）；本轮未执行并发 dispatch 实验。
- 质量影响：显式 UI 重试或网络重放可能产生 500/唯一约束错误、孤儿 Task 或重复副作用，聊天 snapshot 中的 Agent 状态与 EventLog 事实不一致。
- 最小修正：将 source-message 分支的 Task 和 `agent.task.created` 放进同一 Prisma 事务，并以 sourceMessageId 唯一键提供明确的重复请求结果；最好复用与 `createHumanMessage` 相同的领域派生服务，不扩大 Agent Runtime 功能。
- 验收证据：真实 PostgreSQL 并发提交同一 `sourceMessageId` 只能得到一个 Task 和一个创建事件；注入事件写失败时 Task 与事件一起回滚；重复 HTTP 请求返回稳定幂等结果。
- 影响范围：QAM-02；直接关联 QAM-08 的 Task/Trace 生命周期。

#### QAM-02-004：删除最后房间的保护是 check-then-act，不能保持显式不变量

- 状态：`open`
- 问题：删除 Route 先 count 当前用户其他房间，再执行 `room.delete`，两次请求可分别在 count 阶段看到彼此尚存，随后同时删除两个房间，导致用户没有默认房间，违反代码注释所声明的“不能删除最后房间”不变量。
- 证据：[`room DELETE#L16-L36`](../../app/api/rooms/%5BroomId%5D/route.ts#L16-L36)、[`getDefaultRoomForUser`](../../lib/access.ts#L19-L31)。真实 PostgreSQL 仅验证了直接 cascade，不覆盖 API 并发删除（[`prisma-access.integration.test.ts#L54-L74`](../../tests/integration/prisma-access.integration.test.ts#L54-L74)，E3/E2）。
- 质量影响：并发点击、两个浏览器或重试可使 `/chat` 无法解析默认房间，造成持久的房间生命周期错误和错误恢复路径。
- 最小修正：在数据库事务内以可序列化/适当锁定的方式重新检查该用户房间数并删除，或引入等价的用户级互斥；保留当前“至少一个房间”的功能边界。
- 验收证据：真实 PostgreSQL 两个并发 DELETE 的交错测试中，最多一个请求成功，用户始终保留一个房间；成功删除后 `/chat` 仍能重定向到默认房间。
- 影响范围：QAM-02；直接关联 QAM-01 注册创建的 RoomParticipant（BU-06）。

### P2

#### QAM-02-002：消息 GET 的 Agent trace 投影超出聊天 contract

- 状态：`open`
- 问题：`GET /messages` 对 `finalTask` 使用 `toolCalls: true`、`llmCalls: true`，把完整 input/output、LLM request/response payload 等字段返回浏览器；而 snapshot 仅选择摘要字段，`ChatMessage` 也只声明摘要字段。客户端详情面板不需要这些完整载荷。
- 证据：[`messages GET#L18-L38`](../../app/api/rooms/%5BroomId%5D/messages/route.ts#L18-L38)、[`snapshot trace select#L15-L33`](../../lib/room-snapshot.ts#L15-L33)、[`MessageList rendering#L70-L97`](../../components/chat/MessageList.tsx#L70-L97)（E2）。本轮未执行带敏感 trace 数据的 HTTP 响应实验。
- 质量影响：重连刷新路径向房间成员暴露内部 prompt/tool 数据，响应体和客户端合并成本也随 trace 数量增长；同时形成 GET 与 SSE 两个不同的事实/隐私 contract。Agent trace 的执行语义归 QAM-08，但聊天投影由 QAM-02 负责。
- 最小修正：让 GET 复用 snapshot 的 allow-list projection，或抽取单一 ChatMessage view model；若需要完整 trace，使用已有受授权的 QAM-08 trace 入口，不夹带到消息列表响应。
- 验收证据：HTTP 重连刷新只返回 `ChatMessage` 声明的摘要字段；消息列表仍能呈现 task/tool/LLM 状态；完整 trace 仅在其专门授权入口返回。
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
  │         └─ Message → (optional) AgentTask → agent.task.created EventLog
  ├─ POST /api/agent/dispatch（显式 UI/调用入口）
  │    └─ assertRoomAccess → source Message → Task → EventLog（当前非原子）
  └─ EventSource /api/rooms/:roomId/stream
       └─ initial auth/member check → session/member recheck
            └─ periodic full snapshot → client merge/reconnect
```

正常人类消息路径的事务边界在 `createHumanMessage` 内，Room/Message 的成员资格在 Route 前置检查并由真实数据库唯一/级联关系支撑。失败路径中，SSE 对 abort 和 controller close 已有保护；最后房间删除和显式 dispatch 的线性化/幂等边界尚未表达，wipe 的并发线性化语义则尚未文档化或以行为测试锁定，但本轮没有证明其违反既定清空集合。BU-02 的 snapshot 聚合同时被 Chat 和 Study 使用；本报告只登记其对 QAM-02 读取 contract、隐私和实时成本的直接影响，不把 Memo、Study 状态、Scheduler 或 Agent Runtime 的领域规则移入本 QAM。

## Verified Strengths

- 所有主要 Room/Message/Stream Route 都先取得当前用户并对 `roomId` 执行成员资格检查；RoomParticipant 的复合唯一键和 Room 外键级联在真实 PostgreSQL 测试中通过。
- 普通消息创建在单一 Prisma 事务内完成 Message、可选 AgentTask 和 `agent.task.created` EventLog 派生，检测结果也写入持久化 metadata；这条主路径是当前较强的事实来源。
- SSE 使用统一 `write`/`stop`，对客户端 abort、reader cancel、首次 snapshot 未完成和 controller 已关闭均有显式保护；`tests/server/room-stream.test.ts` 的 12 项定向 Node 测试通过。
- 客户端 `stableMergeBy` 按 ID 合并并保留无变化引用，optimistic 消息在响应/重连时有替换和去重路径；消息编辑器的键盘提交、重复发送禁用和成功清空行为测试通过。
- `npm run check:quick` 通过：typecheck、ESLint、Vitest 共 58 个测试文件/344 个测试；`prisma-access.integration.test.ts` 在 PostgreSQL 中 3 项通过。

## Recommended Improvements

1. 先修复 QAM-02-001：在 `getRoomSnapshot` 和页面边界建立 allow-list projection，并用真实浏览器/HTTP payload 回归验证隐私字段不出现在 Chat 数据中。
2. 合并 QAM-02-003 的显式 dispatch 与普通消息派生事务，补 PostgreSQL 并发/失败回滚测试；这同时降低重复入口和 Task/EventLog 漂移。
3. 为 QAM-02-004 建立 Room/用户级串行化语义，补真实 PostgreSQL 的并发 DELETE 测试；对 wipe 与并发写入补明确的产品线性化语义测试，只有测试证明违反既定 barrier 时才重新登记缺陷。
4. 修复 QAM-02-002/006：统一消息 view model 和 trace allow-list，并把 SSE timer 改为无重入串行循环；补 deferred snapshot 和慢查询行为测试。

## Sustainable Review Record

### 当前开放问题

| ID | Priority | Status | 首次证据 | 下一次复审触发 |
| --- | --- | --- | --- | --- |
| QAM-02-001 | P1 | open | snapshot 全量 profile + Chat 页面序列化（E2） | snapshot projection 或 QAM-01 profile contract 改动 |
| QAM-02-002 | P2 | open | messages GET `include: true` 与类型/快照漂移（E2） | Message GET、trace API 或 ChatMessage 类型改动 |
| QAM-02-003 | P1 | open | dispatch Task/EventLog 两次写入（E2） | Agent dispatch、Task 创建或 EventLog 事务改动 |
| QAM-02-004 | P1 | open | last-room count 后 delete（E2） | Room DELETE、默认房间或成员生命周期改动 |
| QAM-02-005 | P1 | not-reproduced | Read Committed 交错分析未证明 wipe 后并发写违反既定语义；batch transaction 原子提交（E2） | 明确记录清空 barrier/线性化语义，或出现真实 PostgreSQL 交错导致清空集合被部分保留 |
| QAM-02-006 | P2 | open | SSE interval 无 in-flight guard（E2） | Stream timer、snapshot 查询或客户端 merge 改动 |

### 复审触发与证据规则

- 任一问题修复后必须保留原 ID，状态只可改为 `resolved`、`accepted-risk` 或 `not-reproduced`，并附修复提交/测试证据；不得删除历史结论。
- 下一次复审必须重新核对 QAM-01 profile 隐私、QAM-07 Study snapshot 使用方和 QAM-08 Task/Trace 所有权，避免把共享文件的改善重复计入多个 QAM。
- 本轮实际验证：`npm run check:quick`（通过，58 files/344 tests）；`npm run test:unit -- tests/server/room-stream.test.ts tests/server/agent-detection.test.ts`（通过，2 files/12 tests）；`npm run test:component -- tests/component/message-composer.test.tsx`（通过，1 file/2 tests）；`npm run test:integration -- tests/integration/prisma-access.integration.test.ts`（通过，1 file/3 tests，Docker PostgreSQL）。
- `npm run test:e2e -- tests/e2e/authenticated.spec.ts` 已执行但未完成聊天浏览器验证：setup 通过，4 个 authenticated 用例因 Chromium 启动缺少 `libnspr4.so` 失败；该结果是环境阻塞，不计作 QAM-02 行为通过。`npm run check`、完整 integration/E2E 和 Compose smoke 本轮未运行。

### 评分历史（只追加）

| 日期 | Score | Score Level | Gate | Final | Delta | 变更证据 |
| --- | ---: | --- | --- | --- | --- | --- |
| 2026-09-06 | 70 | L2 | L1 | L1 | baseline | 初审：`check:quick`、QAM-02 定向测试、PostgreSQL 访问/级联测试；浏览器 E2E 因 `libnspr4.so` 未验证。 |
| 2026-09-06 | 71 | L2 | L1 | L1 | +1（证据纪律复核） | 复核 QAM-02-005：Read Committed 下并发 POST 在无文档 barrier 时可合法线性化到 wipe 前/后，未证明部分清空或孤儿写入；移除开放项并将其标为 `not-reproduced`。 |
