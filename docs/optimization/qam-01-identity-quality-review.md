# QAM-01 身份、会话与个人档案质量审查

## 元数据

- QAM：QAM-01 身份、会话与个人档案
- 快照日期：2026-09-08
- 审查 Skill：[`xoxo-qam-01-identity-review`](../../.agents/skills/xoxo-qam-01-identity-review/SKILL.md)
- 评分标准：[`module-quality-review-standard.md`](./module-quality-review-standard.md)，v1.0.0
- 范围来源：[`PROJECT_VIEW.md`](../../PROJECT_VIEW.md) 的 QAM-01、Cross-cutting Concerns、共享映射、BU-06～BU-10
- 当前基线命令：`sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full`（单次退出 0；59 文件/346 项 Vitest、生产构建、覆盖率、12 文件/29 项 PostgreSQL 集成测试与 9/9 Playwright）

## Overall

Score：87 / 100

Score Level：L3 — 稳健

Gate Level / Final Level：L4 / L3 — 无开放 P0/P1，Session、密码恢复与注册容量的最高风险并发/故障路径均有 E3；最终等级受 Score Level L3 限制

Trend：+4（QAM-01-004 resolved；83→87）

Evidence Confidence：高（Session 签发、密码恢复、注册容量与跨写回滚均有真实 PostgreSQL E3，完整浏览器旅程通过）

结论：认证入口、HMAC Cookie、bcrypt、输入校验、no-store 和事务边界已有清晰基础。Session 签发、密码恢复和默认 Room 注册容量现在分别由稳定数据库事实源串行化，并以真实 PostgreSQL 证明并发、故障回滚和无孤儿状态。当前没有开放 P0/P1；3 个 P2 仍限制原始得分，但不再触发等级门禁。

## Score Breakdown

| Dimension | Score | Max | Finding / Evidence |
|---|---:|---:|---|
| 架构与责任边界 | 11 | 14 | Auth 服务、Route、Profile UI 和 Prisma 模型的主路径清楚，`requireCurrentUser()` 是统一入口；但注册直接写 QAM-02 `RoomParticipant`，Worker 同时承担清理，档案润色又绕过共享 LLM adapter。[auth.ts](../../lib/auth.ts#L356) [register/route.ts](../../app/api/auth/register/route.ts#L39) [agent-worker.ts](../../agent/agent-worker.ts#L41) [refine-note/route.ts](../../app/api/profile/refine-note/route.ts#L47)（E2） |
| 代码结构与复杂度 | 8 | 10 | Cookie 域名/代理兼容逻辑集中在 `lib/auth.ts`，认证 Route 控制流可读；但 Profile PATCH 同时负责城市解析、自动时区和事务更新，Cookie 头手工序列化增加变更面。[auth.ts](../../lib/auth.ts#L83) [me/route.ts](../../app/api/auth/me/route.ts#L63)（E2） |
| 抽象与复用 | 7 | 8 | `verifySession`、`requireCurrentUser`、Email adapter、密码和 Geo helper 有单一落点；密码恢复写入现由 `resetPasswordWithToken()` 统一持有 token claim、User 与 Session 事务边界。三条 LLM adapter 路径仍没有统一错误/隐私契约。[password-reset.ts](../../lib/password-reset.ts#L40) [provider.ts](../../lib/email/provider.ts#L182)（E2/E3） |
| 数据流与状态一致性 | 12 | 12 | Session 替换、密码恢复和注册容量均由各自稳定行锁/条件 claim 保护，并把相关跨写收敛到单一事务；注册 loser 不会留下 User、UserProfile、RoomParticipant 或 Session。[auth.ts](../../lib/auth.ts#L255) [register/route.ts](../../app/api/auth/register/route.ts#L39-L88) [registration-capacity.integration.test.ts](../../tests/integration/registration-capacity.integration.test.ts#L77-L188)（E2/E3） |
| 接口与依赖关系 | 8 | 10 | 外部请求经过 Zod，受保护接口复用认证入口，Email/Geo 有 adapter；代理头信任、档案润色的直接 HTTP 调用和 reset 错误契约仍缺少集中边界。[validation.ts](../../lib/validation.ts#L5) [geo-ip.ts](../../lib/geo-ip.ts#L47) [refine-note/route.ts](../../app/api/profile/refine-note/route.ts#L51)（E2） |
| 健壮性、并发与生命周期 | 14 | 14 | Session 签发、密码恢复和注册容量的已知并发临界区均被数据库原子边界保护；真实 PostgreSQL 覆盖竞争、旧 Cookie 失效、token 单消费、Room 最终槽位、Participant 写入故障和恢复重试。[session-issuance.integration.test.ts](../../tests/integration/session-issuance.integration.test.ts#L104) [password-reset-security.integration.test.ts](../../tests/integration/password-reset-security.integration.test.ts#L55) [registration-capacity.integration.test.ts](../../tests/integration/registration-capacity.integration.test.ts#L77-L188)（E3） |
| 性能与资源使用 | 6 | 8 | Session 和 reset 过期清理有索引且集中由 Worker 执行，Geo 查询有 3 秒 deadline；Session 行锁仅按相关用户局部串行。进程内 rate limit 在多实例不共享，`getCurrentUser()` 每次都做完整 Profile 查询并可能启动后台 Geo 请求。[schema.prisma](../../prisma/schema.prisma#L112) [rate-limit.ts](../../lib/rate-limit.ts#L1) [auth.ts](../../lib/auth.ts#L356)（E2） |
| 安全与隐私 | 8 | 10 | Cookie HMAC/timing-safe 校验、HttpOnly/SameSite、密码 hash、CSRF Origin 和 profile 资源边界有效；PasswordResetToken 只保存 `v1:sha256` digest，迁移主动失效旧 bearer 记录。可信代理头、认证/邮件日志标识和档案外发治理仍开放。[schema.prisma](../../prisma/schema.prisma#L126) [migration.sql](../../prisma/migrations/20260907195500_secure_password_reset_tokens/migration.sql#L1) [logout/route.ts](../../app/api/auth/logout/route.ts#L17)（E2/E3） |
| 可测试性与验证可信度 | 8 | 8 | Session、密码恢复与注册容量均有 Route Handler + 真实 PostgreSQL 竞争/故障回归；修复前容量用例稳定得到 200/200，修复后为 200/409 且 loser 无身份孤儿数据。完整门禁单次通过 12 文件/29 项集成与 9/9 Playwright。[registration-capacity.integration.test.ts](../../tests/integration/registration-capacity.integration.test.ts#L77-L188) [session-issuance.integration.test.ts](../../tests/integration/session-issuance.integration.test.ts#L104)（E3） |
| 可维护性、演进与技术债 | 5 | 6 | 认证服务边界和稳定 Cookie 名称利于演进；但 `sessionVersion` 仍是未使用字段，heartbeat 注释仍描述旧语义，`lib/auth.ts.backup`、过时的 `migrate-session.js` 和空 logout 工件增加误用成本。[schema.prisma](../../prisma/schema.prisma#L84) [SessionHeartbeat.tsx](../../components/auth/SessionHeartbeat.tsx#L8) [migrate-session.js](../../migrate-session.js#L7)（E2） |
| **总计** | **87** | **100** | `11 + 8 + 7 + 12 + 8 + 14 + 6 + 8 + 8 + 5 = 87` |

## Level Gate

### 已通过

- 基础身份入口：受保护页面/API 通过 `getCurrentUser()`、`requireCurrentUser()` 或 `requirePageUser()`，资源模块仍负责成员/所有权复核。[auth.ts](../../lib/auth.ts#L356)（E2）
- Cookie 签名和数据库 Session 一致性基础：Cookie payload 经过 HMAC 与过期校验，Session 再回查数据库；Cookie 为 HttpOnly、SameSite=Lax，并按路径设置 no-store。[auth.ts](../../lib/auth.ts#L171) [api.ts](../../lib/api.ts#L10)（E2）
- Session 单活跃签发：登录与注册共用 `createSessionCookie()`；内部按受影响用户 ID 固定顺序取得 PostgreSQL 行锁，在同一事务内删除旧 Session 并创建新 Session，并对 P2034 有界重试。真实 PostgreSQL 证明并发登录最终仅一条 Session、两个 Cookie 恰为 200/401，插入故障会完整回滚（E3）。
- 密码与输入边界：登录对未知邮箱执行 dummy bcrypt，注册/登录/Profile 输入使用 Zod，密码长度由环境配置约束。[password.ts](../../lib/password.ts#L5) [validation.ts](../../lib/validation.ts#L5)（E2）
- 密码恢复存储与消费：只持久化版本化 digest；同一事务内条件 claim、更新密码并失效 Session。真实 PostgreSQL 证明并发恰有一个成功、故障完整回滚且 token 可重试（E3）。
- 注册容量原子性：注册事务先按默认 slug 对 Room 执行 `FOR UPDATE`，再读取占用和锁内 `maxHumanUsers`；真实 PostgreSQL 证明已有 1 名成员时两个并发请求恰为 200/409、最终 Participant=2，loser 无 User/Profile/Session，Participant 故障会完整回滚且可重试。[register/route.ts](../../app/api/auth/register/route.ts#L39-L88) [registration-capacity.integration.test.ts](../../tests/integration/registration-capacity.integration.test.ts#L77-L188)（E3）
- 正向通用验证：`npm run check:full` 单次退出 0，59 文件/346 项 Vitest、生产构建、覆盖率、12 文件/29 项 PostgreSQL 和 Playwright 9/9 全部通过（E3）。

### 未通过或受限

- 当前没有触发 Gate 降级的开放 P0/P1；Session、密码恢复和注册容量的最高风险并发/故障路径均有 E3，因此 Gate Level 为 L4。
- 原始分数仍受可信代理、敏感日志和旧认证工件三个 P2 约束，Score Level 为 L3。

最终等级：`min(Score Level L3, Gate Level L4) = L3`。

## Critical Issues

### P0

当前无开放 P0。现有证据没有确认可现实触发的权限绕过、不可恢复数据损坏或关键启动路径整体不可用。

### P1

#### QAM-01-001 — 单活跃 Session 的失效与创建不是原子操作（resolved）

- **原问题**：`createSessionCookie()` 先对用户执行事务外 `deleteMany`，随后再 `session.create`。两个并发登录可同时完成删除并各自创建 Session；新记录插入失败还会永久提交旧 Session 删除。
- **已实施修正**：[`replaceActiveSession()`](../../lib/auth.ts#L255-L318) 对目标用户和当前浏览器可能切换出的旧用户按 ID 固定顺序执行 `SELECT ... FOR UPDATE`，随后在同一 Prisma transaction 内删除相关旧 Session、删除目标用户 Session 并创建新 Session。只有 Prisma `P2034` 事务冲突/死锁会最多重试 3 次；登录、注册和 `setSessionCookie()` 均继续通过统一 `createSessionCookie()` 入口签发（E2）。
- **验收证据**：[`session-issuance.integration.test.ts`](../../tests/integration/session-issuance.integration.test.ts#L104-L201) 用真实 PostgreSQL insert delay trigger 稳定复现旧实现最终 2 条 Session，修复后两个登录都返回 200、最终仅 1 条 Session，两个响应 Cookie 访问 `/api/auth/me` 恰为 200/401；insert failure trigger 证明替换失败时旧 Session 保留，注册入口签发的 Cookie 可访问受保护端点（E3）。
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

#### QAM-01-004 — 注册房间容量检查无法防止并发超员（resolved）

- **原问题**：注册事务在 `roomParticipant.count()` 后按结果决定角色并插入 Participant，但没有锁定 Room、条件更新或数据库容量约束。已有 1 名成员时两个并发注册都可读到 `occupied=1`，最终产生 3 名成员。
- **已实施修正**：注册事务内按 `DEMO_ROOM_SLUG` 读取并 `FOR UPDATE` 锁定 Room，再基于锁内的 `maxHumanUsers` 重新计数、创建 User/Profile 和 RoomParticipant；Room 不存在、已满或 Participant 写入失败都会回滚同一事务，现有邀请码、角色和 HTTP 200/409/500 契约不变。[`register/route.ts`](../../app/api/auth/register/route.ts#L39-L88)（E2）
- **验收证据**：[`registration-capacity.integration.test.ts`](../../tests/integration/registration-capacity.integration.test.ts#L77-L188) 用 Participant insert delay trigger 在修复前稳定得到 200/200；修复后同一真实 PostgreSQL 场景恰为 200/409、Participant 保持 `maxHumanUsers=2`，loser 无 User/Profile/Session。独立 insert failure trigger 证明 User/Profile/Participant/Session 均不残留，移除故障后同一邮箱可成功注册为 owner 并获得 Session（E3）。
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
- **证据**：[`migrate-session.js`](../../migrate-session.js#L7-L25) 引用旧 `token` 列（E2）；[`lib/auth.ts.backup`](../../lib/auth.ts.backup#L65-L99) 与当前 [`lib/auth.ts`](../../lib/auth.ts#L249-L347) 语义不同（E2）；`rg` 未发现当前入口引用，且 `package.json` scripts 不含该脚本（E2）。
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
  → 按用户行锁 → 单事务 Session.deleteMany + Session.create → HMAC Cookie
  → getCurrentUser：Cookie HMAC + Session DB + User/Profile
       ↘ fire-and-forget Geo IP claim → 外部 ip-api → UserProfile auto 更新
       ↘ Agent Context → profileNote → 外部 LLM（按产品设计提供背景）

forgot-password → 原 token 只进入 Email link + v1:sha256 digest 持久化
reset-password → bcrypt → 单事务条件 claim digest → update User → delete Sessions
```

当前健康边界是：密码 hash、Cookie 签名、Session DB 回查、Session 原子签发、Zod、Room 锁保护的注册容量和密码恢复原子消费均有明确事实源与风险匹配 E3。Profile note 进入 Agent/LLM 是既定接口，不在本报告扩展产品策略；本报告只登记其错误/日志缺少敏感数据治理的直接证据，并将 Trace payload 的通用治理关联给 QAM-08。

## Verified Strengths

- Session Cookie 使用随机 Session ID 加 HMAC payload，验证时检查签名长度、timing-safe equality、过期时间和数据库 Session；Cookie 为 HttpOnly、SameSite=Lax，并按请求路径添加 no-store。[`lib/auth.ts`](../../lib/auth.ts#L165-L207) [`lib/api.ts`](../../lib/api.ts#L10-L17)（E2）
- 登录对不存在用户执行 dummy bcrypt comparison，降低邮箱枚举的时序差异；注册/登录/Profile 输入均经过 schema 校验。[`lib/password.ts`](../../lib/password.ts#L5-L22) [`lib/validation.ts`](../../lib/validation.ts#L5-L28)（E2）
- 注册的默认 Room 行锁、容量判断、User、嵌套 UserProfile 和初始 RoomParticipant 在一个 Prisma transaction 内完成；并发最终槽位和 Participant 故障回滚均有真实 PostgreSQL 证据。[`register/route.ts`](../../app/api/auth/register/route.ts#L39-L88) [`registration-capacity.integration.test.ts`](../../tests/integration/registration-capacity.integration.test.ts#L77-L188)（E2/E3）
- Session 替换将受影响用户锁、旧 Session 删除和新 Session 创建收敛到一个可重试事务；两个并发登录最终只有一个 Cookie 保持授权，插入故障不会留下已删除的旧 Session。注册入口继续使用同一签发边界（E3）。
- forgot-password 对不存在邮箱返回相同成功消息，Email provider 失败不会回显枚举信息；Geo provider 有公网 IP 过滤、3 秒 AbortSignal 和失败隔离。[`forgot-password/route.ts`](../../app/api/auth/forgot-password/route.ts#L27-L55) [`geo-ip.ts`](../../lib/geo-ip.ts#L40-L59)（E2）
- 密码恢复数据库不再保留可直接提交的 bearer token；并发单消费、过期/未知拒绝、Session 全失效和故障回滚由 4 项真实 PostgreSQL Route Handler 测试覆盖（E3）。
- `npm run check:full` 单次退出 0；59 文件/346 项 Vitest、生产构建、覆盖率、12 文件/29 项真实 PostgreSQL 与 9 项 Playwright 通过（E3）。

## Recommended Improvements

1. 处理 `QAM-01-005` 与 `QAM-01-006`：把可信代理、Host/Origin 和日志脱敏纳入配置/适配层，保持错误类别稳定且不泄露内部详情。
2. 清理 `QAM-01-007`：删除/归档旧认证工件并验证迁移、构建和路由枚举；不要借此扩大认证功能或重构其他 QAM。

## Sustainable Review Record

### 开放问题

| ID | Priority | Status | 首次证据 | 复审触发条件 |
|---|---|---|---|---|
| QAM-01-005 | P2 | open | 代理头直接读取（E2） | 代理拓扑、Host/Origin 或 Cookie 部署变化 |
| QAM-01-006 | P2 | open | logout/email/provider/refine 日志和错误（E2） | 日志脱敏、错误契约或 Trace 隐私治理变化 |
| QAM-01-007 | P2 | open | 未接入旧认证工件（E2） | 删除/归档工件、迁移路径或交付脚本变化 |

### 已解决问题

| ID | Priority | Status | 解决证据 | 复审触发条件 |
|---|---|---|---|---|
| QAM-01-001 | P1 | resolved | 按用户固定顺序行锁 + Session 删除/创建同事务 + P2034 有界重试；真实 PostgreSQL 并发登录、Cookie 200/401、插入故障回滚与注册签发回归（E2/E3） | Session transaction、登录/注册签发入口、Cookie 验证或 Session 策略变更 |
| QAM-01-002 | P1 | resolved | tokenDigest schema + 旧 bearer 失效迁移；真实 PostgreSQL 证明原 token 不落库（E2/E3） | token schema、创建/邮件链接或备份边界变更 |
| QAM-01-003 | P1 | resolved | 条件 claim + User/Session 同事务；并发 200/400 与 trigger 故障回滚（E3） | reset transaction、Session 失效或恢复 Route 变更 |
| QAM-01-004 | P1 | resolved | 默认 Room `FOR UPDATE` + 锁后容量判断与 User/Profile/Participant 同事务；真实 PostgreSQL 并发 200/409、容量上限、loser 无身份孤儿数据与 Participant 故障回滚（E2/E3） | 注册事务、默认 Room 容量、RoomParticipant 写入或房间加入策略变更 |

### 复审规则

- 问题状态只使用 `open`、`resolved`、`accepted-risk`、`not-reproduced`；已解决 ID 不删除。
- 只有真实 PostgreSQL/浏览器行为证据能关闭相应并发、token 消费和关键旅程问题；单元 mock 不替代数据库语义。
- 跨模块修正只在直接责任报告保留稳定 ID；QAM-02/QAM-08/QAM-09 通过关联问题记录各自直接证据。
- 初审 2026-09-06 的 Playwright 曾因缺少 `libnspr4.so` 受阻，2026-09-07 又曾受用户开发服务的 `.next/dev/lock` 阻塞；2026-09-08 当前仓库的 `npm run check:full` 已单次退出 0，包含 Playwright 9/9。

### 评分历史（只追加）

| 日期 | Score | Score Level | Gate | Final | Delta | 变更证据 |
|---|---:|---|---|---|---|---|
| 2026-09-06 | 68 | L1 | L1 | L1 | baseline | 初审：当前源码/schema；QAM 单元 50 项、真实 PostgreSQL 集成 17 项、快速门禁 344 项通过；身份竞态/reset/容量 E3 未运行，Playwright 受 `libnspr4.so` 环境阻塞 |
| 2026-09-07 | 76 | L2 | L1 | L1 | `+8（QAM-01-002/003 resolved）` | PasswordResetToken 改存版本化 digest 并迁移失效旧 bearer；条件 token claim、密码更新和 Session 失效同事务。回归修复前证明原 token 落库、并发 200/200 和故障后部分改密，修复后真实 PostgreSQL 4/4 覆盖 digest、并发 200/400、过期/未知拒绝、Session 失效和 trigger 回滚。`npm run check`、10 文件/24 项集成与隔离副本 Playwright 9/9 通过。 |
| 2026-09-07 | 83 | L3 | L1 | L1 | `+7（QAM-01-001 resolved）` | Session 签发按受影响用户固定顺序行锁，在同一可重试事务内失效旧 Session 并创建新 Session。修复前真实 PostgreSQL 回归证明并发登录留下 2 条 Session 且插入故障会丢失旧 Session；修复后 3/3 覆盖最终单活跃、Cookie 200/401、故障回滚和注册签发。`npm run check`、11 文件/27 项集成与隔离副本缓存预热后 Playwright 9/9 通过。 |
| 2026-09-08 | 87 | L3 | L4 | L3 | `+4（QAM-01-004 resolved）` | 注册事务内锁定默认 Room 后重新计算容量，并把 User/Profile/Participant 写入保持在同一原子边界。修复前真实 PostgreSQL 得到并发 200/200，修复后 2/2 覆盖 200/409、Participant 不超 2、loser 无 User/Profile/Session、Participant trigger 故障回滚和成功重试；`npm run check:full` 单次通过 12 文件/29 项集成与 Playwright 9/9。 |
