---
name: xoxo-qam-07-study-review
description: 审查 XOXO Meridian QAM-07 专注学习与伙伴状态的既有实现质量并维护持续评分报告；用于 Focus 状态机、Session/Goal 一致性、时区统计、presence 或客户端 timer 审查，不用于增加学习功能。
---

# QAM-07 专注学习与伙伴状态质量审查

## 目标与必读资料

在功能范围不变的前提下，判断专注计时事实、完成记录、目标、时区统计和伙伴状态是否在并发与生命周期变化下保持一致。不得因计时模式或统计指标少而扣分。

完整读取 `AGENTS.md`、`docs/optimization/module-quality-review-standard.md`，以及 `PROJECT_VIEW.md` 的 QAM-07、Cross-cutting Concerns、共享映射、BU-02。若报告已存在，读取并持续更新 `docs/optimization/qam-07-study-quality-review.md`。

## 模块证据范围

- 入口/UI：`app/study/`、`app/api/study/`、`components/study/`。
- 服务/共享：`lib/study.ts`、`lib/room-snapshot.ts`、`components/chat/types.ts`、`components/chat/useRoomChat.ts`。
- 数据：Prisma `FocusState`、`FocusSession`、`StudyGoal` 及相关约束/迁移。
- 验证：Study service/Route/组件测试、时区测试、真实数据库语义和 Study E2E。

重点核对 start/pause/resume/stop 状态转移、并发/多标签页重复 Session、stop 的事务一致性、Goal ownership/sort order、DST/跨午夜/周界/streak、客户端 timer 漂移、polling/presence 清理，以及与 Room snapshot 的循环依赖和查询放大。UI 文件大不是独立问题，必须关联认知或修改成本证据。

## 审查与交付

1. 追踪所有状态转移、完成/取消、目标 CRUD、统计和页面轮询/heartbeat 的正常及失败路径。
2. 使用 E1～E3 证据完成十维评分、Gate 和稳定 `QAM-07-nnn` ID；原子/并发结论需风险匹配证据。
3. 只提出保持既有模式和统计定义的最小修正，不新增通知、离线或学习能力。
4. 按固定格式创建或更新 `docs/optimization/qam-07-study-quality-review.md`；初审 Delta 为 `baseline`。
5. 只修改该报告，不修改业务实现、总览或 Harness 状态。

完成前确认总分 100、Gate 与测试证据一致，并区分 QAM-01 时区档案和 QAM-02 Chat/Snapshot 责任。
