# Atlas 画板交互增强 + 拖拽回退修复

## 概述

对 Atlas 记忆画板进行五项变更：四个功能增强 + 一个拖拽 bug 修复。

---

## Bug Fix: 拖拽回退

### 问题

拖动元素后概率性回退至拖动前位置，然后又闪回正确位置。

### 根因

三个时序问题叠加：

1. **`AtlasElement.tsx` onPointerUp 节流丢失最终位置** — 松手时如果距上次节流发送不到 100ms，`onDrag` 不被调用，React state 停留在上一次节流位置。`setIsDragging(false)` 触发重渲染时 DOM 被拉回。

2. **`AtlasApp.tsx` onElementDragEnd 不更新 React state** — 只发 PATCH 请求，不调用 `setElements`，React state 缺少最终位置。

3. **`AtlasApp.tsx` localDragIds 过早移除** — PATCH 完成后立即 `delete(id)`，但可能有旧的 SSE 快照（800ms 周期）正在途中。元素失去保护后被旧快照覆盖。

### 修复

**AtlasElement.tsx onPointerUp:**
- 移除节流条件，无条件调用 `onDrag` 发送最终位置到 React state。

**AtlasApp.tsx onElementDragEnd:**
- 添加 `setElements` 调用，确保 React state 与 DOM 位置一致。
- `localDragIds.delete(id)` 延迟 1000ms，跨越至少一个 SSE 快照周期（800ms）。

---

## 功能 40: 照片备注单击编辑

### 问题

PolaroidCard 底部标注使用 `onDoubleClick` 进入编辑模式，但 AtlasElement 的 `onPointerDown` 先触发拖拽，导致双击编辑无法工作。

### 方案

**PolaroidCard.tsx:**
- 标注区域的 `<p>` 和包裹 `<div>` 添加 `data-caption-area` 属性。
- `onDoubleClick` 改为 `onClick`，点击即进入编辑。
- 占位文字改为"添加备注…"。

**NoteCard.tsx (一并修复):**
- 内容区域的 `<div>` 添加 `data-note-area` 属性。
- `onDoubleClick` 改为 `onClick`。

**AtlasElement.tsx onPointerDown:**
- 检测 `e.target`，如果 `closest('[data-caption-area]')` 或 `closest('[data-note-area]')` 则 `return`，不启动拖拽。
- 删除按钮同理：如果 `closest('button[title="删除"]')` 则 `return`。

---

## 功能 41: 快速连线

### 需求

无需先点工具栏"连线"按钮，连续点击两个元素即可连线。

### 方案

**AtlasElement.tsx — 区分点击与拖拽:**
- `onPointerDown` 中记录 `startX`、`startY`、`pointerDownTime`。
- `onPointerUp` 中判断：移动距离 < 5px 且时长 < 300ms 视为"点击"，调用 `onClick(id)` 而非 `onDragEnd`。
- 连线模式（connectMode）下的行为不变——始终视为点击。

**AtlasApp.tsx — onElementClick 改造:**
- 不再要求 `connectMode` 才响应点击。
- 新增 `connectFrom` 的来源：快速点击。
- 逻辑：
  - 如果 `connectFrom` 为空 → 设为当前元素 id，启动 1.5s 超时自动清除。
  - 如果 `connectFrom` 已有值且与当前 id 不同 → 创建连线（POST /api/atlas/connections），清除 `connectFrom`。
  - 如果点击自己 → 清除 `connectFrom`。
- 工具栏 connectMode 保留：开启后所有点击都走连线逻辑（不触发拖拽），适合连续创建多条连线。快速连线的超时在 connectMode 下不生效。

**视觉反馈:**
- `connectFrom` 有值时，对应元素显示高亮环（`ring-2 ring-amber-400`），与现有 `isConnectFrom` 样式一致。

---

## 功能 42: 右键菜单添加照片/便签

### 需求

右键点击画布空白处弹出菜单（+ 照片 / + 便签），以鼠标位置作为新元素左上角坐标。

### 方案

**AtlasApp.tsx — 新增状态:**
- `contextMenu: { screenX: number; screenY: number; canvasX: number; canvasY: number } | null`

**AtlasCanvas.tsx — onContextMenu:**
- 在 container div 上监听 `onContextMenu`。
- 仅当 `e.target === e.currentTarget` 或 `e.target` 带有 `data-canvas-bg` 时触发（空白处）。
- `e.preventDefault()` 阻止浏览器默认菜单。
- 屏幕坐标 → 画布坐标转换：
  ```
  canvasX = (e.clientX - rect.left - viewport.x) / viewport.zoom
  canvasY = (e.clientY - rect.top - viewport.y) / viewport.zoom
  ```
- 通过 callback 传递给 AtlasApp 设置 `contextMenu` 状态。

**AtlasApp.tsx — 菜单渲染:**
- 当 `contextMenu` 非 null 时，渲染一个 `fixed` 定位的下拉菜单在 `(screenX, screenY)` 处。
- 两个选项：
  - "+ 照片" → 打开上传 modal，上传完成后元素放到 `(canvasX, canvasY)`。
  - "+ 便签" → 调用 `onAddNote(canvasX, canvasY)`（已支持坐标参数）。
- 点击菜单外部、滚轮、Escape 时关闭菜单。

**AtlasUploadModal — 新增可选 position prop:**
- `position?: { x: number; y: number }`
- 上传完成后：有 position 时用指定坐标，否则用视口中心。

---

## 功能 43: 单照片删除 + 清除连线

### 现状

代码已基本实现：
- PolaroidCard 右上角 × 按钮 → `onDelete(element.id)`
- AtlasApp `onElementDelete`：前端乐观删除 elements 和 connections，后端 DELETE 级联删除。

### 需要确保的点

- 功能 40 的修复（AtlasElement onPointerDown 跳过删除按钮区域）同时解决了 × 按钮可能被拖拽拦截的问题。
- 前端过滤逻辑 `prev.filter(c => c.fromId !== id && c.toId !== id)` 正确覆盖了 from 和 to 两个方向。
- 后端 Prisma schema 的 `onDelete: Cascade` 确保数据库层面连线被级联删除。

此功能无需额外代码变更，在功能 40 的修复中已一并解决按钮交互问题。

---

## 涉及文件

| 文件 | 变更类型 |
|---|---|
| `components/atlas/AtlasElement.tsx` | 修改：区分点击/拖拽、跳过编辑区域拖拽、修复 onPointerUp 节流 |
| `components/atlas/AtlasApp.tsx` | 修改：快速连线逻辑、右键菜单状态、dragEnd 修复、菜单渲染 |
| `components/atlas/AtlasCanvas.tsx` | 修改：onContextMenu 事件处理 |
| `components/atlas/PolaroidCard.tsx` | 修改：onClick + data-caption-area |
| `components/atlas/NoteCard.tsx` | 修改：onClick + data-note-area |
| `components/atlas/AtlasUploadModal.tsx` | 修改：可选 position prop |

不涉及新文件创建、数据库变更或新 API 端点。
