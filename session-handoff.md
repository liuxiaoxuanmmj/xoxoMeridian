# 会话交接

## Last Updated

2026-08-31

## Current Objective（当前目标）

feat-023「固化会话退出检查清单」已完成文档改动，但因 `npm run check` 的生产构建失败处于 `blocked`；当前没有 `in-progress` feature。`AGENTS.md` 已将构建、测试、进度、临时工件和启动路径五项全部满足定义为“完成”或“清洁退出”的前提，并要求失败原文进入交接。新增 `npm run check:compose-config`：只用临时非敏感环境变量渲染并校验隔离 Compose 配置，不访问 Docker daemon；新增 `npm run test:compose-smoke`：实际构建 production Web/Worker 镜像，在随机 Compose project 中验证 init、Web healthcheck/standalone、独立 Worker 消费 AgentTask，并清理所有测试资源。

该 smoke 补足了 `check:full` 的部署缺口：后者仍是应用级门禁，使用 Testcontainer 与本机 `next dev`；新命令专门验证 Dockerfile production runner、init 容器、Compose healthcheck 及 agent-worker 协作，两者互补且不互相替代。

此前 `docs/optimization/agent-runtime-review.md` 中原有四项 P1 与最高优先级 Runtime Budget P2 已严格按一次一个 feature 的顺序完成：

- feat-016：AgentTask lease、heartbeat 与 Worker Crash Recovery。
- feat-017：全部 Tool 的统一 deadline、AbortSignal、错误分类与受控 Retry。
- feat-018：13 个内置 Tool 的同源 Zod input/output 运行时契约。
- feat-019：覆盖 Plan、全部 Tool、审批与 Final 的通用 Durable Step 恢复模型。
- feat-020：持久化 Runtime Budget、crash-safe 用量累计与 `limit_exceeded` 终态。

feat-016 至 feat-022 均为 `done`，当前没有 `in-progress` feature。先前的 97/100 结论不可直接采信；本轮修复前的独立源码审查为 92/100、最终 L3，修复完成后尚未重新进行完整评分。

## Files Changed（当前未提交改动范围）

- feat-016：Prisma schema 与迁移 `20260830215000_add_agent_task_lease`；`agent/task-claim.ts`、Dispatcher、Worker、Runtime、Tracer、审批栅栏、lease 环境配置与 Worker 强制退出测试。
- feat-017：`agent/tool-errors.ts`、`agent/tool-registry.ts`、Tool 类型与全部内置 Tool；统一 deadline/AbortSignal/Retry，新增可靠性单元测试和数据库超时回滚测试。
- feat-018：`agent/tool-contracts.ts`、Registry 与内置 Tool；统一 Zod input/output 校验，新增无效输入、无效输出和数据库事务回滚测试。
- feat-019：Prisma schema 与迁移 `20260831083000_add_agent_steps`、`agent/durable-step.ts`、Runtime、Tracer、审批与任务/Trace API；新增 Durable Step PostgreSQL 恢复测试，并让 `memory.recall.updatedAt` 使用可持久化的 ISO 字符串。
- feat-020：Prisma schema 与迁移 `20260831111500_add_agent_runtime_budget`；`agent/runtime-budget.ts`、Runtime、LLM provider、Tool executor、Tracer、任务创建路径、环境 schema/示例与 Agent 状态 UI；新增 Runtime Budget 单元和真实 PostgreSQL 集成测试。
- feat-021：`app/api/agent/tasks/[taskId]/run/route.ts` 的生产排队/inline 限流边界、`docker-compose.yml` 全量 Runtime Budget 环境透传，以及 `tests/server/agent-task-run-route.test.ts` 回归测试。
- feat-022：新增 `docker-compose.smoke.yml`、`scripts/compose-deployment-smoke.ts`、两个 npm 命令和测试文档；测试 override 隔离 project、端口、卷、bind directory 与镜像，生产 `docker-compose.yml`、Dockerfile、镜像策略和 Worker healthcheck 均未修改。
- feat-023：`AGENTS.md` 新增五项会话退出检查清单；`feature_list.json`、`progress.md` 和本文件登记结构性审查、验证与构建阻塞。
- 审查与状态：`docs/optimization/agent-runtime-review.md`、`feature_list.json`、`progress.md` 和本文件。
- 工作树中的其他既有用户改动均被保留，没有执行破坏性 Git 操作或覆盖无关内容。

## Verification（最终验证）

- `./init.sh`：feat-020 开始前基线通过，56 个文件/338 项 Vitest。
- `npm run test:unit -- tests/agent/runtime-budget.test.ts tests/agent/task-claim.test.ts tests/agent/agent-runtime.test.ts tests/agent/tool-registry-reliability.test.ts`：4 个文件/24 项测试通过。
- `sudo -n -g docker -u dadalv npm run test:integration -- tests/integration/agent-runtime-budget.integration.test.ts`：1 个文件/3 项真实 PostgreSQL 测试通过。
- `npm run check:quick`：TypeScript、ESLint、57 个文件/341 项 Vitest 全部通过。
- `sudo -n -g docker -u dadalv npm run check:full`：退出 0；快速门禁、Prisma Client 生成、Next.js 16.3.3 生产构建、覆盖率基线、7 个文件/17 项 PostgreSQL 集成测试与 9 项 Playwright E2E 全部通过。
- `./init.sh`：feat-021 修改前基线通过，57 个文件/341 项 Vitest。
- `npm run test:unit -- tests/server/agent-task-run-route.test.ts`：1 个文件/3 项通过。
- `env ... docker compose config --quiet`：无敏感测试值下 Compose 配置有效；渲染结果确认 web、agent-worker 与 init 均获得 8 项 Runtime Budget 覆盖变量。
- `npm run check:quick`：TypeScript、ESLint、58 个文件/344 项 Vitest 全部通过。
- `docker compose config -q`：退出 0；仅验证 Compose 配置可渲染，不等同于构建、启动或部署测试。
- `npm run check:compose-config`：退出 0；以临时 env 渲染并断言隔离 Compose config，未访问 Docker daemon。
- `sudo -n -g docker -u dadalv npm run test:compose-smoke`：退出 0；真实构建 production Web/Worker，init exit 0，Web healthcheck 与 `/api/health` 通过，Web 命令为 `/sbin/tini -- node server.js` 而非 `next dev`；实际 AgentTask 由 Worker 容器对应 hostname 完成，final message、durable plan/final steps 与房间消息均可观察，清理后无该 project 的容器、网络、卷和测试镜像。
- `npm run check:quick`：TypeScript、ESLint、58 个文件/344 项 Vitest 全部通过。
- `git diff --check`：通过。
- `harness-creator` 结构性验证：100/100；仓库中未发现受版本控制的 GitHub Actions、GitLab CI、Jenkins 等 CI 配置。
- `./init.sh`：Prisma Client 生成、TypeScript、ESLint、58 个文件/344 项 Vitest 全部通过。
- `wc -l AGENTS.md`：92，符合 feat-005 的 50-200 行标准；`node /home/dadalv/.agents/skills/harness-creator/scripts/validate-harness.mjs --target /home/dadalv/projects/xoxoMeridian`：100/100。
- `npm run check`：退出 1。`typecheck`、`lint`、58 个文件/344 项 Vitest 通过；`npm run build` 在 Next.js 16.3.3 阶段失败，原文为 `Could not parse output from TypeScript's --showConfig.`。

## Next Session Startup（恢复步骤）

1. 依次阅读 `AGENTS.md`、`feature_list.json`、`progress.md` 和本文件。
2. 确认 Node.js 22 与锁定依赖；需要重装时运行 `npm ci`。本轮新增三条迁移，本地数据库尚未应用时运行 `npm run db:deploy`，再运行 `npm run db:generate`。
3. 运行 `./init.sh` 建立快速基线。
4. feat-016 至 feat-022 均已完成；feat-023 因生产构建失败而 `blocked`，不要将其标为完成。需要部署配置验证时先运行 `npm run check:compose-config`，需要真实部署 smoke 时在 Docker 可用环境运行 `sudo -n -g docker -u dadalv npm run test:compose-smoke`。
5. 需要完整应用验证时确保 Docker 可用，并运行 `sudo -n -g docker -u dadalv npm run check:full`；部署 smoke 是独立补充，不替代此命令。

## Blockers / Risks（阻塞与风险）

- 当前没有阻塞项，也没有开放 P0/P1；生产 Web 直跑 Runtime 的路径已关闭。
- Runtime Budget 已关闭：Run 会冻结高默认值的 turns、Tool attempts、deadline、token/cost 上限与价格快照，并以 `limit_exceeded` 终态收敛；crash 后未结算 reservation 保守保留，避免低估消耗。
- Trace 仍缺字段级脱敏、敏感数据分级、保留/删除策略、Run 总耗时与全局顺序号；本轮已完成成本聚合与价格快照。
- Tool 共享 Runtime 进程和应用权限，尚无每 Tool 的 CPU、内存、文件系统和网络沙箱；HITL 只支持 Approve/Reject，不支持 Edit。
- Durable Step 已覆盖当前同库副作用；未来非数据库外部写操作必须使用供应商幂等键或 Outbox/relay。
- `check:full` 仍不等同于 Compose 上线保证；`test:compose-smoke` 覆盖当前 production 容器路径，但不是性能、滚动升级、镜像签名或外部供应商验收。
- Compose 使用固定 `container_name` 与 `latest` Worker 镜像标签，暂不阻止单机部署；smoke 通过 test-only override 隔离，若未来需要生产并行部署、可回滚发布或 Worker healthcheck，应分别作为独立运维 feature 处理。
- 当前 Node.js 22.22.1 下 `check:full` 的 Prisma Client 生成已正常通过；没有依赖或锁文件变更。
- 当前 `npm run check` 在生产构建阶段失败：`Could not parse output from TypeScript's --showConfig.`；快速基线仍通过，但按新增会话退出检查清单不得称为清洁退出。
- 本轮没有依赖变更；既有审计记录为 production high/critical 0。不得提交本地 `.env`。

## Recommended Next Step（唯一推荐下一步）

先独立复现并定位 `npm run build` 的 TypeScript `--showConfig` 解析失败；构建恢复通过后再完成 feat-023，并按新增检查清单确认清洁退出。
