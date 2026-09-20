# 最新会话交接

## 当前进展

- Last Updated：2026-09-20。本轮实现 **feat-076**「修复 /home 毡板背景未覆盖整个文档表面」（P2，无依赖，来源：用户本轮指定：/home 网格状毡板没有填满背景、滚动时始终有一段非网格背景；时间线随文章无限延伸符合预期）。修复已完成并置 `done`。
- 缺陷（第一性原理）：毡板纹理原本画在**页面内的元素** `.home-linen-page` 上，而文档末尾有一段**由 root layout 拥有、位于该元素之外**的内容——[`app/layout.tsx`](app/layout.tsx) 在 `{children}` 之后渲染 `<AgentEntryGate>`，模型就绪后插入 `div.clearance` 留白（desktopSize 208 + desktopBottom 24 = **232px**）。页面元素不可能覆盖它，所以 `scrollHeight` 恒等于「页面元素高度 + 232」，那 232px 由 body 的纯色 `#f3f7f0`（`background-image: none`）填充。隔离环境 1280×800 实测：scrollHeight 6227、`.home-linen-page` 5995、`.clearance` 位于 5995..6227；滚到底取最后一个像素行，`elementFromPoint` 命中 BODY 且无背景图。
- 实现（纯 CSS）：[`app/globals.css`](app/globals.css) 的 `.home-linen-page { … }` 改为 `body:has(.home-linen-page) { … }`——纹理移到文档表面，三层背景（5px/6px 细网格 + 135° 斜向渐变）与底色逐字未改。[`app/home/page.tsx`](app/home/page.tsx) 未改，类名现在只作 `:has()` 的作用域钩子（CSS 注释已写明用意，**不要当无用类删掉**）。`body` 是唯一保证横跨整个可滚动区域的表面，`:has()` 让作用域仍由「本页是否渲染 /home」决定。相位不变：`.home-linen-page` 是 `<body>` 第一个子元素、无 margin（SiteNav 在其内部），body 绘制原点与它同在 (0,0)。降级：不支持 `:has()` 时整条规则失效，退回 body 纯色，布局不受影响。
- 先红后绿（同一条命令、未放宽断言、未加 skip、未改断言超时）：`E2E_APP_MODE=production npx playwright test tests/e2e/authenticated.spec.ts --project=authenticated -g "felt surface|Home document"`——`git show HEAD:app/globals.css` 退回旧实现后 **`1 failed | 2 passed (43.5s)`、EXIT=1**（失败点 `tests/e2e/authenticated.spec.ts:454` 的 `expect(coverage.backgroundImage).toContain("repeating-linear-gradient")` → `Matcher error: received value must not be null nor undefined`）；恢复修复版本（sha256 `55bf333d5c59405f8f11d254a5f14913b10cfdfe4d4251437d662d5c44bbbd37`）后 **`3 passed (40.7s)`、EXIT=0**。
- 新增测试：`tests/e2e/authenticated.spec.ts` 的「keeps the Home felt surface covering content appended after the page element」（向 body 追加 232px 同形状尾部内容——真实留白依赖 WebGL 模型加载，不适合作为确定性前置，滚到文档末尾取最后一个像素行的 `elementFromPoint`，断言带 `repeating-linear-gradient`、`top === 0`、`bottom >= scrollHeight`）与「scopes the Home felt surface to the Home document」（在 `/study` 断言无毡板类名、body 无背景图且为 `rgb(243, 247, 240)`）。
- **需要保留的判断（易误读）**：第二条「scopes …」是**守卫而非红灯证据**——旧实现下它同样通过（旧实现根本不在 body 上画纹理），它约束的是本次机制不被写成无条件的 `body { background-image: … }`。后轮不要把它算作先红后绿。
- 门禁：`npm run check:full` **exit 0，跑了两次且数字逐项一致**（第一次在 scope 用例补 `toHaveURL` 守卫之前，第二次在冻结的最终内容上）——快速门禁与覆盖率阶段各报 87 文件 **771 项**、生产构建成功、覆盖率 **53.86/47.46/58.91/54.56**（门槛 40/35/45/40）、真实 PostgreSQL **35 文件/140 项**（124.23s / 124.32s）、生产 Playwright **46 passed（3.4 分钟，0 skipped、0 flaky）**（44 → 46 即本轮新增的两条，`:416` 与 `:459`）。`npm run typecheck`、`npm run lint` exit 0；日志无 `npm ERR!`/`ELIFECYCLE`/非零退出。
- 计数与归档：`featuresNumber` 22→**24**（新增 feat-076、feat-077，等于根 `features` 长度）；归档判定 24 ≤ 40，直接跳过。根列表现为 `done` 23 项 + `not-started` 1 项（feat-077），无 `blocked`/`in-progress`。
- 落地：**改动未提交、未推送**。工作区当前有 `app/globals.css`、`tests/e2e/authenticated.spec.ts`、`feature_list.json`、`progress.md`、`session-handoff.md` 的改动（外加门禁构建改写的 [`next-env.d.ts`](next-env.d.ts)，已还原）。是否提交由用户决定，本轮未收到提交指令。

## Files Changed（改动文件）

- 本轮修改：[`app/globals.css`](app/globals.css)（**唯一产品代码改动**，5 行替换为含注释的 6 行）、[`tests/e2e/authenticated.spec.ts`](tests/e2e/authenticated.spec.ts)（新增 2 条用例）、`feature_list.json`、`progress.md`、`session-handoff.md`。
- 本轮未改：[`app/home/page.tsx`](app/home/page.tsx)、`app/layout.tsx`、`components/agent-entry/*`（只读，用于确认留白高度与渲染位置）。
- 未新增迁移、未改依赖/Next 配置/API 契约/Prisma schema。
- 门禁生成的 `coverage/`、`test-results/`、`playwright-report/`、`.next/` 均为按需重建产物。

## Blockers / Risks（未通过、保留边界与风险）

- **feat-077 已登记但未实现**（`not-started`）：`/home` 的 `.home-linen-page` 上的 `overflow: hidden` 使 SiteNav 的最近滚动容器变成该非滚动容器，滚动 1200px 后 nav top 为 -1200，Blog/Chat/Study/New Post 入口全部不可见。对照实验只把该属性改为 `visible` 即回到 0。**不要仅凭症状直接删除该属性**——验收标准第一条要求先说明它原本裁切什么（页面内还有 `absolute`/`fixed` 的装饰光斑与照片层）。它与 feat-076 改的是同一个类名所在的元素，但两件事独立，不要合并。
- **`body:has(.home-linen-page)` 的作用域由页面元素上的类名决定**：若后轮把 `.home-linen-page` 加到别的路由，那些路由的整个文档都会带上网格；「scopes the Home felt surface to the Home document」正是为此。若确实需要复用该类名，必须先改作用域钩子。
- **测试命令的坑（本轮实际踩到）**：`--no-deps` 会跳过 `setup` 项目，而每次 Playwright 运行都新建 testcontainers 数据库，上一轮存下的登录态因此失效，`/home` 会重定向到 `/login`。表现是断言以**另一种方式**失败（本轮首次红灯跑成 `.home-linen-page` 不可见），或让依赖「页面上没有毡板类名」的断言**空过**。跑定向 E2E 时不要加 `--no-deps`；这也是 scope 用例固定 `toHaveURL(/\/study$/)` 的原因。
- 门禁日志计数不一致（历史 750 vs 751）本轮**未复现**：两个阶段一致报 771。若下一轮又遇到，先用 `--reporter=json` 比对逐文件清单，不要直接引用其中一个数字，也不要把「少 1 项」当成用例被跳过。
- `check:full` 以生产构建收尾，会把 [`next-env.d.ts`](next-env.d.ts) 的引用改写到 `./.next/types/*`（开发服务写回 `./.next/dev/types/*`）。跑完门禁后 `git status` 会多出这一个改动，属预期；本轮已还原为 `./.next/dev/types/*`。
- `npm run test:e2e`（默认 `development`）在本机 7.8GB 内存下仍可能因资源压力出现延迟有界的失败；它是诊断入口，不是门禁；浏览器层验收按 `test:e2e:production`。
- 本机另有其它会话/任务在并发占用资源（`scripts/subset-poc-font.py` 单核满载、`pnpm run dev:poc` 常驻、`.poc-logs/`）。**不要把这些进程当作本仓库的测试进程去 kill**，也不要据此判定测试变慢是回归。
- 本轮未运行：`npm run test:compose-smoke`、Compose 构建与实体设备（未改依赖、Next 配置、API 契约或 Compose 启动拓扑）。
- **跑任何 `prisma db push` / `migrate` 命令前，必须显式传入目标库的 `DATABASE_URL`，不要依赖 `.env` 的隐式解析**——此前一轮的事故正源于此。本轮全程使用一次性库 `xoxo_ux_probe`，未触碰开发库 `xoxo_meridian`。

## Next Session Startup（恢复路径与唯一下一步）

1. 依次读取 AGENTS.md、根 feature_list.json、progress 当前总览及所选任务记录、本文件；工作区有本轮未提交改动（`app/globals.css`、`tests/e2e/authenticated.spec.ts` 及三份状态文件），**必须保留，不要 `git checkout` 整文件覆盖**。
2. **唯一下一步：先与用户确认方向**。根列表现有一项 `not-started`——**feat-077**（/home 顶部导航未吸顶，本轮已有直接行为证据与对照实验），通常应优先取它；若用户要回到 QAM 路线，则按 `priorityPolicy`（核心操作受阻程度 → 入口影响范围 → 触发频率 → 恢复成本，同分优先已有直接行为证据者）对 `docs/optimization/module-quality-overview.md` 的开放 QAM P2 排序给出建议。确认后按全局最大编号 +1（当前 feat-077）登记为独立 feature 并只把它标为 `in-progress`，再运行 `./scripts/run-node22.sh ./init.sh` 建立基线。
3. 若用户指定其它方向，同样先登记再实现；不要顺手扩大范围到既有 done 项，也不要把 QAM-06-002/004/006/008 合并进同一次修复。
4. 使用仓库锁定的 Node.js 22.23.2/npm 10.9.8；PATH 被清理时用 `./scripts/run-node22.sh`。沙箱空 Node stdout 与 Docker socket 权限差异按 AGENTS.md 的正常权限边界复核，不因这些已知差异改应用代码。
