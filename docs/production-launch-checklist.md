# XOXO Meridian 生产上线待办与配置清单

这份文档基于当前项目状态整理：项目已经可以通过 Docker Compose 本地运行，但仍是 MVP/内测形态。若要部署到公网并长期稳定使用，需要完成下面这些工作。

## 1. 当前状态

当前已经具备：

- Next.js Web 服务和 API。
- PostgreSQL 数据库。
- 独立 `agent-worker` 容器轮询 `AgentTask`。
- Prisma migration 和 seed。
- Demo 双人聊天室。
- SSE 实时刷新。
- OpenAI-compatible LLM Provider 抽象。
- Mock 天气工具。
- Docker Compose 启动链路。

当前不适合直接公网长期上线的原因：

- 仍使用 demo 登录，cookie 中只有用户 id，没有签名 session。
- `docker-compose.yml` 中有默认数据库账号和密码。
- `NEXT_PUBLIC_APP_URL`、`APP_BASE_URL` 仍是 `localhost`。
- Postgres 端口暴露到宿主机。
- LLM 可以在无 Key 时 fallback 到 mock，生产环境容易误以为真实 Agent 已接入。
- 天气工具仍是 mock。
- 缺少 HTTPS、反向代理、备份、监控、日志轮转和告警。

## 2. 上线前必须修改的环境变量

生产环境建议创建 `.env.production`，不要把真实值提交到仓库。

必填：

```env
POSTGRES_USER=xoxo_prod
POSTGRES_PASSWORD=use_a_long_random_password
POSTGRES_DB=xoxo_meridian

DATABASE_URL=postgresql://xoxo_prod:use_a_long_random_password@postgres:5432/xoxo_meridian?schema=public
DIRECT_URL=postgresql://xoxo_prod:use_a_long_random_password@postgres:5432/xoxo_meridian?schema=public

NEXT_PUBLIC_APP_URL=https://chat.example.com
APP_BASE_URL=https://chat.example.com

LLM_PROVIDER=openai-compatible
LLM_API_KEY=your_real_llm_api_key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4.1-mini
LLM_TIMEOUT_MS=20000

WEATHER_PROVIDER=mock
WEATHER_API_KEY=
WEATHER_BASE_URL=

AGENT_TASK_INLINE_RUN=false
AGENT_WORKER_POLL_MS=3000
```

Atlas 和登录页视觉资源上线时还需要：

```env
ATLAS_STORAGE_PROVIDER=aliyun-oss
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_BUCKET=xoxo-atlas-prod
ALIYUN_OSS_ACCESS_KEY_ID=your_ram_access_key_id
ALIYUN_OSS_ACCESS_KEY_SECRET=your_ram_access_key_secret
ALIYUN_OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
ALIYUN_OSS_PREFIX=atlas/prod/

LOGIN_VISUALS_MANIFEST_URL=https://cdn.example.com/login/manifest.json
LOGIN_VISUALS_CACHE_TTL_SECONDS=300
LOGIN_VISUALS_IMAGE_SRC=https://cdn.example.com
```

建议新增：

```env
AUTH_SESSION_SECRET=generate_at_least_32_random_bytes
DEMO_LOGIN_ENABLED=false
INVITE_CODE=generate_a_private_invite_code
```

对应代码还需要接入这些新增变量，见认证改造部分。

## 3. Docker Compose 需要调整

当前 `docker-compose.yml` 可以作为本机部署起点，但生产建议拆出 `docker-compose.prod.yml`。

必须调整：

- 将 `POSTGRES_PASSWORD` 改为 `${POSTGRES_PASSWORD}`，不要硬编码 `xoxo_password`。
- 将 `DATABASE_URL` 和 `DIRECT_URL` 改为从环境变量读取。
- 将 `NEXT_PUBLIC_APP_URL` 和 `APP_BASE_URL` 改为真实 HTTPS 域名。
- 移除 Postgres 对公网的端口映射，除非你明确需要远程直连数据库。
- 保留 `AGENT_TASK_INLINE_RUN=false`，生产环境让 worker 独立执行 Agent 任务。
- 为 `web`、`agent-worker` 配置日志轮转。

建议修改示例：

```yaml
postgres:
  environment:
    POSTGRES_USER: ${POSTGRES_USER}
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    POSTGRES_DB: ${POSTGRES_DB}
  ports: []
  volumes:
    - postgres-data:/var/lib/postgresql/data

web:
  environment:
    DATABASE_URL: ${DATABASE_URL}
    DIRECT_URL: ${DIRECT_URL}
    NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL}
    APP_BASE_URL: ${APP_BASE_URL}
    LLM_API_KEY: ${LLM_API_KEY}
    AGENT_TASK_INLINE_RUN: "false"
  logging:
    options:
      max-size: "10m"
      max-file: "5"
```

## 4. Dockerfile 需要硬化

当前 `Dockerfile` 可以运行，但更偏 MVP。

上线前建议：

- 使用 `npm ci` 替代 `npm install`，保证依赖可复现。
- 使用 multi-stage build，最终镜像只保留运行所需文件。
- 不要在 Dockerfile 中写 `DATABASE_URL` 和 `DIRECT_URL` 默认值，统一由 Compose 或部署平台注入。
- 使用非 root 用户运行应用。
- 构建镜像时固定版本标签，例如 `xoxo-meridian-web:2026-04-28-001`。
- `LOGIN_VISUALS_IMAGE_SRC` 在当前实现中由 middleware 运行时读取，不需要作为 build arg 注入。

最低限度需要删除：

```dockerfile
ENV DATABASE_URL="postgresql://xoxo:xoxo_password@postgres:5432/xoxo_meridian?schema=public"
ENV DIRECT_URL="postgresql://xoxo:xoxo_password@postgres:5432/xoxo_meridian?schema=public"
```

这些值应该只存在于运行时环境变量。

## 5. 认证与权限必须改造

当前实现位于 `lib/auth.ts` 和 `app/api/auth/demo-login/route.ts`。现在的 demo 登录只接收 `me/her`，并把 `xoxo_user_id` 写进 cookie。这不适合公网。

必须完成：

- 禁用生产环境 demo 登录，或要求邀请码。
- Cookie 中不要只放裸 `userId`，应改成签名 session token。
- 新增 `AUTH_SESSION_SECRET`。
- 登录接口增加限流。
- 用户登录成功后生成 session 记录或签名 JWT。
- 退出登录接口清理 cookie。
- 所有 API 继续保留 `assertRoomAccess` 房间权限检查。

可选方案：

- 简单方案：邀请码 + 两个固定用户 + signed cookie。
- 稳妥方案：邮箱密码 + bcrypt/argon2 + session 表。
- 更长期方案：Passkey 或 OAuth。

## 6. 数据库上线工作

上线前：

- 生成强随机数据库密码。
- 确认 Postgres 只暴露在 Docker 内部网络或服务器内网。
- 首次部署执行：

```bash
docker compose --env-file .env.production up -d postgres
docker compose --env-file .env.production run --rm web npx prisma migrate deploy
docker compose --env-file .env.production run --rm web npm run db:seed
docker compose --env-file .env.production up -d
```

生产运行中：

- migration 只能用 `prisma migrate deploy`，不要用 `prisma db push`。
- 建立每日备份：

```bash
docker exec xoxo-meridian-postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backups/xoxo_$(date +%F).sql
```

- 定期演练从备份恢复。
- 为 `postgres-data` 所在磁盘设置监控和容量告警。

## 7. LLM Provider 配置

当前 `agent/llm-provider.ts` 中，如果 `LLM_API_KEY` 为空，会自动使用 mock planner。

生产必须：

- 设置真实 `LLM_API_KEY`。
- 确认 `LLM_BASE_URL` 和 `LLM_MODEL` 可用。
- 给 LLM API Key 设置额度和账单提醒。
- 记录模型调用失败率和耗时。
- 明确是否允许 mock fallback。生产建议新增 `ALLOW_MOCK_LLM=false`，如果没有 Key 就启动失败。

建议增加启动检查：

- `NODE_ENV=production` 且 `LLM_API_KEY` 为空时，web/worker 直接报错退出。
- 将 `LLM_TIMEOUT_MS` 保持在 10-30 秒之间。

## 8. 天气 API 配置

当前 `weather.get` 仍使用 mock。

如果要上线真实天气：

- 选择天气服务，例如 OpenWeather、WeatherAPI、和风天气等。
- 设置：

```env
WEATHER_PROVIDER=your-provider
WEATHER_API_KEY=your_weather_key
WEATHER_BASE_URL=https://provider.example.com/current
```

- 修改 `agent/tools/weather-tool.ts`，把真实 API 返回值映射成统一结构。
- 增加失败兜底：天气 API 失败时，Agent 应友好说明暂时查不到，而不是任务失败。

## 9. HTTPS 与反向代理

公网部署必须放在 HTTPS 后面。

推荐：

- Caddy：自动申请和续期证书，配置简单。
- Nginx：更通用，但证书续期需要额外配置 Certbot。
- Cloudflare Tunnel：适合不想直接暴露服务器 IP 的私密站点。

Caddy 示例：

```caddy
chat.example.com {
  reverse_proxy web:3000
}
```

如果 Caddy 和 Compose 在同一网络内，建议只暴露 Caddy 的 80/443，web 不直接暴露公网端口。

## 9a. Atlas 与登录页 OSS 配置

Atlas 用户上传图和登录页展示图必须分开配置。

Atlas 图片：

- 创建私有 OSS bucket，例如 `xoxo-atlas-prod`。
- Bucket ACL 保持 `private`，不要给 Atlas 图片使用 public-read。
- 使用专用 prefix，例如 `atlas/prod/`。
- App 的 RAM 用户或角色只授予该 prefix 下的最小权限：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:PutObject",
        "oss:GetObject",
        "oss:DeleteObject"
      ],
      "Resource": [
        "acs:oss:*:*:xoxo-atlas-prod/atlas/prod/*"
      ]
    }
  ]
}
```

- 如果部署在同地域阿里云 ECS，优先使用内网 endpoint；否则使用 HTTPS 公网 endpoint。
- 浏览器不直接访问 Atlas OSS URL，所有 Atlas 图片都通过 `/api/atlas/uploads/<key>` 由应用鉴权代理读取。
- 切换到 `ATLAS_STORAGE_PROVIDER=aliyun-oss` 前，先把现有 `data/atlas-uploads` 文件上传到 OSS 对应 prefix。

登录页视觉图：

- 使用单独公开 bucket 或 CDN origin，例如 `https://cdn.example.com/login/`。
- 登录页 manifest 可公开访问，且不包含秘密。
- `LOGIN_VISUALS_MANIFEST_URL` 指向 manifest JSON。
- `LOGIN_VISUALS_IMAGE_SRC` 必须包含 manifest 中 `imageUrl` 的 origin，否则运行期 CSP 会拦截外部图片。
- `LOGIN_VISUALS_IMAGE_SRC` 支持空格或逗号分隔的 HTTPS origin，例如：

```env
LOGIN_VISUALS_IMAGE_SRC=https://cdn.example.com https://*.alicdn.com
```

上线前验证：

- Atlas OSS 对象不能匿名读取。
- 应用服务器能用 RAM 凭证读取 Atlas OSS 对象。
- 登录页 manifest 和图片都能通过 HTTPS 匿名访问。
- 登录页响应头的 `Content-Security-Policy` 中 `img-src` 包含登录图 CDN/OSS origin。
- Atlas bucket/prefix 不与登录页 public bucket/prefix 混用。

## 10. 网络与防火墙

服务器防火墙建议：

- 开放 `80/tcp` 和 `443/tcp`。
- SSH 端口只允许你的固定 IP，或至少使用密钥登录并禁用密码。
- 不对公网开放 `5432/tcp`。
- 不对公网开放 `3000/tcp`，如果使用反向代理。

Docker 层面：

- Postgres 只在内部网络可访问。
- web 只给反向代理访问。
- agent-worker 不需要任何入站端口。

## 11. Agent Runtime 上线注意事项

当前 worker 已经通过数据库任务队列运行，生产建议保持这个模式。

需要补强：

- pending/running 任务超时恢复，例如运行超过 5 分钟自动标记 failed 或重试。
- `retryCount` 生效，失败任务最多重试 N 次。
- worker 启动时扫描 stuck running tasks。
- 高风险工具必须设计权限确认，目前不要加入命令执行、任意文件读写、浏览器自动化等工具。
- 所有新工具必须通过 `ToolRegistry` 白名单注册。

建议增加：

- `AGENT_TASK_MAX_RETRIES=3`
- `AGENT_TASK_TIMEOUT_MS=300000`
- `AGENT_TOOL_TIMEOUT_MS=30000`

## 12. 实时通信与性能

当前 SSE 是每 2 秒重新读取 room snapshot，适合 MVP。

上线初期两个人使用可以保留。

后续优化：

- 消息增量推送，避免每次拉取全部面板数据。
- 使用 Redis Pub/Sub、Postgres LISTEN/NOTIFY 或 WebSocket。
- 为消息列表增加分页。
- 为 `Message.roomId + createdAt`、`AgentTask.status + createdAt` 保持索引，目前 schema 已有基础索引。

## 13. 日志、监控与告警

上线前至少需要：

- Docker 日志轮转。
- Web 健康检查。
- worker 健康检查或心跳记录。
- Postgres 容量监控。
- LLM 调用失败率监控。
- AgentTask pending 数量告警。

建议观察 SQL：

```sql
select status, count(*) from "AgentTask" group by status;
select "toolName", status, count(*) from "ToolCall" group by "toolName", status;
select provider, model, status, count(*) from "LLMCall" group by provider, model, status;
```

## 14. 隐私与数据安全

这是情侣私密聊天室，隐私优先级很高。

上线前建议：

- 不在日志中输出完整聊天内容。
- LLM 调用记录可以保留摘要，但要避免长期保存敏感原文。
- 数据库备份加密保存。
- LLM Provider 选择时确认数据保留政策。
- 给自己准备一键导出和一键删除数据的脚本。

## 15. 正式上线推荐步骤

1. 准备域名，例如 `chat.example.com`。
2. 在服务器安装 Docker 和 Docker Compose。
3. 配置防火墙，只开放 SSH、80、443。
4. 创建 `.env.production`，填入真实域名、数据库密码、LLM Key。
5. 修改 Compose，去掉 Postgres 公网端口，改用生产环境变量。
6. 部署反向代理和 HTTPS。
7. 执行 `docker compose --env-file .env.production up --build -d`。
8. 检查：

```bash
docker compose ps
docker compose logs --tail=100 web
docker compose logs --tail=100 agent-worker
```

9. 访问 `https://chat.example.com`。
10. 用两个账号登录，发送普通消息。
11. 发送 `@小助手 明天提醒我给她发早安`，确认 worker 处理任务。
12. 检查数据库中是否出现 `AgentTask`、`ToolCall`、`LLMCall`、`EventLog`。
13. 建立备份 cron。
14. 建立监控和告警。
15. 禁用 demo 登录或改为邀请码登录。

## 16. 上线前验收清单

- [ ] 生产域名已解析到服务器。
- [ ] HTTPS 可用。
- [ ] `NEXT_PUBLIC_APP_URL` 是 HTTPS 域名。
- [ ] `APP_BASE_URL` 是 HTTPS 域名。
- [ ] 数据库密码已替换。
- [ ] Postgres 未暴露公网。
- [ ] `.env.production` 未提交到 Git。
- [ ] `LLM_API_KEY` 已配置。
- [ ] 生产环境不会无声 fallback 到 mock LLM。
- [ ] demo 登录已关闭，或已加邀请码/密码。
- [ ] Cookie/session 已签名。
- [ ] API 有基础限流。
- [ ] 数据库 migration 可重复执行。
- [ ] seed 不会污染真实生产数据。
- [ ] 每日备份可用。
- [ ] 备份恢复演练通过。
- [ ] web 健康检查通过。
- [ ] agent-worker 能处理 pending task。
- [ ] Agent 工具仍保持白名单。
- [ ] 日志不会泄露 API Key。
- [ ] Docker 日志轮转已配置。
- [ ] 有服务器磁盘容量告警。
- [ ] Atlas OSS bucket 是 private。
- [ ] Atlas RAM 权限只覆盖 `ALIYUN_OSS_PREFIX`。
- [ ] `ATLAS_STORAGE_PROVIDER=aliyun-oss` 已配置。
- [ ] 现有本地 Atlas 图片已迁移到 OSS。
- [ ] 登录页 manifest 可访问且不包含秘密。
- [ ] `LOGIN_VISUALS_IMAGE_SRC` 已包含登录页图片 CDN/OSS origin。

## 17. 建议优先级

第一优先级，必须做完再公网开放：

- 真实域名 + HTTPS。
- 替换数据库密码。
- 不暴露 Postgres。
- 认证从 demo 改成邀请码/密码。
- 配置真实 LLM Key，禁止生产 mock fallback。
- 建立数据库备份。

第二优先级，上线初期尽快做：

- Dockerfile multi-stage 和非 root 用户。
- 日志轮转和监控。
- Agent task 超时/重试机制。
- 天气 API 替换 mock。
- LLM 调用成本和错误告警。

第三优先级，稳定运行后迭代：

- WebSocket 或增量 SSE。
- 数据导出/删除工具。
- 更完整的 Memory/MessageSummary。
- 多 Agent 编排。
- 更细的工具权限模型。
