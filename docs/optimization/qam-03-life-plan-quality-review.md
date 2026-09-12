# QAM-03 双人生活信息与计划管理工程质量审查

## 元数据

| 项目 | 内容 |
| --- | --- |
| QAM | QAM-03 双人生活信息与计划管理 |
| 快照日期 | 2026-09-12 |
| 审查 Skill | [`xoxo-qam-03-life-plan-review`](../../.agents/skills/xoxo-qam-03-life-plan-review/SKILL.md) |
| 标准版本 | [`module-quality-review-standard.md`](./module-quality-review-standard.md) v1.0.0 |
| 范围来源 | [`PROJECT_VIEW.md`](../../PROJECT_VIEW.md) 的 QAM-03、Cross-cutting Concerns、共享映射、BU-03/BU-04 与 Quality Tracking Index；[`AGENTS.md`](../../AGENTS.md) |
| 本轮 Delta | `+5`（QAM-03-004 resolved；85→90） |
| 当前基线命令 | 开始 `./init.sh`：退出 0，72 文件/472 项 Vitest；实现后 `npm run check:quick`：退出 0，72 文件/480 项；最终 `check:full` 单次退出 0，含 production build、覆盖率 48.26/42.98/53.55/49.14、20 文件/63 项真实 PostgreSQL 与 30/30 Playwright |
| 风险匹配命令 | 修复前 one-shot/Tool contract 定向回归 2 文件/50 项中 6 项失败：resolver 在 Asia/Shanghai 与 America/Los_Angeles 进程中分别把同一无 offset 值解释为不同绝对时刻，四组 Agent create/update 非法 trigger 越过 Registry validation；修复后同命令 50/50。真实 PostgreSQL 定向 11/11，回读 Agent create/update 与 Route 的 `nextRunAt`、`cron`、`runOnce`；完整门禁 72/480、20/63、30/30 全部通过 |
| 证据纪律 | E3 为本轮实际执行的测试/可复现实验；E2 为源码、schema、迁移与测试交叉证据；未把 mock 结果写成真实 PostgreSQL 或浏览器验证 |

## Overall

| 指标 | 结果 |
| --- | --- |
| Score | **90 / 100** |
| Score Level | **L4** |
| Gate Level | **L4** |
| Final Level | **L4** |
| Trend | `+5`（QAM-03-004 resolved） |
| Evidence Confidence | 高（一次性 trigger 的合法/非法输入具有跨进程 TZ、Tool Registry 与真实 PostgreSQL Route/Agent parity E3；active cap 和参与者身份既有 E3 继续通过，剩余两项 P2 有可执行/源码证据） |

QAM-03-004 已关闭：HTTP 与 Agent `schedule.create/update` 复用同一 offset datetime 及 trigger 组合谓词，Tool Registry 在 execute/`ScheduledJob` 写入前拒绝无 offset 和 `fireAt+cron`，resolver 仍保留防御性校验。跨进程 TZ 与真实 PostgreSQL E3 证明合法 offset 始终解析为同一绝对时刻；字段约束漂移和表单可访问名称缺口仍分别作为 QAM-03-005/006 开放。当前无开放 P0/P1，开放 P2×2。

## Score Breakdown

| 维度 | Score | Max | Finding / Evidence |
| --- | ---: | ---: | --- |
| 架构与责任边界 | 13 | 14 | `lib/scheduled-job-authoring.ts` 拥有 cap/原子写入，`lib/scheduled-job-one-shot.ts` 同时拥有 trigger contract 与时间派生，`lib/participant-resolution.ts` 统一 UI/Agent 身份解析（E2/E3）；Memo/Schedule 字段上限仍平行维护（QAM-03-005）。 |
| 代码结构与复杂度 | 8 | 10 | CRUD、cron、天气和客户端交互均可定位；主要复杂度来自 Route/Tool 平行分支，而非业务本身（E2）。 |
| 抽象与复用 | 7 | 8 | active cap、Room 锁、一次性 trigger/时间派生和参与者解析已有共享实现；但 Memo/Schedule 输入上限尚无共享字段 contract，仍有可执行差异（E2/E3，QAM-03-005）。 |
| 数据流与状态一致性 | 12 | 12 | Room scope、active count/write transaction、显式参与者身份与 one-shot 绝对时刻一致；跨进程 TZ 和 PostgreSQL parity 证明合法 offset 不漂移，非法 trigger 不进入持久化（E3）。 |
| 接口与依赖关系 | 9 | 10 | Weather Route/Tool 的参与者目标一致，Schedule cap、offset datetime、trigger 组合与 one-shot 派生跨 HTTP/Agent 复用；Memo/Schedule 字段长度仍不一致（E3，QAM-03-005）。 |
| 健壮性、并发与生命周期 | 12 | 14 | Room 行锁、29→30 竞争、非法 cron/时区/过期或无 offset `fireAt`、`fireAt+cron`、参与者缺失和天气 timeout/fallback 均有失败控制；run-once 触发终态由 QAM-04 独立保护（E3）。 |
| 性能与资源使用 | 7 | 8 | Memo/Job 的 snapshot/Tool 查询有 room/index 与 take 边界，天气 cache 有 `MAX_CACHE_SIZE=500` 淘汰阈值；`who=both` 顺序请求天气是局部延迟成本（E2）。 |
| 安全与隐私 | 9 | 10 | 生活 Route 统一认证、成员校验和 roomId 归属检查；Memo/Job Tool 也检查资源所属房间，天气只读取房间参与者档案（E2）。 |
| 可测试性与验证可信度 | 8 | 8 | one-shot 正常/非法输入有 resolver、跨进程 TZ、Tool Registry 与真实 PostgreSQL Route/Agent create/update E3；参与者有组件/Agent/Route/Chromium E3。Cron/Timezone 可访问名称断言仍单独登记为 QAM-03-006。 |
| 可维护性、演进与技术债 | 5 | 6 | 共享 helper 让参与者、cap、trigger contract 与时间派生可导航；字段上限、Tool JSON contract 的其他字段和 ScheduledJob 更新矩阵仍需在平行入口同步（E2/E3）。 |
| **合计** | **90** | **100** | 算术精确合计。 |

## Level Gate

| 门禁 | 结果 | 证据与原因 |
| --- | --- | --- |
| 开放 P0 | 通过 | 未发现权限突破、不可恢复数据损坏、重复高风险副作用或支持启动路径整体失效。 |
| 开放 P1 且涉及权限、不可恢复错误、并发重复副作用或支持启动失效 | 通过 | 当前无开放 P1；QAM-03-004 已按原 ID 标为 resolved。 |
| 最高风险不变量有风险匹配行为验证 | 通过 | active cap、one-shot 绝对时刻与 Route/Agent parity 有真实 PostgreSQL E3；非法 trigger 有 Registry 前置拒绝，参与者身份有 Chromium E3。 |
| L4 要求 | 通过 | 无开放 P0/P1；最高风险边界具备失败路径、跨进程 TZ、真实数据库和完整浏览器门禁证据。 |
| **最终判定** | **L4** | Score Level=L4；Gate Level=L4；Final Level=min(L4,L4)=L4。 |

## Critical Issues

### P0

当前无开放项。

### P1

当前无开放项。

### P2

#### QAM-03-005：Memo/Schedule 的 Route 与 Agent 字段约束已发生可执行漂移

- **状态**：`open`。
- **问题**：HTTP Memo schema 把 title/content 限为 200/8000（[`validation.ts`](../../lib/validation.ts#L53)），Schedule description 限为 200（[`validation.ts`](../../lib/validation.ts#L71)）；Agent contract 则分别允许 500/20000 与 500（[`tool-contracts.ts`](../../agent/tool-contracts.ts#L33)）。Tool 实现把验证后的值直接写入 Memo 或 Job payload（[`memo-tool.ts`](../../agent/tools/memo-tool.ts#L63)、[`schedule-tool.ts`](../../agent/tools/schedule-tool.ts#L146)），两条入口没有共享字段约束。
- **证据**：本轮使用当前 schema/contract 执行 create 与 update 对照：Memo title 300、content 9000、Schedule description 300 在 HTTP create/patch schema 中均为 `false`，在对应 Agent create/update contract 中均为 `true`（E3）。组件又以 `maxLength=200/8000/200` 呈现这些字段（[`LifePanelModals.tsx`](../../components/chat/LifePanelModals.tsx#L76)），因此 Agent 写入的合法值不能原样经 UI 保存（E2）。
- **质量影响**：同一实体的合法状态取决于写入入口；Agent 能制造 UI/HTTP 无法 round-trip 的 Memo/Job，后续任何小改动都必须先人工缩短内容。约束继续独立演进时还会再次产生 Route/Tool 漂移。
- **最小修正**：在 QAM-03 `lib/` 边界导出共享字段常量或 Zod fragments，由 HTTP schema、Tool contract 与组件属性共同引用；选定当前产品既有上限之一并明确兼容已有较长记录，不新增字段或实体。
- **验收证据**：参数化 contract 测试对 create/update 两条入口逐一断言边界值、边界+1、trim 与 nullable description；真实 PostgreSQL 回读证明 Agent 创建的合法记录可在 HTTP PATCH 原样保存。
- **影响范围**：QAM-03 直接受影响；QAM-08 只消费 QAM-03 提供的 Tool contract。

#### QAM-03-006：Cron 与时区表单控件缺少可访问名称

- **状态**：`open`。
- **问题**：[`CronBuilder`](../../components/chat/CronBuilder.tsx#L69) 的“执行时间”文本未通过 `htmlFor`/`aria-*` 关联到小时、分钟两个 number input，两个输入本身也没有可区分名称；[`TimezoneSelector`](../../components/chat/TimezoneSelector.tsx#L19) 的 label 同样没有关联 select。可见文字存在，但辅助技术无法确定三个表单控件的用途，且不满足仓库“表单字段必须绑定可查询 label”的约束。
- **证据**：源码直接显示 label 无 `htmlFor`，input/select 无 `id`、`aria-label` 或 `aria-labelledby`（E2）；现有 [`life-panel-modals.test.tsx`](../../tests/component/life-panel-modals.test.tsx) 只能以无 name 的 `getByRole("combobox")` 查询时区，未验证可访问名称（E2）。
- **质量影响**：键盘仍能聚焦，但屏幕阅读器用户无法辨认小时、分钟和时区字段；未来加入同类控件时，测试也不能通过语义名称稳定定位。
- **最小修正**：为时区 select 绑定稳定 `id/htmlFor`，为小时/分钟提供独立 label 或 `aria-label`，并用 `fieldset/legend` 保留“执行时间”分组语义；可同时为日期快捷按钮暴露 `aria-pressed`，不改变视觉和 cron 规则。
- **验收证据**：组件测试用 `getByRole("spinbutton", { name: /小时|分钟/ })` 与 `getByRole("combobox", { name: "时区" })` 查询并完成纯键盘修改；axe 或等价语义检查不再报告 form control 缺 label。
- **影响范围**：QAM-03 UI；共享可访问性规范属于 Cross-cutting，不影响 Agent、schema 或 QAM-04。

### Resolved — QAM-03-004：Agent Schedule 接受无 offset 的 `fireAt` 并按 Worker 时区持久化错误时刻

- **状态**：`resolved`。
- **修正**：[`lib/scheduled-job-one-shot.ts`](../../lib/scheduled-job-one-shot.ts) 导出 offset datetime schema 与 trigger 组合谓词；[`lib/validation.ts`](../../lib/validation.ts) 和 [`agent/tool-contracts.ts`](../../agent/tool-contracts.ts) 共同引用，create 要求 `fireAt`/`cron` 恰一，update 禁止二者同时出现。resolver 自身也先校验 offset，再构造 `Date`，不会依赖 Worker `TZ` 猜测业务时刻。合法 offset、五分钟宽限、cron 合成与 QAM-04 触发策略未改。
- **验收证据**：修复前新增的 resolver/Registry 定向套件 2 文件/50 项中 6 项失败：Asia/Shanghai 与 America/Los_Angeles 子进程把无 offset 值解释为不同绝对时刻，四组 Agent create/update 非法 trigger 越过 validation；修复后 50/50。合法 `2030-05-09T20:40:00+01:00` 在两个进程均解析为 `19:40Z`，无 offset 均抛 `ScheduledJobFireAtError`；Registry 对 create/update 的无 offset 与 `fireAt+cron` 均抛 `ToolValidationError`，execute 未调用且无 `ScheduledJob` 写入（E3）。真实 PostgreSQL [`scheduled-job-one-shot-fireat.integration.test.ts`](../../tests/integration/scheduled-job-one-shot-fireat.integration.test.ts) 11/11，回读 Agent create/update 与 Route POST/PATCH 的 `nextRunAt`、`cron`、`payload.runOnce` 一致，并确认四组非法 Agent 输入不改变原 Job、无 ToolCall（E3）。
- **完整门禁**：`check:full` 单次退出 0，含 72 文件/480 项 Vitest、Next.js production build、覆盖率 48.26/42.98/53.55/49.14、20 文件/63 项真实 PostgreSQL 与 30/30 Playwright。QAM-03-005/006 保持独立开放。
- **影响范围**：QAM-03 负责 trigger 输入与持久化语义；QAM-08 Registry 继续只负责通用 validation/execution，QAM-04 继续消费已验证 Job，未修改其 CAS、missed-window 或派生策略。

### Resolved — QAM-03-003：UI 与 Agent 以参与者数组位置推断本人/伙伴

- **状态**：`resolved`。
- **修正**：新增 [`lib/participant-resolution.ts`](../../lib/participant-resolution.ts) 作为无框架依赖的身份解析事实源；ID 缺失或无法匹配时同时返回空 self/partner，不以数组顺序猜测。[`ChatApp.tsx`](../../components/chat/ChatApp.tsx) 将 `currentUser.id` 传入 LifePanel，LifePanel 与 ScheduledJobModal 按 ID 排列本人/伙伴并选择本人的默认时区；Agent weather/timezone/schedule Tool 用 `requestedById` 调用同一 helper，显式 city/timezone/label 仍优先。
- **验收证据**：未修复组件负向对照 2/5，第二参与者仍显示 Alice/Bob 且计划默认 Asia/Shanghai；未修复 Agent 负向对照 2/6，伙伴天气错误取 London、timezone.compare 错把 Alice/Shanghai 当本人。修复后相关组件 7/7、Agent/Server 4 文件/35 项通过；[`weather-participant-resolution.test.ts`](../../tests/server/weather-participant-resolution.test.ts) 证明 Route 与 Tool 对第二参与者的伙伴均解析为 Alice/Shanghai。真实 Chromium [`authenticated.spec.ts`](../../tests/e2e/authenticated.spec.ts) 以第二参与者独立登录，验证伙伴天气为第一参与者 Tokyo、本人时间排在伙伴之前、计划默认 Europe/London；空 Cookie request context 防止单活 Session 污染后续用例，完整 Playwright 29/29（E3）。
- **影响范围**：QAM-03 直接受影响；参与者排序、QAM-02 RoomSnapshot transport、QAM-04 调度触发、schema/migration 均未改。

### Resolved — QAM-03-001：一次性任务编辑的 `fireAt` 被 PATCH 契约静默丢弃

- **状态**：`resolved`。
- **修正**：[`lib/scheduled-job-one-shot.ts`](../../lib/scheduled-job-one-shot.ts) 成为一次性时间语义的单一来源（`fireAt` 解析、五分钟宽限、`nextRunAt`、合成 cron、合法 cron 优先），[`lib/zoned-time.ts`](../../lib/zoned-time.ts) 提供墙上时间与时刻的双向换算；[`scheduledJobPatchSchema`](../../lib/validation.ts#L84) 增加 `fireAt` 与"不可与 cron 同时提供"的 refine，[`[jobId]/route.ts`](../../app/api/rooms/%5BroomId%5D/scheduled-jobs/%5BjobId%5D/route.ts) 按显式状态转移矩阵写入，Agent `schedule.update` 的 [`tool-contracts.ts`](../../agent/tool-contracts.ts) 契约与 [`schedule-tool.ts`](../../agent/tools/schedule-tool.ts) 同步增加 `fireAt`，编辑弹窗按任务时区显示与提交墙上时间。Route 不再从 `agent/tools` 导入，分层倒置一并消除。
- **验收证据**：真实 PostgreSQL [`scheduled-job-one-shot-fireat.integration.test.ts`](../../tests/integration/scheduled-job-one-shot-fireat.integration.test.ts) 9/9，断言 PATCH 后 `nextRunAt`/`cron`/`payload.runOnce` 持久化回读、仅改 prompt 不移位、once→recurring 按 cron 重算、过期与非法输入 400，并断言 Route 与 Agent `schedule.update` 在同一 `fireAt` 上得到相同 `nextRunAt`/`cron`（E3）。组件层 [`life-panel-modals.test.tsx`](../../tests/component/life-panel-modals.test.tsx) 以 MSW 捕获 PATCH body：负向对照在未修复组件上 3/4 失败（显示 `2026-08-28T01:30` 而应为 `09:30`，保存后时刻偏移 −480 分钟），修复后 4/4（E3）。`tests/lib` 覆盖墙上时间往返、DST 歧义与缺口、宽限/非法/合法分支（E3）。
- **影响范围**：QAM-03 直接受影响；QAM-04 只获得语义自洽的触发输入，claim/CAS 与派生未改。
- **遗留核对**：合成 cron 描述用户请求的时刻而非宽限后推的 `nextRunAt`，两者在“已过期但仍在五分钟宽限内”时相差数秒；Job 为 `runOnce`，触发时即禁用，不影响结果。原关联的 QAM-04-002 已在 feat-046 解决超出 missed window 后次日重放问题，本轮没有把 Scheduler 责任重新登记到 QAM-03。

### Resolved — QAM-03-002：计划数量上限非原子且跨入口不一致

- **状态**：`resolved`。
- **修正**：[`scheduled-job-authoring.ts`](../../lib/scheduled-job-authoring.ts) 将 30 条 cap、Room `FOR UPDATE` 锁、active count、create 以及 disabled→enabled 判定收敛为单一事务服务。Route POST/PATCH 显式开启 Prisma interactive transaction，Agent `schedule.create/update` 复用 Tool Registry 已有的副作用事务；Agent update 不再可绕过 cap。
- **验收证据**：[`scheduled-job-active-cap.integration.test.ts`](../../tests/integration/scheduled-job-active-cap.integration.test.ts) 在真实 PostgreSQL 中对 enabled INSERT/UPDATE 注入延迟。去掉 Room 行锁的负向对照 0/2，Route/Agent create 与 re-enable 都同时成功；恢复锁后 3/3，两类竞争均恰一成功/恰一冲突、active count=30、无孤儿 Job，已启用 Job 在满额时仍可由 Route/Agent 编辑（E3）。全量 PostgreSQL 18 文件/48 项及 `check:full` 通过，QAM-04 Scheduler 回归未变。
- **影响范围**：QAM-03 直接受影响；QAM-04 只获得受 cap 保护的扫描输入，触发 CAS/派生未改；QAM-08 只复用现有 Tool 事务边界。

## Architecture and Data Flow

```text
当前用户
  ├─ ChatApp(initial RoomSnapshot)
  │    └─ LifePanel / Modal ──HTTP──> Memo/Job/Weather Routes ──> Prisma / weather adapter
  └─ AgentTask Runtime
       └─ buildAgentContext ──> memo/schedule/timezone/weather Tool ──> Prisma / weather adapter

ScheduledJob definition (QAM-03) ──> scheduler-tick CAS/dispatch (QAM-04)
Tool registration/deadline/retry/approval (QAM-08) 包裹生活 Tool，但不拥有生活规则。
```

事实源是 Prisma `Memo` 与 `ScheduledJob`；RoomSnapshot、Agent context 和客户端 modal 是派生视图/输入。Route 在入口处认证并 `assertRoomAccess`，资源 Route 和生活 Tool 再校验目标记录的 `roomId`；天气使用进程内 location/weather TTL cache，并在 QWeather 失败时返回标识为 mock 的降级结果。ScheduledJob 的 offset datetime schema、create XOR、update at-most-one 与正常时间派生由 `lib/scheduled-job-one-shot.ts` 共享；HTTP/Agent 在入口复用 contract，resolver 再防御性校验，随后 create/re-enable 经 authoring service 进入 Room 行锁串行化的 count-and-write。Route 自己开启 transaction，Agent Tool 使用 QAM-08 Executor 已有 transaction。LifePanel/Modal 的 `currentUserId` 与 Tool context 的 `requestedById` 均进入 `lib/participant-resolution.ts`，数组排序只用于稳定展示/上下文，不承担身份协议。ScheduledJob 到期 claim、任务派生和触发失败计数留给 QAM-04；Tool 通用 executor/审批/trace 留给 QAM-08。

## Verified Strengths

- Memo、ScheduledJob、Weather Route 都先调用 `requireCurrentUser` 与 `assertRoomAccess`；Memo/Job 单记录 Route 和对应 Agent Tool 都再次核对 `roomId`，形成房间隔离的双重边界（E2）。
- ScheduledJob active cap 已由共享 service 统一应用于 Route POST/PATCH 和 Agent create/update；真实 PostgreSQL 延迟触发器将原竞争窗口稳定放大，修复后证明 30 条上限、冲突语义和非 re-enable 编辑行为（E3）。
- Memo 输入、计划 body 和 Agent Tool 输入都有 Zod/运行时契约；计划 trigger 的 offset datetime 与组合谓词由 HTTP/Agent 共享，cron-parser 按 IANA timezone 解析，合法 offset `fireAt` 有五分钟宽限并强制 one-shot（E2/E3）。Memo/Schedule 字段上限差异仍单独登记为 QAM-03-005。
- 一次性计划的 trigger contract、`fireAt` 解析、宽限、`nextRunAt` 与合成 cron 只由 `lib/scheduled-job-one-shot.ts` 实现，Route POST/PATCH 与 Agent `schedule.create/update` 共用；跨进程 TZ 和真实 PostgreSQL 断言合法 offset 产生同一绝对时刻与 `cron`，避免入口或 Worker 环境再次漂移（E3）。
- HTTP 对不可解析/无 offset/超出宽限的 `fireAt`、`fireAt+cron`、非法 cron 和未知 IANA 时区有稳定 400；Agent Registry 对对应 contract 错误在 execute 前抛 `ToolValidationError`，不产生 `ScheduledJob` 写入（E3）。
- 客户端编辑弹窗的 `datetime-local` 墙面时间按任务时区的双向换算显示与提交，未改动字段直接保存不会移动触发时刻；组件回归在未修复组件上有 3/4 失败的负向对照（E3）。
- 参与者身份由 `currentUserId`/`requestedById` 驱动并复用纯函数解析；第二参与者的 UI 时间顺序、伙伴天气、计划默认时区以及 Agent weather/timezone 默认对象均有负向对照和修复后回归，Weather Route/Tool 结果一致，真实 Chromium 旅程覆盖后续 Session 隔离（E3）。
- Weather adapter 有 QWeather location/weather cache 与 `MAX_CACHE_SIZE=500` 淘汰阈值、8 秒无外部 signal 时 timeout；Agent signal 会传播，fallback 明确返回 `provider=mock` 和 `fallbackReason`（E2/E3）。
- LifePanel 的天气刷新在切房间时取消旧请求并清除 interval，且只接受当前 roomId 的结果；对应组件测试通过（E3）。
- QAM-04 的 Scheduler 已有独立 CAS/事务集成证据，本报告不把 scheduler 的触发执行问题重复登记为 QAM-03；QAM-08 的 Tool Executor/审批也不作为本模块缺陷。

## Recommended Improvements

1. **修复 QAM-03-005（P2）**：收敛 Memo/Schedule 的共享字段约束，再让 HTTP、Tool 与组件引用同一上限，消除不能跨入口 round-trip 的记录。
2. **修复 QAM-03-006（P2）**：为 CronBuilder 小时/分钟和 TimezoneSelector 建立可查询名称及分组语义，以键盘与语义查询回归验收。

以上均为既有 Memo/计划/天气边界的最小修正，不新增生活实体或产品能力。

## Sustainable Review Record

### 问题登记

| ID | Priority | 状态 | 首次发现 | 直接责任 | 关联责任 |
| --- | --- | --- | --- | --- | --- |
| QAM-03-001 | P1 | `resolved` | 2026-09-06 | QAM-03 UI/Job authoring/Route contract | QAM-04 触发时间输入 |
| QAM-03-002 | P1 | `resolved` | 2026-09-06 | QAM-03 Job authoring boundary | QAM-04 扫描输入；QAM-08 schedule Tool 入口 |
| QAM-03-003 | P1 | `resolved` | 2026-09-06 | QAM-03 UI/Tool participant resolution | QAM-01 profile source、QAM-02 snapshot transport |
| QAM-03-004 | P1 | `resolved` | 2026-09-12 | QAM-03 Schedule input/time semantics | QAM-08 Tool contract；QAM-04 触发输入 |
| QAM-03-005 | P2 | `open` | 2026-09-12 | QAM-03 Memo/Schedule field contracts | QAM-08 Tool contract |
| QAM-03-006 | P2 | `open` | 2026-09-12 | QAM-03 LifePanel form accessibility | Cross-cutting accessibility |

### 复审触发条件

- 修改 Memo/ScheduledJob/Weather Route、LifePanel/Cron/Timezone UI、`schedule-tool`/`weather-tool`/`timezone-tool`、`tool-contracts.ts` 或相关 validation/schema。
- QAM-04 修改 ScheduledJob trigger fields、timer/CAS，或 QAM-08 修改生活 Tool contract/执行边界。
- 新增真实 PostgreSQL 并发 cap、one-shot fireAt 和双人第二参与者浏览器旅程证据，或 Playwright 环境恢复后重跑生活旅程。

### 只追加评分历史

| 日期 | Score | Score Level | Gate | Final | Delta | 变更证据 |
| --- | ---: | --- | --- | --- | --- | --- |
| 2026-09-06 | 69 | L1 | L1 | L1 | `baseline` | 初审；定向 Agent/组件测试通过，`npm run check:quick` 通过；`npm run check:full` 的构建/真实 PostgreSQL 集成通过，Playwright 因 `libnspr4.so` 缺失未完成。 |
| 2026-09-10 | 81 | L3 | L2 | L2 | +12（QAM-03-002 resolved） | ScheduledJob authoring service 以 Room 行锁和单 transaction 统一 Route/Agent create/re-enable；真实 PostgreSQL 负向对照 0/2（无锁时均 `success/success`），修复后 3/3（恰一成功/冲突、active=30、无孤儿且 active edit 可用）；`check:full` 通过 18 文件/48 项 PostgreSQL 和 11/11 Playwright。QAM-03-001/003 仍开放，Gate/Final 为 L2。 |
| 2026-09-11 | 88 | L3 | L2 | L2 | +7（QAM-03-001 resolved） | 一次性时间语义收敛为单一事实来源 `lib/scheduled-job-one-shot.ts`（`fireAt` 解析、5 分钟宽限、`nextRunAt`、合成 cron）与 `lib/zoned-time.ts`（墙上时间双向换算），Route POST/PATCH 与 Agent `schedule.create/update` 共用同一实现，`fireAt` 一并进入 `scheduledJobPatchSchema` 与 `schedule.update` 契约（后者此前被 `.strict()` 契约静默剥离）；PATCH 新增 once→recurring 重算与状态转移矩阵。负向对照：未修复组件上 3/4 失败（显示 UTC `01:30`、未改动字段直接保存偏移 −480 分钟），修复后 4/4；真实 PostgreSQL 9/9，含 Route 与 Agent 在同一 `fireAt` 上产出相同 `nextRunAt`/`cron` 的防漂移断言。`check:full` 单次 exit 0：70 文件/457 项 Vitest、production build、覆盖率、19 文件/57 项 PostgreSQL 与 26/26 Playwright。QAM-03-003 仍开放，Gate/Final 为 L2。 |
| 2026-09-12 | 92 | L4 | L4 | L4 | +4（QAM-03-003 resolved） | `lib/participant-resolution.ts` 以显式 ID 统一 UI/Agent 的 self/partner，缺失或不匹配时不猜数组位置；LifePanel/Modal 使用 `currentUserId`，weather/timezone/schedule Tool 使用 `requestedById`。未修复组件 2/5、Agent 2/6 失败，修复后组件 7/7、Agent/Server 4 文件/35 项；Route/Tool 对第二参与者的伙伴结果一致，真实 Chromium 验证伙伴天气、时间顺序与本人默认时区。独立依赖隔离副本的 `check:full` 单次 exit 0：72 文件/466 项 Vitest、production build、覆盖率 48.18/42.99/53.42/49.10、19 文件/57 项 PostgreSQL 与 29/29 Playwright。 |
| 2026-09-12 | 85 | L3 | L2 | L2 | -7（全范围复审纠正遗漏） | feat-044 参与者实现与 9 文件/77 项定向回归仍通过，QAM-03-003 保持 resolved；可复现实验确认 Agent contract 接受无 offset `fireAt`，并在 Worker TZ 与业务 timezone 不同时把 London 20:40 错存为 12:40Z（应为 19:40Z），新增 QAM-03-004。create/update contract 对照另确认 Memo 300/9000 与 Schedule description 300 的 Route/Tool 接受范围分叉，新增 QAM-03-005；源码复核确认 Cron/Timezone 表单缺可访问名称，新增 QAM-03-006。本轮未改业务代码，未重复运行 Docker/全量门禁；根基线 `./init.sh` 72/472 已通过。 |
| 2026-09-12 | 90 | L4 | L4 | L4 | +5（QAM-03-004 resolved） | HTTP/Agent 共用 offset datetime 与 trigger 组合谓词，resolver 防御性拒绝无 offset。修复前 resolver/Registry 2 文件/50 项中 6 项失败，修复后 50/50；两个不同进程 TZ 对合法 offset 均得到 19:40Z，对无 offset 均拒绝。真实 PostgreSQL 11/11 回读 Route/Agent create/update 的 `nextRunAt`、`cron`、`runOnce` parity，并确认非法 Agent trigger 无 Job/ToolCall 副作用；`check:full` 单次 exit 0：72/480 Vitest、production build、覆盖率 48.26/42.98/53.55/49.14、20/63 PostgreSQL 与 30/30 Playwright。QAM-03-005/006 仍开放。 |

复审时保留上述 ID 和历史行；仅在当前代码或风险匹配证据变化时重算受影响维度，并重新核对 100 分合计、Gate 与 Final。
