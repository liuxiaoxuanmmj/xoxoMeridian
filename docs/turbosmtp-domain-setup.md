# TurboSMTP 域名绑定完整指南

本指南将帮助你完成 TurboSMTP 的域名认证配置，提高邮件送达率并防止邮件被标记为垃圾邮件。

## 📋 前置要求

- ✅ 拥有一个域名（如 `yourdomain.com`）
- ✅ 能够访问域名的 DNS 管理面板
- ✅ 已注册 TurboSMTP 账号并获取 API 凭证

## 🎯 为什么需要域名认证？

域名认证通过 SPF、DKIM 和 DMARC 三个 DNS 记录来：
- ✅ 证明你有权使用该域名发送邮件
- ✅ 防止他人伪造你的域名发送垃圾邮件
- ✅ 大幅提高邮件送达率（避免进入垃圾箱）
- ✅ 提升品牌信誉

## 📝 第一步：在 TurboSMTP Dashboard 中添加域名

### 1.1 登录 TurboSMTP Dashboard

访问：https://dashboard.serversmtp.com/

### 1.2 进入域名验证页面

根据 Dashboard 界面，通常路径为：
- **Settings** → **Sender Domain Verification**
- 或 **Domain Authentication**
- 或 **Email Authentication**

### 1.3 添加你的域名

1. 点击 **Add Domain** 或 **Verify Domain**
2. 输入你的域名（如 `yourdomain.com`）
3. 提交后，TurboSMTP 会生成需要添加的 DNS 记录

> **注意**：TurboSMTP 会为你生成特定的 DKIM 记录值，请务必从 Dashboard 复制准确的值。

## 🔧 第二步：配置 DNS 记录

你需要在域名注册商或 DNS 服务商（如 Cloudflare、阿里云、腾讯云、GoDaddy 等）的管理面板中添加以下 DNS 记录。

### 2.1 添加 SPF 记录

**SPF (Sender Policy Framework)** 指定哪些服务器可以代表你的域名发送邮件。

#### 记录类型：`TXT`
#### 主机名/名称：`@` 或留空（代表根域名）
#### 记录值：

```
v=spf1 include:_spf.serversmtp.com ~all
```

#### 如果已有 SPF 记录

如果你的域名已经有 SPF 记录（如用于 Google Workspace 或其他邮件服务），**不要创建第二条 SPF 记录**（会导致失败）。

正确做法是**合并**到现有记录中：

**原记录**：
```
v=spf1 include:_spf.google.com ~all
```

**合并后**：
```
v=spf1 include:_spf.google.com include:_spf.serversmtp.com ~all
```

> **重要**：`~all` 或 `-all` 必须放在最后。

### 2.2 添加 DKIM 记录

**DKIM (DomainKeys Identified Mail)** 使用加密签名验证邮件未被篡改。

#### 记录类型：`TXT`
#### 主机名/名称：`turbo._domainkey` 或 `default._domainkey`

> **关键**：DKIM 选择器（selector）和公钥值必须从 TurboSMTP Dashboard 复制！

#### 记录值示例：

```
v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC...（很长的公钥字符串）
```

**获取准确值的步骤**：
1. 在 TurboSMTP Dashboard 的域名验证页面
2. 找到 **DKIM Record** 部分
3. 复制显示的完整记录值
4. 注意记录名称（可能是 `turbo._domainkey` 或其他）

### 2.3 添加 DMARC 记录

**DMARC (Domain-based Message Authentication)** 告诉收件服务器如何处理未通过 SPF/DKIM 验证的邮件。

#### 记录类型：`TXT`
#### 主机名/名称：`_dmarc`
#### 记录值（推荐配置）：

```
v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com; pct=100; adkim=r; aspf=r
```

#### 参数说明：

| 参数 | 值 | 说明 |
|------|-----|------|
| `v` | `DMARC1` | DMARC 版本 |
| `p` | `none` / `quarantine` / `reject` | 策略：none=仅监控，quarantine=隔离到垃圾箱，reject=拒收 |
| `rua` | `mailto:your-email@yourdomain.com` | 接收聚合报告的邮箱 |
| `pct` | `100` | 应用策略的邮件百分比（100=全部） |
| `adkim` | `r` | DKIM 对齐模式（r=宽松，s=严格） |
| `aspf` | `r` | SPF 对齐模式（r=宽松，s=严格） |

**建议策略演进**：
1. **初期**：`p=none`（仅监控，不影响邮件投递）
2. **稳定后**：`p=quarantine`（未通过验证的邮件进垃圾箱）
3. **完全信任后**：`p=reject`（直接拒收未通过验证的邮件）

## 📊 第三步：DNS 记录配置示例

### 完整 DNS 记录表

假设你的域名是 `yourdomain.com`：

| 类型 | 主机名/名称 | 值 | TTL |
|------|-------------|-----|-----|
| TXT | `@` | `v=spf1 include:_spf.serversmtp.com ~all` | 3600 |
| TXT | `turbo._domainkey` | `v=DKIM1; k=rsa; p=MIGfMA0GCS...`（从 Dashboard 复制） | 3600 |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com` | 3600 |

### 常见 DNS 服务商配置界面

#### Cloudflare
1. 登录 Cloudflare → 选择域名
2. 进入 **DNS** → **Records**
3. 点击 **Add record**
4. 选择类型 `TXT`，填写名称和内容

#### 阿里云
1. 登录阿里云控制台 → 域名
2. 点击域名 → **解析设置**
3. 点击 **添加记录**
4. 记录类型选择 `TXT`

#### 腾讯云
1. 登录腾讯云控制台 → DNSPod
2. 选择域名 → **记录管理**
3. 点击 **添加记录**
4. 记录类型选择 `TXT`

#### GoDaddy
1. 登录 GoDaddy → My Products → Domains
2. 点击域名旁的 **DNS**
3. 滚动到 **Records** 部分
4. 点击 **Add** → 选择 `TXT`

## ✅ 第四步：验证 DNS 记录

### 4.1 等待 DNS 传播

DNS 记录更新需要时间：
- **最快**：5-15 分钟
- **通常**：1-2 小时
- **最长**：48 小时

### 4.2 使用工具检查 DNS 记录

#### 在线工具：

1. **MXToolbox**：https://mxtoolbox.com/SuperTool.aspx
   - 输入 `yourdomain.com`
   - 选择 `TXT Lookup`

2. **Google Admin Toolbox**：https://toolbox.googleapps.com/apps/dig/
   - 输入域名和记录类型

3. **DMARC Analyzer**：https://www.dmarcanalyzer.com/dmarc/dmarc-record-check/

#### 命令行检查：

```bash
# 检查 SPF 记录
dig yourdomain.com TXT +short | grep spf

# 检查 DKIM 记录
dig turbo._domainkey.yourdomain.com TXT +short

# 检查 DMARC 记录
dig _dmarc.yourdomain.com TXT +short
```

或使用 `nslookup`：

```bash
nslookup -type=TXT yourdomain.com
nslookup -type=TXT turbo._domainkey.yourdomain.com
nslookup -type=TXT _dmarc.yourdomain.com
```

### 4.3 在 TurboSMTP Dashboard 中验证

1. 返回 TurboSMTP Dashboard 的域名验证页面
2. 点击 **Verify** 或 **Check DNS** 按钮
3. 等待验证结果

**成功标志**：
- ✅ SPF: Verified
- ✅ DKIM: Verified
- ✅ DMARC: Verified

## 🎯 第五步：更新项目配置

DNS 验证通过后，更新项目的 `EMAIL_FROM` 环境变量：

```bash
# 使用你已验证的域名
EMAIL_FROM=noreply@yourdomain.com
# 或
EMAIL_FROM=hello@yourdomain.com
```

重启应用：

```bash
npm run dev
```

## 🐛 常见问题排查

### 问题 1：DNS 记录验证失败

**可能原因**：
- DNS 记录尚未传播（等待更长时间）
- 记录值复制错误（检查是否有多余空格）
- 记录名称错误（如 `turbo._domainkey` vs `default._domainkey`）

**解决方法**：
1. 使用 `dig` 或在线工具确认 DNS 记录已生效
2. 重新从 Dashboard 复制记录值
3. 确认记录类型为 `TXT`

### 问题 2：SPF 记录冲突

**错误信息**：Multiple SPF records found

**解决方法**：
- 一个域名只能有一条 SPF 记录
- 将多个 `include:` 合并到一条记录中

### 问题 3：DKIM 公钥太长

某些 DNS 服务商限制单个 TXT 记录长度为 255 字符。

**解决方法**：
将长字符串分割成多个引号包裹的部分：

```
"v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC..." "继续的字符串..."
```

### 问题 4：邮件仍进垃圾箱

**可能原因**：
- DNS 记录刚生效，需要时间建立信誉
- DMARC 策略设置为 `p=none`（仅监控）
- 邮件内容触发垃圾邮件过滤器

**解决方法**：
1. 等待 1-2 周建立发送信誉
2. 检查邮件内容（避免过多链接、全大写、垃圾词汇）
3. 逐步将 DMARC 策略从 `none` → `quarantine` → `reject`

## 📊 监控和维护

### 查看 DMARC 报告

如果你在 DMARC 记录中设置了 `rua=mailto:your-email@yourdomain.com`，你会收到 XML 格式的聚合报告。

**推荐工具**（解析 DMARC 报告）：
- **Postmark DMARC Digests**：https://dmarc.postmarkapp.com/
- **DMARC Analyzer**：https://www.dmarcanalyzer.com/
- **Valimail**：https://www.valimail.com/

### 定期检查

- 每月检查一次 DNS 记录是否仍然有效
- 监控 TurboSMTP Dashboard 的发送统计
- 关注退信率和投诉率

## 🎓 进阶配置

### 自定义 DKIM 选择器

如果你使用多个邮件服务商，可以为每个服务配置不同的 DKIM 选择器：

```
turbo._domainkey.yourdomain.com    # TurboSMTP
google._domainkey.yourdomain.com   # Google Workspace
```

### 子域名配置

如果你想用子域名发送邮件（如 `mail.yourdomain.com`），需要为子域名单独配置 SPF、DKIM、DMARC。

### BIMI（品牌标识）

BIMI 允许在支持的邮件客户端中显示你的品牌 Logo，但需要：
- 完整的 DMARC 配置（`p=quarantine` 或 `p=reject`）
- 商标认证（VMC）
- SVG 格式的 Logo

## 📚 参考资源

- [TurboSMTP 邮件认证设置](https://serversmtp.com/how-to-set-up-email-authentication/)
- [配置 TurboSMTP DKIM/SPF/DMARC](https://dmarcdkim.com/de/setup/how-to-authenticate-turbosmtp-email-domain)
- [SPF 记录完整指南](https://www.autospf.com/blog/complete-spf-record-guide-syntax-lookup-flattening-and-testing/)
- [DMARC 配置指南](https://www.mailreach.co/blog/spf-dkim-dmarc-how-to-implement-them)

## ✅ 配置检查清单

完成以下所有步骤后，你的域名认证就完成了：

- [ ] 在 TurboSMTP Dashboard 添加域名
- [ ] 添加 SPF TXT 记录到 DNS
- [ ] 添加 DKIM TXT 记录到 DNS（从 Dashboard 复制）
- [ ] 添加 DMARC TXT 记录到 DNS
- [ ] 等待 DNS 传播（1-48 小时）
- [ ] 使用在线工具验证 DNS 记录
- [ ] 在 TurboSMTP Dashboard 验证域名
- [ ] 更新项目 `EMAIL_FROM` 环境变量
- [ ] 发送测试邮件验证
- [ ] 监控 DMARC 报告

---

**配置完成后，你的邮件送达率将显著提升！** 🎉

如有问题，请查看 TurboSMTP 官方文档或联系他们的技术支持。
