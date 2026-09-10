# 3D Agent Entry 设计审查与详细实施计划

- 日期：2026-09-10。
- 输入：[原设计](../plan/2026-09-09-agent-entry-design.md)。
- 审查结论：总体架构可行；实施前须补齐生产 CSP、Docker 构建配置与真实浏览器验证三个高优先级缺口。
- 文档状态：实施方案已编写，产品功能尚未实施；本文中的步骤、命令和验收结果均为未来执行要求，另有明确标注的本次只读核验除外。
- 范围：一个全局 3D 聊天导航入口，两个构建期主题，以及支撑它的资产流程、配置和测试。
- 排期：现有 `feat-039` 已为 `in-progress`，保留其工作；Agent Entry 登记为后续 `not-started` feature，待活动 feature 收尾后再启动。两项功能没有领域技术依赖，先后顺序来自仓库单 feature 约束。

## 1. 审查依据与已确认事实

本次对照了 `app/layout.tsx`、`app/chat/page.tsx`、`app/api/auth/me/route.ts`、登录/注册/退出组件、`proxy.ts`、Dockerfile、Compose、测试配置和现有状态文件，并只读解析了两个 GLB 的 JSON、索引计数与内嵌 JPEG 元数据。原设计和原始资产均未修改。

| 项目 | 当前事实 | 实施含义 |
| --- | --- | --- |
| 框架 | Next.js 16.3.3、React 19.2.8；Three/R3F/Drei 尚未安装 | 按仓库安装版本的指南和实际 peerDependencies 选型 |
| Root Layout | Server Component，没有认证查询 | 增加 Gate 子树即可，不必改变现有页面渲染边界 |
| 聊天入口 | `/chat` 在服务端认证并解析默认房间 | DOM button 只需 `router.push("/chat")` |
| 身份探测 | `/api/auth/me` 返回 200/401，已有 no-store 响应头 | Gate 只消费状态，不缓存或记录返回的邮箱、档案等个人数据 |
| 身份切换 | 登录/注册使用 `window.location.replace("/home")`，退出整页跳转到登录入口 | 可在当前 Root Layout 生命周期复用已成功的探测结果 |
| 生产 CSP | `script-src 'self' 'unsafe-inline'`；只在 development 增加 `'unsafe-eval'` | 需要验证 Meshopt decoder 的 WebAssembly 路径 |
| Docker | builder 未声明主题 ARG；Compose `web.build` 未传主题；原始模型仍在 public | 必须补构建传递，并把源资产移出 public 和构建上下文 |
| 浏览器测试 | `start-test-app.ts` 启动 `next dev`；project 只匹配特定 spec 文件 | 默认完整门禁不能单独证明生产 CSP/主题构建正确 |

资产实测如下。三角面是当前单 Primitive 的索引数除以 3；两者 mode 均为 TRIANGLES。

| 主题 | 原始文件 | 字节数 | 顶点数 | 三角面数 | 内嵌纹理尺寸 |
| --- | --- | ---: | ---: | ---: | --- |
| default | `public/models/agent-entry/default/default_scene.glb` | 60,745,800 | 969,982 | 1,894,099 | 8192²、4096²、4096² |
| birthday-2026 | `public/models/agent-entry/birthday-2026/birthday_scene.glb` | 62,241,580 | 1,011,768 | 1,954,449 | 8192²、4096²、4096² |

两者均为 GLB v2，单 Node/Mesh/Primitive，无 Camera、Skin、AnimationClip、Morph Target 和声明的扩展；Buffer 与三张 JPEG 均内嵌。以上不等同于已通过完整 glTF validator 或人工视觉验收。

源文件 SHA-256，供实施时验证原样归档：

```text
default        f85011629f31c036768c3fd559f354fa063fe457f2e452a631173666c6c95961
birthday-2026  5dd17573f77c6713b013c8f974c108c2e138afb4b63b42c159744d9aac8ea384
```

## 2. 设计审查发现

这里的 P1/P2 是本设计的实施风险优先级，不是对现有 QAM 报告新增评分或已复现业务缺陷。

### R01 · P1：本地 decoder 仍可能被生产 CSP 阻止

原设计第 99 行要求本地 Meshopt decoder，但没有纳入 `proxy.ts`。本地打包解决下载来源问题，WebAssembly 编译还受 `script-src` 约束。当前生产策略没有 `'wasm-unsafe-eval'`，开发策略却包含 `'unsafe-eval'`，因此开发预览成功可能掩盖生产失败。

Meshoptimizer 官方说明 decoder 使用 WebAssembly；CSP3 单独控制其编译/实例化。结合当前策略，可以推断默认 WASM decoder 存在生产兼容风险；尚未安装目标依赖并运行真实页面，不能将此写成已经复现的运行故障。[Meshoptimizer 说明](https://github.com/zeux/meshoptimizer/tree/master/js)、[CSP3 WebAssembly 检查](https://www.w3.org/TR/CSP3/#can-compile-wasm-bytes)。

处理：在 S1 用锁定版本、真实 Meshopt 候选和生产响应头做最小验证。采用 WASM decoder 时，将精确的 `'wasm-unsafe-eval'` 加入脚本策略，保留对 JavaScript eval 和外部连接的现有限制；纳入 `tests/server/security-headers.test.ts` 与生产浏览器回归。不要通过关闭 CSP 或在生产加入 `'unsafe-eval'` 解决问题。若锁定 loader 使用其他解码实现，则根据实测决定是否需要该 CSP 变更。

### R02 · P1：主题构建参数没有进入 Docker builder

原设计第 61、107 行定义构建期主题，但文件范围没有 Dockerfile、`docker-compose.yml`。现有 `.dockerignore` 排除了 `.env`，Compose 的运行时 `environment` 也不会自动成为 `next build` 的输入。仅填写 `.env.example` 或容器运行时变量，生日主题可能始终回退为 default。

处理：Dockerfile builder 在 `RUN npm run build` 前接收 `ARG NEXT_PUBLIC_AGENT_ENTRY_THEME=default` 并传给构建进程；Compose 的 `web.build.args` 显式传入同名值。应用源码只在 server-only resolver 中用完整的 `process.env.NEXT_PUBLIC_AGENT_ENTRY_THEME` 属性读取，避免动态索引或 env 别名破坏构建期替换。此行为已与本地 `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` 核对。

验收必须包括 default/birthday 两次独立构建，以及“同一构建产物仅修改运行时变量不会切换主题”的反向用例。Worker/init 无需消费该 UI 参数。

### R03 · P1：原测试策略可能产生未覆盖生产路径的绿色结果

原设计第 249–254、290 行要求 Playwright 与完整门禁。当前 `playwright.config.ts` 的 public/authenticated 项目分别只匹配 `public.spec.ts` 与 `authenticated.spec.ts`；直接新增 `agent-entry.spec.ts` 不会被这些项目选中。当前 E2E 服务还固定为 development，无法验证 R01/R02。

处理：明确新增 spec 的 project 归属并以 `playwright test --list` 检查发现结果；新增可选择的生产 E2E 启动模式，复用隔离 PostgreSQL、迁移、seed 和清理，在同一测试环境执行 build/start。两个主题使用两个串行进程运行，避免共享 `.next`、端口和 storage state 冲突。生产浏览器必须实际解码 GLB，并观察网络、CSP 和页面错误。

### R04 · P2：`useGLTF` 返回与用户可见 ready 尚未对齐

原设计第 80、102 行把 GLB 解析完成作为 ready，但 Camera target、环境贴图和首帧绘制可能尚未完成。若模型 ready 前直接 `return null`、`display: none` 或将容器尺寸设为 0，还可能让 Canvas 无法初始化，形成等待死锁。

处理：Canvas 在隐藏期间保持确定的非零尺寸；入口使用 opacity、disabled、tabIndex 和 pointer-events 控制。ready 定义为当前模型解析成功、Camera/Environment 就绪且包含该模型的首帧已提交。首帧通知需发生在提交后的回调中，不能在 React render 或普通 `useFrame` 的绘制前阶段直接解锁按钮。重挂载时重新确认当前 Canvas 的首帧。

### R05 · P2：错误边界和资源释放没有覆盖完整生命周期

原设计第 74、171 行给出错误隔离和缓存复用目标，但 DOM Error Boundary 不能自动捕获事件回调、任意 Promise rejection 或 `webglcontextlost`。缓存的 GLTF 资源若在进入 Chat、卸载入口时被递归 dispose，再次返回非 Chat 页面可能损坏；反之每次重建 Environment 却不释放，会持续累积 GPU 资源。

处理：分别覆盖动态 import、Canvas 创建、Canvas 内 Suspense/模型解析和 context-lost，统一通知 DOM 层移除入口。只缓存当前主题的解析模型；明确其共享资源所有权。卸载时清理 Canvas 自有 renderer、PMREM/render target、监听与帧回调，保留约定缓存的数据。通过非 Chat → Chat → 非 Chat 重访与重复循环验证无重复入口、模型缺失或未处理错误。

### R06 · P2：Tooltip 的“可聚焦”措辞与语义不符

原设计第 84 行要求“可聚焦 Tooltip”。应当可聚焦的是触发按钮，tooltip 本身不进入 Tab 顺序。还缺少 Escape 关闭、焦点保持、鼠标经过 tooltip 时持续显示的规则。[WAI-ARIA Tooltip 指南](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)。

处理：button 保持唯一交互焦点，tooltip 用 `role="tooltip"` 和稳定 id，由 button 的 `aria-describedby` 关联；Escape 可关闭，焦点仍在按钮，离开触发范围或 blur 后关闭。Canvas 作为装饰隐藏于辅助技术。移动触摸一次即可导航，不要求先打开 tooltip。

### R07 · P2：资产流程缺少可执行参数、指标口径和产物来源

原设计第 194、210 行描述的管线与候选流程中，`quantize → meshopt` 容易直接映射为重复量化：glTF Transform 的 `meshopt()` 本身包装了 reorder、quantize 和扩展压缩。应选定一种参数可追踪的管线，避免把默认命令机械串联。[glTF Transform meshopt](https://gltf-transform.dev/modules/functions/functions/meshopt)。

两个源模型的 15%/10% 目标面数约为 28–29 万/18–20 万，本来就超过 150,000 上限；7.5% 约为 142,057/146,584，5% 约为 94,705/97,722。比例只是简化目标，不能代替实际计数。另有 8192² 纹理必须降采样，几何简化不会自动解决纹理预算。

处理：15%/10% 可作为质量参照，只有实测合格者可提升；把预算明确为 ≤8,388,608 bytes、≤150,000 个场景实际渲染三角面、所有纹理宽高 ≤2048。记录工具版本、源与产物 hash、每步参数、纹理处理和 validator 结果，正式文件必须可由已选 recipe 重建。

### R08 · P2：探测竞态和导航锁需要明确结束条件

原设计第 63、65、83 行未明确探测期间跳转 Chat、组件卸载、Strict Mode 重挂载，以及导航未成功时如何处理。迟到的认证响应可能重新挂载入口；永久布尔导航锁可能让仍在原页面的按钮一直失效。

处理：pathname 判断优先于所有异步状态；探测使用 AbortController 和请求代次校验；只有 200 才授权显示，401/其他状态/网络错误静默隐藏。按钮用同步 ref 抑制重复激活，用 transition pending 或可取消的导航状态恢复交互；不能把返回 void 的 App Router `push` 当作 Promise 等待。

按原设计保留一次成功探测的会话内复用。它是显示条件，不是认证边界；其他标签页退出或会话自然过期时，入口可能暂时保留，点击后的 `/chat` 仍由服务端拒绝未认证访问。本期不追加全局认证订阅系统。

### R09 · P2：人工选择前后的实施顺序需要解开依赖

原设计最后的第 6 步要求接入真实入口做人工预览，第 7 步却在确认后才进行真实模型装配。候选评审依赖真实渲染器，应先具备完整候选预览能力，再选择正式资产。

处理：先完成候选生成、最小真实渲染、Camera/Light 校准和自动预算报告，再提供两个主题、桌面/移动截图与浏览器预览供人工选择。确认只控制正式 `scene.glb` 的提升；等待期间仍可完成错误路径、键盘交互、构建配置与测试。此处保留原设计明确提出的人工质量门禁，不在本次计划编写时请求选择尚未生成的候选。

## 3. 实施契约

### 3.1 保留的产品范围

入口只负责导航。继续保留两个 Theme ID、未知值回退 default、完整 Scene GLB、静态 3D 场景、DOM button 交互、无可见加载/失败兜底、无自动日期切换等约束。无需修改 Prisma、Agent Runtime、Chat 内部状态或增加认证端点。

`/chat` 排除规则按原设计保留 `pathname.startsWith("/chat")`，覆盖 `/chat`、`/chat/[roomId]` 与 Atlas 子路由。它也会排除未来同前缀路径，例如 `/chatty`；当前不存在该路由，本期不自行改变原契约。

“匿名不加载”指应用不会自动请求入口的 3D 代码或模型；`public/` 下资产仍是公开静态资源，知道 URL 的访问者能够直接下载。不要把 Gate 描述成资产访问控制。

### 3.2 组件与数据依赖

```text
app/layout.tsx（Server）
  ├─ resolve-agent-entry-theme.ts（server-only，唯一 env 读取点）
  ├─ agent-entry.registry.ts + agent-entry.types.ts（可序列化纯数据）
  └─ AgentEntryGate.tsx（轻量 Client 入口）
       ├─ pathname + auth probe + AbortController
       └─ AgentEntryErrorBoundary（不导入 Three/R3F）
            └─ dynamic AgentEntry.tsx（ssr: false，仅认证后挂载）
                 ├─ DOM motion.button + Tooltip + router
                 └─ AgentEntryScene.tsx
                      ├─ Canvas + 场景内错误边界
                      ├─ Camera / Light / Environment / 首帧回报
                      └─ AgentEntryModel.tsx（仅当前 GLB）
```

Gate 是最小客户端入口边界；其依赖进入客户端图，不意味着只允许一个 Client Component 文件。types 使用 `import type`，Gate 的同步依赖不得通过 barrel 间接导入 Three、Drei、模型或 framer-motion。动态加载声明位于 Client 文件模块顶层，渲染受认证条件控制；不调用 preload。

Registry 延续原设计契约，Theme ID 列表为唯一类型来源，使用 `as const satisfies Record<AgentEntryTheme, AgentEntryThemeConfig>`。Resolver 可接收可选 raw 参数便于纯输入测试，默认参数只在该 server-only 文件中读取环境变量。仅精确的两个合法值通过；缺失、空串、纯空白、拼写错误和带空白的非精确值均回退 default。

Registry 不含函数、React 节点、Three 对象或动态 Tailwind 类。只把选中主题的配置传给 Gate。readonly 向量在需要的库边界复制为可接受的 tuple，禁止用 `any` 掩盖类型不匹配。

### 3.3 状态与生命周期

| 所在层 | 进入条件 | 行为及退出条件 |
| --- | --- | --- |
| Gate：排除路由 | pathname 以 `/chat` 开头 | 同步返回 null；中止在途探测；不挂载动态入口 |
| Gate：未探测/探测中 | 非 Chat 且尚无结果 | 最多保留一个有效请求；卸载和路由排除时 abort，迟到结果不得提交 |
| Gate：认证成功 | 有效请求返回 200 | 当前 Layout 内复用；只保存授权显示所需布尔状态 |
| Gate：隐藏 | 401、其他 HTTP 状态、网络错误 | 本次非 Chat 访问静默隐藏；后续离开 Chat 再进入非 Chat 可新建失败后的探测，成功结果继续复用 |
| Entry：加载中 | 动态模块已挂载 | 非零尺寸 Canvas 隐藏渲染；button disabled、tabIndex=-1、不可命中 |
| Entry：就绪 | 模型、环境、相机和首帧就绪 | 淡入；支持鼠标、触摸、键盘 |
| Entry：导航中 | 首次有效激活 | 同步锁定重复事件并 push；Chat 路由卸载，导航取消/结束且仍留原页时可恢复 |
| Entry：失败 | import、GLB、WebGL 或 context-lost | 本次挂载终止并返回 null，清理监听/帧/自有 GPU 资源；无自动重试循环 |

Strict Mode 可能发生“已发出但中止的请求 + 新有效请求”，测试不要求开发模式总请求数硬为 1；应验证只有最新有效结果生效，没有并行有效探测、循环探测或迟到复活。

### 3.4 渲染、布局和可访问性

- 初始建议尺寸为移动 160 px、桌面 208 px；桌面断点沿用 Tailwind `md`。偏移先取移动 16 px、桌面 24 px，再依据真实页面校准并写入 Registry。
- bottom 加 `env(safe-area-inset-bottom)`，right 也考虑 `env(safe-area-inset-right)`；320 px 窄屏不产生横向滚动。支持横屏与浏览器缩放，不引入新的页面级容器。
- 固定层使用 `z-30`。检查首页 toast、Post 编辑/删除弹窗、个人资料表单与 Study 控件，尤其注意同为 `z-30` 的 BackToBlog；避免透明的入口外层遮挡整页。
- 使用原生 `type="button"`，Canvas 装饰层 `aria-hidden`、无 tabIndex 且不处理指针；button 有明确 aria-label、focus-visible 样式和正确 disabled 行为。
- Tooltip 不可聚焦；鼠标进入按钮或 tooltip 时显示，Focus 显示，Escape dismiss，blur/离开后关闭。避免 tooltip 开合把焦点移出按钮。
- 采用 framer-motion 管理一次淡入、轻微 Hover 缩放和 Tap 压缩。`useReducedMotion` 为真时立即显示，不执行缩放、位移或淡入过渡；功能和焦点反馈保持可用。
- Canvas 透明、`frameloop="demand"`、DPR 建议 `[1, 1.5]`、`powerPreference: "low-power"`。Camera `lookAt(target)`、尺寸变化和资源就绪后按需 invalidate。
- 程序化 Environment 每个 Canvas 生命周期生成一次，建议 PMREM + 本地 RoomEnvironment，或锁定 Drei 版本支持的程序化单帧方案；不使用会请求 HDR 的 preset。Environment 不应成为背景。
- 当前模型为静态 primitive，不读节点名称、不播放动画、不实现每帧漂浮/旋转；共享模型的 transform 放在外层 group，避免修改缓存 scene。

按需帧和模型缓存的行为已与 R3F 官方说明核对；仅设置 demand 不会自动感知所有命令式相机/资源变更。[R3F 性能指南](https://github.com/pmndrs/react-three-fiber/blob/master/docs/advanced/scaling-performance.mdx)。

## 4. 依赖与文件清单

### 4.1 依赖决策

S1 才执行安装，本次不修改依赖。React 19 对应 R3F 9；Three、Drei 与类型包按所选版本的 peerDependencies 配对，不凭当前网页臆造精确 patch 版本。[R3F 兼容说明](https://github.com/pmndrs/react-three-fiber#readme)。

| 类型 | 包 | 用途 |
| --- | --- | --- |
| 运行时 | `three`、`@react-three/fiber`、`@react-three/drei` | WebGL、React 场景与 GLB loader |
| 开发时 | `@types/three` | 与 Three 版本配套的 TypeScript 类型 |
| 开发时 | `@gltf-transform/cli` | 固定版本离线资产转换与验证命令 |
| 按直接 import 需要声明 | `@gltf-transform/core`、`@gltf-transform/extensions`、`meshoptimizer`、`gltf-validator`、`sharp` | 资产元数据/解码/validator/纹理检查；实现若直接 import，就必须显式声明，不能依赖偶然 hoist |
| 按安装结果确认 | `server-only` | 若项目没有可直接解析的标记依赖，显式补齐 |

先确认 `npm view` 的 engine/peer 信息，再用 Node 22/npm 锁定安装。安装后检查 `npm ls`、`npm audit`、`npm audit --omit=dev`。devDependency 也会进入当前 Docker deps 阶段，因此 CLI/图像处理的 Node Alpine 安装必须由 Compose build 验证。构建和 Runtime 都不执行资产优化。

Drei 官方实现支持 `useGLTF(path, false, true)`，其中第二参数关闭 Draco、第三参数启用 Meshopt；以最终安装源码核验该契约，避免只用默认参数。[Drei GLTF 实现](https://github.com/pmndrs/drei/blob/master/src/core/Gltf.tsx)。

### 4.2 预计文件范围

| 文件 | 改动 |
| --- | --- |
| `app/layout.tsx` | 装配 resolver、选中配置和轻量 Gate |
| `components/agent-entry/agent-entry.types.ts` | Theme ID、向量、Registry 与组件回调契约 |
| `components/agent-entry/agent-entry.registry.ts` | 两个主题的静态配置 |
| `components/agent-entry/resolve-agent-entry-theme.ts` | server-only 环境变量读取与精确回退 |
| `components/agent-entry/AgentEntryGate.tsx` | pathname、探测、竞态与动态加载 |
| `components/agent-entry/AgentEntryErrorBoundary.tsx` | 轻量错误隔离，供合适的渲染边界复用 |
| `components/agent-entry/AgentEntry.tsx` | DOM 交互、tooltip、导航状态和 ready |
| `components/agent-entry/AgentEntryScene.tsx` | Canvas、Camera、Environment、context-lost、首帧 |
| `components/agent-entry/AgentEntryModel.tsx` | GLB loader 与共享 Scene 装配 |
| `scripts/agent-entry-assets.ts` | 显式 inspect/candidates/check/promote 子命令 |
| `scripts/lib/agent-entry-assets.ts` | 可独立测试的资产检查与报告逻辑 |
| `3d-source/agent-entry/*/source.glb` | 原样归档的两个源文件 |
| `3d-source/agent-entry/optimization-recipes.json` | 每主题参数、hash、工具版本和选择结果 |
| `public/models/agent-entry/*/scene.glb` | 仅人工选定后的正式优化产物 |
| `.dockerignore`、`.gitignore` | 排除源资产构建输入与临时候选/预览输出 |
| `.env.example`、Dockerfile、`docker-compose.yml` | 构建期主题声明与传递 |
| `proxy.ts`、`tests/server/security-headers.test.ts` | 按 decoder 验证结果补 WASM CSP 与回归 |
| `package.json`、`package-lock.json` | 依赖、资产检查、生产主题 E2E 命令 |
| `tests/lib/agent-entry-theme.test.ts`、`agent-entry-assets.test.ts` | Resolver/Registry 与真实资产预算 |
| `tests/component/agent-entry-gate.test.tsx`、`agent-entry.test.tsx` | 认证、竞态、可访问交互和错误行为 |
| `tests/e2e/agent-entry-public.spec.ts`、`agent-entry-authenticated.spec.ts` | 匿名/Chat 零请求和真实导航/错误路径 |
| `playwright.config.ts`、`tests/e2e/start-test-app.ts` | 新测试发现、主题输入隔离、生产模式 |
| `scripts/compose-deployment-smoke.ts` | 仅增加主题 build args 契约验证，保留已有隔离协议 |
| `feature_list.json`、`progress.md`、`session-handoff.md` | 实施状态和证据 |

脚本 helper 如没有独立复用价值可保持单文件；上述清单允许这种局部合并，不需要建立通用资产平台。库默认生成的 Canvas DOM 必须检查实际 HTML；若 button 内包含不合适的块级 wrapper，采用同尺寸装饰 Canvas 与 DOM button 叠放，保持单一点击区域和语义有效。

## 5. 顺序实施步骤

以下 S0–S8 是同一个 Agent Entry feature 内的检查点，不各自登记活动 feature。每一步包含可核对的输入和退出条件；不得将数据库修复等其他工作并入。

### S0：恢复上下文并建立基线

1. 依次阅读 AGENTS、feature_list、progress、handoff，重新读取原设计与本文，核对当前活动 feature 和未提交改动。
2. 只有当前活动 feature 收尾后，才把 Agent Entry 标为唯一 `in-progress`。实际编号以登记时的 feature_list 为准，不覆盖其他会话新增项。
3. 核验 Node 22.23.2/npm 10.9.8、依赖安装、两份源文件 hash；阅读本地 Next.js 的 Server/Client、lazy-loading、environment-variables 指南。
4. 运行 `./init.sh`，记录真实结果。若基线已有无关失败，只记录归属和原因，不扩大实现范围。

退出条件：唯一活动项、验收范围、原始资产和快速基线已确认。

### S1：依赖与生产渲染可行性验证

1. 核对并安装前述依赖，保存锁文件与审计证据。
2. 用 CLI 显式读取源资产，生成一个临时 Meshopt 样本；不把大源模型接入全局页面，也不提升正式文件。
3. 在最小真实 Canvas 中加载本地样本，关闭 Draco、外部 HDR 和 preload；确认 React 19/R3F 配套、透明背景及 decoder 来源。
4. 用生产模式页面验证 CSP；捕获 `securitypolicyviolation`、pageerror 和 decode 结果。需要时补 `'wasm-unsafe-eval'`，先有失败证据再跑修复后的行为回归。
5. 确认 CLI 能在 Node 22 工作，Docker deps 的 npm ci 可安装新增原生依赖。

退出条件：锁定版本能本地解码并在生产策略下绘制；不会把 decoder 兼容问题拖到正式资产选择之后。若依赖或自动优化存在限制，记录具体版本/错误，继续不依赖它的 DOM 和 Gate 工作。

### S2：主题契约与轻量 Gate

1. 先写 Resolver/Registry 和 Gate 行为测试；用可控动态模块替身观察是否真正挂载入口。Node 测试对 `server-only` 环境标记作局部替身，不绕过实际 resolver 逻辑；构建冻结语义另由生产测试验证。
2. 实现 types、Registry、resolver。模型正式路径保持原设计约定，候选只通过开发评审配置注入。
3. 实现路径优先、认证探测、AbortController、请求代次和成功缓存。HTTP 使用 `cache: "no-store"`、`credentials: "same-origin"`，不读取响应正文作为显示所需数据。
4. 在 Gate 中声明 `dynamic(() => import(...), { ssr: false, loading: () => null })`；同步错误边界不依赖 3D 包。
5. Root Layout 末尾装配 Gate，不增加 Cookie/数据库读取；保持既有字体、页面和导航结构。
6. 验证 `/chat` 首屏无认证探测；离开 Chat 后探测；探测途中进入 Chat 的响应不得挂载 Entry。

退出条件：身份与路由条件能控制实际动态模块装配，匿名与 Chat 未触发 3D 请求；还不能声明正式模型就绪。

### S3：原始资产归档与候选流水线

1. 原样移动两份源文件到 `3d-source/agent-entry/<theme>/source.glb`，按 hash 验证；不修改原始二进制，不重写历史提交。
2. `.dockerignore` 排除 `3d-source/`；临时候选目录加入 `.gitignore` 和 `.dockerignore`。正式 public 中不得遗留 `default_scene.glb`/`birthday_scene.glb`。
3. 提供四个显式脚本动作：inspect、candidates、check、promote。参数使用固定主题白名单和受控本地路径，校验失败退出非零；调用 CLI 使用参数数组，避免拼接 shell 命令。
4. 每个比例从原始源文件独立生成，不在前一候选上连续简化：inspect → weld → simplify → texture resize/compress → meshopt → validate。meshopt 内部管理 reorder/quantize，量化精度记录在 recipe；如改用底层 API，则只执行一次显式量化。
5. 第一轮纹理最长边设为 2048；优先保留 JPEG/PNG，无透明度时保持 JPEG，保留贴图语义、色彩空间和 normal map。需要进一步压缩时依据实际画质调整质量，不直接将所有贴图统一当成颜色图重编码。
6. 生成 15%、10%、7.5%、5% 候选和结构化报告。每个报告包括 source/candidate SHA-256、CLI 版本、全部参数、bytes、场景三角面、每张纹理宽高/格式、扩展列表、validator errors/warnings 和预算结论。
7. 自动检查遍历默认 scene 的全部节点与实例，计算实际绘制的三角面，避免只统计第一 mesh 或按唯一 geometry 漏算实例。TRIANGLES/strip/fan 需正确计数；不认识的拓扑明确失败。Meshopt 后按解码语义和 accessor 计数校验，不能把压缩字节当几何数。
8. 检查所有 buffer/image 引用：允许 GLB 内嵌数据，拒绝外部文件/网络引用。扩展使用精确 allowlist，例如当前管线实际生成并被 loader 支持的 `EXT_meshopt_compression`、`KHR_mesh_quantization`；未来出现 KHR 同类扩展也需验证 loader 后显式加入。
9. validator errors 必须为 0；warnings 逐条处理或记录可解释的接受理由。预算不合格者不得进入 promote。

退出条件：候选可重复生成、指标完整，至少明确是否存在预算内候选。所有候选都不合格时，在保留源文件的基础上进入 Blender 修形/重烘焙方案，不放宽预算。

CLI 命令以安装版本的 `gltf-transform help <command>` 为准；禁止临时下载未锁定的 `npx ...@latest`，不启用 `--allow-net`。[glTF Transform CLI](https://gltf-transform.dev/cli)。

### S4：真实模型、首帧与错误生命周期

1. 实现 Scene/Model，配置真实 Camera、lookAt、公共 Light、一次性 Environment 和当前主题 primitive。
2. 在临时本地评审配置中让 Registry 的 model 指向候选路径，其他逻辑与最终 Entry 完全一致。不创建用户可输入模型 URL 的接口，也不引入生产主题切换 flag。
3. Canvas 保持非零尺寸但入口不可见；模型及 Environment 完成后 invalidate，在包含模型的帧提交后幂等通知 DOM 层 ready。回调携带当前模型/挂载身份，旧模型回调不能解锁新实例。
4. 实现动态模块错误边界、Canvas 内错误转发、WebGL 创建失败与 `webglcontextlost` 处理。失败清理后只隐藏入口，宿主页面继续可交互。
5. 明确模型缓存与 Canvas 自有资源的 dispose 策略。禁止把创建过的缓存 scene 挂在两个活动 root；不在正常路由往返时清除当前主题解析缓存。
6. 加载中进入 Chat、模型 404/损坏、GPU context lost、返回非 Chat 和组件卸载均无未处理 rejection、额外导航或常驻 Canvas。

退出条件：真实 GLB 首帧可用，隐藏/显示与资源生命周期符合契约。生产模式必须使用与正式候选相同的 decoder 路径。

### S5：DOM 交互、响应式布局与人工选型

1. 先补按钮与 tooltip 行为测试，再实现 ready/disabled、点击去重、transition 导航、键盘和 reduced-motion。
2. 使用真实候选在 `/home`、公开 `/about` 的登录态、`/me`、`/study`、Post 详情/编辑页检查布局；移动端还检查软键盘打开后主要表单控件不被入口遮挡。
3. 针对两个主题分别校准 Camera、target、near/far、scale、position、rotation。源模型包围盒不同，不能直接复用 default 的 Camera 并假设生日主题不裁切。
4. 固定桌面 1440×900、移动 390×844 作为四张主要评审截图，并补 320 px 窄屏、横屏和缩放检查。截图关联候选 hash、视口/DPR 与 Registry 参数，不使用像素快照判断模型艺术质量。
5. 将预算内的最低面数候选与相邻高一档候选并排预览，检查脸/手、蛋糕/礼物、边缘、孔洞、阴影、接缝与主体裁切；给出推荐及实际指标。
6. 提供可复核的预览和报告后，请用户选择两个主题的候选。候选未出现前不请求批准，确认前不提升正式资产；其他测试和配置工作可继续。
7. 对明确选定的 hash 执行 promote：重新验证预算与 validator，原子写入正式路径，并保存 recipe/人工结论；若已存在正式文件，先保留可恢复副本。
8. 移除临时 Registry 覆盖与候选预览入口，重新确认只有两个固定正式路径。最终截图随实施交付记录保存；未选候选和临时大文件按会话清理规则移除。

退出条件：两个主题均有人工选择记录、正式 GLB、固定 Registry 参数和可重复 recipe。人工选择待定时，记录待确认项并保持 feature 未完成。

### S6：构建与 Compose 配置

1. `.env.example` 增加 `NEXT_PUBLIC_AGENT_ENTRY_THEME=default`，说明合法值、错误回退和修改后必须重建。
2. builder 增加主题 ARG 并在 build 前传入；Compose 只在 `web.build.args` 传递 `${NEXT_PUBLIC_AGENT_ENTRY_THEME:-default}`。
3. 扩展现有 Compose config 检查，用合成非敏感环境验证 default 和 birthday 的实际渲染结果；不打印实际 `.env` 或服务密钥。
4. 验证生产镜像只有优化后 public GLB，没有 `3d-source/`、原始文件或临时候选。记录 Web 镜像资产大小；不在本 feature 重构整个 Worker 依赖裁剪。
5. 用 default/birthday 独立构建验证浏览器只请求相应 GLB；同一产物启动时设置相反主题仍应使用构建时主题。
6. 运行隔离 Compose smoke，验证新增依赖不破坏 build、init、Web health 或 Worker 消费任务。正式部署仍遵循仓库先 build 后 up 的顺序，但实施验证不直接重启现有生产服务。

退出条件：本地构建和 Docker 构建选择一致，主题不是运行时可变配置；生产静态资产路径正确。

### S7：测试矩阵与生产浏览器验证

按第 6 节补齐测试，用真实 GLB 证明首帧与导航。优先运行定向测试，再执行完整门禁和两主题生产 E2E；只有新改动或失败需要时才重复门禁。

生产 E2E 模式在已有启动器中增加受校验的测试专用参数，例如 `E2E_APP_MODE=production`。默认模式保持现有开发服务；production 分支在隔离 appEnv 中先执行 `npm run build`，再启动 `next start`，明确传入 `NODE_ENV=production`。生产启动超时单独提高以容纳构建，不降低用例断言要求。两模式均沿用临时 PostgreSQL、迁移/seed、0600 URL 文件、退出清理与固定测试账号。

主题由进程环境明确指定，测试启动器默认值固定为 default，避免开发机 `.env` 隐式改变测试。两个项目共享同一主题服务；切换主题必须重启测试进程并重建，不能仅在 test 内改 `process.env`。`PLAYWRIGHT_BASE_URL` 外部模式仅接受明确隔离的测试服务，并记录服务构建主题。

退出条件：所有必要测试确实被发现并执行，生产 CSP/decoder、两主题构建和负向网络断言均有真实浏览器证据。

### S8：交付与清理

1. 核对第 8 节验收清单，在 feature_list 与 progress 写入文件范围、源/产物 hash、选型结果、依赖审计、测试命令和真实结果。
2. 保留正式资产、recipes 和必要的交付图；清理本次候选、预览覆盖、coverage、Playwright 报告及隔离容器/网络/卷/镜像。只处理本 feature 产生且已确认用途的工件。
3. 运行最终 `./init.sh`、`git diff --check` 与 `git status --short`；检查是否有工具生成的类型路径等意外变更，保留其他任务的改动。
4. 更新 handoff 的可执行恢复路径、状态、阻塞和一个推荐下一步。未完成验证或仍待人工选择时，不标记 done、不宣称清洁退出。

## 6. 验证矩阵

| 层级 | 场景 | 关键断言 |
| --- | --- | --- |
| Node | 两个合法主题；undefined/空串/空白/错误输入 | 返回精确 Theme ID 或 default；恢复测试环境 |
| Node | Registry | 两主题字段完整、数值有限、near > 0 且 far > near、可 JSON 序列化、当前 capabilities 为空 |
| Node/真实文件 | 正式 GLB | 文件存在、完整 GLB v2、validator 无 error、扩展/资源引用合格、三个硬预算均通过 |
| Node/隔离 fixture | 资产检查器 | 截断 GLB、外部 URI、超预算、未知扩展等输入明确失败；测试临时数据退出即清理 |
| Node | CSP | 生产需要的 WASM 权限存在，JavaScript unsafe-eval 仍受限；原有同源规则保持 |
| 组件/MSW | Chat 首屏和非 Chat 200/401/500/网络错误 | Chat 不探测；仅 200 挂载入口；失败不显示 |
| 组件/MSW | 导航、卸载、Strict Mode 与迟到响应 | 不在 Chat 复活、不循环请求；成功状态在非 Chat 间复用 |
| 组件 | ready 前/后 | 不可见且无法 Tab/点击 → 具有可访问名称并可激活 |
| 组件 | 鼠标、Enter、Space、快速连续激活 | 每次有效导航周期只 push 一次；失败/取消后按契约恢复 |
| 组件 | Tooltip/动画 | Hover/Focus 显示，Escape 关闭，焦点不移动；reduced-motion 保持即时行为 |
| 浏览器/冷 context | 匿名 `/about`、认证 `/chat/[roomId]` | 不显示入口；无 GLB，也无入口专属 3D chunk 请求 |
| 浏览器/真实模型 | 认证 `/home` 与登录态 `/about` | 当前主题 GLB ready、可见 button、一次激活到实际 `/chat/[roomId]` |
| 浏览器/真实模型 | Chat 往返及缓存 | Chat 卸载 Canvas，返回后同主题可再次显示，无另一主题请求 |
| 浏览器/故障注入 | GLB 404/损坏、context lost、动态 chunk 失败 | 入口消失、宿主页面可交互、无未处理 pageerror/rejection |
| 浏览器/移动 | touch、窄屏、横屏、软键盘、安全区 | 一次触摸导航，button 不超视口，不妨碍主要控件 |
| 浏览器/production | 两主题构建、CSP、同源请求 | 真解码/真首帧；无外部 decoder/HDR；运行时变量不改变既有构建主题 |
| Compose | 配置、镜像、部署 smoke | build args 正确，只有优化资产，init/Web/Worker 既有旅程通过 |
| 人工 | default/birthday × 桌面/移动 | 构图与视觉质量通过，记录所选 hash 和理由 |

补充执行规则：

- jsdom 只替换 WebGL 边界，以“未 ready/ready/error”回调驱动 DOM 行为；不用源码字符串断言证明懒加载或 reduced-motion。
- 新 public/authenticated spec 必须加入对应 project 的 testMatch，例如分别匹配 `public.spec.ts`/`agent-entry-public.spec.ts` 和 `authenticated.spec.ts`/`agent-entry-authenticated.spec.ts`；setup 仍单独匹配。
- 负向网络测试从 fresh context、导航前开始记录，到页面完成 hydration、认证探测结束且其他页面交互已验证后断言。导航之前已经请求的 GLB 不算进入 Chat 后的新请求，不能把一次暖缓存零请求当作匿名懒加载证据。
- 生产 chunk 名称可能不含 three/r3f；通过构建输出的动态入口文件映射及 bundle 检查识别专属资源，测试真实请求的 URL 集合。不以 URL 包含包名或仅“无 canvas”代替代码未下载的证据。
- 通过路由拦截让 GLB 延迟，验证 ready 前不可聚焦/点击，再释放真实二进制确认按钮显示；不把“HTTP 200 已到达”当成首帧已完成。
- WebGL 成功用例必须可创建 context；CI 不支持时明确失败并记录环境，不允许跳过后称全部通过。可在明确配置的软件渲染 Chromium 执行功能测试，但其结果不能替代实体移动设备的性能检查。
- 在主要目标设备记录当前 GLB 请求大小、从认证成功到 ready 的耗时、静止时渲染活动和若干路由往返的内存趋势。没有设备实测时，不声称已达成移动性能目标；本期硬预算只采用原设计列出的三项。

## 7. 计划提供的命令

以下新增脚本名均为本计划约定，目前尚不存在，需在对应步骤实现后才能执行。原有门禁不更名。

```bash
# S0：版本与基线
./scripts/run-node22.sh node --version
./scripts/run-node22.sh npm --version
./init.sh

# S1：安装后的兼容与审计
npm ls three @react-three/fiber @react-three/drei @types/three
npm audit
npm audit --omit=dev

# S3：显式离线处理；候选不覆盖正式资产
npm run agent-entry:assets -- inspect --theme default
npm run agent-entry:assets -- inspect --theme birthday-2026
npm run agent-entry:assets -- candidates --theme default
npm run agent-entry:assets -- candidates --theme birthday-2026
# S5 人工选择并 promote 后，检查两个正式文件；S3 的候选检查由 candidates 执行
npm run check:agent-entry-assets

# S2–S5：定向行为验证
npm run test:unit -- tests/lib/agent-entry-theme.test.ts
npm run test:unit -- tests/lib/agent-entry-assets.test.ts tests/server/security-headers.test.ts
npm run test:component -- tests/component/agent-entry-gate.test.tsx tests/component/agent-entry.test.tsx

# S7：发现测试，然后真实浏览器运行
npm run test:e2e -- --list
sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run test:e2e -- tests/e2e/agent-entry-public.spec.ts tests/e2e/agent-entry-authenticated.spec.ts

# 下面两个 package scripts 内部负责显式主题、production 启动与顺序清理
sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run test:e2e:agent-entry:production:default
sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run test:e2e:agent-entry:production:birthday

# 最终门禁；check:full 已包含 npm run check
npm run check:compose-config
sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run check:full
sudo -n -g docker -u dadalv ./scripts/run-node22.sh npm run test:compose-smoke
./init.sh
git diff --check
git status --short
```

`check:agent-entry-assets` 复用同一检查器，并接入快速门禁以防正式 GLB 后续回退；实际优化只由显式脚本执行。promote 命令要求精确 candidate 路径/hash 与已记录的选择结果，文档不预填尚未产生的候选。

若受限执行出现 EPERM、空 stdout 或 Next.js TypeScript `--showConfig` 解析失败，按 AGENTS 规定用同一 Node 版本在获准权限边界复核原命令，保留两次结果。缺 Docker、浏览器依赖或构建网络不能用 mock/静态检查替代。

## 8. 最终验收与交付物

- [ ] 原设计的十项验收标准全部满足，并补齐 R01–R09 的对应行为。
- [ ] 原始模型 hash 不变并移出 public；两个正式 GLB 均 ≤8 MiB、≤150,000 面、纹理 ≤2048，validator 无 error。
- [ ] 两主题各有可重复 recipe、正式产物 hash、人工选择依据和桌面/移动截图。
- [ ] 匿名/Chat 冷启动没有入口 3D 代码或 GLB 请求；登录态非 Chat 能真实绘制并导航。
- [ ] Root Layout 与现有页面保持 Server/Client 边界；所有主题差异集中在 Registry。
- [ ] ready 前不可见、不可聚焦、不可点击；ready 后原生键盘/触摸、tooltip、reduced-motion 和导航去重通过。
- [ ] 模型加载失败、chunk 失败和 context-lost 不影响宿主页面，路由往返缓存和资源释放正常。
- [ ] default/birthday 生产构建均通过真实浏览器；CSP、同源 decoder/HDR 约束和构建冻结语义有证据。
- [ ] 安装兼容、依赖审计、`check:full`、生产主题 E2E、Compose smoke、最终 `init.sh` 均有原始命令及结果。
- [ ] 三份状态记录同步、临时资源清理、diff/status 检查通过，才将实现 feature 标为 done。

交付应包含业务实现、锁文件、两个源文件与正式 GLB、优化 recipe/预算报告、测试和配置，以及本计划关联的最终证据。不要提交敏感数据、失败调试载荷或无用途的候选大文件。

## 9. 风险处理与恢复

| 情况 | 处理 | 恢复入口 |
| --- | --- | --- |
| 简化后面部/手部质量不可接受 | 保留源文件，局部手工处理或重烘焙后重跑预算；不自动放宽阈值 | S3/S5，指定源与候选 hash |
| 尚未人工选择候选 | 保留必要评审资产和记录，正式 GLB 不提升；继续独立的测试/配置工作 | S5，明确缺少哪个主题的选择 |
| 生产 decoder 被 CSP 阻止 | 按锁定依赖复现并验证最小 WASM 策略调整 | S1，记录浏览器/依赖/响应策略 |
| 缺少 Docker/WebGL/依赖下载能力 | 明确未执行层级及原始错误，在有能力的隔离环境恢复 | S6/S7，不将低层替身当完成证据 |
| 页面入口发生回归 | 部署回已验证的上一版本产物；源文件和历史迁移不动 | 已验证构建与其 recipe/锁文件 |

本期不增加运行时关闭 flag。需要撤销功能时，在独立修复提交中移除 Root Layout 的 Gate 接入并回归页面；不要对含其他任务改动的工作树做整体 reset。

## 10. 本次文档工作的验证边界

本次已完成代码/配置只读核对、原始 GLB 大小/结构/纹理/hash 核验和官方资料交叉检查。本文不代表已安装 3D 依赖、生成候选、执行模型视觉评审或验证生产渲染。

本次没有运行 `./init.sh`、`npm run check`、`npm run check:full` 或 `npm run test:compose-smoke`：用户授权范围为设计审查和实施计划，未实施产品代码，且仓库另有活动 feature。本次仅检查文档链接、feature JSON 与 diff；对应产品 feature 保持 `not-started`，不声明应用门禁通过或会话清洁退出。

下一步：保留当前 `feat-039` 的实施优先级；它收尾后，按本计划 S0 启动 Agent Entry 的唯一活动 feature。
