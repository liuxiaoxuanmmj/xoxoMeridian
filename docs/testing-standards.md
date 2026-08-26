# 测试标准

## 目标与技术选型

本项目使用分层测试，而不是让单一框架承担所有风险：

- Vitest 4（Node 项目）验证纯函数、Agent 行为、服务模块和带可控依赖的 Route Handler。它与 TypeScript/ESM 工具链一致，反馈最快。
- Vitest 4（jsdom 项目）配合 React Testing Library、`user-event` 和 MSW，验证组件的可访问交互与真实 HTTP 边界，不测试 React 内部状态。
- Testcontainers + PostgreSQL 16 + Prisma 验证唯一约束、外键级联、事务和访问控制等数据库语义。SQLite 或 Prisma mock 不能替代这一层。
- Playwright 验证真实浏览器中的注册/登录、鉴权跳转、发帖、专注计时和聊天等关键旅程。
- V8 coverage 作为非回退门禁；当前全量基线为 statements 40%、branches 35%、functions 45%、lines 40%，后续只能随有效覆盖提高。

Jest、Cypress、AVA、Mocha 都能完成部分工作，但引入它们会造成重复 runner、配置和 mock 语义。当前项目无需再增加第二套单元测试 runner；浏览器旅程选择 Playwright，是因为它与 Next.js Web Server、认证状态复用和多项目依赖直接配合。

## 测试目录

- `tests/agent/**/*.test.ts`：计划、调度、工具和 Agent Runtime 的 Node 测试。
- `tests/lib/**/*.test.ts`：纯函数、适配层、领域服务和存储边界的 Node 测试。
- `tests/server/**/*.test.ts`：认证、授权、API 和服务端渲染行为的 Node 测试。
- `tests/component/**/*.test.tsx`：jsdom + Testing Library 组件测试。
- `tests/integration/**/*.integration.test.ts`：真实临时 PostgreSQL 集成测试。
- `tests/e2e/**/*.spec.ts`：Playwright 用户旅程；`*.setup.ts` 只负责前置状态。
- `tests/mocks/` 与 `tests/setup/`：跨测试共享的网络替身和生命周期清理。

## 命令与门禁

- `npm run test:unit`：Node 项目。
- `npm run test:component`：jsdom 组件项目。
- `npm test`：Node 与组件项目，共享默认快速反馈。
- `npm run test:watch`：本地迭代。
- `npm run test:coverage`：全量 Vitest + V8 门槛。
- `npm run test:integration`：启动 PostgreSQL 16 Testcontainer、执行迁移并运行 Prisma 集成测试。
- `npm run test:e2e`：启动 PostgreSQL Testcontainer、迁移和 seed、Next.js 测试服务，再运行全部 Playwright 项目。
- `npm run test:e2e:public`：只选择 public 项目；它仍依赖认证 setup。
- `npm run check:quick`：类型检查、ESLint、Vitest。
- `npm run check`：快速门禁、生产构建和覆盖率。
- `npm run check:full`：标准门禁、集成测试和 E2E。

集成测试和本地 E2E 要求 Docker daemon 可用；缺少运行时必须失败并明确提示，不得自动 skip。若验证已在外部环境运行，可通过 `PLAYWRIGHT_BASE_URL` 让 Playwright 连接指定服务，此时服务的数据准备与隔离由该环境负责。

## 如何选择测试层级

1. 无 I/O 的规则或格式化：写 `tests/lib` 或 `tests/agent` Node 测试。
2. Route Handler/服务编排，外部依赖可控：写 `tests/server`，只 mock 进程外边界或数据库适配入口。
3. 组件输入、提交、错误提示、键盘和 label：写 Testing Library 组件测试；HTTP 响应用 MSW。
4. 唯一约束、事务、级联、真实查询或数据库权限语义：写 Testcontainers 集成测试。
5. 跨页面、Cookie、重定向、浏览器渲染或核心用户旅程：写 Playwright。

一个缺陷可以同时需要低层回归测试和一条高层旅程，但不要重复断言相同实现细节。

## 编写规则

- 断言用户或调用方可观察的输入、输出、状态和副作用；不得读取源码字符串来证明行为存在。
- 优先使用角色、label 和可见文本查询组件；不要依赖 CSS class、组件实例或私有 state。
- `user-event` 模拟真实交互；仅在底层事件本身是被测对象时使用 `fireEvent`。
- MSW 负责 HTTP 边界；`vi.mock` 只用于时间、随机性、第三方 SDK、Prisma 入口等明确边界。
- 每个测试自行设置所需环境变量、时间和 mock，并在结束后恢复；禁止依赖文件执行顺序。
- 集成测试在每项测试前清空业务表；E2E 使用临时数据库、临时上传目录和非敏感固定账号。
- 可选供应商 SDK 不得因模块导入而访问系统或网络；本地 provider 的导入必须能在 SDK 不可用时工作。
- 异步交互使用 `findBy*` 或 `waitFor`，不得用固定 sleep 掩盖竞态。
- 缺陷修复的测试名称应描述失败场景及期望行为，并确保它在修复前可失败。

## 覆盖率策略

覆盖率只阻止回退，不等同于测试质量。门槛统计 `agent/**/*.ts`、`app/api/**/*.ts` 和 `lib/**/*.ts`，排除声明文件、独立 Worker 入口和 Prisma 单例。提高门槛前先补关键风险路径，尤其是认证、权限、Agent Runtime 和尚未覆盖的 Route Handler；不得通过扩大 exclude、无意义断言或只调用不验证来刷覆盖率。

## 交接要求

在 `progress.md` 和 `session-handoff.md` 中记录实际运行的命令、测试数量、覆盖率和失败原文摘要。若 Docker、网络或外部服务导致某层未运行，应把该层标为未验证，而不是把静态检查或 mock 测试写成它的替代证据。
