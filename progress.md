# 进度日志

## Current State（当前状态）

Last Updated：2026-08-30。feat-012 至 feat-015 已按单 feature 工作流完成，原审查报告列出的 4 项 P0 全部关闭；最终完整门禁退出 0。复审分数由 49/100 提升至 74/100，但因缺少覆盖全部 Tool 的统一 Timeout，L2 Gate 未通过，最终等级仍为 L1。当前没有 `in-progress` feature。

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
