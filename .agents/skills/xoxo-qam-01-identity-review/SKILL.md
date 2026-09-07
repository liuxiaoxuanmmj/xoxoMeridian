---
name: xoxo-qam-01-identity-review
description: 审查 XOXO Meridian QAM-01 身份、会话与个人档案的既有实现质量并维护持续评分报告；用于认证、Session/Cookie、密码恢复、档案隐私或外部身份适配相关质量审查，不用于增加认证功能。
---

# QAM-01 身份、会话与个人档案质量审查

## 目标

在功能范围不变的前提下，判断身份事实、会话生命周期、账号恢复和个人资料边界是否清晰、可靠且易于修改。不要因认证方式少、固定双人邀请或页面简单扣分。

## 必读资料

1. 完整读取仓库根目录 `AGENTS.md`。
2. 读取 `PROJECT_VIEW.md` 的 QAM-01、Cross-cutting Concerns、共享代码映射，以及 BU-06～BU-10 中与身份相关的条目。
3. 完整读取 `docs/optimization/module-quality-review-standard.md`。
4. 若存在，读取并持续更新 `docs/optimization/qam-01-identity-quality-review.md`，不得删除历史问题 ID 或评分记录。

## 模块证据范围

- 入口：`app/api/auth/`、`app/api/profile/refine-note/route.ts`、`app/me/`、`components/auth/`。
- 核心服务：`lib/auth.ts`、`lib/password.ts`、`lib/password-reset.ts`、`lib/geo-ip.ts`、`lib/geo-normalize.ts`、`lib/email/`。
- 数据与交付边界：Prisma `User`、`Session`、`PasswordResetToken`、`UserProfile`，以及 `lib/env.ts`、`proxy.ts` 中直接影响身份语义的配置。
- 验证：相关 server/lib/component/E2E 测试；Session、token 消费或并发语义需要风险匹配的数据库/浏览器证据。

重点核对 Cookie 签名与数据库 Session 一致性、单活跃会话竞态、reset token 的存储和原子消费、跨写 `RoomParticipant` 的所有权、代理头信任、敏感档案/日志，以及邮件、Geo IP、LLM 失败隔离。遗留文件只有在确认未接入运行路径且造成误用或维护成本时才登记技术债。

## 审查流程

1. 用入口、服务、schema 和测试追踪注册/登录/受保护请求/退出与密码重置的正常路径和主要失败路径。
2. 先收集 E1～E3 证据，再按共享标准完成十维 100 分评分、Gate 和稳定问题 ID；不得凭外观制造问题。
3. 对每个问题写清机制、影响链、最小修正和验收证据；修正不得扩展认证能力或改变产品策略。
4. 按共享固定格式创建或更新 `docs/optimization/qam-01-identity-quality-review.md`，初审历史 Delta 写 `baseline`。
5. 只修改该报告；除非用户另行授权，不修改业务代码、schema、配置、总览或 Harness 状态。

## 完成检查

- 十维分数精确合计 100，Score Level、Gate Level 和 Final Level 一致。
- 所有 P0/P1 至少有 E2 直接代码证据，P0 必须有 E3 复现或等价强证据。
- 建议均关联问题 ID，保持已有功能边界，并区分本模块与 QAM-02/QAM-08/QAM-09 的责任。
- 仓库链接可解析，未运行的验证明确标注为未验证。
