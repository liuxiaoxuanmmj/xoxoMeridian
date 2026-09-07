# QAM-01 身份、会话与个人档案质量审查

## 元数据

- QAM：QAM-01 身份、会话与个人档案
- 快照日期：2026-09-07
- 审查 Skill：[`xoxo-qam-01-identity-review`](../../.agents/skills/xoxo-qam-01-identity-review/SKILL.md)
- 评分标准：[`module-quality-review-standard.md`](./module-quality-review-standard.md)，v1.0.0
- 范围来源：[`PROJECT_VIEW.md`](../../PROJECT_VIEW.md) 的 QAM-01、Cross-cutting Concerns、共享映射、BU-06～BU-10
- 当前基线命令：`npm run check`（通过，59 文件/346 项 Vitest、生产构建与覆盖率）；`npm run test:integration`（通过，10 文件/24 项）；隔离临时副本 `npm run test:e2e`（通过，9/9）

## Overall

Score：76 / 100

Score Level：L2 — 可控

Gate Level / Final Level：L1 — Session 单活跃与注册容量仍有开放并发一致性 P1；密码恢复已有风险匹配 E3

Trend：+8（QAM-01-002/003 resolved；68→76）

Evidence Confidence：中高（密码恢复的 digest、并发单消费和故障回滚已有真实 PostgreSQL E3；Session 签发与注册容量竞态仍只有 E2）

结论：认证入口、HMAC Cookie、bcrypt、输入校验、no-store 和注册事务已有清晰基础。密码恢复现在只持久化版本化 SHA-256 digest，并把 token claim、密码更新与 Session 失效放入同一事务；真实 PostgreSQL 已证明并发单消费和失败回滚。当前没有开放 P0；Session 单活跃与注册容量的 2 个 P1，以及 3 个 P2，使最终等级仍为 L1。

## Score Breakdown

| Dimension | Score | Max | Finding / Evidence |
|---|---:|---:|---|
| 架构与责任边界 | 11 | 14 | Auth 服务、Route、Profile UI 和 Prisma 模型的主路径清楚，`requireCurrentUser()` 是统一入口；但注册直接写 QAM-02 `RoomParticipant`，Worker 同时承担清理，档案润色又绕过共享 LLM adapter。[auth.ts](../../lib/auth.ts#L302) [register/route.ts](../../app/api/auth/register/route.ts#L39) [agent-worker.ts](../../agent/agent-worker.ts#L41) [refine-note/route.ts](../../app/api/profile/refine-note/route.ts#L47)（E2） |
| 代码结构与复杂度 | 8 | 10 | Cookie 域名/代理兼容逻辑集中在 `lib/auth.ts`，认证 Route 控制流可读；但 Profile PATCH 同时负责城市解析、自动时区和事务更新，Cookie 头手工序列化增加变更面。[auth.ts](../../lib/auth.ts#L83) [me/route.ts](../../app/api/auth/me/route.ts#L63)（E2） |
| 抽象与复用 | 7 | 8 | `verifySession`、`requireCurrentUser`、Email adapter、密码和 Geo helper 有单一落点；密码恢复写入现由 `resetPasswordWithToken()` 统一持有 token claim、User 与 Session 事务边界。三条 LLM adapter 路径仍没有统一错误/隐私契约。[password-reset.ts](../../lib/password-reset.ts#L40) [provider.ts](../../lib/email/provider.ts#L182)（E2/E3） |
| 数据流与状态一致性 | 9 | 12 | 注册的 User/Profile/Participant 在事务内提交；密码恢复的条件 token 删除、密码更新和全部 Session 失效也已原子提交并有回滚 E3。Session 签发的 deleteMany→create 与房间容量 count→create 仍跨越非原子边界。[register/route.ts](../../app/api/auth/register/route.ts#L39) [auth.ts](../../lib/auth.ts#L264) [password-reset.ts](../../lib/password-reset.ts#L40)（E2/E3） |
| 接口与依赖关系 | 8 | 10 | 外部请求经过 Zod，受保护接口复用认证入口，Email/Geo 有 adapter；代理头信任、档案润色的直接 HTTP 调用和 reset 错误契约仍缺少集中边界。[validation.ts](../../lib/validation.ts#L5) [geo-ip.ts](../../lib/geo-ip.ts#L47) [refine-note/route.ts](../../app/api/profile/refine-note/route.ts#L51)（E2） |
| 健壮性、并发与生命周期 | 9 | 14 | bcrypt dummy compare、Email/Geo 失败隔离、过期清理和 heartbeat 提供基础保护；密码恢复以条件删除 claim 抵御重放，两个并发 Route 请求只有一个成功，Session 删除故障会回滚全部状态。并发登录和并发注册容量仍没有串行化或 E3。[password-reset.ts](../../lib/password-reset.ts#L40) [password-reset-security.integration.test.ts](../../tests/integration/password-reset-security.integration.test.ts#L55)（E3） |
| 性能与资源使用 | 6 | 8 | Session 和 reset 过期清理有索引且集中由 Worker 执行，Geo 查询有 3 秒 deadline；进程内 rate limit 在多实例不共享，`getCurrentUser()` 每次都做完整 Profile 查询并可能启动后台 Geo 请求。[schema.prisma](../../prisma/schema.prisma#L112) [rate-limit.ts](../../lib/rate-limit.ts#L1) [auth.ts](../../lib/auth.ts#L302)（E2） |
| 安全与隐私 | 8 | 10 | Cookie HMAC/timing-safe 校验、HttpOnly/SameSite、密码 hash、CSRF Origin 和 profile 资源边界有效；PasswordResetToken 只保存 `v1:sha256` digest，迁移主动失效旧 bearer 记录。可信代理头、认证/邮件日志标识和档案外发治理仍开放。[schema.prisma](../../prisma/schema.prisma#L126) [migration.sql](../../prisma/migrations/20260907195500_secure_password_reset_tokens/migration.sql#L1) [logout/route.ts](../../app/api/auth/logout/route.ts#L17)（E2/E3） |
| 可测试性与验证可信度 | 5 | 8 | 密码恢复新增真实 PostgreSQL Route Handler 回归，覆盖原 token 不落库、并发 200/400、过期/未知 token、旧 Session 失效和 trigger 故障回滚；通用门禁与 9 项 Playwright 通过。并发 Session 签发、注册容量及完整浏览器恢复邮件旅程仍未验证。[password-reset-security.integration.test.ts](../../tests/integration/password-reset-security.integration.test.ts#L40)（E3） |
| 可维护性、演进与技术债 | 5 | 6 | 认证服务边界和稳定 Cookie 名称利于演进；但 `sessionVersion` 仍是未使用字段，heartbeat 注释仍描述旧语义，`lib/auth.ts.backup`、过时的 `migrate-session.js` 和空 logout 工件增加误用成本。[schema.prisma](../../prisma/schema.prisma#L84) [SessionHeartbeat.tsx](../../components/auth/SessionHeartbeat.tsx#L8) [migrate-session.js](../../migrate-session.js#L7)（E2） |
| **总计** | **76** | **100** | `11 + 8 + 7 + 9 + 8 + 9 + 6 + 8 + 5 + 5 = 76` |

## Level Gate

### 已通过

- 基础身份入口：受保护页面/API 通过 `getCurrentUser()`、`requireCurrentUser()` 或 `requirePageUser()`，资源模块仍负责成员/所有权复核。[auth.ts](../../lib/auth.ts#L302)（E2）
- Cookie 签名和数据库 Session 一致性基础：Cookie payload 经过 HMAC 与过期校验，Session 再回查数据库；Cookie 为 HttpOnly、SameSite=Lax，并按路径设置 no-store。[auth.ts](../../lib/auth.ts#L171) [api.ts](../../lib/api.ts#L10)（E2）
- 密码与输入边界：登录对未知邮箱执行 dummy bcrypt，注册/登录/Profile 输入使用 Zod，密码长度由环境配置约束。[password.ts](../../lib/password.ts#L5) [validation.ts](../../lib/validation.ts#L5)（E2）
- 密码恢复存储与消费：只持久化版本化 digest；同一事务内条件 claim、更新密码并失效 Session。真实 PostgreSQL 证明并发恰有一个成功、故障完整回滚且 token 可重试（E3）。
- 正向通用验证：`npm run check` 通过 59 文件/346 项 Vitest、生产构建和覆盖率；全量 PostgreSQL 10 文件/24 项、隔离副本 Playwright 9/9 通过（E3）。

### 未通过或受限

- 单活跃 Session 门禁未通过：`deleteMany` 与 `create` 不在同一串行化边界，开放 `QAM-01-001`（P1），涉及并发一致性，Gate 不高于 L1。[auth.ts](../../lib/auth.ts#L264)
- 注册双人容量门禁未通过：事务内的 `count` 没有锁定 Room 或使用条件 CAS，开放 `QAM-01-004`（P1），可能超过 `maxHumanUsers=2`。[register/route.ts](../../app/api/auth/register/route.ts#L39) [schema.prisma](../../prisma/schema.prisma#L154)
- 最高风险不变量只有部分风险匹配 E3：密码恢复已覆盖；并发登录和并发注册容量仍没有真实 PostgreSQL 行为测试。故即使无 P1，Gate 也不高于 L2。
- L4 不满足：存在开放 P1，且关键并发/恢复路径无 E3。

最终等级：`min(Score Level L2, Gate Level L1) = L1`。

## Critical Issues

### P0

当前无开放 P0。现有证据没有确认可现实触发的权限绕过、不可恢复数据损坏或关键启动路径整体不可用。

### P1

#### QAM-01-001 — 单活跃 Session 的失效与创建不是原子操作（open）

- **问题**：`createSessionCookie()` 先对用户执行 `deleteMany`，随后再 `session.create`。两个并发登录可同时完成删除并各自创建 Session，违反代码声称的“only one active session”策略；两个 Cookie 都能通过 HMAC 和数据库回查。
- **证据**：[`lib/auth.ts`](../../lib/auth.ts#L264-L279)（E2）；[`Session` schema](../../prisma/schema.prisma#L112-L124) 只有 `userId` 普通索引，没有单活跃约束（E2）。本轮没有并发登录 E3。
- **质量影响**：同一账号的旧 Tab 可能继续有效，heartbeat 的踢出语义不确定；后续任何“新登录立即失效旧登录”的修改都必须围绕隐式竞态补丁，增加跨端状态认知成本。
- **最小修正**：将所有 Session 签发路径收敛到可重试的 PostgreSQL serializable 事务或按 `userId` 锁定的事务，在同一边界内删除旧 Session 并创建新 Session；保留现有单活跃策略，不新增认证能力。
- **验收证据**：真实 PostgreSQL 并发发起至少两次登录，最终 `Session` 数量为 1；旧 Cookie 的受保护请求返回 401，新 Cookie 成功；测试覆盖注册后的签发路径。
- **影响范围**：QAM-01；直接影响 QAM-02～QAM-08 的所有认证入口和 QAM-09 Worker 运行中的 Session 清理。

#### QAM-01-002 — 密码重置 token 以 bearer 明文持久化（resolved）

- **原问题**：`PasswordResetToken.token` 直接保存可用于重置密码的随机值，数据库读取权限或备份泄露后无需额外验证即可调用 reset API。
- **已实施修正**：[`createPasswordResetToken`](../../lib/password-reset.ts#L21-L38) 继续只把原 token 返回给邮件链接，数据库改存 `v1:sha256:<digest>`；schema 将字段明确命名为 `tokenDigest`。时间戳迁移先删除所有旧 bearer 记录，再重命名列和唯一索引，因此升级时已有恢复链接会安全失效而不会被误当作 digest。[`migration.sql`](../../prisma/migrations/20260907195500_secure_password_reset_tokens/migration.sql#L1-L10)（E2）
- **验收证据**：[`password-reset-security.integration.test.ts`](../../tests/integration/password-reset-security.integration.test.ts#L40-L53) 在真实 PostgreSQL 读取整行 JSON，证明记录不存在 `token` 字段、`tokenDigest` 符合版本化 64 位十六进制 SHA-256 且不等于返回给邮件的原 token；合法 token 可消费，未知/过期 token 返回 400（E3）。
- **影响范围**：QAM-01；QAM-09 的备份/日志/数据库运维边界需同步确认。

#### QAM-01-003 — reset token 验证、改密和失效缺少原子消费（resolved）

- **原问题**：Route 先验证 token，再分别更新 User、删除 token 和删除所有 Session；两个并发请求可以同时通过验证并各自改密，后续失败还会留下部分提交状态。
- **已实施修正**：[`resetPasswordWithToken`](../../lib/password-reset.ts#L40-L79) 在同一 Prisma transaction 内按 digest 读取记录，以 `id + tokenDigest + expiresAt > now` 的条件删除原子 claim；只有 `count === 1` 才继续更新密码和删除全部 Session。任一步抛错会回滚 token、密码和 Session；Route 只负责输入/限流、bcrypt 与稳定 200/400/500 响应。[`reset-password/route.ts`](../../app/api/auth/reset-password/route.ts#L10-L33)（E2/E3）
- **验收证据**：同一真实 PostgreSQL 回归修复前稳定得到两个 200，修复后并发结果恰为 200/400，最终密码只匹配胜出请求、旧 Session 为 0、token 不可重放；`BEFORE DELETE` trigger 注入 Session 删除失败时 HTTP 返回 500，密码、Session 和 token 全部保持原值，移除故障后同 token 可成功重试（E3）。
- **影响范围**：QAM-01；Session 失效行为影响所有受保护 QAM。

#### QAM-01-004 — 注册房间容量检查无法防止并发超员（open）

- **问题**：注册事务在 `roomParticipant.count()` 后按结果决定角色并插入 Participant，但没有锁定 Room、条件更新或数据库容量约束。已有 1 名成员时两个并发注册都可能读到 `occupied=1`，最终产生 3 名成员。
- **证据**：[`register/route.ts`](../../app/api/auth/register/route.ts#L39-L69)（E2）；Room 仅有可变的 `maxHumanUsers` 字段，`RoomParticipant` 只有 `(roomId,userId)` 唯一约束，不能表达容量（[`schema.prisma`](../../prisma/schema.prisma#L154-L176)）（E2）。本轮没有并发注册 E3。
- **质量影响**：固定双人边界被突破，后续成员授权、Agent 上下文和房间快照都可能看到超出策略的第三个用户；错误发生在注册跨 QAM-02 写入处，修复时容易扩散到多个模块。
- **最小修正**：在同一事务中对 Room 行执行 `FOR UPDATE`/等价锁后重新计数再插入，或建立可证明的容量 CAS；保留当前邀请码和默认房间策略，不改变房间功能范围。
- **验收证据**：真实 PostgreSQL 在已有 1 名成员时并发注册两次，最多一个请求成功，Participant 数量不超过 `maxHumanUsers`，失败请求不留下 User/Profile 孤儿记录。
- **影响范围**：主责任 QAM-01（注册入口）；直接关联 QAM-02 的成员容量与授权事实源。

### P2

#### QAM-01-005 — 代理头信任未绑定可信代理边界（open）

- **问题**：`x-forwarded-for`、`x-real-ip`、`x-forwarded-host` 和 `x-forwarded-proto` 可直接影响 Geo profile、Session 审计字段和 Cookie Secure/Domain 选择，但没有可信代理配置或入口清洗证明。
- **证据**：[`auth.ts`](../../lib/auth.ts#L51-L75)（E2）；[`geo-ip.ts`](../../lib/geo-ip.ts#L47-L59)（E2）；现有 Geo 测试验证了头解析，却没有直连客户端伪造头的部署行为测试（[`geo-ip.test.ts`](../../tests/lib/geo-ip.test.ts#L182-L226)）（E2）。
- **质量影响**：攻击者可伪造自己的地理来源和 Session IP，或在 APP_BASE_URL 为 HTTP 时伪造 proto 造成 Secure Cookie 不可用；域名/代理切换时登录失败原因难以诊断。当前影响主要是自身档案完整性、可用性和审计可信度，不据此登记 P1。
- **最小修正**：在反向代理边界清洗并重写这些头，应用只在明确配置的可信代理来源下读取；否则使用连接层地址/APP_BASE_URL，并将允许 Host/Origin 纳入同一配置契约。
- **验收证据**：直连请求无法用伪造头改变记录 IP、Geo 或 Cookie Secure/Domain；受信代理转发仍保持现有登录和 Geo 行为。
- **影响范围**：QAM-01；QAM-09 负责实际代理/部署边界。

#### QAM-01-006 — 认证与邮件错误日志携带可关联敏感标识（open）

- **问题**：注销日志打印 Session ID，forgot-password 打印完整邮箱和供应商错误，Email adapter 直接记录异常对象；Profile refine 的上游错误消息还会作为 `details.reason` 返回。
- **证据**：[`logout/route.ts`](../../app/api/auth/logout/route.ts#L17-L35)（E2）；[`forgot-password/route.ts`](../../app/api/auth/forgot-password/route.ts#L49-L54)（E2）；[`provider.ts`](../../lib/email/provider.ts#L16-L21)（E2）；[`refine-note/route.ts`](../../app/api/profile/refine-note/route.ts#L71-L85)（E2）。
- **质量影响**：应用日志、集中日志和客户端响应可能保留账号标识、Session 标识或外部服务内部信息；在档案/恢复问题排查时扩大隐私暴露面，并使日志保留策略难以按敏感等级执行。
- **最小修正**：采用结构化事件和关联 ID，默认掩码邮箱、Session、IP 与 provider message；客户端只返回稳定错误类别，详细原因仅进入受控日志，不记录 token、profileNote 或完整请求载荷。
- **验收证据**：失败登录、退出、邮件失败和 LLM 超时的日志/响应不含 bearer token、完整 Session ID、完整邮箱或 provider 原始消息；仍可用关联 ID 定位失败。
- **影响范围**：QAM-01；QAM-08 负责 Trace 中档案/LLM payload 的进一步隐私治理，避免重复计数。

#### QAM-01-007 — 未接入运行路径的旧认证工件会误导维护与运维（open）

- **问题**：`lib/auth.ts.backup` 保留旧的 sessionVersion 实现，`migrate-session.js` 会尝试创建已删除的 `Session.token` 列，`app/api/auth/logout/sedhKksNn` 为空；它们不在 `package.json` scripts 或当前 import 路径中，却仍像可运行入口/迁移工件。
- **证据**：[`migrate-session.js`](../../migrate-session.js#L7-L25) 引用旧 `token` 列（E2）；[`lib/auth.ts.backup`](../../lib/auth.ts.backup#L65-L99) 与当前 [`lib/auth.ts`](../../lib/auth.ts#L248-L293) 语义不同（E2）；`rg` 未发现当前入口引用，且 `package.json` scripts 不含该脚本（E2）。
- **质量影响**：人工运维或后续维护者可能误执行不兼容 SQL，或根据旧 sessionVersion 代码推断当前失效策略；空路由文件增加错误入口排查成本。它未被运行路径调用，故不升级为 P1。
- **最小修正**：删除或移入明确归档目录，并在需要保留的迁移旁写明适用 schema/版本和不可作为当前部署命令；清理空路由文件，保持当前认证实现不变。
- **验收证据**：生产构建、`prisma migrate deploy` 和仓库搜索不再出现可误执行的旧 Session 列/入口；当前 Auth API 路由枚举保持完整。
- **影响范围**：QAM-01；QAM-09 的迁移/交付文档与运维入口。

## Architecture and Data Flow

```text
浏览器
  → Proxy Origin/CSRF + Cookie 头
  → Auth Route（Zod / rate limit）
  → User + UserProfile +（注册时）RoomParticipant 事务
  → Session.deleteMany → Session.create → HMAC Cookie
  → getCurrentUser：Cookie HMAC + Session DB + User/Profile
       ↘ fire-and-forget Geo IP claim → 外部 ip-api → UserProfile auto 更新
       ↘ Agent Context → profileNote → 外部 LLM（按产品设计提供背景）

forgot-password → 原 token 只进入 Email link + v1:sha256 digest 持久化
reset-password → bcrypt → 单事务条件 claim digest → update User → delete Sessions
```

当前健康边界是：密码 hash、Cookie 签名、Session DB 回查、Zod、注册事务和密码恢复原子消费均有明确事实源；当前脆弱边界收敛为 Session 签发与注册容量的并发“先读/先删再写”。Profile note 进入 Agent/LLM 是既定接口，不在本报告扩展产品策略；本报告只登记其错误/日志缺少敏感数据治理的直接证据，并将 Trace payload 的通用治理关联给 QAM-08。

## Verified Strengths

- Session Cookie 使用随机 Session ID 加 HMAC payload，验证时检查签名长度、timing-safe equality、过期时间和数据库 Session；Cookie 为 HttpOnly、SameSite=Lax，并按请求路径添加 no-store。[`lib/auth.ts`](../../lib/auth.ts#L165-L207) [`lib/api.ts`](../../lib/api.ts#L10-L17)（E2）
- 登录对不存在用户执行 dummy bcrypt comparison，降低邮箱枚举的时序差异；注册/登录/Profile 输入均经过 schema 校验。[`lib/password.ts`](../../lib/password.ts#L5-L22) [`lib/validation.ts`](../../lib/validation.ts#L5-L28)（E2）
- 注册的 User、嵌套 UserProfile 和初始 RoomParticipant 在一个 Prisma transaction 内提交，P2002 会转换为稳定冲突响应；本轮没有将容量竞态误判为事务缺失。[`register/route.ts`](../../app/api/auth/register/route.ts#L37-L78)（E2）
- forgot-password 对不存在邮箱返回相同成功消息，Email provider 失败不会回显枚举信息；Geo provider 有公网 IP 过滤、3 秒 AbortSignal 和失败隔离。[`forgot-password/route.ts`](../../app/api/auth/forgot-password/route.ts#L27-L55) [`geo-ip.ts`](../../lib/geo-ip.ts#L40-L59)（E2）
- 密码恢复数据库不再保留可直接提交的 bearer token；并发单消费、过期/未知拒绝、Session 全失效和故障回滚由 4 项真实 PostgreSQL Route Handler 测试覆盖（E3）。
- `npm run check` 的 59 文件/346 项 Vitest、生产构建和覆盖率通过；全量集成 10 文件/24 项、隔离副本 9 项 Playwright 通过（E3）。这些证据不冒充仍缺失的 Session 签发/注册容量竞态验证。

## Recommended Improvements

1. 优先只修复 `QAM-01-001`：统一 Session 签发事务，并补并发登录、旧 Cookie 失效与注册签发路径回归。
2. 随后单独处理 `QAM-01-004`：锁定 Room 容量事实源，并以真实 PostgreSQL 并发注册回归证明不会超员。
3. 处理 `QAM-01-005` 与 `QAM-01-006`：把可信代理、Host/Origin 和日志脱敏纳入配置/适配层，保持错误类别稳定且不泄露内部详情。
4. 清理 `QAM-01-007`：删除/归档旧认证工件并验证迁移、构建和路由枚举；不要借此扩大认证功能或重构其他 QAM。

## Sustainable Review Record

### 开放问题

| ID | Priority | Status | 首次证据 | 复审触发条件 |
|---|---|---|---|---|
| QAM-01-001 | P1 | open | `lib/auth.ts` deleteMany/create（E2） | Session 签发事务、并发登录 E3 或 Session 策略变更 |
| QAM-01-004 | P1 | open | register count→participant create（E2） | Room 锁/CAS 或并发注册容量 E3 |
| QAM-01-005 | P2 | open | 代理头直接读取（E2） | 代理拓扑、Host/Origin 或 Cookie 部署变化 |
| QAM-01-006 | P2 | open | logout/email/provider/refine 日志和错误（E2） | 日志脱敏、错误契约或 Trace 隐私治理变化 |
| QAM-01-007 | P2 | open | 未接入旧认证工件（E2） | 删除/归档工件、迁移路径或交付脚本变化 |

### 已解决问题

| ID | Priority | Status | 解决证据 | 复审触发条件 |
|---|---|---|---|---|
| QAM-01-002 | P1 | resolved | tokenDigest schema + 旧 bearer 失效迁移；真实 PostgreSQL 证明原 token 不落库（E2/E3） | token schema、创建/邮件链接或备份边界变更 |
| QAM-01-003 | P1 | resolved | 条件 claim + User/Session 同事务；并发 200/400 与 trigger 故障回滚（E3） | reset transaction、Session 失效或恢复 Route 变更 |

### 复审规则

- 问题状态只使用 `open`、`resolved`、`accepted-risk`、`not-reproduced`；已解决 ID 不删除。
- 只有真实 PostgreSQL/浏览器行为证据能关闭相应并发、token 消费和关键旅程问题；单元 mock 不替代数据库语义。
- 跨模块修正只在直接责任报告保留稳定 ID；QAM-02/QAM-08/QAM-09 通过关联问题记录各自直接证据。
- 初审 2026-09-06 的 Playwright 曾因缺少 `libnspr4.so` 受阻；当前隔离临时副本已实际通过 9/9。原仓库复跑受用户既有 `next dev` 的 `.next/dev/lock` 阻塞，因此没有把组合 `check:full` 虚记为单次成功。

### 评分历史（只追加）

| 日期 | Score | Score Level | Gate | Final | Delta | 变更证据 |
|---|---:|---|---|---|---|---|
| 2026-09-06 | 68 | L1 | L1 | L1 | baseline | 初审：当前源码/schema；QAM 单元 50 项、真实 PostgreSQL 集成 17 项、快速门禁 344 项通过；身份竞态/reset/容量 E3 未运行，Playwright 受 `libnspr4.so` 环境阻塞 |
| 2026-09-07 | 76 | L2 | L1 | L1 | `+8（QAM-01-002/003 resolved）` | PasswordResetToken 改存版本化 digest 并迁移失效旧 bearer；条件 token claim、密码更新和 Session 失效同事务。回归修复前证明原 token 落库、并发 200/200 和故障后部分改密，修复后真实 PostgreSQL 4/4 覆盖 digest、并发 200/400、过期/未知拒绝、Session 失效和 trigger 回滚。`npm run check`、10 文件/24 项集成与隔离副本 Playwright 9/9 通过。 |
