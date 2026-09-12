# XOXO Meridian 模块工程质量总览

> 评分标准：[`module-quality-review-standard.md`](./module-quality-review-standard.md)
> 模块边界：[`PROJECT_VIEW.md`](../../PROJECT_VIEW.md)
> 当前状态：QAM-01～QAM-10 已按当前快照完成独立 Skill 复审；后续只在代码、资产或风险匹配证据变化时复审。

## Current Quality Baseline

| QAM | Module | Score | Score Level | Gate / Final | Trend | Open Issues | Last Review | Report | Skill |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| QAM-01 | 身份、会话与个人档案 | 87 | L3 | L4 / L3 | 0 | 3（P2×3） | 2026-09-12 | [报告](./qam-01-identity-quality-review.md) | [`$xoxo-qam-01-identity-review`](../../.agents/skills/xoxo-qam-01-identity-review/SKILL.md) |
| QAM-02 | 私密房间与实时消息 | 90 | L4 | L4 / L4 | 0 | 2（P2×2） | 2026-09-12 | [报告](./qam-02-room-message-quality-review.md) | [`$xoxo-qam-02-room-message-review`](../../.agents/skills/xoxo-qam-02-room-message-review/SKILL.md) |
| QAM-03 | 双人生活信息与计划管理 | 90 | L4 | L4 / L4 | +5 | 2（P2×2） | 2026-09-12 | [报告](./qam-03-life-plan-quality-review.md) | [`$xoxo-qam-03-life-plan-review`](../../.agents/skills/xoxo-qam-03-life-plan-review/SKILL.md) |
| QAM-04 | 定时任务触发与派生 | 87 | L3 | L3 / L3 | 0 | 1（P2×1） | 2026-09-12 | [报告](./qam-04-scheduler-quality-review.md) | [`$xoxo-qam-04-scheduler-review`](../../.agents/skills/xoxo-qam-04-scheduler-review/SKILL.md) |
| QAM-05 | 内容发布与时间线 | 73 | L2 | L2 / L2 | 0 | 7（P2×7） | 2026-09-12 | [报告](./qam-05-content-timeline-quality-review.md) | [`$xoxo-qam-05-content-timeline-review`](../../.agents/skills/xoxo-qam-05-content-timeline-review/SKILL.md) |
| QAM-06 | 空间画布与媒体资产 | 74 | L2 | L2 / L2 | +9 | 6（P2×6） | 2026-09-12 | [报告](./qam-06-spatial-media-quality-review.md) | [`$xoxo-qam-06-spatial-media-review`](../../.agents/skills/xoxo-qam-06-spatial-media-review/SKILL.md) |
| QAM-07 | 专注学习与伙伴状态 | 85 | L3 | L2 / L2 | 0 | 2（P2×2） | 2026-09-12 | [报告](./qam-07-study-quality-review.md) | [`$xoxo-qam-07-study-review`](../../.agents/skills/xoxo-qam-07-study-review/SKILL.md) |
| QAM-08 | Agent 任务执行与工具治理 | 80 | L3 | L2 / L2 | +10 | 5（P2×5） | 2026-09-12 | [报告](./qam-08-agent-runtime-quality-review.md) | [`$xoxo-qam-08-agent-runtime-review`](../../.agents/skills/xoxo-qam-08-agent-runtime-review/SKILL.md) |
| QAM-09 | 应用交付与进程拓扑 | 82 | L3 | L2 / L2 | +4 | 5（P2×5） | 2026-09-12 | [报告](./qam-09-delivery-quality-review.md) | [`$xoxo-qam-09-delivery-review`](../../.agents/skills/xoxo-qam-09-delivery-review/SKILL.md) |
| QAM-10 | 全局 3D Agent 入口与模型资产生命周期 | 84 | L3 | L2 / L2 | baseline | 5（P2×5） | 2026-09-12 | [报告](./qam-10-agent-entry-quality-review.md) | [`$xoxo-qam-10-agent-entry-review`](../../.agents/skills/xoxo-qam-10-agent-entry-review/SKILL.md) |

## Portfolio Snapshot

- 十个模块简单平均分：`83.2/100`。该数值只用于观察全局趋势，不替代模块 Gate，也不用于比较产品价值或团队绩效。
- Final Level 分布：L0×0、L1×0、L2×6、L3×2、L4×2。
- 当前开放问题：38 项，其中 P0×0、P1×0、P2×38；另有 QAM-02-005 一项 `not-reproduced` 历史记录，不计入开放项。
- 当前没有开放 P0/P1。`QAM-08-006` 已由显式 requester/self/partner contract、绝对 Memory owner、无损迁移及真实 PostgreSQL/Planner→Tool 回归关闭；`QAM-03-004` 与 `QAM-06-009` 的既有关闭结论保持。QAM-10 已作为独立模块纳入持续治理；其首次审查无 P0/P1，当前五个 P2 聚焦资产 provenance、Theme 单一契约、认证显示缓存、实体设备证据和当前 production E3 缺口。

## 使用规则

- 总览只汇总各模块报告的当前分数、最终等级、趋势和开放问题数量；详细判断以模块报告为准。
- `Score` 是可连续比较的 100 分质量指标，`Final Level` 同时受严重问题和验证门禁限制。
- 每次模块复审后更新对应行；没有实际代码或证据变化时不制造分数波动。
- 跨模块问题只在主责任模块维护稳定 ID，其他报告以关联方式引用，避免重复计数。
- 总览不用于比较产品价值、功能丰富度或团队绩效。

## Portfolio History

| Date | Reviewed Scope | Summary | Evidence |
| --- | --- | --- | --- |
| 2026-09-06 | QAM-01～QAM-09 | 9 个独立子 Agent 显式调用对应 Skill 完成初审；平均分 68.7，开放 P1×17/P2×31，Final 分布 L0×1/L1×5/L2×3 | feat-025、9 份模块报告的 baseline 历史行 |
| 2026-09-07 | QAM-06 | QAM-06-001 已解决；QAM-06 由 57/L0 提升至 64/L1，组合平均分 69.4，开放问题降为 P1×16/P2×31 | feat-027、QAM-06 复审历史、真实 PostgreSQL board-scope 回归与完整门禁 |
| 2026-09-07 | QAM-06 | QAM-06-003 已解决；QAM-06 由 64/L1 提升至 71/L2，组合平均分 70.2，开放问题降为 P1×15/P2×31 | feat-029、Home 拖动失败/重试与串行组件回归、真实 PostgreSQL 双进程 snapshot 收敛验证 |
| 2026-09-07 | QAM-01 | QAM-01-002/003 已解决；QAM-01 由 68/L1 提升至 76/L1（Score L2、Gate L1），组合平均分 71.1，开放问题降为 P1×13/P2×31 | feat-030、token digest/迁移、真实 PostgreSQL 并发单消费与故障回滚、9 项隔离 Playwright |
| 2026-09-07 | QAM-01 | QAM-01-001 已解决；QAM-01 由 76/L1 提升至 83/L1（Score L3、Gate L1），组合平均分 71.9，开放问题降为 P1×12/P2×31 | feat-031、按用户行锁的 Session 原子替换、真实 PostgreSQL 并发登录/Cookie 授权/故障回滚与注册签发回归、9 项隔离 Playwright |
| 2026-09-08 | QAM-01 | QAM-01-004 已解决；QAM-01 由 83/L1 提升至 87/L3（Score L3、Gate L4），组合平均分 72.3，开放问题降为 P1×11/P2×31 | feat-032、默认 Room 行锁、真实 PostgreSQL 并发注册 200/409、容量上限、身份孤儿/故障回滚与单次完整门禁 9 项 Playwright |
| 2026-09-08 | QAM-05 | QAM-05-005 已解决；QAM-05 由 64/L1 提升至 73/L2，组合平均分 73.3，开放问题降为 P1×10/P2×31 | feat-033、统一 Post read visibility、真实 PostgreSQL 列表/type/搜索/详情/首页跨房间与 `SetNull` 孤儿回归、单次完整门禁 9 项 Playwright |
| 2026-09-08 | QAM-07 | QAM-07-001 已解决；QAM-07 由 62/L1 提升至 77/L1（Score L2、Gate L1），组合平均分 75.0，开放问题降为 P1×9/P2×31 | feat-034、keyed transition service、真实 PostgreSQL 并发 stop/pause/故障回滚 5/5、完整门禁 14 文件/35 项 PostgreSQL 与 9/9 Playwright |
| 2026-09-09 | QAM-07 | QAM-07-002 已解决；QAM-07 由 77/L1 提升至 85/L2（Score L3、Gate L2），组合平均分 75.9，开放问题降为 P1×8/P2×31 | feat-035、服务端 keyed reconciliation、真实 PostgreSQL GET/start/stop 并发与故障回滚 10/10、离开/重访/刷新 Playwright、完整门禁 14 文件/40 项 PostgreSQL 与 10/10 Playwright |
| 2026-09-09 | QAM-02 | QAM-02-001 已解决；QAM-02 由 71/L1 提升至 78/L1（Score L2、Gate L1），组合平均分 76.7，开放问题降为 P1×7/P2×31 | feat-036、Prisma `select` 与显式公开 view model、真实 PostgreSQL 修复前完整 User/Profile 暴露及修复后 1/1、Chat/Study RSC 页面载荷 Playwright 修复前失败与修复后 2/2、完整门禁 15 文件/41 项 PostgreSQL 与 11/11 Playwright |
| 2026-09-09 | QAM-02 | QAM-02-003 已解决；QAM-02 由 78/L1 提升至 86/L1（Score L3、Gate L1），组合平均分 77.6，开放问题降为 P1×6/P2×31 | feat-037、共享预算化 Task/Event 原子派生、source Message 行锁与幂等 HTTP 结果、真实 PostgreSQL 修复前并发 201/500 和故障孤儿、修复后 3/3、完整门禁 16 文件/44 项 PostgreSQL 与 11/11 Playwright |
| 2026-09-09 | QAM-02 | QAM-02-004 已解决；QAM-02 由 86/L1 提升至 90/L4（Score/Gate/Final L4），组合平均分 78.0，开放问题降为 P1×5/P2×31 | feat-038、User 行锁与事务内成员资格/count/delete、真实 PostgreSQL 修复前并发 `[200,200]` 删除全部房间、修复后 `[200,409]` 且 `/chat` 解析剩余默认房间、完整门禁 17 文件/45 项 PostgreSQL 与 11/11 Playwright |
| 2026-09-10 | QAM-03 | QAM-03-002 已解决；QAM-03 由 69/L1 提升至 81/L2（Score L3、Gate L2），组合平均分 79.3，开放问题降为 P1×4/P2×31 | feat-039、共享 ScheduledJob authoring service、Room 行锁与事务内 active count/write；真实 PostgreSQL 无锁负向对照 0/2、修复后 Route/Agent create/re-enable/active edit 3/3，完整门禁 18 文件/48 项 PostgreSQL 与 11/11 Playwright |
| 2026-09-11 | QAM-03 | QAM-03-001 已解决；QAM-03 由 81/L2 提升至 88/L2（Score L3、Gate L2，Final 因开放 P1 仍为 L2），组合平均分 80.1，开放问题降为 P1×3/P2×31 | feat-042、一次性 `fireAt` 与墙上时间收敛为 `lib/` 单一事实来源并由 Route/Agent 共用；未修复组件负向对照 3/4 失败（−480 分钟）、修复后 4/4；真实 PostgreSQL 9/9 含 Route 与 Agent 同一 `fireAt` 一致性；完整门禁 70 文件/457 项 Vitest、19 文件/57 项 PostgreSQL 与 26/26 Playwright |
| 2026-09-12 | QAM-03 | QAM-03-003 已解决；QAM-03 由 88/L2 提升至 92/L4（Score/Gate/Final L4），组合平均分 80.6，开放问题降为 P1×2/P2×31 | feat-044、显式 currentUserId/requestedById 与共享 participant resolver；未修复组件 2/5、Agent 2/6 失败，修复后组件 7/7、Agent/Server 4 文件/35 项；Weather Route/Tool 一致性与第二参与者真实 Chromium 旅程；完整门禁 72 文件/466 项 Vitest、19 文件/57 项 PostgreSQL 与 29/29 Playwright |
| 2026-09-12 | QAM-04 | QAM-04-001 已解决；QAM-04 由 75/L2 提升至 84/L2（Score L3、Gate/Final L2），组合平均分 81.6，开放问题降为 P1×1/P2×31 | feat-045、期望 `nextRunAt` timer 与共享 due/CAS；修复前 Node 负向对照 3/15 失败，修复后 Scheduler 16/16；真实 PostgreSQL 3/3 覆盖旧 timer 隔离、并发单 Task/Event 与故障回滚；完整门禁 72 文件/470 项 Vitest、19 文件/59 项 PostgreSQL 与 29/29 Playwright |
| 2026-09-12 | QAM-04 | QAM-04-002 已解决；QAM-04 由 84/L2 提升至 87/L3（Score/Gate/Final L3），组合平均分 81.9，开放问题降为 P1×0/P2×31 | feat-046、run-once 统一禁用 claim；修复前 Node 1/17、PostgreSQL 1/4 均在下一日错误 fired，修复后 Scheduler 18/18、PostgreSQL 4/4 覆盖 fireAt 合成 cron 禁用终态与零 Task/Event；完整门禁 72 文件/472 项 Vitest、19 文件/60 项 PostgreSQL 与 29/29 Playwright |
| 2026-09-12 | QAM-01～QAM-10 | 10 个模块分别由独立子 Agent 显式调用对应 Skill 复审；3D Agent Entry 经独立边界分析升格为 QAM-10 并建立专用 Skill/初审报告。组合均分 80.8，开放 P1×3/P2×38，Final 分布 L1×2/L2×5/L3×2/L4×1 | feat-047；QAM-01/02/04/05/07 持平，QAM-03 新增错误 `fireAt`/contract/a11y 问题降 7，QAM-06 新增 Home anchor 授权 P1 降 6，QAM-08 新增 Planner/Memory 身份 P1 降 4，QAM-09 因直接交付证据升 4，QAM-10 baseline 84/L2；各报告记录本轮定向命令和未运行层级 |
| 2026-09-12 | QAM-06 | QAM-06-009 已解决；QAM-06 由 65/L1 提升至 74/L2（Score/Gate/Final L2），组合均分 81.7，开放问题降为 P1×2/P2×38 | feat-048、共享 Home spatial access predicate 与实际条件写；未修复 PostgreSQL 负向对照复现隐藏 ID、200/201/200 和持久副作用，修复后双 Room 1/1、完整门禁 20 文件/61 项 PostgreSQL 与 30/30 Playwright |
| 2026-09-12 | QAM-03 | QAM-03-004 已解决；QAM-03 由 85/L2 提升至 90/L4（Score/Gate/Final L4），组合均分 82.2，开放问题降为 P1×1/P2×38 | feat-049、HTTP/Agent 共享 offset datetime 与 trigger 组合谓词、resolver 防御校验；修复前跨进程/Registry 2 文件/50 项中 6 项失败，修复后 50/50；真实 PostgreSQL Route/Agent create/update parity 11/11，完整门禁 72/480 Vitest、20/63 PostgreSQL 与 30/30 Playwright |
| 2026-09-12 | QAM-08 | QAM-08-006 已解决；QAM-08 由 70/L1 提升至 80/L2（Score L3、Gate/Final L2），组合均分 83.2，开放问题降为 P1×0/P2×38 | feat-050、显式 requester/self/partner contract、绝对 Memory owner/canonical key 与保留 legacy 的迁移；修复前 Node 2 项、PostgreSQL 3 项失败，修复后旧迁移数据 8/8 保留及双成员/Planner→Tool 回归通过；完整门禁 72/482 Vitest、22/68 PostgreSQL 与 30/30 Playwright |
