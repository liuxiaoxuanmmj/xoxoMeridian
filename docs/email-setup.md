# 邮件发送功能使用指南

## 概述

xoxo Meridian 现已集成邮件发送功能，支持密码重置、欢迎邮件等场景。系统采用抽象接口设计，支持多种邮件服务提供商。

## 架构设计

```
lib/email/
├── types.ts       # 类型定义（EmailProvider 接口、EmailPayload 等）
├── provider.ts    # 提供商实现（Resend、Mock）
├── templates.ts   # 邮件模板（密码重置、欢迎邮件）
└── index.ts       # 统一导出
```

## 环境变量配置

### 开发环境（Mock 模式）

在 `.env` 中添加：

```bash
EMAIL_PROVIDER=mock
EMAIL_FROM=noreply@your-domain.example.com
```

Mock 模式会将邮件内容输出到控制台日志，不会真实发送。

### 生产环境（Resend）

1. 注册 Resend 账号：https://resend.com
2. 获取 API Key：https://resend.com/api-keys
3. 验证发件域名（或使用测试地址 `onboarding@resend.dev`）
4. 在 `.env` 中配置：

```bash
EMAIL_PROVIDER=resend
EMAIL_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=noreply@your-domain.com
```

**注意：** Resend 免费版限制：
- 每月 3,000 封邮件
- 每天 100 封邮件
- 仅支持已验证的域名发送（测试可用 `onboarding@resend.dev`）

## 使用方法

### 1. 发送密码重置邮件

```typescript
import { sendEmail, createPasswordResetEmail } from "@/lib/email";

const resetLink = `${env.APP_BASE_URL}/reset-password?token=${token}`;
const emailPayload = createPasswordResetEmail({
  email: "user@example.com",
  resetLink,
  expiryHours: 1,
});

const result = await sendEmail(emailPayload);

if (!result.success) {
  console.error("邮件发送失败:", result.error);
}
```

### 2. 发送欢迎邮件

```typescript
import { sendEmail, createWelcomeEmail } from "@/lib/email";

const emailPayload = createWelcomeEmail({
  email: "newuser@example.com",
  displayName: "张三",
  loginLink: `${env.APP_BASE_URL}/login`,
});

const result = await sendEmail(emailPayload);
```

### 3. 自定义邮件

```typescript
import { sendEmail } from "@/lib/email";
import type { EmailPayload } from "@/lib/email";

const payload: EmailPayload = {
  to: { email: "user@example.com", name: "用户名" },
  subject: "自定义邮件主题",
  html: "<h1>HTML 内容</h1><p>邮件正文</p>",
  text: "纯文本内容（可选）",
  replyTo: { email: "support@example.com", name: "客服团队" },
};

const result = await sendEmail(payload);
```

### 4. 批量发送

```typescript
const payload: EmailPayload = {
  to: [
    { email: "user1@example.com", name: "用户1" },
    { email: "user2@example.com", name: "用户2" },
  ],
  subject: "批量邮件",
  html: "<p>邮件内容</p>",
};

const result = await sendEmail(payload);
```

## 添加新邮件模板

在 `lib/email/templates.ts` 中添加：

```typescript
export type YourEmailData = {
  email: string;
  // 其他字段
};

export function createYourEmail(data: YourEmailData): EmailPayload {
  const { email } = data;

  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>邮件标题</title>
</head>
<body style="margin: 0; padding: 0; font-family: sans-serif;">
  <!-- 邮件内容 -->
</body>
</html>
  `.trim();

  const text = `
纯文本版本
  `.trim();

  return {
    to: { email },
    subject: "邮件主题",
    html,
    text,
  };
}
```

然后在 `lib/email/index.ts` 中导出：

```typescript
export { createYourEmail } from "./templates";
export type { YourEmailData } from "./templates";
```

## 扩展其他邮件服务商

实现 `EmailProvider` 接口：

```typescript
// lib/email/provider.ts

import type { EmailProvider, EmailPayload, EmailResult } from "./types";

class SendGridProvider implements EmailProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(payload: EmailPayload): Promise<EmailResult> {
    // 实现 SendGrid 发送逻辑
    try {
      // ... SendGrid API 调用
      return { success: true, messageId: "sg-xxx" };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
```

然后在 `getEmailProvider()` 中添加分支：

```typescript
export function getEmailProvider(): EmailProvider {
  // ...
  if (provider === "sendgrid") {
    providerInstance = new SendGridProvider(env.EMAIL_API_KEY);
  }
  // ...
}
```

## 测试

运行邮件功能测试：

```bash
npx vitest run tests/lib/email.test.ts
```

## 故障排查

### 1. Mock 模式下看不到日志

检查 `EMAIL_PROVIDER` 是否设置为 `mock`，查看控制台输出。

### 2. Resend 发送失败

- 检查 `EMAIL_API_KEY` 是否正确
- 确认 `EMAIL_FROM` 域名已在 Resend 控制台验证
- 查看 Resend Dashboard 的发送日志

### 3. 邮件进入垃圾箱

- 配置 SPF、DKIM、DMARC 记录（Resend 控制台有详细指引）
- 避免使用垃圾邮件触发词
- 确保 HTML 模板格式正确

## 安全注意事项

1. **不要在日志中输出敏感信息**：密码重置 token 仅在 Mock 模式下输出
2. **防止邮箱枚举攻击**：无论用户是否存在，都返回相同的成功消息
3. **速率限制**：忘记密码接口已配置速率限制（15 分钟内最多 5 次）
4. **Token 过期**：密码重置 token 有效期 1 小时，过期自动清理

## 已实现的功能

- ✅ 密码重置邮件（`forgot-password` API 已集成）
- ✅ 欢迎邮件模板（待集成到注册流程）
- ✅ Mock 和 Resend 提供商
- ✅ 单元测试覆盖

## 待完成的工作

### 必须完成

1. **配置生产环境变量**
   - 在生产服务器的 `.env` 中设置 `EMAIL_PROVIDER=resend`
   - 添加 Resend API Key
   - 配置已验证的发件域名

2. **验证域名**
   - 登录 Resend 控制台
   - 添加你的域名（如 `your-domain.com`）
   - 按照指引配置 DNS 记录（SPF、DKIM、DMARC）
   - 等待验证通过（通常几分钟到几小时）

3. **测试生产环境**
   - 在生产环境触发忘记密码流程
   - 确认邮件能正常送达
   - 检查邮件不进垃圾箱

### 可选扩展

1. **集成欢迎邮件到注册流程**
   - 在 `app/api/auth/register/route.ts` 中调用 `createWelcomeEmail`
   - 注册成功后自动发送欢迎邮件

2. **添加更多邮件模板**
   - 账号激活邮件
   - 密码修改通知
   - 登录异常提醒
   - 定期摘要邮件

3. **邮件发送队列**
   - 当前是同步发送，可能阻塞 API 响应
   - 考虑使用后台任务队列（如 BullMQ + Redis）异步发送
   - 支持失败重试机制

4. **邮件发送统计**
   - 记录发送成功/失败次数
   - 监控邮件送达率
   - 集成到管理后台

5. **多语言支持**
   - 根据用户语言偏好选择邮件模板
   - 支持中英文切换

6. **邮件预览功能**
   - 开发环境下提供邮件预览页面
   - 方便调试邮件样式

## 相关文件

- `app/api/auth/forgot-password/route.ts` - 忘记密码 API（已集成）
- `lib/email/` - 邮件功能核心代码
- `lib/env.ts` - 环境变量配置
- `.env.example` - 环境变量示例
- `tests/lib/email.test.ts` - 单元测试
