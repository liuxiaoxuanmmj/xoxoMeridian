# TurboSMTP 邮件服务配置指南

本项目已集成 TurboSMTP API v2，用于发送邮件（密码重置、欢迎邮件等）。

## 📋 前置要求

1. 注册 TurboSMTP 账号：https://serversmtp.com/
2. 免费账号提供每月 6,000 封邮件额度
3. 从 Dashboard 获取 API 凭证

## 🔑 获取 API 凭证

1. 登录 TurboSMTP Dashboard
2. 进入 **API Settings** 或 **API Keys** 页面
3. 创建新的 API Key，获取：
   - **Consumer Key**
   - **Consumer Secret**

## ⚙️ 环境变量配置

在项目根目录的 `.env` 或 `.env.local` 文件中添加以下配置：

```bash
# 邮件服务提供商（必填）
EMAIL_PROVIDER=turbosmtp

# 发件人邮箱地址（必填）
# 注意：即使没有绑定域名，也可以使用任意邮箱地址
EMAIL_FROM=noreply@yourdomain.com

# TurboSMTP API 凭证（必填）
TURBOSMTP_CONSUMER_KEY=your_consumer_key_here
TURBOSMTP_CONSUMER_SECRET=your_consumer_secret_here

# TurboSMTP 区域（可选，默认 us）
# 选项: us | eu
TURBOSMTP_REGION=us
```

### 环境变量说明

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `EMAIL_PROVIDER` | ✅ | `mock` | 邮件服务提供商，设置为 `turbosmtp` |
| `EMAIL_FROM` | ✅ | `noreply@example.com` | 发件人邮箱地址 |
| `TURBOSMTP_CONSUMER_KEY` | ✅ | - | TurboSMTP Consumer Key |
| `TURBOSMTP_CONSUMER_SECRET` | ✅ | - | TurboSMTP Consumer Secret |
| `TURBOSMTP_REGION` | ❌ | `us` | API 区域，欧盟用户使用 `eu` |

## 🌍 区域选择

TurboSMTP 提供两个 API 端点：

- **美国/全球用户**: `https://api.turbo-smtp.com/api/v2/mail/send`
  - 设置 `TURBOSMTP_REGION=us` 或不设置（默认）

- **欧盟用户**: `https://api.eu.turbo-smtp.com/api/v2/mail/send`
  - 设置 `TURBOSMTP_REGION=eu`

## ✅ 验证配置

启动开发服务器后，触发一次密码重置或注册流程，检查控制台日志：

```bash
npm run dev
```

**成功示例**：
```
[email] Sending email via TurboSMTP...
[email] Email sent successfully, messageID: xxx
```

**失败示例**（配置错误）：
```
[email] EMAIL_PROVIDER=turbosmtp but TURBOSMTP_CONSUMER_KEY or TURBOSMTP_CONSUMER_SECRET is empty. Falling back to mock provider.
[email] Mock provider - Email would be sent:
```

## 🔄 切换回 Mock 模式（开发测试）

如果暂时不想发送真实邮件，可以切换回 Mock 模式：

```bash
EMAIL_PROVIDER=mock
```

Mock 模式会在控制台打印邮件内容，但不会真正发送。

## 📚 API 文档参考

- [TurboSMTP API v2 官方文档](https://serversmtp.com/turbo-api/)
- [TurboSMTP 开发者页面](https://serversmtp.com/email-api-for-developers/)

## 🐛 常见问题

### 1. 邮件发送失败，返回 401 错误

**原因**: Consumer Key 或 Consumer Secret 错误

**解决**: 
- 检查环境变量是否正确复制（无多余空格）
- 重新生成 API Key

### 2. 邮件发送失败，返回 403 错误

**原因**: API Key 权限不足或账号被限制

**解决**:
- 检查 TurboSMTP 账号状态
- 确认账号未超出配额

### 3. 收不到邮件

**原因**: 可能被垃圾邮件过滤

**解决**:
- 检查垃圾邮件文件夹
- 在 TurboSMTP Dashboard 查看发送日志
- 考虑配置 SPF/DKIM 记录（需要域名）

### 4. 想使用自定义域名

TurboSMTP 支持绑定自定义域名，但需要：
1. 拥有域名
2. 在 DNS 中添加 SPF、DKIM、DMARC 记录
3. 在 TurboSMTP Dashboard 中验证域名

详见：https://serversmtp.com/domain-authentication/

## 🔐 安全建议

1. **不要将 API 凭证提交到 Git**
   - `.env.local` 已在 `.gitignore` 中
   - 使用环境变量管理工具（如 Vercel、Railway）

2. **生产环境使用环境变量**
   ```bash
   # Vercel
   vercel env add TURBOSMTP_CONSUMER_KEY
   vercel env add TURBOSMTP_CONSUMER_SECRET
   ```

3. **定期轮换 API Key**
   - 在 TurboSMTP Dashboard 中可以随时重新生成

## 📊 监控和日志

TurboSMTP Dashboard 提供：
- 实时发送统计
- 邮件发送日志
- 退信和投诉报告
- API 调用次数

建议定期检查以确保邮件服务正常运行。
