# 会话交接

## 2026-09-12 最新交接：feat-050 已完成（QAM-08-006 resolved）

- 状态：feat-001 至 feat-050 均为 `done`，没有 `not-started`、`in-progress` 或 `blocked` feature。QAM-08-006 已关闭；QAM-08 为 80 分、Score L3、Gate/Final L2，开放项仅 P2×5。十模块均分 83.2，Final 分布 L0×0/L1×0/L2×6/L3×2/L4×2，开放 P0×0/P1×0/P2×38。
- 实现：`buildAgentContext(roomId, requestedById)` 通过稳定 userId 形成显式 requester/self/partner；Task、Durable Plan、mock/真实 Planner 与 Tool 使用同一有效请求者，空或非成员 ID 不猜 participant 顺序。新增 `agent/memory-identity.ts`，把个人 me/her 写入规范化为 `user:<id>` owner + `person.*` key，shared/system 使用房间 scope；唯一、upsert、owner 内去重、recall、context 投影与 extractor 都复用该协议。
- 迁移：`20260912175500_add_memory_owner_key` 增加必填 `ownerKey`、`(roomId,ownerKey,key)` 唯一键与 owner check。已知 owner 无损规范化；同 owner canonical 冲突、缺 owner 的个人行和未知 key 不被删除或猜归属，而是保留为带原因的 `legacy:<id>`。隔离临时数据库从全部旧迁移升级，证明 8/8 旧行保留且复合唯一/check 拒绝非法写。
- 负向与回归：旧实现 Node 2 failed/13 passed，复现第二请求者与 null 请求者的 Planner 错配；旧实现真实 PostgreSQL 3/3 failed，复现个人事实跨成员覆盖/删除、错投影及 null 个人写入。修复后 Node 3 文件/20 项、requester-memory PostgreSQL 4/4、迁移 PostgreSQL 1/1；双成员同名/相似事实、双向 aboutMe/aboutHer/recall、空请求者和第二请求者 Bob/London→Alice/Shanghai 的 Planner→Tool 全链路均通过。集成 global setup 固定 mock LLM 并清空 API key，避免继承开发 `.env` 发出真实网络请求。
- 门禁：`db:generate`、typecheck、lint、check:quick 72/482 通过。首轮 `check:full` 仅有无关 home-board upload coverage 用例一次 5000ms 超时；同文件立即 8/8、完整 coverage 72/482，未改该用例。随后完整门禁通过；最后将 Tool 请求者收紧为 context 有效 ID 后，20 项定向测试及最终 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full` 再次 exit 0：production build、覆盖率 47.73/42.56/52.71/48.54、22/68 PostgreSQL、30/30 Playwright（5.9 分钟）。Compose smoke 因未改部署路径未运行且不声称通过。
- 清理与保留：`coverage/`、`playwright-report/`、`test-results/` 已移入系统回收站，可恢复；迁移临时库/目录和 Testcontainers 已清理，`next-env.d.ts` 无差异，Docker 仅保留会话前既有健康 `xoxo-meridian-postgres`。QAM-08-001～005、QAM-03-005/006、feat-044～049、QAM-10、既有 `docs/optimization/agent-runtime-review.md` 删除状态及其他用户改动均未恢复、覆盖或纳入本 feature。
- 最终核验与恢复：状态落盘后 `./init.sh` exit 0、72/482；Harness validator 100/100，50 个 feature 连续且全 `done`，QAM-08 十维 80/100、组合总分 832/均分 83.2，报告相对链接和 JSON 均可解析，`git diff --check` 通过，最终 status 无测试/认证/迁移临时工件。clean restart 只需依次读取四份启动文件，确认 Node 22.23.2/npm 10.9.8，再运行 `./init.sh`。
- 唯一推荐下一步：由产品优先级登记一个新的独立 feature；当前没有开放 P1，不自动扩大本 feature 到 QAM-08-001～005 或其他 P2。

以下保留历史交接，状态与推荐步骤以本节为准。

## 2026-09-12 最新交接：feat-049 已完成（QAM-03-004 resolved）

- 状态：feat-001 至 feat-049 均标记为 `done`，没有 `not-started`、`in-progress` 或 `blocked` feature。QAM-03-004 已关闭；QAM-03 为 90 分、Score/Gate/Final L4，开放项仅 P2×2。十模块均分 82.2，Final 分布 L1×1/L2×5/L3×2/L4×2，开放 P0×0/P1×1/P2×38。
- 改动：`lib/scheduled-job-one-shot.ts` 拥有并导出 offset datetime schema、create 恰一 trigger、update 至多一项 trigger 谓词，并在 resolver 构造 `Date` 前防御校验；`lib/validation.ts` 与 `agent/tool-contracts.ts` 共同引用。Agent `schedule.create/update` 的无 offset `fireAt` 与 `fireAt+cron` 现在由 Tool Registry 在 execute/`ScheduledJob` 写入前拒绝；合法 offset、五分钟宽限、cron 合成、active cap 和 QAM-04 触发策略未改。
- 负向对照：修复前 resolver/Registry 定向回归 2 文件/50 项中 6 failed；同一无 offset 值在 Asia/Shanghai 与 America/Los_Angeles 子进程得到不同绝对时刻，四组非法 Agent trigger 越过 validation。修复后 50/50；合法 `+01:00` 输入在两进程均为 `19:40Z`，无 offset 均拒绝，四组 Registry 输入均为 `ToolValidationError`、execute 未调用且无 `ScheduledJob` 写入。
- 数据库与门禁：真实 PostgreSQL 定向 11/11，回读 Agent create/update 与 Route POST/PATCH 的 `nextRunAt`、`cron`、`runOnce` parity，并确认非法输入不改变 Job、无 ToolCall。`typecheck`、`lint`、`check:quick` 72/480 通过；最终 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full` 单次 exit 0，含 production build、覆盖率 48.26/42.98/53.55/49.14、20/63 PostgreSQL 与 30/30 Playwright（7.2 分钟）。Compose smoke 因未改部署路径未运行且不声称通过。
- 清理与保留：`coverage/`、`playwright-report/`、`test-results/` 已移入系统回收站，可恢复；`next-env.d.ts` 无差异，Docker 仅保留会话前既有健康 `xoxo-meridian-postgres`。QAM-03-005/006、QAM-08-006、feat-044～048、QAM-10 文件、既有 `docs/optimization/agent-runtime-review.md` 删除状态及其他用户改动均未恢复、覆盖或纳入本 feature。
- 最终核验：状态文档落盘后 `./init.sh` exit 0、72/480；Harness validator 100/100，49 个 feature 连续且全 `done`，QAM-03 十维 90/100、组合总分 822/均分 82.2，JSON 可解析。通用链接脚本初次仅因把 QAM-05 的历史 `javascript:...` 示例误当本地文件而 exit 1；按 URI scheme 排除后，11 份质量文档的 521 个相对链接全部可解析。`git diff --check` exit 0，最终 status 无测试工件。本交接只保留一个 clean restart 路径：依次读取四份启动文件，确认 Node 22.23.2/npm 10.9.8，再运行 `./init.sh`。
- 唯一推荐下一步：另行登记并只修复当前唯一开放 P1 `QAM-08-006`，为 Planner/Memory 建立稳定请求者身份和双成员隔离回归；不要并入 QAM-03-005/006 或其他 QAM。

以下保留历史交接，状态与推荐步骤以本节为准。

## 2026-09-12 最新交接：feat-048 已完成（QAM-06-009 resolved）

- 状态：feat-001 至 feat-048 全部为 `done`，当前没有 `not-started`、`in-progress` 或 `blocked` feature。QAM-06-009 已关闭；QAM-06 为 74 分、Score/Gate/Final L2，开放项仅 P2×6。十模块均分 81.7，Final 分布 L1×1/L2×6/L3×2/L4×1，开放 P0×0/P1×2/P2×38。
- 改动：`lib/home-board.ts` 用单一 spatial access predicate 表达固定 Home board 下的共享照片、全局 `user_post` 与当前用户可见 `agent_log` anchor，并从两端可见性派生 connection access；`app/home/page.tsx` 的 snapshot 显式传入当前用户。Home element PATCH/DELETE 与 connection POST/DELETE 在预读和实际 update/deleteMany/nested connect 中复用同一条件，失配统一 404。
- 负向对照：新 PostgreSQL 双 Room 回归在旧实现上 0/1，A 实际看到 B 的隐藏 anchor/connection，PATCH/POST/DELETE 为 200/201/200，隐藏 x 写成 999、原 connection 删除并新增未授权 connection；修复后 1/1，隐藏空间标识被过滤，三个写请求均为 404 且数据库不变，B、全局 Post anchor 与共享照片仍可操作。Playwright 从真实 `/home` 响应及真实 HTTP mutation 重证同一边界。
- 门禁：定向 Route/helper 2 文件/10 项、相关 PostgreSQL 4 文件/5 项、定向浏览器 2/2 均通过；`npm run check:quick` exit 0、72 文件/472 项。最终 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full` 单次 exit 0：72/472 Vitest、Next.js production build、覆盖率 48.21/42.92/53.41/49.09、20/61 PostgreSQL、30/30 Playwright（5.1 分钟）。未修改部署路径，Compose smoke 未运行且不声称通过。
- 清理与保留：`coverage/`、`playwright-report/`、`test-results/` 已移入系统回收站，可恢复；`next-env.d.ts` 无差异，Docker 仅保留会话前既有健康 `xoxo-meridian-postgres`。feat-044～047、QAM-10 文件、既有 `docs/optimization/agent-runtime-review.md` 删除状态及其他用户改动均未恢复、覆盖或纳入本 feature。
- 最终核验：状态文档落盘后 `./init.sh` exit 0、72/472；Harness validator 100/100，48 个 feature 连续且全 `done`，QAM-06 十维合计 74、组合总分 817/均分 81.7、521 个报告相对链接均可解析，`git diff --check` 通过。最终 `git status --short` 只包含本 feature 文件与会话开始前既有改动。本交接只保留一个 clean restart 路径：依次读取 `AGENTS.md`、`feature_list.json`、`progress.md` 和本文件，确认 Node 22.23.2/npm 10.9.8，再运行 `./init.sh`。
- 唯一推荐下一步：另行登记并只修复 `QAM-03-004`，统一 Agent 无 offset `fireAt` 的绝对时刻解析，并用 Route/Agent 跨进程及时区差异回归证明不会按 Worker 本地时区漂移；不要并入 QAM-08-006 或 QAM-06 的六个 P2。

以下保留历史交接，状态与推荐步骤以本节为准。

## 2026-09-12 最新交接：feat-047 已完成（QAM-01～QAM-10 全量独立复审）

- 状态：feat-001 至 feat-047 全部为 `done`，当前没有 `not-started`、`in-progress` 或 `blocked` feature。QAM-01～09 各由一个独立子 Agent 显式使用对应审查 Skill 复审；3D Agent Entry 经另一个独立边界 Agent 判定应升格为 QAM-10，建立专用 Skill 后再由第十个独立子 Agent完成初审。
- 模块治理：`PROJECT_VIEW.md` 已新增 QAM-10「全局 3D Agent 入口与模型资产生命周期」的完整规范、共享映射和 BU-11～14；统一标准扩至 QAM-10；新增 `.agents/skills/xoxo-qam-10-agent-entry-review/SKILL.md` 与 `docs/optimization/qam-10-agent-entry-quality-review.md`。QAM-10 拥有 Entry Gate、主题/Registry、WebGL 生命周期与 source→formal GLB 资产事实，QAM-09 只拥有 build arg/image/Compose 交付接缝。
- 当前组合：十模块均分 80.8；Final 分布 L1×2/L2×5/L3×2/L4×1；开放 P0×0/P1×3/P2×38。QAM-01/02/04/05/07 持平；QAM-03 为 85/L2，QAM-06 为 65/L1，QAM-08 为 70/L1，QAM-09 为 82/L2，QAM-10 baseline 84/L2。详细证据、定向命令和未运行层级均在十份模块报告及 progress 最新条目。
- 新增 P1：`QAM-03-004`——Agent 无 offset `fireAt` 按 Worker 时区写错绝对时刻；`QAM-06-009`——Home board snapshot/mutation 未继承 room-scoped Post anchor 授权；`QAM-08-006`——Planner/Memory 缺稳定请求者身份，可跨成员覆盖、删除或错读个人 Memory。本轮是审查，不修改业务实现，也不把问题写成已修复。
- 验证：开始与收尾 `./init.sh` 均 exit 0、72 文件/472 项；各模块定向测试/实验均记录在各报告。`./scripts/run-node22.sh npm run check` exit 0，包含两主题资产检查、TypeScript、ESLint、72/472 Vitest、Next.js 16.3.3 production build与覆盖率 48.27/43.21/53.42/49.15。十报告结构/算术、524 个相对链接、总览统计、47 个全 `done` feature、QAM-10 Skill 校验通过，Harness 100/100，`git diff --check` 通过。`check:full`/Compose smoke 因本轮不改实现未运行，不声称通过；QAM-10 的当前 production E3 缺口保留为 P2。
- 清理与保留：`coverage/` 已移入系统回收站，`next-env.d.ts` 恢复 dev types；未删除既有 `.next`、容器或用户改动。feat-044～046 的源码/测试/报告改动完整保留；无关的 `docs/optimization/agent-runtime-review.md` 既有删除状态未恢复或纳入本轮。
- clean restart：依次阅读 `AGENTS.md`、`feature_list.json`、`progress.md` 和本文件；确认 Node 22.23.2/npm 10.9.8，运行 `./init.sh`。开始后续工作前另行登记且只标一个 feature 为 `in-progress`。
- 唯一推荐下一步：登记并只修复 `QAM-06-009`，让 Home board snapshot 与 element/connection mutation 复用 room-scoped Post anchor 可见性/成员授权，并以真实 PostgreSQL 与 Playwright 证明非成员不能看到或修改隐藏 anchor/connection；不要并入 QAM-03-004 或 QAM-08-006。

以下保留历史交接，状态与推荐步骤以本节为准。

## 2026-09-12 最新交接：feat-046 已完成（QAM-04-002 resolved，开放 P1 清零）

- 状态：feat-001 至 feat-046 全部为 `done`，当前没有 `not-started`、`in-progress` 或 `blocked` feature。最后一个开放 P1 `QAM-04-002` 已关闭；QAM-04 为 87 分、Score/Gate/Final L3；组合均分 81.9，开放问题 P0×0/P1×0/P2×31。
- 改动：`agent/scheduler-tick.ts` 在既有共享 transaction claim 中对所有 run-once Job 写 `enabled=false`；窗口外 claim 返回 skipped，不创建 Task/Event，周期 Job 仍 enabled 并推进 `nextRunAt`。窗口内失败整事务回滚，既有 failCount/retry 保持。未修改 QAM-03 authoring/schema、QAM-04-003 shutdown、QAM-08 Runtime 或部署拓扑。
- 回归：旧实现的 fake-clock 定向测试为 1/17 failed、真实 PostgreSQL 为 1/4 failed，均在下一合成 cron 周期错误得到 `fired: 1`；修复后 Scheduler 18/18、PostgreSQL 4/4。数据库回归使用共享 `resolveOneShotSchedule()` 合成 fireAt 日 cron，证明窗口外 Job disabled、Task/Event 为零且下一日无副作用；周期 Job missed-window 推进及既有窗口内成功/失败语义继续通过。
- 最终门禁：`sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full` 单次 exit 0，包含 72 文件/472 项 Vitest、Next.js 16.3.3 production build、覆盖率 48.27/43.21/53.42/49.15、19 文件/60 项 PostgreSQL 与 29/29 Playwright（4.8 分钟）。开始 `./init.sh` exit 0、72/470；清理及文档落盘后最终 `./init.sh` exit 0、72/472，harness validator 100/100、46 个 feature 连续且全部 done、`git diff --check` 通过。Compose smoke 因未改部署路径未运行，不声称通过。
- 清理与保留：`coverage/`、`playwright-report/` 与含临时认证状态的 `test-results/` 已移入系统回收站，可恢复；没有删除 `.next`、源码或容器。既有 feat-044/045 工作树改动全部保留；无关的 `docs/optimization/agent-runtime-review.md` 删除状态不是本轮操作，未恢复或纳入验收。
- clean restart：依次阅读 `AGENTS.md`、`feature_list.json`、`progress.md` 和本文件；确认 Node 22.23.2/npm 10.9.8，运行 `./init.sh`。开始后续工作前另行登记且只标一个 feature 为 `in-progress`。
- 唯一推荐下一步：若继续 QAM-04，登记并只修复 P2 `QAM-04-003`，为 Scheduler in-flight callback 增加可等待的有界 shutdown，并以 Worker 信号行为与真实 PostgreSQL 重启恢复验证；不要扩展到 QAM-08 lease、QAM-09 Compose 拓扑或新调度功能。

以下保留历史交接，状态与推荐步骤以本节为准。

## 2026-09-12 最新交接：feat-045 已完成（QAM-04-001 resolved）

- 状态：feat-001 至 feat-045 全部为 `done`，当前没有 `not-started`、`in-progress` 或 `blocked` feature。QAM-04-001 已关闭；QAM-04 为 84 分、Score L3、Gate/Final L2；组合均分 81.6，开放问题 P1×1/P2×31。
- 改动：`agent/scheduler-tick.ts` 的 timer registry 保存期望 `nextRunAt`，重复 tick 替换改期 timer，callback 重读持久化版本；timer/polling 共用 wall-clock due 与 transaction 内 enabled/nextRunAt/lastRunAt/failCount CAS。没有修改 Job authoring、schema/migration、run-once missed-window、Worker shutdown 或部署配置。
- 回归：旧实现负向对照 3/15 失败——改期、停用后按新时间重启用、clock backward 都在旧时刻错误创建 Task；修复后 Scheduler 16/16，并覆盖改早时重建 timer。真实 PostgreSQL 3/3 证明旧 timer 不写 Task/Event 或覆盖新 Job、两个并发 tick 只创建一个 Task/Event、Event 故障完整回滚。
- 最终门禁：正常权限 `check:quick` 为 72/470；`sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full` 单次 exit 0，包含 production build、覆盖率 48.22/43.18/53.42/49.15、19 文件/59 项 PostgreSQL 与 29/29 Playwright（5.5 分钟）。受限 quick/init 的唯一失败均为已知 build-config 子进程空 stdout，正常权限原命令对照通过；最终 `./init.sh` exit 0、72/470。
- 清理与保留：本轮 `coverage/`、`playwright-report/`、`test-results/` 已按明确路径永久删除（系统回收站因只读不可用）；没有删除 `.next` 或源码。既有 feat-044 工作树改动全部保留；无关的 `docs/optimization/agent-runtime-review.md` 当前删除状态不是本轮操作，未恢复或纳入验收。
- clean restart：依次阅读 `AGENTS.md`、`feature_list.json`、`progress.md` 和本文件；确认 Node 22.23.2/npm 10.9.8，运行 `./init.sh`。开始任何后续工作前另行登记且只标一个 feature 为 `in-progress`。
- 唯一推荐下一步：登记并只修复 `QAM-04-002`——超过一小时 missed window 的 run-once Job 应禁用且不创建 Task，并在下一 cron 周期也不重放；用 fake clock 与真实 PostgreSQL 验证，不并入 `QAM-04-003` shutdown 或新的补发策略。

以下保留历史交接，状态与推荐步骤以本节为准。

## 2026-09-12 最新交接：feat-044 已完成（QAM-03-003 resolved）

- 状态：feat-001 至 feat-044 全部为 `done`，当前没有 `not-started`、`in-progress` 或 `blocked` feature。QAM-03-003 已关闭；QAM-03 为 92 分，Score/Gate/Final 均为 L4；组合均分 80.6，开放问题 P1×2/P2×31。
- 改动：新增 `lib/participant-resolution.ts`，以显式用户 ID 返回 self/partner，身份缺失或不匹配时不猜数组位置；ChatApp/LifePanel/ScheduledJobModal/TimezoneSelector 使用 `currentUserId`；Agent weather/timezone/schedule Tool 使用 `requestedById`。显式 city/timezone/label 优先级与中性 fallback 保持，参与者排序、RoomSnapshot transport、schema/migration 和 QAM-04 scheduler 未改。
- 回归：未修复组件 2/5 失败（第二参与者显示顺序和默认时区错误），未修复 Agent 2/6 失败（伙伴天气与本人时区对象反转）；修复后组件 7/7、Agent/Server 4 文件/35 项。新增 Weather Route/Tool 第二参与者一致性测试，以及真实 Chromium 第二参与者旅程（伙伴天气 E2E One/Tokyo、本人时间在前、计划默认 Europe/London）；独立登录 request context 显式为空 storageState，避免单活 Session 污染后续用例。
- 最终门禁：在无 `.next` 且 `node_modules` 为项目内独立目录的隔离副本执行 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full`，单次 exit 0：72 文件/466 项 Vitest、Next.js 16.3.3 production build、覆盖率 48.18/42.99/53.42/49.10、19 文件/57 项真实 PostgreSQL 与 29/29 Playwright。开始时受限 `./init.sh` 仅因已知子进程空 stdout 症状使 build-config 3/3 失败，获准正常权限原命令重跑 70/457、exit 0；清理测试产物与 1.9 GiB 隔离副本后，最终根仓库 `./init.sh` 再次 exit 0、72/466。
- 失败复核：根目录 E2E 曾因既有 `.next/dev/lock` 在收集前退出，未中断用户进程。symlink 到原仓库 `node_modules` 的隔离副本两次 `check:full` 均在 check/PostgreSQL 通过后由 Next dev 的 `module.compiled` 相对路径错误导致 28/29；bundle 证明同一依赖真实路径被登记为 `(ssr)/./home/...` 与 `(ssr)/../../home/...` 两种 module ID。改用独立依赖目录后同一默认命令单次全绿，因此没有修改产品/Next 配置迁就非正常验证拓扑；完整原始过程见 progress 当日条目。
- clean restart：依次阅读 `AGENTS.md`、`feature_list.json`、`progress.md` 和本文件；用 `./scripts/run-node22.sh` 确认 Node 22.23.2/npm 10.9.8，再运行 `./init.sh`。当前没有已登记的活动 feature，开始任何工作前先登记且只标一个为 `in-progress`。
- 唯一推荐下一步：登记独立的 QAM-04 调度器质量复审 feature，使用 `xoxo-qam-04-scheduler-review` 核对 feat-042 已触发的 `nextRunAt`/runOnce 时间语义影响；只审查既有实现，不在同一 feature 中增加调度能力或处理 QAM-03 非 P1 重构。

以下保留历史交接，状态与推荐步骤以本节为准。

## 2026-09-11 当前交接：feat-043 已完成

- 状态：共登记 43 个 feature，`feat-001` 至 `feat-043` 均为 `done`；当前没有 `not-started`、`in-progress` 或 `blocked` feature。
- 实现：`public/brand/logo_transparent.svg` 和 `logo_white.svg` 使用不改几何/颜色的 `181 170 925 925` 方形紧裁 viewBox；白底版本保留白色 rect。`BrandBadge` 以 24×24 透明 SVG 替换叶子，仍保留动态 accent 的 32×32 绿色圆角底块、“XOXO / Meridian”、链接和可访问名称；AuthPanel、SiteNav、ChatApp 三处同步生效。根 `Metadata.icons` 以 `image/svg+xml`、`sizes=any` 指向白底 SVG。
- 测试：组件旧实现负向对照 0/1、修复后 1/1；真实 Chromium 定向 4/4（含 setup），覆盖登录/Home/Chat、`rel=icon`、SVG 200/MIME、16/32px decode 和 320/1280px 布局；截图目视确认小尺寸清晰、绿色底块与文字保留且无偏移。
- 门禁：初始 `./init.sh` exit 0、69 文件/456 项；`npm run check` exit 0，70 文件/457 项、Next.js 16.3.3 production build 和覆盖率 46.47/41.73/51.75/47.32 全部通过；最终 `./init.sh` exit 0、70/457。没有数据库、认证或部署变更，故未运行 integration、`check:full` 或 Compose smoke。
- 范围与清理：About/Study 内容型叶子、Apple/PWA/OG、依赖和数据库均未改；coverage/Playwright 报告移入回收站，临时截图按明确路径删除，无失败日志、测试凭据或临时服务残留。根目录未跟踪 `logo.png` 是用户参考图，已保留且不参与运行时。
- clean restart：依次阅读 `AGENTS.md`、`feature_list.json`、`progress.md` 和本文件；用 `./scripts/run-node22.sh` 确认 Node 22.23.2/npm 10.9.8，按下一项产品优先级先登记 feature，再只将该 feature 标为 `in-progress` 并运行 `./init.sh`。
- 唯一推荐下一步：由产品优先级决定并登记一个新的独立 feature，确认依赖与验收标准后再启动；不要继续扩大 `feat-043` 到 Apple/PWA/OG。

以下保留历史交接，状态与推荐步骤以本节为准。

## 2026-09-11 历史交接：feat-042 已完成（QAM-03-001 resolved）

- 状态：共登记 42 个 feature，feat-001 至 feat-042 均为 `done`；当前没有 `not-started`、`in-progress` 或 `blocked` feature。
- 改动：新增 `lib/scheduled-job-one-shot.ts`（`fireAt` 解析、5 分钟宽限、`nextRunAt`、合成 cron、类型化错误）与 `lib/zoned-time.ts`（墙上时间 ↔ `Date` 两遍 offset 求解）作为一次性时间语义的单一事实来源；修改 `agent/tool-contracts.ts`、`agent/tools/schedule-tool.ts`、两个 scheduled-jobs Route、`lib/validation.ts`、`components/chat/LifePanelModals.tsx`；新增 `tests/lib/zoned-time.test.ts`、`tests/lib/scheduled-job-one-shot.test.ts`、`tests/server/scheduled-jobs-one-shot-patch.test.ts`、`tests/integration/scheduled-job-one-shot-fireat.integration.test.ts` 并扩展 agent/组件测试。
- 门禁：feat-042 验收时 `npm run check:quick` exit 0（70 文件/457 项 Vitest，本 feature 前原始基线 67/414），最终 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full` **单次 `EXIT=0`**：TypeScript、ESLint、70 文件/457 项 Vitest、Next.js 16.3.3 production build、覆盖率、19 文件/57 项真实 PostgreSQL 与 **26/26 Playwright**（默认 dev 模式套件，5.0 分钟，0 failed/flaky/skipped）。这些原始数字各包含后来按用户要求回退的 1 个无关 logo 测试；回退后本次 `./init.sh` 与 `npm run check` 均 exit 0，当前 quick/coverage 均为 69 文件/456 项，production build 通过，覆盖率 46.52/41.77/51.75/47.32。
- Harness 状态：`feature_list.json`、`progress.md` 与本文件已统一为 feat-042；42 个 feature ID 连续且全部 `done`，`harness-creator` validator 100/100，跨文件语义断言全部通过。`coverage/` 已移入系统回收站，`git diff --check` exit 0；现有 `logo.png` 与其他用户改动均保留。
- 负向对照：未修复的 `LifePanelModals` 上组件测试 3/4 失败——输入框显示 UTC 的 `2026-08-28T01:30` 而非任务时区的 `09:30`，未改动任何字段直接保存会把 `2026-08-28T01:30:00.000Z` 变成 `2026-08-27T17:30:00.000Z`（偏移 **−480 分钟**）；修复后 4/4。真实 PostgreSQL 9/9，含 Route 与 Agent `schedule.update` 在同一 `fireAt` 上产出相同 `nextRunAt`/`cron` 的防漂移断言。
- 评分：QAM-03 由 81/L2 提升至 **88/L2**（Score L3、Gate L2，Final 因开放 P1 仍为 L2），Delta `+7`；开放问题降为 P1×3/P2×31，组合均分 80.1。QAM-03-003（参与者身份按数组位置推断）仍开放。
- 记录更正：本轮初稿曾把当前基线的 Playwright 数写成 `11/11`——那是 feat-039 时期的**历史**值；feat-040 加入 agent-entry spec 后默认套件已增至 26 项，现已按原始输出 `26 passed (5.0m)` 更正为 26/26，历史行保留其当时的真实数字。
- 残留与边界：未改 `agent/scheduler-tick.ts` 的 claim/CAS/触发语义；未处理 QAM-03-003；该界面没有浏览器旅程，回归由 lib + server + component + 真实 PostgreSQL 四层承载，不声称浏览器层验收。合成 cron 描述的是用户请求的时刻而非宽限后推的 `nextRunAt`（该 Job 为 `runOnce`、触发即禁用，残余语义归 QAM-04-002）。**QAM-04 复审触发条件已命中**（PATCH/`schedule.update` 改变了 `nextRunAt` 的时间语义），但本 feature 不代为改分，应由下一次 QAM-04 会话按其自身证据判断。
- clean restart：依次阅读 `AGENTS.md`、`feature_list.json`、`progress.md` 和本文件；用 `./scripts/run-node22.sh` 确认 Node 22.23.2/npm 10.9.8，再运行 `./init.sh`。
- 唯一推荐下一步：登记一个独立的 QAM-04 调度器质量复审 feature，使用 `xoxo-qam-04-scheduler-review` 核对 feat-042 触发的时间语义影响；只做既有实现审查，不在同一 feature 中增加调度功能。

以下保留历史交接，状态与推荐步骤以本节为准。

## 2026-09-11 历史交接：feat-041 已完成

- 状态：feat-001 至 feat-041 全部 `done`，没有 `not-started`、`in-progress` 或 `blocked` feature。feat-041 只处理 2026-09-10 记录的依赖公告，没有扩展产品功能。
- 改动：`package.json` 将 Nodemailer 提升为 `^9.1.1`；`package-lock.json` 解析 Browserslist 4.28.9、js-yaml 4.3.2、qs 6.16.0、根级 postcss-selector-parser 6.1.4、tsx 4.23.13/esbuild 0.28.2；新增 SMTP 公开发送路径行为测试。没有新依赖、主版本迁移、真实网络或凭据测试。
- 审计：npm 官方 registry 的生产与全量 audit 均 exit 0、0 vulnerabilities；low/moderate/high/critical 均为 0，没有需延期的风险项或升级 feature。后续依赖变更继续执行官方 registry 审计。
- 门禁：邮件定向测试 2 文件/7 项通过。`check:full` 已通过 quick 66/413、production build、覆盖率 44.60/39.25/49.32/45.35 和 PostgreSQL 18/48；只在 Playwright 启动前因用户已有开发进程 PID 24031 持有项目锁而 exit 1。未中断用户进程，同工作树隔离副本的完整 Playwright 26/26 exit 0。
- 最终基线：测试输出及 290 MiB 隔离副本清理后，`./init.sh` exit 0，Prisma generate、正式资产、类型、lint 与 66/413 Vitest 全部通过。Docker 仅既有健康 `xoxo-meridian-postgres`；未跟踪的两份 logo 用户文件保留。
- clean restart：依次阅读 `AGENTS.md`、`feature_list.json`、`progress.md` 和本文件；用 `./scripts/run-node22.sh` 确认 Node 22.23.2/npm 10.9.8，再运行 `./init.sh`。当前没有可直接启动的已登记 feature。
- 唯一推荐下一步：由产品优先级决定并登记一个新的独立 feature，明确依赖与验收标准后再将它标为唯一 `in-progress`。

以下保留历史交接，状态与推荐步骤以本节为准。

## 2026-09-11 当前交接：feat-040 已完成

- 状态：feat-001 至 feat-040 均 done，没有 in-progress/blocked；feat-041 为唯一 not-started 后续项。用户已明确选择两个主题均为 5%，正式文件已提升，不要再次询问选型。
- 改动范围：components/agent-entry、app/layout.tsx、next.config.mjs、proxy.ts、资产脚本/源/正式模型/recipe、依赖锁、Docker/Compose/环境说明、Node/组件/E2E 测试及隔离 production 启动器；选型结论、指标与复建方式位于 docs/spec/agent-entry-review/README.md。
- 最终结果：default 独立 production 16/16；生日主题 production check:full 的快速 64/409、build/coverage、PostgreSQL 18/48、生产浏览器 26/26 通过。新增真实 Next 环境配置 3/3 后，清理后的最终 ./init.sh 在同 Node 22 正常权限边界 exit 0，65 文件/412 项；完整命令、报告与早期失败见 progress 2026-09-11。跨日原 PTY ID 已失效，生日 E2E 以落盘 report stats 与 .last-run passed 复核，未伪造进程退出码。
- 最终部署：隔离 Compose smoke exit 0，Web 140131614 bytes，仅两个正式 GLB，init/Web/Worker 旅程通过；Compose 缺省/default/birthday build args 检查通过。最终配置与布局均已纳入最后一轮镜像构建。
- 清理：候选、临时预览、测试输出/凭据/失败日志、Buildx builder 与镜像、临时代理配置已清理；用户后续要求删除的 `docs/spec/agent-entry-review` 17 张 PNG/3 个 JSON、旧 `.next` 813 MiB 与根目录 `tsconfig.tsbuildinfo` 也已删除，统计和观测值已写回 README/progress；next-env.d.ts 恢复原内容。VS Code 终端中 2026-09-11 11:05 启动的 `npm run dev` 仍在运行并重建 `.next/dev`（盘点时 117 MiB），未中断用户进程。Docker socket 恢复后只读确认仅既有健康 xoxo-meridian-postgres、两个既有基础镜像。初次受限 Docker 命令 no new privileges、正常权限初次 socket 暂缺，已对照复核成功。
- 权限对照：受限 ./init.sh 的 Node 子进程空 stdout 导致配置测试 3/3 失败（其余 409 通过）；获准在正常权限边界原命令复跑 65/412、exit 0。恢复时遇到同类现象按 AGENTS 复核，不改测试来绕过沙箱。
- 风险边界：实体手机性能、系统软键盘、非零安全区尚无设备实测；当前为软件 Chromium 功能及缩短视口检查。生产依赖审计 2 high 与开发 js-yaml high 已登记 feat-041，未升级、未声称清零。
- clean restart：依次阅读 AGENTS/feature_list/progress/本文件；使用 ./scripts/run-node22.sh 校验 Node 22.23.2/npm 10.9.8，运行 ./init.sh。需要本地预览时设置 .env 的 NEXT_PUBLIC_AGENT_ENTRY_THEME=default 或 birthday-2026，npm run dev；生产切换须重新 npm run build，Docker 按 build web agent-worker init → up -d。模型无需重新优化；只有复建资产时按评审 README 的 candidates/promote 命令执行。
- 唯一推荐下一步：将 feat-041 标为唯一 in-progress，核对并升级 Browserslist/Nodemailer/开发依赖公告，运行邮件适配回归、审计与风险匹配门禁。

以下保留历史交接，状态与推荐步骤以本节为准。

## 2026-09-10 最新补充：feat-039 ScheduledJob active cap 修复完成

- 当前状态：feat-001 至 feat-039 均为 `done`，没有 `in-progress` 或 `blocked`；feat-040 为唯一已登记的 `not-started` 后续项。QAM-03-002 已 resolved，QAM-03 为 81 分、Score L3、Gate/Final L2；组合平均 79.3，开放问题 P1×4/P2×31。
- 实现边界：`lib/scheduled-job-authoring.ts` 用 Room 行锁和事务内 count/write 统一 ScheduledJob create/re-enable；Route POST/PATCH 显式使用 transaction，Agent `schedule.create/update` 使用 Tool Registry 的 `database-write` transaction。one-shot `fireAt`、participant 顺序和 Scheduler 触发未改。
- 回归证据：真实 PostgreSQL delay trigger 下，无 Room 锁负向对照 0/2（create 与 re-enable 都是 Route/Agent `success/success`）；恢复锁后 3/3，竞争恰一成功/冲突、active=30、无孤儿，满额 active edit 仍成功。全量 integration 18 文件/48 项通过。
- 最终门禁：`sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full` 单次退出 0，60 文件/360 项 Vitest、production build、覆盖率、18/48 PostgreSQL 与 11/11 Playwright 全部通过；清理后 `./init.sh` 再次退出 0。首次定向 integration 曾因 Docker Desktop WSL mount 暂缺而在收集前报告 `Could not find a working container runtime strategy`，Docker Server 29.7.2 恢复后原命令通过，不是代码阻塞。
- 清理与保留：`coverage/`、`playwright-report/`、`test-results/` 已移入系统回收站，`next-env.d.ts` 恢复 production types；只保留既有健康 `xoxo-meridian-postgres`。Agent Entry 设计、两个已暂存 GLB、`docs/spec/` 及其他用户改动均未覆盖或删除。
- 恢复路径：依次阅读 `AGENTS.md`、`feature_list.json`、`progress.md` 和本文件；确认 feat-039 为 done 后，只将 feat-040 标为 `in-progress`，阅读 Agent Entry 设计与实施计划并从 S0 运行版本核对及 `./init.sh`。
- 唯一推荐下一步：启动 feat-040 的 S0；QAM-03-001（one-shot `fireAt`）和 QAM-03-003（participant 身份）保持独立 P1，不并入 3D Agent Entry。

## 2026-09-10 最新补充：Agent Entry 审查与计划

- 本次目标：审查 `docs/plan/2026-09-09-agent-entry-design.md` 并编写详细实施计划；按用户补充要求，产物位于 `docs/spec/2026-09-10-agent-entry-implementation-plan.md`。
- 当前状态：feat-039 保持既有 `in-progress`；新增 feat-040 为 `not-started`。本次只改计划、feature_list、progress 和本交接，不实施 3D 入口，不修改原设计、原始模型或并行产生的 ScheduledJob 源码/测试。
- 计划内容：R01–R09 审查、S0–S8 顺序任务、真实首帧与错误生命周期、资产管线/人工选择、Docker 构建参数、CSP/WASM、两主题生产 E2E、文件范围、门禁与验收清单。资产原始尺寸/面数/纹理/hash 已只读核验。
- 验证：本次只做文档链接、JSON、diff/status 核验，结果见 progress 本日条目。`./init.sh`、`npm run check`、`npm run check:full`、`npm run test:compose-smoke` 均未运行：本次是设计文档工作，仓库另有活动实现；不声明产品验收通过、feature 完成或会话清洁退出。
- 阻塞与待办：计划编写无未决输入；正式模型候选尚未生成，后续人工质量选择、生产 decoder 验证和应用门禁都未执行。现有 feat-039 的结果需由其实施记录更新，本次不代为判断。
- 清理：本次未生成服务、容器、测试数据、候选或其他临时工件，现有用户改动保留。
- 恢复路径：先依次阅读 AGENTS、feature_list、progress 和本文件；以实时 feature_list 为状态依据。feat-039 收尾后，读取原设计与实施计划，仅将 feat-040 标为 `in-progress`，按 S0 运行版本核对及 `./init.sh`，再进入 S1。
- 唯一推荐下一步：先收尾当前 feat-039，再进入 feat-040 的 S0。

以下为 2026-09-09 上一已验收会话的历史交接；其中“当前状态”和门禁结果仅描述该日，不覆盖上面的最新补充。

## Last Updated

2026-09-09

## Current Objective（当前目标）

feat-038「修复最后房间并发删除竞态」已完成，当前没有 `in-progress` 或 `blocked` feature。feat-001 至 feat-038 全部为 `done`。

Room DELETE 现在以稳定 User 行锁串行同一用户的并发删除，并在单一 Prisma transaction 中重查目标成员资格、成员总数和删除 Room；两个房间并发 DELETE 严格收敛为 200/409，`/chat` 始终能解析剩余默认房间。QAM-02-004 已解决，QAM-02 当前为 90 分、Score/Gate/Final L4；组合开放问题为 P1×5/P2×31，模块平均分为 78.0。

## Files Changed（当前未提交改动范围）

- `lib/room-lifecycle.ts`：新增最后房间删除领域服务；以 User 行锁串行同一用户，在事务内二次验证成员资格、统计 RoomParticipant 并删除 Room。
- `app/api/rooms/[roomId]/route.ts`：保留认证、早期成员资格、rate limit 与 HTTP contract，改为委托原子生命周期服务。
- `tests/integration/room-delete-invariant.integration.test.ts`：新增真实 PostgreSQL 延迟 DELETE trigger、并发 200/409、成员保留与 `/chat` 默认房间回归。
- `docs/optimization/qam-02-room-message-quality-review.md`、`docs/optimization/module-quality-overview.md`：QAM-02-004 标为 resolved；QAM-02 更新为 90/Score L4/Gate L4/Final L4，总览同步为平均 78.0、P1×5/P2×31。
- `feature_list.json`、`progress.md`、本文件：完成 feat-038，记录修复前后证据、完整门禁、清理和唯一下一步。
- 前序 feat-001～feat-037 的源码、迁移、测试、报告与状态改动完整保留；当前工作树仍包含 feat-036/037 的 Room snapshot 隐私与 dispatch 原子派生改动。与本任务无关的未跟踪 `3D_Agent_Entry_Plan.md` 未读取或修改并已保留；本轮没有修改 npm 依赖、锁文件、Prisma schema/migration、房间 wipe、message trace、SSE 或部署配置。

## Verification（最终验证）

- Node.js/npm 为 v22.23.2 / 10.9.8；开始与最终 `./init.sh` 均退出 0，Prisma Client、TypeScript、ESLint、60 文件/360 项 Vitest 全部通过。
- 修复前 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run test:integration -- tests/integration/room-delete-invariant.integration.test.ts` 为 0/1：期望状态 `[200,409]`、实际 `[200,200]`。修复后为 1/1：状态 `[200,409]`、成员数为 1，且 `/chat` 重定向到剩余房间。
- `npm run typecheck`、`npm run lint`、`npm run check:quick` 均退出 0；快速门禁为 60 文件/360 项 Vitest。独立全量 PostgreSQL 为 17 文件/45 项通过。
- 最终 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full` 单次退出 0：60 文件/360 项 Vitest、Next.js 16.3.3 production build、覆盖率、17 文件/45 项真实 PostgreSQL 和 11/11 Playwright 全部通过。覆盖率 statements 42.32%、branches 36.42%、functions 47.72%、lines 43.02%，均高于门槛；既有故障注入的 Prisma `P0001`/唯一约束日志未造成测试失败。
- 完整门禁生成的 `coverage/`、`playwright-report/` 和 `test-results/` 已移入系统回收站，可恢复；`next-env.d.ts` 已恢复 production types。Docker 只保留既有且健康的 `xoxo-meridian-postgres`，无 Testcontainers 残留；最终 `./init.sh` 退出 0，`harness-creator` 为 100/100，38 个 feature 全部为 `done`，QAM-02 十维合计 90、总览平均 78.0，`git diff --check` 通过。

## Next Session Startup（恢复步骤）

1. 依次阅读 `AGENTS.md`、`feature_list.json`、`progress.md` 和本文件。
2. 运行 `node --version && npm --version`，期望 v22.23.2 / 10.9.8；PATH 被权限切换清理时使用 `./scripts/run-node22.sh <command>`，Docker 组命令使用 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm ...`。
3. 阅读 `docs/optimization/qam-03-life-plan-quality-review.md` 的 `QAM-03-002`、`PROJECT_VIEW.md` 的 QAM-03/QAM-04/QAM-08 共享边界，以及 `xoxo-qam-03-life-plan-review` Skill；确认 feat-038 为 `done` 后，只把新的 ScheduledJob active-cap 原子化 feature 标为 `in-progress`。
4. 运行 `./init.sh` 建立快速基线；修改 Next.js Route Handler 前阅读 `node_modules/next/dist/docs/` 中当前版本对应指南。
5. 先补可失败的真实 PostgreSQL 回归：在 active Job 接近 30 条上限时并发执行 Route/Agent create 或 re-enable，旧实现可共同越过 count；create/re-enable 路径都必须纳入共享事实边界。
6. 再把 cap 检查与写入收敛到事务内的 Room 行锁或等价串行化边界，运行风险匹配门禁、最终 `./init.sh`、生成物清理和三份状态更新；不要同时处理 one-shot `fireAt` 或 participant 顺序问题。

## Blockers / Risks（阻塞与风险）

- 当前没有 feature 阻塞项，也没有开放 P0；QAM-02-004 已关闭，最后房间并发不变量由真实 PostgreSQL 回归保护，QAM-02 已无开放 P1。
- 当前推荐 P1 为 QAM-03-002：ScheduledJob 的 30 条 active cap 在 Route create/re-enable 与 Agent create/re-enable 路径间既不原子也不一致，并发请求可共同越过 count，Agent update 还能绕过 cap。
- QAM-03-001 one-shot `fireAt` 丢弃和 QAM-03-003 participant 顺序身份推断是独立 P1；QAM-02-002 message trace 与 QAM-02-006 SSE in-flight 是独立 P2，不得并入下一 feature。
- 本轮没有依赖变更；既有审计记录为 production high/critical 0。E2E 直接数据库桥接只能使用启动器创建或显式提供的隔离数据库，临时 URL 文件必须 mode 0600 且退出即删。

## Recommended Next Step（唯一推荐下一步）

另行登记并只修复 `QAM-03-002`：将 ScheduledJob active cap 的 Route/Agent create 与 re-enable 路径收敛为共享原子事务，用真实 PostgreSQL 并发回归证明 active Job 永不超过 30；不要与 one-shot `fireAt` 或 participant 顺序问题合并。
