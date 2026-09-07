# QAM-09 应用交付与进程拓扑工程质量审查

## 元数据

| 项目 | 内容 |
| --- | --- |
| QAM | QAM-09 应用交付与进程拓扑 |
| 快照日期 | 2026-09-06 |
| 审查 Skill | [`xoxo-qam-09-delivery-review`](../../.agents/skills/xoxo-qam-09-delivery-review/SKILL.md) |
| 标准版本 | [`module-quality-review-standard.md`](./module-quality-review-standard.md) v1.0.0 |
| 范围来源 | [`PROJECT_VIEW.md`](../../PROJECT_VIEW.md) 的 QAM-09、Cross-cutting Concerns、共享映射、BU-07/BU-09/BU-10 与 Quality Tracking Index；[`AGENTS.md`](../../AGENTS.md) |
| 本轮 Delta | `baseline`（初审） |
| 工作区说明 | 审查前已有 AGENTS/Harness、PROJECT_VIEW、共享标准和 QAM-01～QAM-07 报告未提交改动；本报告未将其当作 QAM-09 实现改动，也未修改这些文件。 |
| 当前基线命令 | `command -v node && node --version && npm --version`：`/home/dadalv/.local/bin/node`、v22.23.2、npm 10.9.8；`npm ls --depth=0 --package-lock-only`：锁文件依赖树可解析；`npm run check:compose-config`：退出 0；`npx prisma seed --help`：退出 0 但输出 `Unknown command "seed"`，用于确认文档命令错误；`git diff --check`：通过。 |
| 本轮未运行 | `npm run check:quick`、`npm run check`、镜像构建、`npm run test:compose-smoke` 和真实重启/信号实验均未重复运行；不把静态配置门禁写成部署行为通过。 |
| 历史交接证据 | `progress.md` 记录 2026-08-31 `sudo -n -g docker -u dadalv npm run test:compose-smoke` 退出 0：production Web/Worker 构建、`init`、Web health、独立 Worker 消费 AgentTask 和隔离资源清理通过。该项标为“历史 E3”，不是本轮实际执行的 E3；当前代码已重新核对。 |

## Overall

| 指标 | 结果 |
| --- | --- |
| Score | **78 / 100** |
| Score Level | **L2** |
| Gate Level | **L2** |
| Final Level | **L2** |
| Trend | `baseline` |
| Evidence Confidence | 中等（Dockerfile/Compose/init/env/Worker 为 E2；本轮 Compose config 为 E3；完整 Compose 行为只有历史 E3，Worker shutdown、volume 权限失败和 seed 重跑尚无本轮行为证据） |
| 当前开放问题 | 5 项（P2×5；无开放 P0/P1） |

Dockerfile 的多阶段构建、Prisma Client 生成、Web standalone runner 与独立 Worker，以及 PostgreSQL → init → Web/Worker 的 Compose 依赖图边界清楚；本轮配置门禁也确认了隔离 smoke 拓扑。主要扣分来自 init 对 bind mount 权限失败的静默处理、seed 重跑会追加 `seed.completed`、日志暴露部分 invite code、Worker 没有独立 healthcheck，以及部署 README 使用不存在的 `prisma seed` 命令。历史 Compose smoke 曾验证过正常启动和 Worker 消费，但本轮没有重新构建或启动容器，因此关键生命周期 Gate 保持 L2。

## Score Breakdown

| 维度 | Score | Max | Finding / Evidence |
| --- | ---: | ---: | --- |
| 架构与责任边界 | 12 | 14 | Docker build stages、Compose service graph、init bootstrap 和 Worker entry 可分别定位；`x-app-env`/hardening/logging anchors 形成交付侧共享边界。Worker 同时承载 dispatch、scheduler 和认证清理（BU-07），但责任仍可由入口追踪（[`Dockerfile`](../../Dockerfile#L3-L65)、[`docker-compose.yml`](../../docker-compose.yml#L83-L177)、[`agent-worker.ts`](../../agent/agent-worker.ts#L1-L79)，E2）。 |
| 代码结构与复杂度 | 8 | 10 | 构建、配置、smoke harness 和启动脚本分离，Compose smoke 的 config/run/cleanup 结构清晰；Worker 两个 loop 共用 stopped/sleep，且 init 使用内嵌 shell 字符串，失败语义较难局部验证（[`scripts/compose-deployment-smoke.ts`](../../scripts/compose-deployment-smoke.ts#L658-L710)、[`agent-worker.ts`](../../agent/agent-worker.ts#L21-L75)、E2）。 |
| 抽象与复用 | 7 | 8 | Compose 复用 app-env、logging、hardening 和 smoke override；`lib/env.ts` 提供统一运行时 schema。Compose 默认值与 env schema/示例仍需跨文件同步，配置 contract 不是单一可生成来源（[`docker-compose.yml`](../../docker-compose.yml#L3-L80)、[`lib/env.ts`](../../lib/env.ts#L6-L90)、[`.env.example`](../../.env.example#L94-L146)，E2）。 |
| 数据流与状态一致性 | 9 | 12 | `postgres` healthy → `init` migrate/seed exit 0 → Web/Worker `service_completed_successfully` 的启动状态链清楚；`seed` 的 Room/Agent upsert 可重复，但每次仍 `eventLog.create`，重跑会追加相同语义事件（[`docker-compose.yml`](../../docker-compose.yml#L105-L142)、[`prisma/seed.ts`](../../prisma/seed.ts#L5-L37)、[`prisma/schema.prisma`](../../prisma/schema.prisma#L419-L433)，E2）。 |
| 接口与依赖关系 | 8 | 10 | Node/npm scripts、Prisma CLI、standalone server、Worker tsx entry、`/api/health` 和 Compose service conditions 形成稳定接口；但 README 部署段落写 `prisma seed`，当前 Prisma CLI 实测返回 `Unknown command "seed"`，会使人工部署路径偏离 `npm run db:seed`（[`package.json`](../../package.json#L5-L31)、[`README.md`](../../README.md#L286-L299)，本轮命令 E3；BU-09）。 |
| 健壮性、并发与生命周期 | 9 | 14 | Compose restart policy、Tini、数据库健康检查和 smoke cleanup 覆盖正常生命周期；init 的 `chown`/`chmod` 错误被丢弃，Worker 无 healthcheck，且 SIGTERM 只设置 flag、退避 sleep 不可唤醒。Worker scheduler in-flight 的重复问题由 QAM-04-003 维护，本报告仅保留 QAM-09 的托管/可观测关联（[`docker-compose.yml`](../../docker-compose.yml#L105-L177)、[`agent/agent-worker.ts`](../../agent/agent-worker.ts#L13-L69)、QAM-04-003，E2）。 |
| 性能与资源使用 | 7 | 8 | Web/Worker/PostgreSQL 有 memory limit，日志有 json-file size/file rotation，Worker poll/backoff 有上限；无 Worker healthcheck 会让 hung process 持续占用资源且不触发 restart，但当前没有规模或泄漏证据（[`docker-compose.yml`](../../docker-compose.yml#L84-L102)、[`docker-compose.yml`](../../docker-compose.yml#L158-L177)，E2）。 |
| 安全与隐私 | 8 | 10 | Web/Worker non-root、`cap_drop: ALL`、`no-new-privileges`、DB 仅绑定 loopback，Compose 不把密码写入 Dockerfile；seed 日志仍输出 invite code 首尾各两字符，属于不必要的 secret 派生物，且 debug chat log 可持久化完整 LLM/tool payload（[`Dockerfile`](../../Dockerfile#L33-L65)、[`docker-compose.yml`](../../docker-compose.yml#L64-L80)、[`prisma/seed.ts`](../../prisma/seed.ts#L39-L42)、[`.env.example`](../../.env.example#L114-L117)，E2）。 |
| 可测试性与验证可信度 | 5 | 8 | 本轮 `check:compose-config` 实际通过，断言隔离 project、卷/目录、runner target、production 和 inline=false；历史 E3 smoke 覆盖构建、init、Web health、Worker 消费和 cleanup，但本轮未重跑，且没有权限失败、seed 二次运行、Worker health/hang 或 signal/stop 行为测试（[`scripts/compose-deployment-smoke.ts`](../../scripts/compose-deployment-smoke.ts#L250-L326)、[`scripts/compose-deployment-smoke.ts`](../../scripts/compose-deployment-smoke.ts#L658-L699)，当前 E3 + 历史 E3）。 |
| 可维护性、演进与技术债 | 5 | 6 | 交付变化点集中在 Dockerfile、Compose anchors、env schema 和 smoke harness；固定生产 container name/`latest` worker tag 与 README/CLI 漂移增加运维认知成本，但当前单机拓扑没有因偏好平台而扣分（[`docker-compose.yml`](../../docker-compose.yml#L81-L87)、[`README.md`](../../README.md#L286-L299)，E2/E3）。 |
| **合计** | **78** | **100** | 算术核对：12+8+7+9+8+9+7+8+5+5 = 78。 |

## Level Gate

| 门禁 | 结果 | 证据与原因 |
| --- | --- | --- |
| 开放 P0 | 通过 | 未发现支持启动路径整体不可用、完整 secret 泄漏、不可恢复数据损坏或已证明的高风险重复副作用；容器正常路径有历史 E3 smoke。 |
| 开放 P1 且涉及权限绕过、不可恢复数据错误、并发重复副作用或支持启动路径失效 | 通过 | 当前 5 项均为 P2：权限处理是条件性 bind mount 失败的静态风险，seed 重复主要污染事件日志，Worker health/README 属于可观测性与运维路径；未有本轮 E3 证明其达到 P1 条件。 |
| 最高风险不变量有风险匹配行为验证 | 未通过（本轮） | 当前 E3 仅为 Compose 配置渲染与 CLI 命令实验；完整构建→init→Web/Worker→Agent 消费→cleanup 只有 2026-08-31 历史 E3，且本轮未执行权限失败、重复 seed、hung Worker 和信号停止验证。因此本轮 Gate 不高于 L2；历史 E3 不被写成当前 E3。 |
| L4 要求 | 未通过 | 当前有开放 P2，且关键失败/并发/生命周期路径没有本轮 E3。 |
| **最终判定** | **L2** | Score Level=L2；Gate Level=L2；Final Level=min(L2, L2)=L2。 |

## Critical Issues

### P0

当前无开放项。

### P1

当前无开放项。

### P2

#### QAM-09-001：init 静默吞掉 bind mount 权限失败

- **状态**：`open`
- **问题**：Compose init command 对 `chown`、`chmod` 均只重定向错误并以分号继续；没有 `set -e` 或显式检查，最终只要迁移和 seed 成功，init 仍可 exit 0（[`docker-compose.yml`](../../docker-compose.yml#L105-L128)，E2）。在 rootless、受限宿主文件系统或既有文件属主不匹配时，Web/Worker 会以 UID 1001 启动，但启动链不会报告目录不可写。
- **质量影响**：`/app/data/chat-logs` 与 `/app/data/atlas-uploads` 的写入会在运行期持续失败；Web health 只探测数据库，因而可能把一个部分失效的部署报告为 ready，排障需要从应用日志反向判断目录权限。
- **最小修正**：保留现有 root init 和两个 bind mount，只对 `chown`/`chmod` 失败立即退出，或在迁移前用 UID 1001 可写测试明确失败；若已有目录需要递归修复，应限定在两个挂载目标，不扩大到宿主其他路径。
- **验收证据**：在隔离 Compose smoke 中将两个目录设为不可修复权限，断言 init 非零退出且 Web/Worker 不启动；正常目录场景仍断言非 root 进程可写 chat log/upload。该验证需要真实容器 E3。
- **影响范围**：QAM-09 init/volume/health；直接影响 QAM-06 本地媒体和 QAM-08 debug log 写入；不改变领域数据迁移责任。

#### QAM-09-002：seed 重跑会追加不可幂等的 `seed.completed` EventLog

- **状态**：`open`
- **问题**：Room 与 Agent 使用 upsert，但 seed 每次直接 `eventLog.create`；EventLog 只有普通索引，没有对应唯一幂等键（[`prisma/seed.ts`](../../prisma/seed.ts#L5-L37)、[`prisma/schema.prisma`](../../prisma/schema.prisma#L419-L433)，E2）。因此 Compose init 在保留 `postgres-data` 的部署上重跑时会增加重复 bootstrap 事件。
- **质量影响**：事件审计、Trace 查询和运维判断会把一次初始化显示成多次初始化；重复 init 本身不会失败，因而问题容易长期积累并掩盖真正的 bootstrap 记录。
- **最小修正**：为 seed 事件使用稳定幂等标识并在写入前做条件创建，或按既有 room/type/payload 语义查找后仅首次写入；不修改业务 EventLog 的通用语义。
- **验收证据**：真实 PostgreSQL 中连续执行两次 `npm run db:seed` 或两次隔离 init，断言 Room/Agent/`seed.completed` 各只有预期一条 bootstrap 事件，同时保留业务事件可重复写入。
- **影响范围**：QAM-09 seed/bootstrap；关联 QAM-04/QAM-08 的 EventLog 读取与追踪，但不重复评价其领域事件。

#### QAM-09-003：seed 日志泄露 invite code 的部分内容

- **状态**：`open`
- **问题**：seed 将 `INVITE_CODE` 的前两字符、后两字符写入容器日志（[`prisma/seed.ts`](../../prisma/seed.ts#L39-L42)，E2）。Compose 默认收集所有服务的 json-file 日志并保留最多 3 个文件（[`docker-compose.yml`](../../docker-compose.yml#L64-L68)，E2）。
- **质量影响**：拥有日志读取权限的运维、备份或日志聚合方可获得注册共享 secret 的部分内容；这不提供运行收益，却违反最小暴露原则并增加轮换时的审计范围。
- **最小修正**：只记录 `INVITE_CODE configured=true` 或稳定不可逆摘要的存在性，不记录可拼接/可猜测的首尾片段；保留 `/api/auth/register` 的失败诊断为不含 secret 的稳定信息。
- **验收证据**：seed 正常运行日志中不出现 invite code 的任何明文片段；错误日志、Compose logs 和 smoke 失败保留日志均通过敏感值扫描，且注册仍能用完整环境变量成功。
- **影响范围**：QAM-09 bootstrap/logging；关联 QAM-01 注册 invite contract。

#### QAM-09-004：Agent Worker 没有独立健康语义

- **状态**：`open`
- **问题**：Compose 仅为 PostgreSQL 和 Web 配置 healthcheck，`agent-worker` 只有 `restart: unless-stopped`；Worker 进程若死锁、事件循环饥饿或持续卡住，容器仍可保持 Running 且不会触发重启（[`docker-compose.yml`](../../docker-compose.yml#L149-L177)，E2）。smoke 只检查 Worker 容器 Running 并以最终任务完成间接证明一次消费，没有持续 Worker health contract（[`scripts/compose-deployment-smoke.ts`](../../scripts/compose-deployment-smoke.ts#L396-L412)、[`scripts/compose-deployment-smoke.ts`](../../scripts/compose-deployment-smoke.ts#L486-L529)，历史 E3）。
- **质量影响**：Web/API 仍可接受任务，但 pending AgentTask 无人消费，部署状态和实际异步能力分离；依赖 restart policy 的恢复只覆盖进程退出，不覆盖 hung Worker。
- **最小修正**：增加不泄露数据的 Worker 可观测探针（例如由 Worker 更新的 heartbeat/健康文件或轻量 DB 时间戳），由 Compose healthcheck 检查该语义；healthcheck 只负责把状态标记为 healthy/unhealthy，不会令普通 Docker Compose/Engine 自动重启容器。若需要自动恢复，应让 Worker 在确认 loop/heartbeat 超期后有界退出，以触发现有 `restart: unless-stopped`；自检线程/进程必须不依赖同一可能被阻塞的 event loop，避免自检也被 hang 一起拖住。不引入未经授权的外部托管器。
- **验收证据**：真实 Compose 中分别证明：(1) Worker 正常时 inspect health 为 healthy，停止心跳后在有界窗口内可见为 unhealthy，且仅因 unhealthy 不发生容器重启；(2) 若选择 Worker 自退出方案，注入可控的 loop/heartbeat 超期，断言 Worker 进程确实退出、容器 restart 计数增加并重新进入运行态；另证明自检线程/进程在主 loop 阻塞时仍能触发该有界退出。数据库暂时不可用时应按既有 backoff 语义恢复而非误报成功。
- **影响范围**：QAM-09 Worker health/restart；关联 QAM-04 scheduler 与 QAM-08 AgentTask 消费可观测性。

#### QAM-09-005：部署 README 使用不存在的 Prisma seed 命令

- **状态**：`open`
- **问题**：部署说明写成 `prisma migrate deploy && prisma seed`，而当前 package script 的可用入口是 `npm run db:seed`；本轮运行 `npx prisma seed --help` 输出 `Unknown command "seed"`（[`README.md`](../../README.md#L286-L299)、[`package.json`](../../package.json#L17-L29)，本轮 E3；BU-09）。README 其他章节虽使用正确的 `npm run db:seed`，部署段落仍会误导按一键部署操作的人员。
- **质量影响**：人工部署会在 migration 后因错误命令中止，导致 init/seed 未完成而 Web/Worker 不应启动；操作员还需临时判断是否重复迁移/seed，增加恢复和交接成本。
- **最小修正**：将部署段落统一为 `npm run db:deploy && npm run db:seed`，或明确只通过 Compose init 执行并删除不可执行的 CLI 示例；同步修正同段过期环境变量清单，不引入新部署平台。
- **验收证据**：从 README 的部署命令逐条执行到 seed 成功；Compose init 日志仍以 `migrate deploy && tsx prisma/seed.ts` 通过，文档命令和 package script 不再出现 CLI unknown command。
- **影响范围**：QAM-09 运维文档/CLI contract；不改变 Prisma 迁移内容，关联 BU-09。

## Architecture and Data Flow

```text
Docker build
  ├─ deps: node:22-alpine + npm ci（package-lock）
  ├─ prisma-client: schema → prisma generate
  ├─ builder: standalone Next build（仅 build-time placeholders）
  ├─ web-runner: non-root app + tini → node server.js
  └─ worker-runner: non-root app + tini → npx tsx agent/agent-worker.ts

postgres healthy
  └─ init (root，仅两个 bind mount 做权限准备)
       └─ prisma migrate deploy && prisma/seed.ts
            ├─ exit 0 → web + agent-worker 可启动
            └─ 非 0 → service_completed_successfully 不满足，Web/Worker 不启动

web → /api/health（HTTP + SELECT 1）
web → Agent dispatch（AGENT_TASK_INLINE_RUN=false）
agent-worker → AgentTask lease/Runtime → Message/EventLog
```

Compose `x-app-env` 将数据库、认证、LLM、天气、邮件、Agent budget、存储和日志配置同时传播给 init/Web/Worker；`lib/env.ts` 在各进程启动时做 schema 校验。运行时持久状态由 PostgreSQL named volume 承载，chat logs/Atlas uploads 由三个应用服务共享的 bind mount 承载；init 负责把两个目录准备成 UID/GID 1001 可写。Web readiness 只包含 HTTP 和数据库探测，Worker 没有对应健康事实源。正常启动、独立 Worker 消费和清理已有历史 E3，但权限/seed 重入/hung Worker/信号关闭仍需风险匹配的当前容器实验。

## Verified Strengths

- `package-lock.json` 为 lockfileVersion 3，当前 Node 22/npm 10 工具链可解析；Docker deps 阶段执行 `npm ci`，builder、Prisma client 和 runtime stages 的输入边界清楚（[`Dockerfile`](../../Dockerfile#L3-L31)、本轮 `npm ls --depth=0 --package-lock-only`，E2/E3）。
- Web 与 Worker 使用不同 runner：Web 是 standalone production server，Worker 保留 Agent/Prisma/tsx 运行依赖，均以 UID 1001、Tini 和 capability hardening 运行（[`Dockerfile`](../../Dockerfile#L33-L65)，E2）。
- Compose 依赖顺序、资源限制、日志轮转、PostgreSQL named volume、应用 bind mounts 和 Web DB healthcheck 集中可读；本轮 `npm run check:compose-config` 通过了 4 服务、隔离端口/卷、runner target、production 和 inline=false 断言（当前 E3）。
- 历史 Compose smoke 真实构建并运行了 PostgreSQL、init、Web 与独立 Worker，通过 Web API 观察到 AgentTask 由 Worker 完成、durable plan/final 与房间消息可见，并在结束时清理 project 容器、网络、卷和测试镜像（[`progress.md`](../../progress.md#L80-L100)，历史 E3）。
- `/api/health` 对数据库失败返回 503 并在 production 隐藏内部错误；init 成功条件通过 Compose `service_completed_successfully` 传播给 Web/Worker（[`app/api/health/route.ts`](../../app/api/health/route.ts#L8-L35)、[`docker-compose.yml`](../../docker-compose.yml#L105-L142)，E2）。

## Recommended Improvements

1. 修复 **QAM-09-001**：让两个数据目录的权限准备失败显式阻断 init，并补真实容器权限失败/非 root 写入证据。
2. 修复 **QAM-09-002** 与 **QAM-09-003**：使 bootstrap EventLog 幂等，并移除 invite code 片段日志；补二次 seed 与日志敏感值验证。
3. 评估 **QAM-09-004**：为 Worker 建立最小健康事实源和有界 hung 检测；healthcheck 用于可观测性，若需要自动恢复则由不受主 event loop hang 影响的自检路径让 Worker 有界退出并触发现有 restart policy；QAM-04-003 的 scheduler in-flight/shutdown 修正仍由 QAM-04 维护，避免重复实施。
4. 修复 **QAM-09-005**：统一 README 与 package/Compose 的可执行 seed 入口，并在文档验收中执行该路径。
5. 在上述小修正后重跑 `npm run test:compose-smoke`，另补 init 失败、seed 重入、Worker hung/restart、SIGTERM 与 volume ownership 的容器级 E3；不要求新增 CI、云平台、镜像签名或外部监控产品。

## Sustainable Review Record

### 当前开放问题

| ID | Priority | 状态 | 首次发现 | 直接责任 | 关联责任 |
| --- | --- | --- | --- | --- | --- |
| QAM-09-001 | P2 | `open` | 2026-09-06；init 静默吞掉目录权限错误（E2） | QAM-09 init/volume | QAM-06 本地媒体、QAM-08 debug log |
| QAM-09-002 | P2 | `open` | 2026-09-06；seed 每次追加 `seed.completed`（E2） | QAM-09 seed/bootstrap | QAM-04/QAM-08 EventLog 读取 |
| QAM-09-003 | P2 | `open` | 2026-09-06；seed 日志输出 invite code 片段（E2） | QAM-09 logging/secrets | QAM-01 invite contract |
| QAM-09-004 | P2 | `open` | 2026-09-06；Worker 无 healthcheck（E2） | QAM-09 Worker health/restart | QAM-04 scheduler、QAM-08 AgentTask 消费 |
| QAM-09-005 | P2 | `open` | 2026-09-06；README 的 `prisma seed` 实测 unknown command（E3） | QAM-09 运维文档/CLI | BU-09 |

### 关联但不重复登记的问题

- QAM-04-003 已登记 Worker scheduler in-flight 不等待 shutdown；QAM-09 仅在本报告记录 Compose stop/restart 拓扑和 health 可观测性，不重新登记同一 scheduler 根因。
- QAM-08 的 Task lease/recovery、durable step 和最终消息一致性由 QAM-08 负责；本报告只使用历史 smoke 证明部署能把任务交给独立 Worker。

### 复审触发条件

- 修改 `Dockerfile` runner/deps/Prisma 复制、`docker-compose*.yml` service conditions、restart/resource/logging/volume/health、`init` command 或 `.env.example`/`lib/env.ts` contract。
- 修改 `prisma/seed.ts`、迁移 bootstrap 入口、Worker process host 或 shutdown signal；尤其需要重核对 non-root bind mount ownership、seed 重入和 Web/Worker readiness。
- 修复或重新验证 QAM-09-001～005，或运行真实容器 init failure、二次 seed、Worker hung/restart、SIGTERM 和 cleanup smoke。
- README/运维命令、Node/npm/Next/Prisma/PostgreSQL 基础镜像或 package lock 发生变化时，重新验证 build/runtime parity 与人工启动路径。

### 只追加评分历史

| 日期 | Score | Score Level | Gate | Final | Delta | 变更证据 |
| --- | ---: | --- | --- | --- | --- | --- |
| 2026-09-06 | 78 | L2 | L2 | L2 | `baseline` | 初审；当前 Node/npm、锁文件解析、Compose config 和 Prisma CLI 文档命令实验通过/失败证据；历史 2026-08-31 Compose smoke 曾通过正常构建、init、Web/Worker、Agent 消费与清理，但本轮未重跑；开放 QAM-09-001～005。 |

复审时保留上述问题 ID 和历史行；只在当前代码或风险匹配证据变化时重算受影响维度，并重新核对 100 分合计、Gate 与 Final。问题状态只能使用 `open`、`resolved`、`accepted-risk`、`not-reproduced`。
