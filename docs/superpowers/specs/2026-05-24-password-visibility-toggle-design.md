# 密码可见性切换（小眼睛）

## 概述

为所有密码输入框添加可见性切换按钮（小眼睛图标），点击在明文/密文之间切换。

## 方案

**新建 `components/auth/PasswordInput.tsx`：**
- 封装密码输入框 + 切换按钮
- `useState<boolean>` 管理 `showPassword`，控制 `type="password"` / `type="text"`
- 内联 SVG 图标：眼睛（显示密码时）/ 划线眼睛（隐藏密码时）
- 按钮绝对定位在输入框右侧（`absolute right-3 top-1/2 -translate-y-1/2`）
- 按钮 `type="button"` 防止触发表单提交
- 输入框增加 `pr-10` 给图标留空间
- 组件接收与原生 `<input>` 相同的 props（placeholder、autoComplete、minLength、required 等），透传给内部 input

**修改 3 个表单组件，替换 4 个密码输入框：**

| 文件 | 位置 | 替换内容 |
|---|---|---|
| `components/auth/LoginForm.tsx` | 第 63-72 行 | 1 个密码框 |
| `components/auth/RegisterForm.tsx` | 第 78-87 行 | 1 个密码框 |
| `components/auth/ResetPasswordForm.tsx` | 第 82-91 行 | 新密码框 |
| `components/auth/ResetPasswordForm.tsx` | 第 92-101 行 | 确认密码框 |

**样式：**
- 输入框保持现有样式：`w-full rounded-lg border border-warm-200 bg-white px-4 py-3 text-sm text-ink placeholder-ink/40 focus:border-sage-400 focus:outline-none`
- 新增 `pr-10` 给图标留位
- 图标按钮：`text-ink/30 hover:text-ink/50`，无背景无边框
- 图标尺寸：16x16px

**不涉及：** 新依赖、数据库变更、API 变更。
