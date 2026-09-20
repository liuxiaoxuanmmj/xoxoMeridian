# 最新会话交接

## 当前进展

- Last Updated：2026-09-20。本轮实现 **feat-075**「Agent 时间线投影的持久化与失败恢复」（P2，无依赖，来源 QAM-05-004），状态已置 `done`。根列表 **22 项全部 done**：没有 `not-started`、`blocked` 或 `in-progress`，也没有遗留的下一个待办 feature。
- 缺陷（第一性原理）：**完成是持久事实，而它的投影不是**。[`agent/execution-tracer.ts`](agent/execution-tracer.ts) 的 `completeWithMessage` 先在 lease 事务内提交 final Message、final AgentStep、AgentTask 终态与 EventLog，随后才在事务外调用 `createAgentLogPost`；这段失败被 catch 后只写 `console.error`，节流达到 3 条/10 分钟也直接 `return null`。schema 中 AgentTask 与 Post 之间没有任何关联，也没有 pending/failed 投影状态或 Worker 补偿入口——所以「任务已完成」这个已落库的事实**无法重建它的时间线投影**：一次瞬时数据库故障或提交与投影之间的进程终止，就让该条 agent_log 永久消失，而用户在聊天室看到的是「已完成」。
- 实现：[`lib/agent-posts.ts`](lib/agent-posts.ts) 新增 `isAgentTaskProjectionConflict`（只认 `P2002` 且 `meta.target` 含 `agentTaskId`）、`markTimelineProjected`（`updateMany({where:{id, timelineProjectedAt: null}})` 的 CAS）、`projectAgentTaskTimeline`（读持久事实 → 无 ToolCall 只记终态 → 否则带幂等键写入，撞唯一键视为已投影，其他错误原样上抛**且不推进终态** → CAS 推进终态）与 `recoverPendingTimelineProjections(limit=5)`（按 `completedAt` 升序、逐条隔离）。[`agent/execution-tracer.ts`](agent/execution-tracer.ts) 完成路径改为调用同一函数并保留失败隔离；[`agent/agent-worker.ts`](agent/agent-worker.ts) 在 dispatch 循环中补做投影，与任务分发**互相隔离**（任一侧失败不拖住另一侧，也不影响 `consecutiveErrors` 退避）。新增迁移 [`20260920120000_agent_timeline_projection`](prisma/migrations/20260920120000_agent_timeline_projection/migration.sql)（`AgentTask.timelineProjectedAt`、`Post.agentTaskId` 唯一键 + FK `SetNull`、`(status, timelineProjectedAt)` 索引，历史已完成任务回填为 `COALESCE(completedAt, updatedAt)`）。
- 先红后绿（未放宽断言、未加 skip、未改断言超时）：**对照 A** 只退回 [`agent/execution-tracer.ts`](agent/execution-tracer.ts) 的旧内联投影 → 真实 PostgreSQL `tests/integration/agent-timeline-projection.integration.test.ts` **`1 failed \| 9 passed (10)`**，失败点为完成后 `timelineProjectedAt` 仍为 `null`；**对照 B** 只退回 [`agent/agent-worker.ts`](agent/agent-worker.ts)（去掉恢复调用）→ 进程级 `tests/integration/agent-timeline-worker-recovery.integration.test.ts` **`1 failed (1)`**、50710ms，Worker 已启动（`[worker] dispatch loop started, base poll 1000ms`）但预算内从不补做，该 agent_log 永久缺失。两处按 sha256 与 `/tmp/feat-075-fixed/` 副本比对恢复一致。
- **需要保留的判断（易误读）**：幂等重放、崩溃窗口重放（Post 已提交而 `timelineProjectedAt` 未提交）、节流终态与迁移回填**四项在旧实现下无法以行为方式失败**——旧代码根本没有 `projectAgentTaskTimeline` 入口，行为断言无从失败，它们是防回归守卫而**不是红灯证据**。加分依据是对照 A/B 与新增的进程级 E3，不是测试数量；后轮不要把这四项算作先红后绿。
- 一次被否证的断言（后轮别再固定它）：投影 Post 标题里的工具名顺序**未定义**，实测为 `weather.get, timezone.compare` 而首版断言写成了相反顺序。测试已改为分别 `toContain` 两个工具名，本项没有、也不应该承诺这个顺序。
- 门禁：`./scripts/run-node22.sh npm run check:full` **单次 exit 0**——87 文件 **771 项** Vitest（快速门禁与覆盖率阶段**计数一致**）、生产构建（`✓ Compiled successfully in 4.9s`）、覆盖率 53.86/47.46/58.91/54.56（门槛 40/35/45/40）、真实 PostgreSQL **35 文件/140 项**（139.93s）、生产 Playwright **44 passed（4.2 分钟，无 skip/retry）**；`npm run typecheck` exit 0、`npm run lint` exit 0；定向 Node `tests/agent/agent-posts.test.ts` 15/15，三个新增集成文件 3 文件/12 项。日志中无 `npm ERR!`/`ELIFECYCLE`/非零退出。
- 质量结论：QAM-05 数据流与状态一致性 **11→12**、健壮性并发与生命周期 **12→13**、可测试性与验证可信度 **7→8**，Score **84→87**、Score Level 保持 **L3**；模块最高风险不变量（派生投影的失败恢复与幂等）自此有 risk-matched E3，**Gate 由 L2 升至 L3**、`Final = min(L3, L3) = L3`。**L4 未通过**：QAM-05-006（通用错误 message 泄漏）仍只有 E2。组合均分 87.0→**87.3**，Final 分布 L2×5/L3×3/L4×2，开放 QAM P2 **23→22**；QAM-05 开放项仅剩 QAM-05-006。
- 迁移影响面向历史数据：历史 `status='completed'` 的任务被回填为已决策，因此**不会被补发陈旧 Post**；历史 `Post.agentTaskId` 有意不回填（历史任务已决策，不会被重新投影），所以老的时间线条目没有 task 关联——这是预期，不是遗漏。
- 计数与归档：`featuresNumber` 保持 22（只改状态时不变）；归档判定 22 ≤ 40，直接跳过。
- **本轮有一次对用户本地开发库的误操作，现已回滚**（详见 Blockers，无需再裁决）。
- 落地：按用户要求先应用迁移（`prisma migrate deploy` 28 个全部成功、0 失败，开发库与 `prisma/schema.prisma` 经 `migrate diff` 核验一致），再把工作区改动提交为**单个 commit**（`git log -1`，提交信息以 `fix: 修复 Agent 时间线投影的持久化与失败恢复（QAM-05-004）` 开头；70 files changed, 6051 insertions(+), 1326 deletions(-)）。**当前工作区干净**，但**未推送**（远端仍是 `origin/agent_entry`，本地 ahead 1）。

## Files Changed（改动文件）

- 本轮修改：`lib/agent-posts.ts`、`agent/execution-tracer.ts`、`agent/agent-worker.ts`、`prisma/schema.prisma`、`tests/agent/agent-posts.test.ts`、`feature_list.json`、`progress.md`、`session-handoff.md`、`docs/optimization/qam-05-content-timeline-quality-review.md`、`docs/optimization/module-quality-overview.md`。
- 本轮新增：`prisma/migrations/20260920120000_agent_timeline_projection/migration.sql`、`tests/integration/agent-timeline-projection.integration.test.ts`（10 项）、`tests/integration/agent-timeline-projection-migration.integration.test.ts`（1 项）、`tests/integration/agent-timeline-worker-recovery.integration.test.ts`（1 项，真实子进程 Worker）。
- 此前多轮的改动本体（原为未提交状态，现已在最新 commit 中一并归档，若需回看请用 `git show HEAD -- <路径>`，**不要用 `git checkout` 整文件覆盖**）：`agent/worker-lifecycle.ts`、`agent/scheduler-tick.ts`、`tests/agent/worker-lifecycle.test.ts`、`tests/agent/worker-shutdown.test.ts`（feat-074）；`lib/home-board.ts`（feat-069）、`lib/posts.ts`（feat-070）、`app/api/posts/route.ts`、`app/api/posts/[slug]/route.ts`、`app/actions/posts.ts`、`lib/storage/atlas-storage.ts`、`lib/validation.ts`、`app/api/atlas/uploads/route.ts`、`app/api/home-board/uploads/route.ts`、`tests/server/*`、`tests/lib/*`（feat-071/073），以及 `README.md`、`app/about/page.tsx`、`components/about/AboutView.tsx`、`components/about/right-now-content.ts`、`lib/about-photos.ts`、`components/chat/LifePanel.tsx`、`components/chat/useWorldClock.ts`、`components/home/useHomeBoardMutations.ts`、`tests/component/*`、`tests/integration/room-snapshot-privacy.integration.test.ts`、`tests/lib/vitest-worker-budget.test.ts`、`vitest.config.ts`、`package.json`、`docs/testing-standards.md`、`PROJECT_VIEW.md`、`docs/optimization/qam-03-life-plan-quality-review.md` 等。
- 本轮为跑门禁生成的 `coverage/`、`test-results/`、`playwright-report/` 与 `.next/` 均为按需重建产物；除上述文件外的应用改动都属于此前轮次。

## Blockers / Risks（未通过、保留边界与风险）

- **【已处置，无需再动】本地开发库 `xoxo_meridian` 曾被误改，现已回滚并核验一致**：本轮为验证 `P2002` 形状与迁移完整性时，一次 `prisma db push --skip-generate --accept-data-loss` 未覆盖 `DATABASE_URL`，Prisma 从 `.env` 解析后把 `xoxo_meridian` 当成目标强行同步。它多加了 `Memory.ownerKey`（+ `Memory_roomId_ownerKey_key_key`）、`AgentTask.timelineProjectedAt`（+ 同名索引）、`Post.agentTaskId`（+ 唯一索引 + 外键），并**连带删除了 `Memory_roomId_key_key`**（datamodel 用 `@@unique([roomId, ownerKey, key])` 取代了它——这一点最初的反向 DDL 漏了，是靠对照库 diff 才暴露出来的）。数据全程未受损。两次主动回滚被权限分类器拒绝后停手上报，用户明确选择回滚后已执行：先 `pg_dump` 备份到 `/tmp/xoxo_meridian-before-rollback-20260920.sql`，再 DROP 外键/索引/列并补回 `Memory_roomId_key_key`；随后用「26 个迁移在临时库 `xoxo_shadow26` 上 `migrate deploy`」构造对照，`prisma migrate diff` 输出 `-- This is an empty migration.`，证明开发库与其自身迁移历史完全一致。临时库已删除，只剩 `xoxo_meridian`（26 个迁移、数据完好）。备份文件保留未删。
- **该库落后于仓库迁移目录是既有事实，与本轮事故无关**：`xoxo_meridian` 只应用到 `20260911111600_drop_focus_updatedat_default`（26 个），而仓库已有 28 个——`20260912175500_add_memory_owner_key` 与 `20260920120000_agent_timeline_projection` 都未应用。所以**本地要跑起当前工作树，需要先 `prisma migrate deploy`**；这是原有状态，不是我回滚造成的。回滚后 `Memory_owner_contract_check`（那条迁移里的 CHECK 约束）也不在库里，属同一原因。
- **根列表已无待办 feature**：22 项全部 `done`。下一轮不能再从根列表直接取项，必须先按 `priorityPolicy` 从 [`docs/optimization/module-quality-overview.md`](docs/optimization/module-quality-overview.md) 的开放 QAM P2 中排序选定，并**先与用户确认方向**，再按全局最大编号 +1 登记（当前最大 ID 为 **feat-075**），不许自行扩大范围。
- 开放 QAM P2 共 22 项：QAM-01×3、**QAM-05×1**（仅剩 006 通用错误 message 泄漏）、**QAM-06×4**、QAM-07×1、QAM-08×4、QAM-09×5、QAM-10×4。**QAM-04 与 QAM-05-004 已不在列表内**。
- 恢复扫描的收敛速度受 `limit=5` 约束：长积压需多轮 dispatch 周期收敛。这是有意取的上界（避免一次扫描读入长积压），**不要在下一轮顺手调大**——若要改，应按运行观测另行登记。
- Worker 的投影恢复依赖 `AgentTask.completedAt` 非空来排序；`completedAt` 为空的历史完成任务只可能来自迁移前的脏数据，迁移已用 `COALESCE` 兜底，但新写入路径始终设置该字段。
- `check:full` 以生产构建收尾，会把 [`next-env.d.ts`](next-env.d.ts) 的引用改写到 `./.next/types/*`（开发服务写回 `./.next/dev/types/*`）。跑完门禁后 `git status` 会多出这一个改动，属预期；本轮已还原为 `./.next/dev/types/*`。
- 门禁日志计数不一致（历史 750 vs 751）本轮**未复现**：两个阶段一致报 771。该现象仍无根因，若下一轮又遇到，先用 `--reporter=json` 比对逐文件清单，不要直接引用其中一个数字，也不要把「少 1 项」当成用例被跳过。
- `npm run test:e2e`（默认 `development`）在本机 7.8GB 内存下仍可能因资源压力出现延迟有界的失败；它是诊断入口，不是门禁；浏览器层验收按 `test:e2e:production`。
- 本机另有其它会话/任务在并发占用资源（`scripts/subset-poc-font.py` 单核满载、`pnpm run dev:poc` 常驻、`.poc-logs/`）。**不要把这些进程当作本仓库的测试进程去 kill**，也不要据此判定测试变慢是回归。
- 本轮未运行：`npm run test:compose-smoke`、Compose 构建与实体设备（未改依赖、Next 配置、API 契约或 Compose 启动拓扑；schema 与迁移的改动已由迁移边界回归与真实 PostgreSQL 覆盖）。
- 未推送：最新 commit 只在本地 `agent_entry`，是否推送由用户决定。

## Next Session Startup（恢复路径与唯一下一步）

1. 依次读取 AGENTS.md、根 feature_list.json、progress 当前总览及所选任务记录、本文件；工作区当前干净（上一轮改动已提交），若后续产生新的未提交改动再行保留。
2. **唯一下一步：先与用户确认下一项方向**——根列表 22 项全部 done，须从开放 QAM P2（22 项）中按 `priorityPolicy`（核心操作受阻程度 → 入口影响范围 → 触发频率 → 恢复成本，同分优先已有直接行为证据者）排序给出建议，确认后再按全局最大编号 +1（当前 feat-075）登记为独立 feature 并只把它标为 `in-progress`，然后运行 `./scripts/run-node22.sh ./init.sh` 建立基线。
3. 若用户指定其它方向，同样先登记再实现；不要顺手扩大范围到既有 done 项，也不要把 QAM-06-002/004/006/008 合并进同一次修复。
4. 使用仓库锁定的 Node.js 22.23.2/npm 10.9.8；PATH 被清理时用 `./scripts/run-node22.sh`。沙箱空 Node stdout 与 Docker socket 权限差异按 AGENTS.md 的正常权限边界复核，不因这些已知差异改应用代码。**跑任何 `prisma db push` / `migrate` 命令前，必须显式传入目标库的 `DATABASE_URL`，不要依赖 `.env` 的隐式解析**——本轮的事故正源于此。
