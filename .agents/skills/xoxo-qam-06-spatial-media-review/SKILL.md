---
name: xoxo-qam-06-spatial-media-review
description: 审查 XOXO Meridian QAM-06 空间画布与媒体资产的既有实现质量并维护持续评分报告；用于 board scope、协同状态、拖动缓存、SSE、上传安全或 DB/blob 生命周期审查，不用于增加画布功能。
---

# QAM-06 空间画布与媒体资产质量审查

## 目标与必读资料

在功能范围不变的前提下，判断 Atlas/Home board 的事实范围、协同同步和媒体资源生命周期是否可控。不得因元素类型少、没有更复杂协作或只支持当前存储供应商扣分。

完整读取 `AGENTS.md`、`docs/optimization/module-quality-review-standard.md`，以及 `PROJECT_VIEW.md` 的 QAM-06、Cross-cutting Concerns、共享映射、BU-01、BU-05。若报告已存在，读取并持续更新 `docs/optimization/qam-06-spatial-media-quality-review.md`。

## 模块证据范围

- 入口/UI：`app/api/atlas/`、`app/api/home-board/`、`components/atlas/`、`components/home/`、共享首页/Timeline。
- 服务/状态：`lib/atlas-*`、`lib/home-*`、`lib/storage/atlas-storage.ts`。
- 数据/资源：Prisma `AtlasBoard`、`AtlasElement`、`AtlasConnection`，本地文件或 OSS object。
- 验证：reconcile/drag/home/存储测试、Route 测试和画布组件交互测试。

重点核对 global board 与 URL roomId 的实际授权含义、optimistic op/SSE snapshot/drag cache 收敛、多实例缓存、pointer/listener 生命周期、元素连接约束、上传 MIME/大小/key/path traversal、私有读取缓存，以及数据库记录和 blob 写删的部分失败/孤儿资源。不要仅因使用轮询或 best-effort 就定性，必须说明现实影响。

## 审查与交付

1. 追踪元素/连接/拖动/重连、上传/读取/删除和 Home Post anchor 的正常及失败路径。
2. 使用 E1～E3 证据完成十维评分、Gate 和稳定 `QAM-06-nnn` ID；协同与资源一致性结论需匹配验证层级。
3. 只提出保持既有交互的最小修正，不新增元素、协作或存储功能。
4. 按固定格式创建或更新 `docs/optimization/qam-06-spatial-media-quality-review.md`；初审 Delta 为 `baseline`。
5. 只修改该报告，不修改业务实现、共享总览或 Harness 状态。

完成前确认总分 100、Gate 和链接正确，并区分 QAM-05 内容事实与 QAM-09 volume/config 责任。
