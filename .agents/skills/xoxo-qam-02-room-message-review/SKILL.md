---
name: xoxo-qam-02-room-message-review
description: 审查 XOXO Meridian QAM-02 私密房间与实时消息的既有实现质量并维护持续评分报告；用于房间授权、消息一致性、SSE、snapshot 或聊天状态质量审查，不用于增加聊天功能。
---

# QAM-02 私密房间与实时消息质量审查

## 目标与必读资料

在功能范围不变的前提下，判断房间隔离、消息事实和实时客户端视图是否可靠且易于演进。不得因只服务双人、消息协议简单或没有更多社交能力扣分。

完整读取 `AGENTS.md`、`docs/optimization/module-quality-review-standard.md`，以及 `PROJECT_VIEW.md` 的 QAM-02、Cross-cutting Concerns、共享映射、BU-02、BU-06。若报告已存在，读取并持续更新 `docs/optimization/qam-02-room-message-quality-review.md`，保留历史 ID 和评分。

## 模块证据范围

- 入口/UI：`app/api/rooms/`、`app/chat/`、聊天核心组件和 `components/chat/useRoomChat.ts`。
- 服务/状态：`lib/access.ts`、`lib/messages.ts`、`lib/room-list.ts`、`lib/room-snapshot.ts`、`lib/agent-detection.ts`、`lib/sse.ts`、`lib/stable-merge.ts`、`components/chat/types.ts`。
- 数据：Prisma `Room`、`RoomParticipant`、`Message`，以及清空/删除所触及的共享模型。
- 验证：Room/Message/Stream server 测试、真实 PostgreSQL 权限/级联测试、聊天组件和 E2E。

重点核对每条读写路径的成员资格、Message/AgentTask/EventLog 原子派生与重复请求、房间删除/清空事务、SSE 中止和 timer/listener 生命周期、snapshot 跨 QAM 查询成本和 contract 漂移、optimistic 合并/删除/重连正确性。共享聚合本身不是缺陷，只有它造成可证明的修改或运行成本时才扣分。

## 审查与交付

1. 追踪普通消息、Agent 消息、首次 snapshot、断线重连和房间删除/清空的正常及失败路径。
2. 先形成 E1～E3 证据，再按共享十维模型评分和 Gate；问题使用稳定 `QAM-02-nnn` ID。
3. 每项问题说明机制、实际影响、保持功能不变的最小修正和风险匹配验收证据。
4. 按固定格式创建或更新 `docs/optimization/qam-02-room-message-quality-review.md`；初审 Delta 为 `baseline`。
5. 只修改该报告。未经另行授权，不修改业务代码、schema、共享总览或 Harness 状态。

完成前确认十维合计 100、等级与 Gate 一致、P0 有 E3 强证据、链接可解析，并区分 QAM-01 身份、QAM-07 学习状态和 QAM-08 Runtime 的责任。
