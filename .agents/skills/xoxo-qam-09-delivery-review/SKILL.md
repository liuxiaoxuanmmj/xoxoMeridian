---
name: xoxo-qam-09-delivery-review
description: 审查 XOXO Meridian QAM-09 应用交付与进程拓扑的既有实现质量并维护持续评分报告；用于构建、Docker/Compose、配置传播、init、进程、volume、health 或部署 smoke 审查，不用于增加平台功能。
---

# QAM-09 应用交付与进程拓扑质量审查

## 目标与必读资料

在功能范围不变的前提下，判断 Web、PostgreSQL、init 与 Agent Worker 是否可重复构建、按依赖启动、正确接收配置并可观测恢复。不得因没有云平台、滚动发布、镜像签名或外部监控而扣分。

完整读取 `AGENTS.md`、`docs/optimization/module-quality-review-standard.md`，以及 `PROJECT_VIEW.md` 的 QAM-09、Cross-cutting Concerns、共享映射、BU-07、BU-09、BU-10。若报告已存在，读取并持续更新 `docs/optimization/qam-09-delivery-quality-review.md`。

## 模块证据范围

- 构建/命令：`package.json`、lockfile、`Dockerfile`、Next/Prisma 配置、`init.sh`。
- 拓扑/配置：`docker-compose*.yml`、`.env.example`、`lib/env.ts`、`prisma/seed.ts`、`app/api/health/route.ts`。
- 生命周期/验证：`agent/agent-worker.ts`、`scripts/compose-deployment-smoke.ts` 及相关 cleanup scripts、Compose config/smoke 证据。

重点核对锁定工具链和 build/runtime parity、Prisma Client/迁移/seed、service dependency 与失败重启、环境变量传播和 secret 泄漏、non-root/capability/volume ownership、Web/DB/Worker 健康语义、日志与 shutdown、smoke 隔离清理和生产代表性。固定名称或 tag 只有产生部署冲突/不可复现证据时才扣分。

## 审查与交付

1. 追踪 clean build→init→Web/Worker 启动→health→Agent 消费→shutdown/cleanup，并检查配置缺失和部分失败。
2. 使用 E1～E3 证据完成十维评分、Gate 和稳定 `QAM-09-nnn` ID；支持启动路径结论优先使用 Compose E3 证据。
3. 只提出保持现有部署拓扑功能的最小修正，不要求新增云平台、CI 或监控产品。
4. 按固定格式创建或更新 `docs/optimization/qam-09-delivery-quality-review.md`；初审 Delta 为 `baseline`。
5. 只修改该报告，不修改部署实现、总览或 Harness 状态。

完成前确认总分 100、Gate/证据一致、临时资源状态明确，并区分领域迁移内容与本模块的可部署责任。
