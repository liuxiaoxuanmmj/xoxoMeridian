# 会话交接

## Last Updated

2026-09-09

## Current Objective（当前目标）

feat-035「修复 Focus 到期状态的服务端幂等结算」已完成，当前没有 `in-progress` 或 `blocked` feature。feat-001 至 feat-035 全部为 `done`。

Study GET/服务端页面、start 与 stop 现在复用 keyed transition service 的到期 reconciliation：已过 `expectedEndAt` 的 running state 在用户行锁事务内，以持久化 deadline 结算同一 `currentSessionKey` 对应的唯一 FocusSession 与 idle state；重复、并发、重访和刷新不会重复，过期后 start 能在同一事务开启新计时。QAM-07-002 已解决，QAM-07 当前为 85 分、Score L3、Gate/Final L2；组合开放问题为 P1×8/P2×31，模块平均分为 75.9。

## Files Changed（当前未提交改动范围）

- `lib/study-transitions.ts`：在既有用户行锁与 keyed transition 上抽取统一 settlement，新增到期检测/reconciliation；GET/start/stop 的过期结算共用同一事务事实源，legacy 活动状态可修复稳定旧 key。
- `lib/study.ts`：`getStudyPageData()` 在读取状态、统计和 Room 数据前调用 reconciliation，使 `/api/study` 与服务端 `/study` 页面共享恢复入口。
- `tests/lib/study-transitions.test.ts`、`tests/integration/study-focus-transitions.integration.test.ts`：增加到期结算、过期后新 start、deadline 时间、legacy key、未到期/paused、并发与 trigger 故障回滚回归；既有 keyed transition 用例保留。
- `tests/server/study-api.test.ts`、`tests/server/study-page-productized.test.ts`：验证 Study 读服务先调用 reconciliation，并同步测试 mock 边界。
- `tests/e2e/start-test-app.ts`、`tests/e2e/authenticated.spec.ts`、`docs/testing-standards.md`：本地 E2E 启动器临时暴露 mode 0600 的隔离数据库 URL 并在退出时删除；Playwright 覆盖离开、到期、重访与刷新后单次可观察结算，文档禁止外部模式误连开发、预发或生产数据库。
- `docs/optimization/qam-07-study-quality-review.md`、`docs/optimization/module-quality-overview.md`：QAM-07-002 标为 resolved；QAM-07 更新为 85/Score L3/Gate L2/Final L2，总览同步为平均 75.9、P1×8/P2×31。
- `feature_list.json`、`progress.md`、本文件：完成 feat-035，记录验收、修复前后证据、权限型复核、清理和唯一下一步。
- 前序 QAM-01/QAM-05/QAM-07-001 的源码、迁移、测试、报告与状态改动完整保留；本轮没有修改 npm 依赖、锁文件、Prisma schema/migration、DST/Goal、Room snapshot、Agent Runtime 或部署配置。

## Verification（最终验证）

- 开始与最终 `./init.sh` 均退出 0；最终为 Prisma Client、TypeScript、ESLint、60 文件/360 项 Vitest 全部通过。
- 修复前定向真实 PostgreSQL 为 6/10 通过：到期 GET 仍返回 running、过期后 start 保留旧 key、过期 stop 使用请求时间、GET settlement 故障路径未触发。修复后 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run test:integration -- tests/integration/study-focus-transitions.integration.test.ts` 为 10/10。
- Study 定向 Node 回归 4 文件/31 项、`npm run check:quick` 60 文件/360 项、独立全量 integration 14 文件/40 项和独立全量 Playwright 10/10 均通过。
- 受限权限边界的 `npm run check` 在 quick 全通过后原始失败为 `Error: Could not parse output from TypeScript's --showConfig.`；按 AGENTS.md 在获准正常权限边界重跑同一 Node 22 命令后退出 0。
- 最终 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full` 单次退出 0：60 文件/360 项 Vitest、Next.js 16.3.3 production build、覆盖率、14 文件/40 项真实 PostgreSQL 和 10/10 Playwright 全部通过。覆盖率 statements 42.67%、branches 36.71%、functions 48.17%、lines 43.40%，均高于门槛。
- `harness-creator` 校验 100/100；35 个 feature 全部为 `done`、活动/阻塞为 0；`git diff --check` 通过。`coverage/`、`playwright-report/`、`test-results/` 已移入系统回收站且 E2E URL 文件不存在；Docker 只保留既有 `xoxo-meridian-postgres`，无 Testcontainers 残留。

## Next Session Startup（恢复步骤）

1. 依次阅读 `AGENTS.md`、`feature_list.json`、`progress.md` 和本文件。
2. 运行 `node --version && npm --version`，期望 v22.23.2 / 10.9.8；PATH 被权限切换清理时使用 `./scripts/run-node22.sh <command>`，Docker 组命令使用 `sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm ...`。
3. 阅读 `docs/optimization/qam-02-room-message-quality-review.md` 的 `QAM-02-001`、`PROJECT_VIEW.md` 的 QAM-02/Cross-cutting/BU-02 边界，以及 `xoxo-qam-02-room-message-review` Skill；确认 feat-035 为 `done` 后，只把新的 Room snapshot 隐私 feature 标为 `in-progress`。
4. 运行 `./init.sh` 建立快速基线；修改 Next.js 页面/Route Handler 前阅读 `node_modules/next/dist/docs/` 中当前版本对应指南。
5. 先补可失败的真实页面或 Playwright 隐私回归：把 `lastGeoIp`、`preferences`、未公开 `profileNote` 写入成员档案后，断言聊天页和复用 snapshot 的 Study 浏览器载荷均不含这些字段，但显示名、头像、公开城市和时区仍可用。
6. 再将 `getRoomSnapshot()` participant/profile 查询改为 Prisma `select` 与显式 view model allow-list，运行风险匹配门禁、最终 `./init.sh`、生成物清理和三份状态更新；不要同时处理消息 trace、Agent dispatch、房间删除或 SSE P1/P2。

## Blockers / Risks（阻塞与风险）

- 当前没有 feature 阻塞项，也没有开放 P0；QAM-07 当前无开放 P1，仅余 DST 和 Goal 排序两个独立 P2。
- 组合首要 P1 为 QAM-02-001：`getRoomSnapshot()` 当前可能把 `lastGeoIp`、`preferences`、`profileNote` 等私有 UserProfile 字段随聊天页序列化到浏览器；该共享 snapshot 也被 Study 页面复用。
- QAM-02-001 的修复应只收窄读模型 projection，不改变 QAM-01 档案写入/隐私所有权、成员资格或既有公开 UI contract。QAM-02-003/004 是独立 P1，不得合并。
- 本轮没有依赖变更；既有审计记录为 production high/critical 0。E2E 直接数据库桥接只能使用启动器创建或显式提供的隔离数据库，临时 URL 文件必须 mode 0600 且退出即删。

## Recommended Next Step（唯一推荐下一步）

另行登记并只修复 `QAM-02-001`：让 Room snapshot 使用 Prisma `select` 与显式公开字段 allow-list，阻止私有 UserProfile 字段进入聊天/Study 浏览器载荷，并用真实页面或 Playwright 隐私回归验证公开字段仍可用；不要与消息 trace、Agent dispatch、房间删除或 SSE 问题合并。
