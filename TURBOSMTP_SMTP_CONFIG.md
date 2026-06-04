# TurboSMTP SMTP 配置（使用占位符）

## 🔑 SMTP 凭证占位符

```bash
SMTP 用户名: your_smtp_username
SMTP 密码:   your_smtp_password
```

不要把真实 SMTP 凭证写入仓库。如果凭证曾被提交或分享，请立即在 TurboSMTP 后台轮换。

## ⚙️ 环境变量配置

在项目根目录创建或编辑 `.env.local` 文件，添加以下配置：

```bash
# 邮件服务提供商
EMAIL_PROVIDER=smtp

# 发件人邮箱地址
EMAIL_FROM=noreply@yourdomain.com

# TurboSMTP SMTP 配置
SMTP_HOST=pro.turbo-smtp.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_username
SMTP_PASSWORD=your_smtp_password
```

## 📋 配置说明

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `EMAIL_PROVIDER` | `smtp` | 使用 SMTP 协议发送邮件 |
| `EMAIL_FROM` | `noreply@yourdomain.com` | 发件人地址（暂时可以用任意邮箱） |
| `SMTP_HOST` | `pro.turbo-smtp.com` | TurboSMTP 的 SMTP 服务器地址 |
| `SMTP_PORT` | `587` | SMTP 端口（587 使用 STARTTLS） |
| `SMTP_SECURE` | `false` | 端口 587 使用 STARTTLS，不是 SSL |
| `SMTP_USER` | `your_smtp_username` | SMTP 用户名 |
| `SMTP_PASSWORD` | `your_smtp_password` | SMTP 密码 |

## 🚀 快速测试

### 1. 创建配置文件

```bash
cd /home/dadalv/xoxoMeridian
nano .env.local
```

粘贴以下内容：

```bash
EMAIL_PROVIDER=smtp
EMAIL_FROM=noreply@yourdomain.com
SMTP_HOST=pro.turbo-smtp.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_username
SMTP_PASSWORD=your_smtp_password
```

保存并退出（Ctrl+X，然后 Y，然后 Enter）

### 2. 重启开发服务器

```bash
npm run dev
```

### 3. 测试邮件发送

访问你的应用，触发密码重置流程：
1. 访问 `/forgot-password`
2. 输入一个邮箱地址
3. 检查该邮箱是否收到密码重置邮件

## 🔍 验证配置

启动服务器后，查看控制台日志：

**成功示例**：
```
[email] Sending email via SMTP...
[email] Email sent successfully, messageId: <xxx@pro.turbo-smtp.com>
```

**失败示例**（配置错误）：
```
[email] EMAIL_PROVIDER=smtp but SMTP_HOST, SMTP_USER, or SMTP_PASSWORD is empty. Falling back to mock provider.
```

## 📝 完整的 .env.local 示例

```bash
# =============================================================================
# 数据库配置（如果你在本地开发）
# =============================================================================
DATABASE_URL=postgresql://user:password@localhost:5432/xoxomeridian
DIRECT_URL=postgresql://user:password@localhost:5432/xoxomeridian

# =============================================================================
# 应用配置
# =============================================================================
APP_BASE_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
SESSION_SECRET=your-session-secret-at-least-32-chars-long
INVITE_CODE=your-invite-code

# =============================================================================
# 邮件配置（TurboSMTP SMTP）
# =============================================================================
EMAIL_PROVIDER=smtp
EMAIL_FROM=noreply@yourdomain.com

SMTP_HOST=pro.turbo-smtp.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_username
SMTP_PASSWORD=your_smtp_password

# =============================================================================
# 其他可选配置
# =============================================================================
LLM_PROVIDER=openai-compatible
LLM_API_KEY=
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4.1-mini

WEATHER_PROVIDER=mock
AGENT_TASK_INLINE_RUN=true
```

## ⚠️ 重要提示

### 1. 发件人地址
- 暂时可以使用任意邮箱地址作为 `EMAIL_FROM`
- 但为了提高送达率，建议后续绑定域名
- 绑定域名后使用 `noreply@yourdomain.com`

### 2. 端口选择
TurboSMTP 支持多个端口：
- **587**（推荐）：STARTTLS，`SMTP_SECURE=false`
- **465**：SSL/TLS，`SMTP_SECURE=true`
- **25**：不加密（不推荐）

当前配置使用 587 端口，这是最常用和推荐的。

### 3. 安全性
- ⚠️ 不要将 `.env.local` 提交到 Git
- `.env.local` 已在 `.gitignore` 中
- 生产环境使用环境变量管理工具

### 4. 邮件配额
- 免费账号：6000 封/月
- 超出配额后邮件发送会失败
- 在 TurboSMTP Dashboard 查看使用情况

## 🐛 常见问题

### 问题 1：连接超时

**错误信息**：`Connection timeout`

**解决方法**：
- 检查防火墙是否阻止了 587 端口
- 尝试使用 465 端口（`SMTP_PORT=465`, `SMTP_SECURE=true`）

### 问题 2：认证失败

**错误信息**：`Invalid login` 或 `Authentication failed`

**解决方法**：
- 确认用户名和密码没有多余空格
- 重新从 TurboSMTP Dashboard 复制凭证
- 检查账号是否被暂停

### 问题 3：邮件进垃圾箱

**原因**：未绑定域名，缺少 SPF/DKIM 认证

**解决方法**：
- 短期：提醒收件人检查垃圾箱
- 长期：按照 `docs/turbosmtp-domain-setup.md` 绑定域名

### 问题 4：收不到邮件

**排查步骤**：
1. 检查控制台日志是否显示发送成功
2. 检查垃圾邮件文件夹
3. 在 TurboSMTP Dashboard 查看发送日志
4. 确认收件人邮箱地址正确

## 📊 监控

登录 TurboSMTP Dashboard 查看：
- 实时发送统计
- 邮件发送日志
- 退信报告
- 配额使用情况

Dashboard 地址：https://dashboard.serversmtp.com/

## 🎯 下一步

配置完成后，建议：
1. ✅ 发送测试邮件验证配置
2. ✅ 监控发送日志确保正常
3. 📋 后续考虑绑定域名提高送达率（参考 `docs/turbosmtp-domain-setup.md`）

---

**配置完成！现在你可以使用 TurboSMTP 发送邮件了。** 🎉
