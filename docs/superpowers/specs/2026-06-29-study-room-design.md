# Study Room Design Spec

## Overview

新增一个 `/study` 功能页，提供单人可用的番茄钟工作台，并为后续升级为房间型网络自习室预留数据边界。一期必须打通三条链路：

- `study/`：开始专注、结束专注、查看最近记录、查看今日/本周统计
- `home`：在现有 blog 时间轴中线附近叠加已完成的静态专注区间
- `chat`：在房间成员栏中展示用户当前是否 `专注中`，且同房间两名成员都可见

本期不做房间绑定专注，不做暂停/恢复，不做进行中时间轴渲染，不做标签/备注，不做自动休息链路。

## Product Decisions

- 形态：混合型。先做单人专注页，但数据模型预留未来房间化扩展
- 导航：在现有 `SiteNav` 中新增 `Study` 页签
- `home` 联动：只在用户退出专注后渲染静态专注区间
- `home` 呈现：采用时间轴中线附近的背景轨道叠加方案，不插入新的 post/event 卡片
- `chat` 联动：展示全局个人状态。用户一旦在 `study/` 开始专注，自己参与的所有聊天室成员栏里都显示其 `专注中`
- `study/` 页面范围：番茄钟主面板 + 今日/本周统计 + 最近记录
- UI 参考：采用 Figma Make 参考稿 `https://www.figma.com/make/yvrDpXxZ2nE6u2R22MTggi/Add-Study-Room-Page?t=OdFggL6hKX9fBvdC-1` 的单功能工作台风格，但保留本仓库既有导航和路由结构

## Architecture

```text
SiteNav
 ├─ /home
 ├─ /chat
 └─ /study   ← new

StudyPage (server + client)
 ├─ GET /api/study
 │   ├─ currentState     ← FocusState (per-user)
 │   ├─ recentSessions   ← FocusSession[] (per-user)
 │   ├─ todayStats
 │   └─ weekStats
 │
 ├─ POST /api/study/start
 │   └─ upsert FocusState(status = focusing)
 │
 └─ POST /api/study/stop
     ├─ read FocusState
     ├─ create FocusSession(status = completed)
     ├─ reset FocusState(status = idle)
     └─ revalidatePath("/home")

HomePage (server)
 ├─ posts                  ← existing prisma.post.findMany()
 ├─ completedStudySessions ← new study timeline query
 └─ HomeTimelineBoard
     └─ Timeline
         ├─ Post cards remain unchanged
         └─ Study interval overlay rendered near center line

ChatRoomPage (server)
 └─ getRoomSnapshot(roomId, userId)
     └─ participants[].user.studyStatus ← derived from FocusState
```

核心原则：

- `FocusState` 负责“当前状态是否恢复得回来”
- `FocusSession` 负责“历史记录、统计、blog 时间轴”
- `study` 负责写入
- `home` 和 `chat` 只负责读取和展示

## Data Model

建议新增两张表，而不是复用 `Post.metadata` 或 `UserProfile.preferences`。

### 1. `FocusState`

每个用户一条当前状态记录，用于页面刷新恢复和聊天室状态展示。

建议字段：

```prisma
enum FocusStatus {
  idle
  focusing
}

model FocusState {
  id                String      @id @default(cuid())
  userId            String      @unique
  status            FocusStatus @default(idle)
  plannedMinutes    Int
  startedAt         DateTime?
  expectedEndAt     DateTime?
  currentSessionKey String?
  roomId            String?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  user              User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  room              Room?       @relation(fields: [roomId], references: [id], onDelete: SetNull)

  @@index([status])
  @@index([roomId])
}
```

说明：

- `roomId` 一期不参与业务判断，但保留为可空字段，供后续房间型自习室扩展
- `currentSessionKey` 用于避免重复 stop 时重复记账，可选
- `plannedMinutes` 一期固定 `25`，但字段保留，后续可支持自定义时长

### 2. `FocusSession`

每次完成专注后落一条记录，用于历史、统计和时间轴叠加。

建议字段：

```prisma
enum FocusSessionStatus {
  completed
  cancelled
}

model FocusSession {
  id             String             @id @default(cuid())
  userId         String
  roomId         String?
  status         FocusSessionStatus @default(completed)
  plannedMinutes Int
  actualMinutes  Int
  startedAt      DateTime
  endedAt        DateTime
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  user           User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  room           Room?              @relation(fields: [roomId], references: [id], onDelete: SetNull)

  @@index([userId, startedAt(sort: Desc)])
  @@index([startedAt(sort: Desc)])
  @@index([roomId])
  @@index([status, startedAt(sort: Desc)])
}
```

说明：

- 一期 `blog/home` 只消费 `status = completed`
- 一期默认“主动结束即记为 completed”；若后续要区分中断，可再引入 `cancelled`
- `actualMinutes` 不依赖计划时长推断，直接记录真实完成时长，避免后续规则变化影响历史口径

## Route and API Design

### 1. `GET /api/study`

返回当前用户的 `study/` 页面初始化数据：

```ts
{
  currentState: {
    status: "idle" | "focusing";
    plannedMinutes: number;
    startedAt: string | null;
    expectedEndAt: string | null;
  };
  recentSessions: Array<{
    id: string;
    startedAt: string;
    endedAt: string;
    actualMinutes: number;
    userId: string;
  }>;
  stats: {
    todayCount: number;
    todayMinutes: number;
    weekCount: number;
    weekMinutes: number;
  };
}
```

要求：

- 一次请求返回页面首屏所需全部数据
- `recentSessions` 建议取最近 `8-10` 条
- 统计按用户本地时区计算，优先使用 `user.profile.timezone`

### 2. `POST /api/study/start`

请求：

```ts
{
  plannedMinutes?: number;
}
```

行为：

- 校验登录态
- 若当前用户已有 `focusing` 状态，返回当前状态，不重复开启新 session
- 若无进行中状态，则 upsert `FocusState`
- 一期默认 `plannedMinutes = 25`

响应：

```ts
{
  state: {
    status: "focusing";
    plannedMinutes: 25;
    startedAt: string;
    expectedEndAt: string;
  };
}
```

### 3. `POST /api/study/stop`

行为：

- 校验登录态
- 读取当前用户 `FocusState`
- 若当前不是 `focusing`，返回 409 或幂等错误
- 计算实际专注时长
- 写入一条 `FocusSession`
- 将 `FocusState` 重置为 `idle`
- `revalidatePath("/home")`

响应：

```ts
{
  session: {
    id: string;
    startedAt: string;
    endedAt: string;
    actualMinutes: number;
  };
  state: {
    status: "idle";
  };
}
```

### 不纳入本期的 API

以下功能如果在 UI 中保留占位，统一标注 `待实现`：

- 自定义时长设置
- 休息模式和自动轮转
- 暂停/恢复
- 标签/备注
- 房间绑定专注

## Study Page Design

`/study` 是一个真正可工作的单功能页面，不是介绍页。页面应当直接进入专注流程。

### Layout

建议结构：

```text
StudyPage
 ├─ SiteNav
 └─ main
    ├─ Hero work surface
    │  ├─ current status
    │  ├─ countdown
    │  ├─ primary action
    │  └─ supporting info
    ├─ Stats section
    │  ├─ today count
    │  ├─ today minutes
    │  ├─ week count
    │  └─ week minutes
    └─ Recent sessions section
       └─ latest completed intervals
```

### Interaction

- 空闲态：
  - 显示 `开始专注`
  - 倒计时显示默认 `25:00`
- 专注中：
  - 显示 `专注中`
  - 倒计时根据 `expectedEndAt` 递减
  - 主按钮切换为 `结束专注`
- 结束专注：
  - 当前状态回到 `idle`
  - 最近记录立即出现新条目
  - 今日/本周统计刷新

### Visual Rules

基于 Figma 参考稿，页面采用以下约束：

- 单功能工作台布局，不做 hero 文案区
- 使用少量、清晰的 surface 分区，而不是 blog 时间流式大面积留白
- 主计时器区应是首屏视觉中心
- 统计信息使用紧凑数字摘要，不强制加图表
- 最近记录按列表呈现，强调时间区间和持续分钟数
- 整体风格应保持 quiet, clean, content-first

### Pending Marker Rule

凡是页面中保留但本期未接接口的 UI，统一使用同一套标注：

- 文案：`待实现`
- 形式：小号 muted badge / secondary inline text
- 位置：模块标题右侧，或控件说明行内
- 不允许放进主按钮正文里

示例：

- `自定义时长  待实现`
- `休息模式  待实现`

## SiteNav Change

`components/blog/SiteNav.tsx`

- 在 `Blog` / `Chat` 旁新增 `Study`
- 路由指向 `/study`
- 激活态规则：
  - `pathname.startsWith("/study")` 时高亮 `Study`
- 不改变现有 SearchInput / New Post / 用户入口布局逻辑

## Home / Blog Integration

### Data Loading

`app/home/page.tsx` 在查询 `posts` 之外，再查询一段时间窗内的已完成 `FocusSession`。

建议策略：

- 与当前 timeline 同步，先取最近 `50` 条 post 所覆盖的时间范围
- 在该范围附近补一段 buffer，查询该范围内的 `FocusSession`
- 只取 `completed` session
- 需要带上用户基础信息，至少包括：
  - `id`
  - `displayName`
  - `avatarLabel`

### Rendering Strategy

不新增 post，不改 `PostCard` 内容，不把专注区间写进 Markdown。

建议在 `Timeline` 中新增 overlay 数据层：

```ts
type TimelineFocusInterval = {
  id: string;
  userId: string;
  userDisplayName: string;
  startedAt: string;
  endedAt: string;
  actualMinutes: number;
};
```

在现有中线 `timeline-line` 附近绘制一组细条段：

- 条段靠近中线，不进入文章卡正文区域
- 同一用户颜色固定
- 两名用户重叠时使用左右偏移或双轨并排
- 专注轨道不响应 hover、点击，不参与空间锚点逻辑

### User Differentiation

一期只要求区分用户，不要求用户自定义颜色。

建议规则：

- 取时间轴里出现的前两位人类作者，或 session 用户顺序，分配稳定颜色
- 颜色应低饱和、可区分、不会压过文章卡片
- 不要求在每条轨道边上重复显示用户名；必要时可在一天首段或 tooltip 中显示

### Boundary With Existing Spatial Layer

`HomeTimelineBoard` 现有的 photo / connection spatial layer 不应受专注轨道影响。

- 轨道是只读视觉层
- 不注册 spatial anchor
- 不参与连线、框选、右键菜单
- 搜索过滤时，轨道只根据当前显示时间窗重算，不修改数据库

## Chat Integration

### Data Source

`chat` 成员栏读 `FocusState`，不是 `FocusSession`。

展示逻辑：

- `FocusState.status === focusing` -> 显示 `专注中`
- `idle` -> 不显示状态文案

### Snapshot Change

`lib/room-snapshot.ts` 在构造 `room.participants` 时，附带一个轻量状态字段：

```ts
type ChatStudyStatus = {
  state: "focusing" | "idle";
  expectedEndAt?: string | null;
};
```

扩展后：

```ts
participants: Array<{
  user: ChatUser & {
    studyStatus?: ChatStudyStatus | null;
  };
}>
```

查询方式：

- 一次查出该房间所有参与者的 `FocusState`
- 按 `userId` 映射回 participants
- 保持 snapshot 周期刷新即可，不新增专门 SSE 通道

### LeftRail UI

`components/chat/LeftRail.tsx`

在成员卡片中新增一行状态展示：

- 位置：城市信息下方，`个人设置` 链接上方或同一块内
- 文案：`专注中`
- 形式：secondary text 或轻量 badge
- 不增加操作入口

一期不展示倒计时剩余分钟，避免 snapshot 轮询带来频繁 UI 抖动。

## Error Handling and Edge Cases

| 场景 | 处理 |
|---|---|
| 用户在 `focusing` 状态重复点击开始 | 返回当前 state，前端不新增第二轮 |
| 用户没有进行中状态却点击结束 | 返回 409 / 业务错误 |
| 用户刷新 `study/` 页面 | 从 `FocusState` 恢复当前状态 |
| 用户在多个 `chat` 房间中切换 | 因为是全局个人状态，所有房间都可见同一 `专注中` 状态 |
| 用户专注结束后立即看 `home` | 依靠 `revalidatePath("/home")` 让 SSR 查询拿到新 session |
| blog 时间轴无 session | 不渲染 overlay |
| 两个用户 session 时间重叠 | 使用双轨或轻微偏移，避免完全覆盖 |
| 用户没有时区资料 | 回退到服务器默认时区或 UTC，并在统计函数中集中处理 |

## Testing

| Layer | Test |
|---|---|
| API | `POST /api/study/start` 首次开始成功，重复开始返回当前状态 |
| API | `POST /api/study/stop` 在 focusing 时创建 `FocusSession` 并重置 `FocusState` |
| API | 未登录访问 `GET /api/study` / `start` / `stop` 返回 401 |
| Lib | 今日/本周统计在用户时区下计算正确 |
| Lib | 时间轴 interval 映射在重叠场景下能生成稳定轨道数据 |
| UI | `SiteNav` 在所有页面显示 `Study` 页签，`/study` 时高亮 |
| UI | `LeftRail` 在参与者专注中时展示 `专注中` |
| UI | `Timeline` 渲染 overlay 但不修改 `PostCard` 内容结构 |
| UI | `study/` 页面在 idle 和 focusing 两种状态下切换按钮与倒计时 |

## Implementation Order

1. Prisma schema：新增 `FocusState` / `FocusSession` / enum + migration
2. Study data helpers：聚合当前状态、最近记录、统计
3. `GET /api/study`
4. `POST /api/study/start`
5. `POST /api/study/stop`
6. `app/study/page.tsx` + 对应 client 组件
7. `SiteNav` 新增 `Study`
8. `home` 查询 completed sessions
9. `Timeline` / `HomeTimelineBoard` 增加专注轨道 overlay
10. `getRoomSnapshot` / `ChatUser` / `LeftRail` 增加 `专注中` 状态
11. 测试补齐

## Non-Goals

- 不做房间内共同开始/结束专注
- 不做番茄轮次编排
- 不做休息阶段自动切换
- 不做任务标签、备注、分类
- 不做聊天室内控制专注的入口
- 不做进行中的 blog 轨道实时延展
