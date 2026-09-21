# 最新会话交接

## 当前进展

- Last Updated：2026-09-21。本轮实现 **feat-077**「修复 /home 顶部导航未吸顶」（P2，无依赖，来源：feat-076 的浏览器实测中发现、2026-09-20 按 Stay in Scope 单独登记，本轮由用户指定实现）。修复已完成并置 `done`，根列表 **24 项全部 `done`**。
- 根因（第一性原理，真实浏览器变体矩阵，非推断）：[`app/home/page.tsx`](app/home/page.tsx) 的页面容器 `.home-linen-page` 带 `overflow: hidden`，而它是 sticky 的 SiteNav 的最近**滚动容器**——该容器自身不可滚动，所以导航只能随文档滚走（滚动 1200px 后 `nav.getBoundingClientRect().top` 为 **-1200**，computed `position` 仍是 `sticky`）。祖先链 `nav` → `.home-linen-page` → `body` → `html` 上只有它一个非 `visible` 溢出，且四者都没有 `transform`/`filter`/`contain`/`will-change`，故为唯一原因。1280 视口、12 篇真实 Post 撑到 scrollHeight 2353 后逐变体实测：`hidden/hidden` → navTop **-1200**、文档 scrollWidth **1280**（无横向滚动条）；`visible/visible` → navTop **0**、scrollWidth **1494**（出现横向滚动条）；`clip/clip` → navTop **0**、scrollWidth **1280**；`clip/visible` → navTop **0**、scrollWidth **1280**。
- 该裁切原本处理什么（验收标准要求先说明、**不得仅凭症状删除**）：越界的**空间照片层**——[`components/home/HomePhotoElement.tsx`](components/home/HomePhotoElement.tsx) 拖动按位移累加（`onMove(id, startX + dx, startY + dy)`），x/y **没有夹取**，用户可以把照片拖出容器右边界（探针里照片右边界 1490 > 1280）。三个装饰光斑是 `position: fixed`：既不产生可滚动溢出、也不在祖先的裁剪链上（fixed 的包含块是视口），不是该属性的服务对象。
- 实现：[`app/globals.css`](app/globals.css) 新增 `.home-linen-page { overflow: hidden; overflow: clip; }`——`overflow: clip` 保留同样的裁切语义却**不创建滚动容器**，sticky 因此重新相对视口解析；上一行 `hidden` 作为降级，不支持 `clip` 的浏览器只退回「导航不吸顶」，**横向裁切始终不丢失**。[`app/home/page.tsx`](app/home/page.tsx) 去掉容器上的 Tailwind `overflow-hidden` 类（同类属性会与 CSS 规则同层竞争），改由 globals.css 单点承担。**未改用 `position: fixed`**（验收标准明确禁止），SiteNav 仍是 `sticky`。
- 先红后绿（同一条命令、未放宽断言、未加 skip、未改断言超时）：`E2E_APP_MODE=production npx playwright test tests/e2e/authenticated.spec.ts --project=authenticated -g "keeps the Home navigation sticky"`——旧实现 **`1 failed | 1 passed (41.9s)`、EXIT≠0**（`tests/e2e/authenticated.spec.ts:1660` 的 `expect(await navTop()).toBe(0)` → `Expected: 0 / Received: -1200`），最终实现 **`2 passed (43.4s)`、EXIT=0**。负向对照同用这条窄命令：**对照 A**（只删掉 `clip` 那一行、保留 `hidden`）**`1 failed | 1 passed (40.3s)`**，失败点同为 `:1660`；**对照 C**（把裁切整个删掉、改 `overflow: visible`）**`1 failed | 1 passed (40.8s)`**，失败点变为 `:1668` 的 `Expected: 1280 / Received: 1494`。三处对照均按 sha256 与冻结副本比对恢复一致。
- 新增测试：[`tests/e2e/authenticated.spec.ts`](tests/e2e/authenticated.spec.ts) 末尾（`:1582`）的「keeps the Home navigation sticky above the scrollable felt board」——写入 12 篇真实 Post 撑长文档并**先断言可滚动高度 ≥ 1200**（内容不足时直接失败，而不是让「滚动 1200px」变成空断言）；滚动前后各断言 nav top 为 0、Blog/Chat/Study/New Post `visible` 且用 `document.elementFromPoint` 做**命中测试**（位置断言覆盖不到「可点击性」）；断言 `document.documentElement.scrollWidth === clientWidth`（裁切语义未被删除）；最后真实点击 Chat 并断言跳转 `/chat`。
- 门禁：`npm run check:full` **单次 exit 0**——快速门禁与覆盖率阶段各报 87 文件 **771 项**（新增的是 Playwright 用例、不计入 Vitest，故与上一轮同为 771）、生产构建 `✓ Compiled successfully in 4.9s`、覆盖率 **53.86/47.46/58.91/54.56**（门槛 40/35/45/40）、真实 PostgreSQL **35 文件/140 项**（125.78s）、生产 Playwright **47 passed（4.0 分钟，0 skipped、0 flaky）**（46 → 47 即本轮新增用例 `:1582` 3.3s；feat-076 的两条毡板守卫 `:416`/`:459` 同时在列）。`npm run typecheck`、`npm run lint` exit 0。未跑 `npm run test:compose-smoke`、Compose 构建与实体设备。
- 计数与归档：`featuresNumber` 保持 **24**（只改状态，未增删条目）；归档判定 24 ≤ 40，直接跳过。
- 落地：**改动未提交、未推送**。工作区有 `app/globals.css`、`app/home/page.tsx`、`tests/e2e/authenticated.spec.ts`、`feature_list.json`、`progress.md` 的改动（门禁构建改写的 [`next-env.d.ts`](next-env.d.ts) 已还原为 `./.next/dev/types/*`）。是否提交由用户决定，本轮未收到提交指令。

## Files Changed（改动文件）

- 本轮修改：[`app/globals.css`](app/globals.css)（+11 行：`.home-linen-page` 的 `overflow: hidden; overflow: clip;` 与中文理由注释）、[`app/home/page.tsx`](app/home/page.tsx)（1 行类名：去掉 `overflow-hidden`，加 2 行注释）、[`tests/e2e/authenticated.spec.ts`](tests/e2e/authenticated.spec.ts)（新增 1 条用例）、`feature_list.json`、`progress.md`、`session-handoff.md`。
- 本轮未改：[`components/blog/SiteNav.tsx`](components/blog/SiteNav.tsx)、[`components/home/*`](components/home)、[`hooks/useScrollMemory.ts`](hooks/useScrollMemory.ts)（只读，用于确认吸顶实现是 `sticky top-0`、照片坐标不夹取、滚动记忆走的是 window scroller）。
- 未新增迁移、未改依赖/Next 配置/API 契约/Prisma schema。门禁生成的 `coverage/`、`test-results/`、`playwright-report/`、`.next/` 均为按需重建产物。

## Blockers / Risks（未通过、保留边界与风险）

- **下一轮没有已登记的待办**：根列表 24 项全部 `done`，没有 `not-started`/`blocked`/`in-progress`。必须先与用户确认方向再登记新 feature，**不要**自行发明任务或顺手扩大范围到既有 done 项。
- **`.home-linen-page` 上的 `overflow` 现在是单点承担**：裁切与「非滚动容器」两个语义都由 [`app/globals.css`](app/globals.css) 的这条规则决定。**不要在 JSX 里再给该容器加任何 `overflow-*` Tailwind 类**（utility 会与 CSS 规则同层竞争并可能把滚动容器语义带回来），也不要把它改回 `overflow: hidden` 单值——对照 A 已实测会立刻退回 nav top -1200。
- **浏览器降级是有意的**：不支持 `overflow: clip` 的浏览器保留 `hidden`，只退回「导航不吸顶」的旧行为。若后轮要支持这些浏览器，需要另找方案（例如给照片坐标加夹取），**不要**用 `position: fixed` 绕过——验收标准明确禁止。
- **`body:has(.home-linen-page)` 的作用域由页面元素上的类名决定**（feat-076 的机制）：该类名现在只是 `:has()` 的作用域钩子，**不能当无用类删掉**；若把该类名复制到别的路由，那些路由的整个文档都会带上网格。
- **Docker 必须先起来**：本机 Docker Desktop 这次是关闭状态（`/var/run/docker.sock` 不存在），由用户启动后 `check:full` 的真实 PostgreSQL 与生产 Playwright 阶段才跑通；跑门禁前先 `docker info` 自检，不要在没有 Docker 时把集成/E2E 阶段记为通过。用户既有的 `xoxo-meridian-postgres` 容器（2026-09-07 创建）与 `xoxo-meridian_default` 网络属用户环境，**不要删**。
- **测试命令的坑（本轮实际踩到）**：`--no-deps` 会跳过 `setup` 项目，而每次 Playwright 运行都新建 testcontainers 数据库，上一轮存下的登录态因此失效，`/home` 会重定向到 `/login`，断言会以**另一种方式**失败或**空过**。跑定向 E2E 时不要加 `--no-deps`。
- **探针的前置条件坑**：测「滚动 1200px」必须先用真实内容把文档撑长。首轮探针文档只有约 728px、最大滚动 8px，nav 数据无意义；补 12 篇 Post 后 scrollHeight 2353 才有效。新增用例已把「可滚动 ≥ 1200」写成前置断言，不要删掉它。
- `check:full` 以生产构建收尾，会把 [`next-env.d.ts`](next-env.d.ts) 的引用改写到 `./.next/types/*`（开发服务写回 `./.next/dev/types/*`）。跑完门禁后 `git status` 会多出这一个改动，属预期；本轮已还原为 `./.next/dev/types/*`。
- `npm run test:e2e`（默认 `development`）在本机 7.8GB 内存下仍可能因资源压力出现延迟有界的失败；它是诊断入口，不是门禁；浏览器层验收按 `test:e2e:production`。
- 本机另有其它会话/任务在并发占用资源（`scripts/subset-poc-font.py` 单核满载、`pnpm run dev:poc` 常驻、`.poc-logs/`）。**不要把这些进程当作本仓库的测试进程去 kill**，也不要据此判定测试变慢是回归。
- 本轮未运行：`npm run test:compose-smoke`、Compose 构建与实体设备（未改依赖、Next 配置、API 契约或 Compose 启动拓扑）。
- **跑任何 `prisma db push` / `migrate` 命令前，必须显式传入目标库的 `DATABASE_URL`，不要依赖 `.env` 的隐式解析**——此前一轮的事故正源于此。本轮探针全程使用一次性库 `xoxo_ux_probe`，未触碰开发库 `xoxo_meridian`。

## Next Session Startup（恢复路径与唯一下一步）

1. 依次读取 AGENTS.md、根 feature_list.json、progress 当前总览及所选任务记录、本文件；工作区有本轮未提交改动（`app/globals.css`、`app/home/page.tsx`、`tests/e2e/authenticated.spec.ts` 及三份状态文件），**必须保留，不要 `git checkout` 整文件覆盖**。
2. **唯一下一步：先与用户确认方向**。根列表 24 项全部 `done`、没有未完成项，也没有已登记的后继任务：若用户要回到 QAM 路线，按 `priorityPolicy`（核心操作受阻程度 → 入口影响范围 → 触发频率 → 恢复成本，同分优先已有直接行为证据者）对 [`docs/optimization/module-quality-overview.md`](docs/optimization/module-quality-overview.md) 的开放 QAM P2 排序给出建议并让用户选定；若用户直接指定问题，同样先登记。确认后按全局最大编号 +1（当前最大 ID 为 feat-077）登记为独立 feature 并只把它标为 `in-progress`，再运行 `./scripts/run-node22.sh ./init.sh` 建立基线。
3. 不要顺手扩大范围到既有 done 项，也不要把多个 QAM 合并进同一次修复。
4. 使用仓库锁定的 Node.js 22.23.2/npm 10.9.8；PATH 被清理时用 `./scripts/run-node22.sh`。沙箱空 Node stdout 与 Docker socket 权限差异按 AGENTS.md 的正常权限边界复核，不因这些已知差异改应用代码。
