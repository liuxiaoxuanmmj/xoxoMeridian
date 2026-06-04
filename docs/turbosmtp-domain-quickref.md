# TurboSMTP 域名绑定快速参考

## 🎯 三步完成域名认证

### 第一步：TurboSMTP Dashboard
1. 登录 https://dashboard.serversmtp.com/
2. 进入 **Settings** → **Sender Domain Verification**
3. 添加你的域名（如 `yourdomain.com`）
4. 复制生成的 DNS 记录值

### 第二步：添加 DNS 记录

在你的域名 DNS 管理面板添加以下 3 条 TXT 记录：

#### 📝 SPF 记录
```
类型: TXT
名称: @ (或留空)
值:   v=spf1 include:_spf.serversmtp.com ~all
```

#### 🔐 DKIM 记录
```
类型: TXT
名称: turbo._domainkey (从 Dashboard 确认)
值:   v=DKIM1; k=rsa; p=MIGfMA0GCS... (从 Dashboard 复制完整值)
```

#### 📊 DMARC 记录
```
类型: TXT
名称: _dmarc
值:   v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com
```

### 第三步：验证
1. 等待 DNS 传播（1-2 小时）
2. 使用工具检查：`dig yourdomain.com TXT`
3. 在 TurboSMTP Dashboard 点击 **Verify**
4. 更新项目配置：`EMAIL_FROM=noreply@yourdomain.com`

## 🔍 快速验证命令

```bash
# 检查 SPF
dig yourdomain.com TXT +short | grep spf

# 检查 DKIM
dig turbo._domainkey.yourdomain.com TXT +short

# 检查 DMARC
dig _dmarc.yourdomain.com TXT +short
```

## ⚠️ 常见错误

### 已有 SPF 记录？
❌ 不要创建第二条 SPF 记录  
✅ 合并到现有记录：
```
v=spf1 include:_spf.google.com include:_spf.serversmtp.com ~all
```

### DKIM 验证失败？
- 确认选择器名称（`turbo._domainkey` 或其他）
- 从 Dashboard 重新复制完整公钥
- 检查是否有多余空格

### DNS 未生效？
- 等待更长时间（最长 48 小时）
- 清除本地 DNS 缓存：`sudo systemd-resolve --flush-caches`
- 使用在线工具验证：https://mxtoolbox.com/

## 📚 完整指南

详细步骤和故障排查：`docs/turbosmtp-domain-setup.md`

## 🎉 完成标志

- ✅ TurboSMTP Dashboard 显示 "Verified"
- ✅ 测试邮件成功送达收件箱（非垃圾箱）
- ✅ 邮件头显示 `SPF: PASS` 和 `DKIM: PASS`
