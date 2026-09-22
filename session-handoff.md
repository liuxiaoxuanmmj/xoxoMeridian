# 最新会话交接

## 当前进展

- Last Updated：2026-09-22。本轮完成 **feat-079**「修复 QAM-05-006 错误响应泄漏内部异常」（P2，依赖 feat-078 已满足，来源 QAM-05-006，用户上一轮指定），置为 `done`。根列表 **26 项全部 `done`**，没有 `not-started`/`in-progress`/`blocked`。
- 缺陷与边界：非预期异常原先分两条路泄漏——[`lib/api.ts`](lib/api.ts) 的 `errorToResponse` 只在 production 返回通用文案、非 production 直接返回 `error.message`，[`app/actions/posts.ts`](app/actions/posts.ts) 的 `serverError` 把 `Error.message` 交给编辑器。本轮核对时另发现 [`app/api/health/route.ts`](app/api/health/route.ts) 有同一条 `env.NODE_ENV === "production"` 门控，直接违反验收标准 2，一并纳入。**有意不改**：`ScheduledJob*`/`ToolApproval*`/`StudyTransitionConflictError`/`AtlasImageValidationError`/`ValidationError` 的文案是刻意面向调用方或用户的；天气、`refine-note`、房间 SSE 的 `error`/`reason` 负载经核查是有意诊断信息且 UI 从不展示。只收敛「未被识别的异常」这一条通用路径。
- 实施：新增 [`lib/internal-error.ts`](lib/internal-error.ts) 作为单点收口——`INTERNAL_ERROR_MESSAGE`（`"Internal server error"`）与 `logInternalError(scope, error)`（一条 `console.error`：既有作用域前缀 + 12 位关联 id + 异常自身 message/stack，返回关联 id），**有意不按 `NODE_ENV` 分支**。`errorToResponse` 与 `serverError` 改为调用它；`health` 的 `dbError` 恒为 `database unavailable`。日志只写异常自身的 message 与 stack，**不写请求体、表单字段、查询参数或凭据**——调用方也不要把这些拼进 message。
- 验收证据（E3，三层）：Node 层 [`tests/server/error-response-contract.test.ts`](tests/server/error-response-contract.test.ts) 9 项（真实形状的 `P2002`、`connect ECONNREFUSED 127.0.0.1:5432`、畸形 JSON 400、请求体用户内容不入日志、Action 校验文案与 `[createPost]` 前缀、`vi.stubEnv`+`vi.resetModules` 断言 development/production 响应逐字相等）；真实 PostgreSQL 层 [`tests/integration/error-response-redaction.integration.test.ts`](tests/integration/error-response-redaction.integration.test.ts) 4 项（临时唯一索引触发真实 P2002、触发器 `fail_post_insert()` 抛带约束名的 PG 异常、同一触发器下的 Server Action、畸形 JSON 守卫；临时索引/触发器在 `finally` 清理）；production Chromium [`tests/e2e/authenticated.spec.ts`](tests/e2e/authenticated.spec.ts) `:1583`「编辑器遇到数据库异常时只显示通用文案且不跳转」（条件式 `BEFORE INSERT` 触发器只对哨兵标题生效，断言横幅恰为 `Internal server error`、URL 停在 `/posts/new`、横幅与 `body` 不含约束名/stack、该标题 0 行；对照标题必须真正发布并跳转、恰好 1 行）。
- 先红后绿（未放宽断言、未加 skip、未改断言超时）：Node 层旧实现 **`5 failed | 4 passed (9)`** → 修复后 **9/9**；真实 PostgreSQL 层用「临时还原 `lib/api.ts` + `app/actions/posts.ts` 旧行为」的对照 **`3 failed | 1 passed (4)`**、EXIT=1 → 恢复后 **4/4**、EXIT=0，两文件按 sha256 `868c099a…`/`d470a86d…` 还原一致、`TEMP-RED-PROBE` 零残留。**通过的四项/一项是守卫而非红灯证据**，已在报告与进度里如实标注。
- 门禁：`npm run check:full` **单次 exit 0**——88 文件 **780 项** Vitest ×2（两阶段计数一致，+9 即新增的 Node 契约文件）、生产构建 `✓ Compiled successfully in 19.3s`、覆盖率 **55.05/48.40/59.91/55.67**（门槛 40/35/45/40）、真实 PostgreSQL **36 文件/144 项**（127.11s）、生产 Playwright **50 passed（3.7 分钟，0 skipped、0 flaky）**。`npm run typecheck`、`npm run lint` exit 0。全日志无 `✘`/`FAIL`/`ELIFECYCLE` 命中。未跑 `npm run test:compose-smoke`、Compose 构建与实体设备。
- QAM-05 报告同步：QAM-05-006 移入「已解决的 P2」、开放问题归零；`接口与依赖关系` 8→9、`安全与隐私` 8→9，**87→89（Score L3）**；L4 硬条件全部满足，**Gate L3→L4**，但 **Final 仍为 L3**（89 未进 90 的 L4 区间）——这个「Gate 已 L4、Final 仍 L3」的区别已写进报告的 Overall 与门禁表。模块总览的 QAM-05 行、组合均分（87.3→87.5）、开放问题数（21→20）与历史表同步。
- 计数与归档：`featuresNumber` **26** 不变（只改状态）；归档判定 26 ≤ 40，直接跳过。
- 落地：**改动未提交、未推送**。是否提交由用户决定，本轮未收到提交指令。

## Files Changed（改动文件）

- 本轮新增：[`lib/internal-error.ts`](lib/internal-error.ts)（收口常量与日志函数）、[`tests/server/error-response-contract.test.ts`](tests/server/error-response-contract.test.ts)（9 项）、[`tests/integration/error-response-redaction.integration.test.ts`](tests/integration/error-response-redaction.integration.test.ts)（4 项）。
- 本轮修改：[`lib/api.ts`](lib/api.ts)（`errorToResponse` 尾部）、[`app/actions/posts.ts`](app/actions/posts.ts)（`serverError` 与新增导入）、[`app/api/health/route.ts`](app/api/health/route.ts)（catch 块与移除 `env` 导入）、[`tests/e2e/authenticated.spec.ts`](tests/e2e/authenticated.spec.ts)（新增 1 条生产用例，并把对照步骤的 URL 断言收紧为 `/\/posts\/(?!new$)[^/]+$/`）、[`docs/optimization/qam-05-content-timeline-quality-review.md`](docs/optimization/qam-05-content-timeline-quality-review.md)、[`docs/optimization/module-quality-overview.md`](docs/optimization/module-quality-overview.md)、`feature_list.json`、`progress.md`、`session-handoff.md`。
- **仍在工作区、属于上一轮 feat-078 的未提交改动（必须保留，不要 `git checkout` 整文件覆盖）**：删除的 `app/chat/[roomId]/atlas/page.tsx`、`components/atlas/AtlasApp.tsx`、`components/atlas/AtlasToolbar.tsx`、`components/atlas/AtlasUploadModal.tsx`、`app/api/atlas/stream/route.ts`、`lib/atlas-reconcile.ts`，以及修改的 [`components/atlas/types.ts`](components/atlas/types.ts)、[`PROJECT_VIEW.md`](PROJECT_VIEW.md)、[`docs/optimization/qam-06-spatial-media-quality-review.md`](docs/optimization/qam-06-spatial-media-quality-review.md) 与本轮同时改动的 [`tests/e2e/authenticated.spec.ts`](tests/e2e/authenticated.spec.ts)。
- 未新增迁移、未改依赖/Next 配置/Prisma schema/API 契约。门禁生成的 `coverage/`、`test-results/`、`playwright-report/`、`.next/` 均为按需重建产物；门禁构建改写的 [`next-env.d.ts`](next-env.d.ts) 已还原为 `./.next/dev/types/*`。

## Blockers / Risks（未通过、保留边界与风险）

- **根列表已无待办**：26 项全部 `done`。下一轮**先问用户方向**，或按 `priorityPolicy`（核心操作受阻程度 → 入口影响范围 → 触发频率 → 恢复成本，同分优先已有直接行为证据者）从 [`docs/optimization/module-quality-overview.md`](docs/optimization/module-quality-overview.md) 的开放 QAM P2（当前 20 项）排序给出建议后再登记；不要顺手把多个 QAM 合并进一次修复。新登记按全局最大编号 +1（当前最大 ID 为 feat-079）。
- **QAM-05 现在是「Gate 已 L4、Final 仍 L3」**（本轮新状态）：Gate 的 L4 硬条件已全部满足，但 89 分未进 90 分的 L4 区间。**不要因为「开放问题为 0」就写成模块已达 L4**；报告 Overall 与门禁表已写明这一区别。`安全与隐私`/`接口与依赖关系` 各差 1 分的理由（领域错误文案仍是隐式客户端契约、HTTP/Action 两套写路径、`jsonError` 仍允许任意文案）保留在报告里。
- **通用错误契约靠约定与测试维持，不是类型强制**：`jsonError(message, status, details)` 仍接受任意文案，新增 Route/Action 时若直接拼 `error.message`，本轮测试不会在该新入口上失败。新写入点请走 `lib/internal-error.ts`；改 `errorToResponse`/`serverError`/`health` 的 catch 时，`tests/server/error-response-contract.test.ts` 会拦住回归。
- **领域错误是有意保留的用户可见文案**：改这些错误文本（`ScheduledJob*`、`ToolApproval*`、`StudyTransitionConflictError`、`AtlasImageValidationError`、`ValidationError`）等于改客户端契约，需按契约变更评审，不要以「统一脱敏」为由顺手改掉。
- **QAM-06 报告只登记关闭、未重新评分**（feat-078 遗留）：Score/Gate/Final 仍是 81/L3、L2/L2；健壮性与性能两个维度中引用 SSE 生命周期的扣分理由已失效，**下一次完整复审必须重算**。
- **保留的残余（有意保留、不是遗漏）**：`/api/atlas/*` 服务端面（建板、元素、连接、uploads 写入）现在**没有产品入口**，QAM-06 剩下三个 P2 的风险面全部落在这里；`components/atlas` 画布组件族只被组件测试引用。后续若要清理，先按新 feature 登记并与用户确认，**不要**顺手删。
- **`.next/types` 陈旧产物会误报编译错误**：删除路由/文件后 `tsc --noEmit` 可能报 `TS2307: Cannot find module '…'`，来源是 `next build`/dev 写下的 `.next/types`、`.next/dev/types` 里的逐路由类型文件。`npx next typegen` **不会**清理它们——先 `rm -rf .next/types`（dev 产物同理 `rm -rf .next/dev/types`）再 typegen。遇到同类报错先怀疑陈旧产物，不要因此回退删除。
- **`.home-linen-page` 上的 `overflow` 仍是单点承担**（feat-077 遗留）：裁切与「非滚动容器」两个语义都由 [`app/globals.css`](app/globals.css) 的那条规则决定。不要在 JSX 里再给该容器加任何 `overflow-*` Tailwind 类，也不要改回 `overflow: hidden` 单值；`body:has(.home-linen-page)` 依赖类名做 `:has()` 作用域钩子，**不能当无用类删掉**。
- **Docker 必须先起来**：跑门禁前先 `docker info` 自检；没有 Docker 时不要把集成/E2E 阶段记为通过。本轮实况：WSL 侧原先只有 root:root 的 Desktop 代理 socket（`/mnt/wsl/docker-desktop/shared-sockets/…`，非 root 连不上、`sudo -n` 也不可用），用户启动 Docker Desktop 后 `/var/run/docker.sock`（`root:docker` 660，当前用户在 `docker` 组）出现、`docker info` 返回 `29.7.2 | Docker Desktop | overlayfs`。**不要删除**用户既有的 `xoxo-meridian-postgres` 容器与 `xoxo-meridian_default` 网络。
- **`--no-deps` 的坑**：`tests/e2e/authenticated.spec.ts` 的 `setup` 项目会建立每次全新的 testcontainers 数据库与登录态；加 `--no-deps` 会跳过它，上一轮存下的登录态失效、`/home` 重定向到 `/login`，断言会以**另一种方式**失败或**空过**。跑定向 E2E 时不要加 `--no-deps`。
- **写浏览器断言时注意 URL 正则的自匹配**：`/\/posts\/[^/]+$/` 会命中当前页 `/posts/new`，断言立刻通过而失去同步点，后续的库内断言会与仍在飞行的写入竞争（本轮实际踩到）。对照步骤写成 `/\/posts\/(?!new$)[^/]+$/`。
- `check:full` 以生产构建收尾，会把 [`next-env.d.ts`](next-env.d.ts) 的引用改写到 `./.next/types/*`；跑完门禁后 `git status` 会多出这一个改动，属预期，本轮已还原为 `./.next/dev/types/*`。
- `npm run test:e2e`（默认 `development`）在本机 7.8GB 内存下仍可能因资源压力出现延迟有界的失败；它是诊断入口，不是门禁；浏览器层验收按 `test:e2e:production`。
- 本机另有其它会话/任务在并发占用资源（`scripts/subset-poc-font.py`、`pnpm run dev:poc`、`.poc-logs/`）。**不要把这些进程当作本仓库的测试进程去 kill**，也不要据此判定测试变慢是回归。
- 本轮未运行：`npm run test:compose-smoke`、Compose 构建与实体设备（未改依赖、Next 配置、API 契约或 Compose 启动拓扑，未新增迁移）。
- **跑任何 `prisma db push` / `migrate` 命令前，必须显式传入目标库的 `DATABASE_URL`，不要依赖 `.env` 的隐式解析**——此前一轮的事故正源于此。本轮未触碰开发库 `xoxo_meridian`。

## Next Session Startup（恢复路径与唯一下一步）

1. 依次读取 AGENTS.md、根 feature_list.json、progress 当前总览及所选任务记录、本文件；工作区有**两轮未提交改动**（本轮 feat-079 的 3 个文件/3 处修改，加上 feat-078 的 6 个删除文件、`components/atlas/types.ts`、`PROJECT_VIEW.md`、`docs/optimization/qam-06-spatial-media-quality-review.md` 及三份状态文件），**必须保留，不要 `git checkout` 整文件覆盖**。
2. **下一步不再是既有待办**：根列表 26 项全部 `done`。先向用户确认方向；若用户要求继续，按 `priorityPolicy` 从模块总览的开放 QAM P2（20 项）给出排序建议，让用户选定后再登记（新 ID 为 feat-080）。
3. 不要顺手扩大范围到既有 done 项，也不要把多个 QAM 合并进同一次修复；若回到 QAM-05，先读报告的「Gate 已 L4、Final 仍 L3」说明再决定是否重算维度。
4. 使用仓库锁定的 Node.js 22.23.2/npm 10.9.8；PATH 被清理时用 `./scripts/run-node22.sh`。跑集成/生产 E2E 前先 `docker info` 自检。沙箱空 Node stdout 与 Docker socket 权限差异按 AGENTS.md 的正常权限边界复核，不因这些已知差异改应用代码。
