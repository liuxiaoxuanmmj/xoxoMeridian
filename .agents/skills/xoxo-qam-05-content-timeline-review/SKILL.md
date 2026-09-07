---
name: xoxo-qam-05-content-timeline-review
description: 审查 XOXO Meridian QAM-05 内容发布与时间线的既有实现质量并维护持续评分报告；用于 Post 所有权、slug、搜索、Markdown、Agent log 或 Post/Atlas 生命周期审查，不用于增加内容功能。
---

# QAM-05 内容发布与时间线质量审查

## 目标与必读资料

在功能范围不变的前提下，判断用户 Post 与 Agent log 的写入、检索、呈现和跨空间生命周期是否清晰可靠。不得因内容类型少、编辑器简单或没有额外发布能力扣分。

完整读取 `AGENTS.md`、`docs/optimization/module-quality-review-standard.md`，以及 `PROJECT_VIEW.md` 的 QAM-05、Cross-cutting Concerns、共享映射、BU-05。若报告已存在，读取并持续更新 `docs/optimization/qam-05-content-timeline-quality-review.md`。

## 模块证据范围

- 入口/UI：`app/posts/`、`app/api/posts/`、`app/actions/posts.ts`、`components/blog/`、共享首页装配。
- 服务：`lib/posts.ts`、`lib/api-posts.ts`、`lib/post-time.ts`、`lib/agent-posts.ts`。
- 数据：Prisma `Post`、slug/index/migration 及 `AtlasElement.postId` 关系。
- 验证：Post 服务/Route/组件、Markdown、安全、搜索和发帖 E2E；Agent log 投影证据。

重点核对 API 与 Server Action 写路径规则一致性、ownership、并发 slug 唯一性、cursor/search 排序、Markdown 与链接安全、缓存失效、AgentTask→agent_log 的幂等/失败隔离，以及 Post/AtlasElement 删除与创建生命周期。Home 组合耦合只有在引发修改扩散时扣分。

## 审查与交付

1. 追踪创建/编辑/删除/查询 Post、渲染 Markdown 和创建 Agent log 的正常及失败路径。
2. 使用 E1～E3 证据完成十维评分、Gate 和稳定 `QAM-05-nnn` ID；不得用功能丰富度或 UI 审美评分。
3. 每项建议关联问题 ID，说明最小修正和可观察验收，不新增内容类型或发布能力。
4. 按固定格式创建或更新 `docs/optimization/qam-05-content-timeline-quality-review.md`；初审 Delta 为 `baseline`。
5. 只修改该报告，不修改业务实现、总览或 Harness 状态。

完成前确认总分 100、链接和测试层级可信，并区分 QAM-06 空间坐标/媒体与 QAM-08 Trace 生成责任。
