# AGENTS.md

## 项目概览

XOXO Meridian 是一个面向私密双人空间的 Next.js 15 全栈应用，提供认证、聊天、博客、空间画布、专注学习和独立 Agent Runtime。
应用采用 TypeScript、App Router、Prisma 与 PostgreSQL；Web、数据库初始化器和 Agent Worker 可通过 Docker Compose 协同部署。

## 快速开始

### Startup Workflow（首次运行）

- 前置环境：Node.js 22、npm、Docker 与 Docker Compose。
- 安装锁定依赖：`npm ci`
- 创建本地配置：`cp .env.example .env`，填写必需配置且不得保留生产用占位密钥。
- 启动数据库：`docker compose up -d postgres`
- 应用迁移并写入初始数据：`npm run db:deploy && npm run db:seed`
- 建立快速验证基线：`./init.sh`
- 启动 Web：`npm run dev`
- 当 `AGENT_TASK_INLINE_RUN=false` 时，在另一终端运行：`npm run agent:worker`

开始编码前必须依次阅读 `AGENTS.md`、`feature_list.json`、`progress.md` 和 `session-handoff.md`；确认依赖与验收标准后，只把一个未完成 feature 标为 `in-progress`，再运行 `./init.sh`。

### 验证门禁

- 快速门禁：`npm run check:quick`（类型、lint、Node/组件测试）。
- 标准门禁：`npm run check`（快速门禁、生产构建、覆盖率基线）。
- 完整门禁：`npm run check:full`（标准门禁、真实 PostgreSQL 集成测试、Playwright E2E；要求 Docker）。
- 部署重启：先运行 `docker compose build web agent-worker init`，再运行 `docker compose up -d`。

### Stay in Scope（范围边界）

- One feature at a time：一次只实现一个 feature，不隐式扩大其验收标准；新发现的工作必须登记为独立 feature。
- 状态只允许 `not-started`、`in-progress`、`blocked`、`done`；依赖未完成时不得开始下游 feature。

### Definition of Done（完成定义）

- Feature 只有在验收标准满足、相关测试通过、验证范围与证据同时写入 `feature_list.json` 和 `progress.md` 后才能标记为 `done`。
- 无关的既有检查失败时，记录原始失败并保持当前范围，不得用扩大改动范围换取“全绿”。

### End of Session（会话结束）

- Before ending，更新 `feature_list.json`、`progress.md` 和 `session-handoff.md`，记录状态、改动文件、验证、阻塞与一个推荐下一步。
- 保持仓库 restartable：不得留下半写入状态；交接中的 clean restart 路径必须能由下一会话直接执行。

## 硬约束

1. 所有仓库相关的助手回复、进度记录和交接说明必须使用中文；代码标识符、协议字段和第三方专有名词除外。
2. 统一使用 Node.js 22 与 npm；安装必须以 `package-lock.json` 为准，依赖变更必须更新锁文件并复查 `npm audit`，生产 high/critical 漏洞必须修复或在交接中记录风险、原因和升级计划。
3. 使用严格 TypeScript、ES Modules 和 `@/*` 路径别名；沿用两空格缩进、双引号和分号，不新增无必要的 JavaScript 文件。
4. `app/` 只承载页面、布局和路由入口，`components/` 承载 UI，`lib/` 承载共享领域/服务逻辑，`agent/` 承载 Agent 编排与工具；路由处理器不得成为业务逻辑百科全书，`cookies()`、`headers()`、动态 `params` 与 `searchParams` 必须异步读取。
5. 受保护页面和 API 必须通过 `lib/auth.ts` 的认证入口；房间、任务和用户资源还必须执行成员资格或所有权校验。
6. 所有不可信输入必须先经过 `lib/validation.ts` 或同域 Zod schema 校验，不得把原始请求体、查询参数或工具输入直接交给 Prisma 或外部服务。
7. 数据库访问统一复用 `lib/prisma.ts`；模型变更必须同时更新 schema 和新增时间戳迁移，不得修改或删除已应用迁移，并保持 `prisma migrate deploy` 与 `init` 容器兼容。
8. 密钥和环境差异只能通过环境变量提供；不得提交 `.env`、凭据、令牌、真实用户数据或包含敏感载荷的日志。
9. 对象存储、邮件、天气、搜索和 LLM 必须通过适配层访问；可选供应商 SDK 必须惰性加载，测试不得依赖真实网络、真实凭据或开发机状态。
10. Agent 只能执行 `agent/tool-registry.ts` 注册且经过输入校验和 tracer 记录的工具；Docker 部署必须由 `agent-worker` 消费任务，内联执行仅限明确配置的本地开发或测试。
11. 新增或修改的交互控件必须可由键盘操作并具有可访问名称；表单字段必须绑定可查询的 label，lint 例外必须局部说明原因。
12. 测试必须验证可观察行为而非源码字符串或内部实现细节；Node、组件、集成和 E2E 测试必须按目录分层，并隔离 mock、时间、环境变量和数据库状态。
13. 缺陷修复必须带回归测试；数据库约束/级联/权限语义使用真实 PostgreSQL 集成测试，关键用户旅程使用 Playwright，不能用 mock 或源码扫描替代对应层级。
14. 声明完成前必须运行与风险匹配的门禁并记录证据；失败或因 Docker、网络等环境条件未运行的检查必须写明原始命令与原因，不得声称“全部通过”。
15. 保留与当前任务无关的用户改动；不得擅自恢复删除文件、覆盖未提交内容、删除已应用迁移或执行破坏性 Git 操作。

## 专题入口

- [产品与总体架构](README.md) — 首次理解产品边界、主要数据流或本地运行方式时阅读；若与代码冲突，以当前代码和配置为准。
- [脚本与依赖](package.json) — 运行命令、添加依赖或调整 Node 工具链时查阅。
- [环境变量模板](.env.example) — 新增配置、接入外部服务或准备本地/生产环境时必读。
- [Docker Compose 拓扑](docker-compose.yml) — 修改 PostgreSQL、初始化器、Web、Worker、卷或部署顺序时必读。
- [容器构建定义](Dockerfile) — 修改 Node 版本、构建产物、运行用户或 Web/Worker 镜像时必读。
- [数据模型](prisma/schema.prisma) — 修改持久化模型、关系、索引或枚举时必读。
- [数据库迁移](prisma/migrations/) — 设计 schema 变更、检查部署兼容性或排查迁移问题时必读。
- [API 路由](app/api/) — 添加或修改端点、认证、权限、缓存、SSE 或错误响应时查阅。
- [认证与访问控制](lib/auth.ts) — 修改会话、Cookie、登录态或受保护资源访问时必读；房间权限同时查阅 `lib/access.ts`。
- [输入校验](lib/validation.ts) — 新增请求字段、表单、路由参数或工具输入时必读。
- [Agent Runtime](agent/) — 修改计划、任务调度、上下文、追踪、Worker 或模型调用时查阅。
- [Agent 工具注册表](agent/tool-registry.ts) — 添加、删除或授权 Agent 工具时必读。
- [测试标准](docs/testing-standards.md) — 选择测试层级、编写测试、调整覆盖率或排查 Testcontainers/Playwright 时必读。
- [Vitest 配置](vitest.config.ts) — 修改 Node/jsdom 项目、setup、别名或覆盖率门槛时必读。
- [Playwright 配置](playwright.config.ts) — 修改浏览器项目、认证状态、Web Server 或 E2E 产物时必读。
- [功能状态](feature_list.json) — 开始工作前选择一个未完成特性并核对依赖与验收标准。
- [进度日志](progress.md) — 交接前记录改动、验证证据和阻塞项。
- [会话交接](session-handoff.md) — 恢复工作时查看当前状态、可复现命令和唯一推荐下一步。
