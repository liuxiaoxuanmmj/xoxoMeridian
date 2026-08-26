# 会话交接

## Last Updated

2026-08-26

## Current Objective（当前目标）

feat-007 已完成：应用升级至 Next.js 16.3.3、React/React DOM 19.2.8、ESLint 9.39.5 与 flat config；Next 内置 PostCSS high 已清除，最终完整门禁通过。

Next.js 16 的 `middleware` 已迁移为 `proxy`。当前环境的 Turbopack CSS worker 无法建立内部进程连接，因此开发、构建与 E2E 测试服务统一使用官方支持的 `--webpack` 兼容模式；开发服务器仍监听 `0.0.0.0`。

完整门禁最终结果：45 个文件/307 项 Vitest、覆盖率门槛、1 个文件/3 项真实 PostgreSQL 集成测试，以及 1 条认证 setup + 8 条 Playwright 核心旅程全部通过。

仓库原本存在多项与本任务无关的文档删除；这些删除属于用户工作区，未恢复、未覆盖。继续工作时同样应保留。

## Files Changed（改动范围）

- 依赖与工具链：`package.json`、`package-lock.json`、`eslint.config.mjs`；删除 `.eslintrc.json`，升级 Next/React/ESLint 配套主版本。
- Next.js 16：`next.config.mjs`、`next-env.d.ts`、`proxy.ts`；删除 `middleware.ts`，同步 `README.md`。
- 测试引用与 E2E：`tests/server/auth.test.ts`、`tests/server/security-headers.test.ts`、`tests/e2e/start-test-app.ts`、`tests/e2e/authenticated.spec.ts`。
- 状态与交接：`feature_list.json`、`progress.md`、`session-handoff.md`。
- 仓库仍包含 feat-007 之前的大量未提交改动和用户文档删除；均保留，未恢复、未覆盖。

## Next Session Startup（恢复步骤）

1. 阅读 `AGENTS.md`、`feature_list.json`、`progress.md` 和本文件。
2. 确认 Node.js 22、锁定依赖与 Prisma Client；使用 `npm ci && npm run db:generate`。
3. 运行快速基线：`./init.sh`。
4. 需要完整门禁时先启动 Docker Desktop；当前用户可使用 `sudo -n -g docker -u dadalv npm run check:full` 临时获得 docker 组权限。
5. feat-007 已完成，不要重复实现。下一 feature 是 `not-started` 的 feat-009，启动前核对验收标准并将其单独标为 `in-progress`。

## Blockers / Risks（阻塞与风险）

- `npm audit` 与 `npm audit --omit=dev` 当前均为 0 high/critical/moderate，仅剩 tsx → esbuild 0.27.x 的 Windows 本地开发场景 low；等待 tsx 支持安全版本，或在独立依赖任务中验证升级。
- ESLint 10.9.1 当前会触发 `eslint-config-next` 16.3.3 所带 `eslint-plugin-react` 的 rule context API 错误；使用 peer 范围支持的 ESLint 9.39.5，待上游兼容后升级。
- React Hooks 7 编译器诊断暂在 flat config 中关闭，以保持 feat-007 范围；必须在 feat-009 中通过行为测试保护逐项启用。
- 当前执行环境的 Turbopack CSS worker 会因内部进程连接失败而 panic，故开发、构建与 E2E 使用 `--webpack`；不要在未验证完整门禁时移除兼容参数。
- Playwright 本地模式会创建临时 PostgreSQL、临时上传/日志目录并在结束时清理；通过 `PLAYWRIGHT_BASE_URL` 指向外部服务时不会自动准备其数据。
- Docker Desktop 未启动时 Testcontainers 会明确失败；本次未执行 `usermod` 或放宽 socket 权限。
- 本地 `.env` 的 `DATABASE_URL`/`DIRECT_URL` 当前使用 `127.0.0.1:15432`，匹配现有遗留容器；当前 `docker-compose.yml` 声明的是 `5432`，未来若统一重建 Compose 容器必须同步调整。

## Recommended Next Step（唯一推荐下一步）

单独启动 feat-009，在现有组件与 E2E 行为测试保护下逐项启用 React Hooks 7 编译器诊断。
