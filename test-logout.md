# 退出登录测试指南

## 测试环境
- 开发服务器: http://localhost:3001
- 已添加详细的控制台日志

## 测试步骤

### 测试场景 1: 正常退出登录
1. 打开浏览器，访问 http://localhost:3001
2. 登录系统
3. 进入聊天室或个人设置页面
4. 打开浏览器开发者工具 (F12)
5. 切换到 Console 标签页
6. 切换到 Network 标签页，勾选 "Preserve log"
7. 点击"退出登录"按钮
8. 观察控制台日志和网络请求

**预期结果**：
- Console 应该显示：
  ```
  [Logout] starting logout process...
  [Logout] calling /api/auth/logout...
  [SessionHeartbeat] received 'kicked' event
  [SessionHeartbeat] kick() called, cleaning up...
  [SessionHeartbeat] clearing probeTimer
  [SessionHeartbeat] redirecting to /
  [Logout] logout response: 200
  [Logout] clearing sessionStorage...
  [Logout] redirecting to / with hard refresh...
  ```

- Network 应该显示：
  - POST /api/auth/logout (200 OK)
  - 页面导航到 /
  - **不应该有** 401 错误的请求

- 服务端日志应该显示：
  ```
  [Logout API] received logout request, session: xxx
  [Logout API] deleting session from database: xxx
  [Logout API] session deleted successfully
  [Logout API] clearing cookie
  [Logout API] logout complete
  ```

### 测试场景 2: 退出登录后快速操作
1. 登录系统
2. 进入聊天室
3. 打开开发者工具
4. 点击"退出登录"
5. 在页面跳转过程中快速点击其他按钮或链接

**预期结果**：
- 所有请求应该被阻止或返回 401
- 不应该有重复的 /api/auth/me 请求
- 最终应该停留在登录页

### 测试场景 3: SessionHeartbeat 轮询期间退出
1. 登录系统
2. 等待至少 10 秒（确保 probeTimer 已设置）
3. 观察控制台，应该看到 `[SessionHeartbeat] scheduling next probe in 15s`
4. 在下次 probe 触发前点击"退出登录"

**预期结果**：
- 应该看到 `[SessionHeartbeat] clearing probeTimer`
- 退出后不应该有延迟的 /api/auth/me 请求
- Network 标签页中不应该有 401 错误

### 测试场景 4: 多次快速退出登录
1. 登录系统
2. 快速连续点击"退出登录"按钮 3 次

**预期结果**：
- 只有第一次点击生效（loggingOut 状态保护）
- 只有一个 POST /api/auth/logout 请求
- 页面正常跳转到登录页

## 观察要点

### 控制台日志检查清单
- [ ] 看到 `[Logout] starting logout process...`
- [ ] 看到 `[SessionHeartbeat] kick() called, cleaning up...`
- [ ] 看到 `[SessionHeartbeat] clearing probeTimer`
- [ ] 看到 `[Logout] redirecting to / with hard refresh...`
- [ ] **没有** 看到退出后的 `[SessionHeartbeat] probe() executing...`
- [ ] **没有** 看到退出后的 401 错误

### Network 标签页检查清单
- [ ] POST /api/auth/logout 返回 200
- [ ] 退出后没有 GET /api/auth/me 返回 401
- [ ] 退出后没有 GET /api/rooms/*/stream 返回 401
- [ ] 退出后没有任何其他 API 请求返回 401

### 服务端日志检查清单
```bash
# 查看服务端日志
tail -f /tmp/dev-server.log | grep -E "\[Logout|kicked\]"
```

- [ ] 看到 `[Logout API] received logout request`
- [ ] 看到 `[Logout API] session deleted successfully`
- [ ] 看到 `[Logout API] logout complete`

## 问题排查

### 如果仍然看到 401 错误

1. **检查 401 请求的时间戳**
   - 如果在 `[Logout] redirecting to /` 之后，说明清理不完整
   - 查看是哪个接口返回 401

2. **检查 probeTimer 是否被清除**
   - 搜索控制台日志中的 `clearing probeTimer`
   - 如果没有，说明 kick() 没有被调用

3. **检查 EventSource 是否正确关闭**
   - 在 Network 标签页中查看 EventSource 连接
   - 应该在退出时立即关闭

4. **检查是否有多个 SessionHeartbeat 实例**
   - 搜索 `[SessionHeartbeat] connecting to heartbeat stream...`
   - 应该只有一个连接

### 如果看到"闪回"到聊天室

1. **检查去重窗口**
   - 现在已设置为 2000ms
   - 查看两次重定向的时间间隔

2. **检查 window.location.href 是否生效**
   - 应该看到完整的页面刷新
   - 不应该是 SPA 路由跳转

## 成功标准

✅ 退出登录后：
- 立即跳转到登录页
- 没有任何 401 错误
- 没有延迟的 API 请求
- 控制台日志显示所有定时器被清除
- 服务端日志显示 session 被删除

## 测试完成后

如果测试通过，可以移除调试日志：
```bash
# 搜索并移除所有 console.log
grep -r "console.log.*\[Logout\]" components/ app/
grep -r "console.log.*\[SessionHeartbeat\]" components/
```

如果测试失败，请提供：
1. 完整的控制台日志
2. Network 标签页的截图
3. 服务端日志
4. 具体的失败现象描述
