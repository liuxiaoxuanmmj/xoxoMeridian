# 进度日志

## Current State（当前状态）

Last Updated：2026-08-26。feat-007 已完成；Next.js 16/React 19/ESLint 9 主版本迁移、生产审计与完整门禁均已通过，无当前 feature 阻塞。

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

该阶段推荐的 feat-007 已在后续会话完成；当前唯一推荐下一步见上方 feat-009。
