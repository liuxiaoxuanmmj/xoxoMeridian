# QAM-10 全局 3D Agent 入口与模型资产生命周期工程质量审查

## 元数据

| 项目 | 内容 |
| --- | --- |
| QAM | QAM-10 全局 3D Agent 入口与模型资产生命周期 |
| 快照日期 | 2026-09-12 |
| 审查 Skill | [`xoxo-qam-10-agent-entry-review`](../../.agents/skills/xoxo-qam-10-agent-entry-review/SKILL.md) |
| 标准版本 | [`module-quality-review-standard.md`](./module-quality-review-standard.md) v1.0.0 |
| 范围来源 | [`PROJECT_VIEW.md`](../../PROJECT_VIEW.md) 的 QAM-10、Cross-cutting Concerns、共享映射、BU-11～BU-14 与 Quality Tracking Index；[`AGENTS.md`](../../AGENTS.md) |
| 本轮 Delta | `baseline`（首次按统一标准建立 QAM-10 持续评分） |
| 模块边界结论 | QAM-10 在当前粒度下应作为独立模块：它虽由共享 Root Layout 装配，但拥有版本化源/正式 GLB、selection/recipe/candidate report、可执行资产晋升接口、WebGL/缓存/释放生命周期，以及与身份、Chat、交付不同的变化驱动和风险面；不应并入通用应用壳、QAM-02 Chat 或 QAM-09 交付。 |
| 工作区说明 | 本轮开始前已有 feat-044～047、`PROJECT_VIEW.md`、统一标准及其他 QAM 报告的未提交用户/并行 Agent 改动；QAM-10 的运行组件、资产、脚本、测试和共享配置相对 `HEAD` 无未提交实现改动。本审查只新增本报告，不恢复、覆盖或纳入其他文件。 |
| 当前基线命令 | `./scripts/run-node22.sh npm run check:agent-entry-assets` 退出 0，两个正式 GLB 均为 validator 0 error/0 warning 且通过 8 MiB/150000 面/2048 纹理预算；定向 Node 3 文件/31 项、组件 2 文件/20 项、CSP Node 1 文件/6 项均通过；`./scripts/run-node22.sh npm run check:compose-config` 退出 0，缺省/default/birthday 三组配置通过；`sha256sum` 实测源与正式 GLB hash 均与当前记录一致。 |
| 本轮未运行 | 未运行 `./init.sh`、`npm run check`、`npm run check:full`、两主题 production Playwright、Docker image build 或 `npm run test:compose-smoke`。本轮是并行只读审查，production 浏览器会改写共享 `.next`/测试产物，且用户明确排除 Docker/Compose smoke；不把 jsdom、静态 CSP 或历史浏览器结果写成本轮 WebGL/CSP/镜像 E3。 |
| 历史交接证据 | [`progress.md`](../../progress.md#L144) 与 [`feature_list.json`](../../feature_list.json#L608) 记录 2026-09-11 feat-040：default production 16/16、birthday production 全量 26/26、两主题真实首帧/故障/CSP/零下载/布局、完整 Compose image 与正式资产检查均通过；这是历史 E3。2026-09-12 feat-046 的 [`progress.md`](../../progress.md#L1) 记录 `check:full` 退出 0、production build、72 文件/472 项 Vitest、19 文件/60 项 PostgreSQL 与 29/29 默认 Playwright；它证明相邻快照总体门禁但不是本轮两主题 production/Compose E3。 |

## Overall

| 指标 | 结果 |
| --- | --- |
| Score | **84 / 100** |
| Score Level | **L3** |
| Gate Level | **L2** |
| Final Level | **L2** |
| Trend | `baseline` |
| Evidence Confidence | 中高（资产、主题/config、Gate/DOM 交互和 CSP 字符串有本轮 E3；运行代码、共享配置和 production specs 有 E2；两主题 production WebGL/CSP/故障及 Compose image 只有 feat-040 历史 E3；实体设备、系统软键盘和非零 safe-area 无 E3） |
| 当前开放问题 | 5 项（P2×5；无开放 P0/P1） |

QAM-10 的边界足够独立且总体稳健：轻量 Gate、构建期主题、真实 render 后解锁、故障隔离、demand frame、资源释放和受预算资产流水线均有清晰落点。当前正式文件与记录实际一致，低层行为门禁也全部通过，但快速资产检查没有强制 selection/recipe hash 一致性，主题集合仍有多个事实源，认证成功状态会跨路由长期缓存。最高风险的 production WebGL/CSP/失败生命周期与镜像集成本轮没有重跑，实体设备边界也仍未验证，因此 Score 为 L3、Gate/Final 限制为 L2。

## Score Breakdown

| 维度 | Score | Max | Finding / Evidence |
| --- | ---: | ---: | --- |
| 架构与责任边界 | 13 | 14 | Root Layout 只做装配，Gate、DOM 入口、R3F Scene、主题 Registry/resolver 与资产 CLI/core 各自有清楚责任；QAM-01 只提供认证事实、QAM-02 只拥有 `/chat`、QAM-09 只拥有 build/image 传播，BU-11～14 已明确共享接缝（[`layout.tsx`](../../app/layout.tsx#L62-L70)、[`AgentEntryGate.tsx`](../../components/agent-entry/AgentEntryGate.tsx#L12-L47)、[`PROJECT_VIEW.md`](../../PROJECT_VIEW.md#L847-L936)，E2）。扣分来自主题/资产 contract 跨 runtime、CLI、E2E 和交付脚本重复。 |
| 代码结构与复杂度 | 9 | 10 | 客户端状态和渲染生命周期拆分为小型组件，资产解析/预算逻辑与命令编排分离；`AgentEntryScene` 的原生 canvas、异步 R3F root、PMREM、observer 和错误边界控制流虽复杂，但复杂度来自已复现的库错误语义且清理路径集中（[`AgentEntryScene.tsx`](../../components/agent-entry/AgentEntryScene.tsx#L15-L130)、[`agent-entry-assets.ts`](../../scripts/agent-entry-assets.ts#L25-L97)，E2/历史 E3）。 |
| 抽象与复用 | 6 | 8 | Registry 集中相机/transform/layout/UI/capability，`inspectAsset()`、`parseGlb()` 和预算断言被 CLI/测试复用；但合法 Theme 在 runtime types、asset CLI、E2E app-mode、Compose config 循环与 package scripts 中分别硬编码，新增主题需要同步多个不相干入口（[`agent-entry.types.ts`](../../components/agent-entry/agent-entry.types.ts#L1-L3)、[`agent-entry-assets.ts`](../../scripts/lib/agent-entry-assets.ts#L11-L15)、[`app-mode.ts`](../../tests/e2e/support/app-mode.ts#L1-L18)、[`compose-deployment-smoke.ts`](../../scripts/compose-deployment-smoke.ts#L750-L760)，E2；QAM-10-002）。 |
| 数据流与状态一致性 | 9 | 12 | server-only resolver → 可序列化 config → Gate → model identity → 首帧 ready 的状态链可追踪，request generation/AbortController 阻止迟到认证结果；当前实测正式/源 hash 与 selection/recipe 一致。`authenticated=true` 后不会重新探测，且 `check` 不强制已批准 hash，两个状态事实都可能在后续导航或资产替换后漂移（[`resolve-agent-entry-theme.ts`](../../components/agent-entry/resolve-agent-entry-theme.ts#L1-L7)、[`AgentEntryGate.tsx`](../../components/agent-entry/AgentEntryGate.tsx#L15-L41)、[`agent-entry-assets.ts`](../../scripts/agent-entry-assets.ts#L27-L32)，本轮 E2/E3；QAM-10-001/003）。 |
| 接口与依赖关系 | 8 | 10 | `AgentEntryThemeConfig`、`onReady(model)`/`onError()`、`/api/auth/me` status-only probe、DOM button → `/chat` 与 CLI action/schema 都是显式接口；构建主题通过 Next env、Docker ARG 和 Compose build arg 冻结，本轮三组 config 通过。资产 `check` 与 selection/recipe/image 之间缺少完整一致性 contract，Theme allowlist 也未跨边界共享（[`agent-entry.types.ts`](../../components/agent-entry/agent-entry.types.ts#L6-L44)、[`next.config.mjs`](../../next.config.mjs#L1-L10)、[`Dockerfile`](../../Dockerfile#L17-L33)、[`docker-compose.yml`](../../docker-compose.yml#L130-L145)，本轮 E2/E3；QAM-10-001/002）。 |
| 健壮性、并发与生命周期 | 11 | 14 | Gate 能取消/隔离认证探测，Scene 在真实 render 提交后才 ready；GLB/chunk/WebGL/context-lost 由 DOM/R3F 边界隐藏，renderer、PMREM、ResizeObserver、listener、root/canvas 均有卸载路径，R3F root 还负责延迟 `forceContextLoss`。本轮组件 20/20 覆盖 Gate/DOM 状态，但 jsdom 不证明 WebGL；404/损坏/chunk/context-lost/webgl-create、三次往返与单 Canvas 仅有 feat-040 历史 production E3（[`AgentEntryErrorBoundary.tsx`](../../components/agent-entry/AgentEntryErrorBoundary.tsx#L5-L21)、[`AgentEntryScene.tsx`](../../components/agent-entry/AgentEntryScene.tsx#L63-L116)、[`agent-entry-authenticated.spec.ts`](../../tests/e2e/agent-entry-authenticated.spec.ts#L56-L158)，本轮组件 E3 + E2 + 历史浏览器 E3；QAM-10-005）。 |
| 性能与资源使用 | 7 | 8 | `dynamic(..., { ssr:false })` 只在认证通过且非 Chat 时挂载；frameloop demand、DPR `[1,1.5]`、low-power renderer、共享 GLTF cache 和独立 scene clone 控制请求/帧/资源规模。本轮资产 E3 为 default 1,829,016 bytes/94,703 面、birthday 2,046,212 bytes/97,721 面，均三张 2048 JPEG；匿名/Chat 零 chunk/GLB、静止停止绘制和堆观测只有历史软件 Chromium，实体移动 GPU/内存/首帧未验证（[`AgentEntryGate.tsx`](../../components/agent-entry/AgentEntryGate.tsx#L10-L14)、[`AgentEntryModel.tsx`](../../components/agent-entry/AgentEntryModel.tsx#L8-L14)、[`AgentEntryScene.tsx`](../../components/agent-entry/AgentEntryScene.tsx#L79-L103)，本轮资产 E3 + 历史浏览器 E3；QAM-10-004/005）。 |
| 安全与隐私 | 9 | 10 | Gate 只消费同源 `/api/auth/me` 的 200 状态且公开 GLB 不被误当授权边界；CLI 在 NodeIO/validator 前拒绝 URI、未知/嵌套扩展、截断和非白名单 promote 路径。CSP 只开放本地 Meshopt 所需 `wasm-unsafe-eval` 与内嵌纹理 blob，production JavaScript `unsafe-eval` 仍禁用；本轮 CSP 6/6 只证明策略字符串，真实 decoder/CSP/无外联是 feat-040 历史 E3（[`AgentEntryGate.tsx`](../../components/agent-entry/AgentEntryGate.tsx#L18-L39)、[`agent-entry-assets.ts`](../../scripts/lib/agent-entry-assets.ts#L52-L84)、[`proxy.ts`](../../proxy.ts#L112-L141)，本轮 E2/E3 + 历史浏览器 E3）。 |
| 可测试性与验证可信度 | 7 | 8 | 本轮资产 checker、Node 31/31、组件 20/20、CSP 6/6 与 Compose config 均通过；测试覆盖非法 GLB/URI/扩展/预算、Registry、真实 Next config、认证竞态、首帧前交互、导航锁和宿主隔离。production E2E 设计覆盖两主题、零下载、真实 render、失败注入、路由卸载、布局与 CSP，但本轮未执行；资产 checker 也缺批准 hash 的负向回归（[`agent-entry-assets.test.ts`](../../tests/lib/agent-entry-assets.test.ts#L50-L149)、[`agent-entry-gate.test.tsx`](../../tests/component/agent-entry-gate.test.tsx#L36-L131)、[`agent-entry.test.tsx`](../../tests/component/agent-entry.test.tsx#L37-L125)，本轮 E3/E2；QAM-10-001/004/005）。 |
| 可维护性、演进与技术债 | 5 | 6 | 主题差异集中在 Registry，asset source/candidate/selection/recipe/formal 路径有文字和机器记录，故障修正一般能局部落在 Gate/Scene/asset core。Theme allowlist 多源和 checker 未闭合 provenance 会让新增主题或重新提升资产时同步面扩大；当前仍只有两个冻结主题，修正范围可控（[`agent-entry.registry.ts`](../../components/agent-entry/agent-entry.registry.ts#L3-L24)、[`selection.json`](../../3d-source/agent-entry/selection.json#L1-L16)、[`optimization-recipes.json`](../../3d-source/agent-entry/optimization-recipes.json#L1-L346)，E2；QAM-10-001/002）。 |
| **合计** | **84** | **100** | 算术核对：13+9+6+9+8+11+7+9+7+5 = 84。 |

## Level Gate

| 门禁 | 结果 | 证据与原因 |
| --- | --- | --- |
| 开放 P0 | 通过 | 未发现授权绕过、敏感信息泄露、不可恢复数据破坏或宿主页面整体不可用；公开 GLB 与入口显示均不是授权边界。 |
| 开放 P1 且涉及权限绕过、不可恢复数据错误、并发重复副作用或支持启动路径失效 | 通过 | 当前 5 项均为 P2：它们涉及 provenance 门禁、主题 contract、陈旧显示状态及验证可信度，没有 E3 证明现实触发后达到 P1 条件。 |
| 最高风险不变量有风险匹配行为验证 | 未通过（本轮） | 本轮 E3 覆盖资产真实解码/预算、Node、组件和静态 Compose config；但 jsdom 不能证明 WebGL/CSP/资源释放，CSP 单测只证明字符串。feat-040 两主题 production 与 Compose image、feat-046 默认 Playwright 均只能标为历史 E3，因此当前快照的 production 首帧、失败隔离、零下载与 image 一致性没有本轮风险匹配 E3，Gate 不高于 L2。 |
| L4 要求 | 未通过 | 虽无开放 P0/P1，当前快照缺两主题 production 失败/生命周期 E3，且实体移动 GPU、系统软键盘和非零 safe-area 仍未验证。 |
| **最终判定** | **L2** | Score Level=L3；Gate Level=L2；Final Level=min(L3, L2)=L2。 |

## Critical Issues

### P0

当前无开放项。

### P1

当前无开放项。

### P2

#### QAM-10-001：正式资产门禁不强制已批准 selection/recipe hash

- **状态**：`open`
- **问题**：`check` action 只对固定正式路径执行 `inspectAsset()` 和 `assertAssetPromotable()`，不读取 `selection.json`、`optimization-recipes.json` 或 candidate report；只有 `promote` 当次校验候选路径/hash。Compose image 检查也只断言两条路径和 8 MiB 字节预算（[`agent-entry-assets.ts`](../../scripts/agent-entry-assets.ts#L25-L33)、[`agent-entry-assets.ts`](../../scripts/agent-entry-assets.ts#L43-L66)、[`compose-deployment-smoke.ts`](../../scripts/compose-deployment-smoke.ts#L433-L472)，E2）。本轮 `sha256sum` 与 checker 证明当前两份正式资产实际匹配记录并合格（E3），所以这是预防控制缺口，不是当前资产漂移。
- **质量影响**：合法、预算内但未经用户选择的 GLB 被手工替换后仍可通过 `check:quick` 和现有 image smoke；运行视觉、selection、recipe 与交付镜像会分成多个事实，审查者无法从绿色门禁证明“交付的正是已批准产物”。
- **最小修正**：让 `check` 对每个主题同时验证 source hash、selection candidate/hash、recipe report/hash、candidate report/hash 与正式 GLB hash 的精确一致性，并让 image smoke 比较同一批准 hash；保留现有预算、validator 和人工选型流程，不增加远程签名或新资产平台。
- **验收证据**：在隔离临时目录放入另一份结构/预算均合格但 hash 不同的 GLB，断言资产 gate 因 selection/recipe 不一致失败；恢复批准资产后两个主题通过。真实 Web image 中计算两份 GLB SHA-256，必须等于同一机器 contract。
- **影响范围**：QAM-10 资产 provenance/正式文件；关联 QAM-09 build/image 接缝（BU-12），不重复登记 QAM-09 总体镜像责任。

#### QAM-10-002：合法 Theme 集合跨 runtime、资产与验证脚本重复

- **状态**：`open`
- **问题**：runtime `agentEntryThemes`、asset `assetThemes`、E2E `E2EAgentEntryTheme`/parser、Compose config 循环和两个 production package scripts 分别硬编码 `default`/`birthday-2026`（[`agent-entry.types.ts`](../../components/agent-entry/agent-entry.types.ts#L1-L3)、[`agent-entry-assets.ts`](../../scripts/lib/agent-entry-assets.ts#L11-L15)、[`app-mode.ts`](../../tests/e2e/support/app-mode.ts#L1-L18)、[`compose-deployment-smoke.ts`](../../scripts/compose-deployment-smoke.ts#L750-L760)、[`package.json`](../../package.json#L36-L39)，E2）。Registry 的 `satisfies Record<AgentEntryTheme,...>` 只能约束 runtime 自己，不能阻止其他集合漂移。
- **质量影响**：新增或移除一个构建主题必须跨多个不相干文件同步；漏改一处可能使主题可构建却未受资产 gate/production E2E 覆盖，或有正式资产但 resolver 静默回退 default，局部主题改动扩大为交付回归。
- **最小修正**：把无副作用的 Theme ID 列表提为 runtime/asset/E2E/config checker 可共同读取的单一 contract，或至少增加一个 gate 精确比较 Registry key、asset theme、selection/recipe/formal directories 与 production matrix；Registry 继续只承载主题差异，不引入运行时主题切换。
- **验收证据**：在测试 fixture 中只向任一集合增加/删除主题时 gate 必须失败，并指出缺失边界；所有集合完全相等时，resolver fallback、两个正式资产和每主题 production command 仍通过。
- **影响范围**：QAM-10 Registry/resolver/asset/test contract；关联 QAM-09 build arg 与 production matrix（BU-12）。

#### QAM-10-003：认证成功结果在 Root Layout 生命周期内不会重新验证

- **状态**：`open`
- **问题**：Gate 一旦收到一次 `/api/auth/me` 200 就把 `authenticated` 设为 `true`；后续 effect 因 `authenticated` 提前返回，进入 Chat 再返回非 Chat 也只复用旧结果。当前组件测试明确断言 Chat 往返只探测一次（[`AgentEntryGate.tsx`](../../components/agent-entry/AgentEntryGate.tsx#L15-L41)、[`agent-entry-gate.test.tsx`](../../tests/component/agent-entry-gate.test.tsx#L71-L85)，本轮组件 E3）。BU-11 已说明跨标签退出或 Session 自然过期后入口可能暂时仍显示；这不是权限绕过。
- **质量影响**：Session 失效后长期停留在已挂载 Root Layout 的标签页仍会显示入口并保留 WebGL/cache 资源；点击后才由 `/chat` 服务端保护纠正，形成陈旧 UI、无效导航和不必要资源占用。该状态只能靠完整页面刷新或其他偶然 remount 收敛。
- **最小修正**：保留 GLTF cache 和 Chat 往返不重复下载模型，但在离开 Chat、窗口重新获得焦点/可见性或有明确 logout 信号时重新探测身份；用 generation/AbortController 去重，只在最新 200 后显示，401/403 立即卸载入口。认证 contract 本身仍由 QAM-01 负责。
- **验收证据**：组件与真实浏览器模拟“先 200 → 进入 Chat/失焦 → Session 变 401 → 返回/聚焦”，断言只接受最新响应、入口与 Canvas 卸载且模型不发生无界重复下载；恢复 200 后入口可重新 ready。服务端 `/chat` 保护继续由 QAM-01/QAM-02 回归。
- **影响范围**：QAM-10 Gate/client lifecycle；关联 QAM-01 `/api/auth/me` contract（BU-11），不重复评价 Session/Cookie 正确性。

#### QAM-10-004：实体移动 GPU、系统软键盘和非零 safe-area 尚无验证

- **状态**：`open`
- **问题**：CSS 使用 `env(safe-area-inset-right/bottom)`，E2E 使用 320/390/844 等软件 Chromium viewport、touch flag、缩短 viewport 和 SwiftShader；feat-040 记录明确说明没有实体手机性能、系统软键盘或非零 safe-area 实测（[`agent-entry.module.css`](../../components/agent-entry/agent-entry.module.css#L1-L45)、[`agent-entry-authenticated.spec.ts`](../../tests/e2e/agent-entry-authenticated.spec.ts#L160-L231)、[`agent-entry-review/README.md`](../spec/agent-entry-review/README.md#L28-L30)，E2 + 历史软件浏览器 E3）。
- **质量影响**：当前可证明 DOM 可达和模拟视口不越界，但不能确认真实 iOS/Android WebGL 驱动的首帧/内存、系统键盘改变 visual viewport 时的遮挡，或刘海/底部手势区域的非零 inset；把现有证据扩写为实体设备验收会掩盖发布风险。
- **最小修正**：不改入口功能；选择实际支持的至少一台 iOS Safari 与一台 Android Chrome，复用两个正式主题，记录匿名/Chat 零下载、登录首帧、触摸导航、输入法展开、旋转、非零 safe-area、context loss/返回及内存/崩溃观测。若产品明确不承诺这些设备，则将其写为 accepted-risk 而非伪装成已验证。
- **验收证据**：保留设备/OS/浏览器/GPU、主题、网络与视口条件，以及首帧、遮挡、触摸、旋转、键盘和多次往返的可观察结果；软件 Chromium 继续只作为自动功能回归。
- **影响范围**：QAM-10 性能、overlay 与 accessibility；宿主 QAM 只关联其关键表单旅程（BU-14）。

#### QAM-10-005：当前快照缺两主题 production WebGL/CSP 与镜像集成 E3

- **状态**：`open`
- **问题**：本轮只执行资产、Node、jsdom 组件、CSP 字符串和 Compose config；没有执行 production browser 或真实 Web image。现有 production specs 能覆盖零下载、构建主题、真实 render、导航/缓存、静止帧、卸载、GLB/chunk/WebGL/context-lost 故障和布局，但结果来自 feat-040；feat-046 的 29/29 是相邻历史默认 Playwright，不能代替本轮两主题 production/Compose（[`agent-entry-public.spec.ts`](../../tests/e2e/agent-entry-public.spec.ts#L4-L16)、[`agent-entry-authenticated.spec.ts`](../../tests/e2e/agent-entry-authenticated.spec.ts#L5-L231)、[`progress.md`](../../progress.md#L144-L183)，本轮未运行 + 历史 E3）。
- **质量影响**：低层测试无法发现 WebGL driver、真实 decoder/WASM、browser CSP、动态 chunk、Next production bundling 或 image include 的回归；当前评分可以引用历史可信度，却不能声称最高风险不变量在当前快照已验证，直接限制 Gate。
- **最小修正**：在不与共享 `.next` 冲突的隔离工作树/CI 中执行 default 与 birthday 两条 production E2E，并执行只检查 Web image 正式资产/hash 的风险匹配 Compose 路径；保留 pageerror/CSP/外联/故障断言，不降级为 jsdom 或源码扫描。
- **验收证据**：两主题各自 production build 后运行专属 specs，记录通过数、构建主题/反向 runtime theme、唯一 GLB 请求、零外联/CSP violation、失败注入、Canvas/释放与布局；真实 image 内只有两个批准 hash 的 GLB且不含 source/candidate。不得把 SwiftShader 写成实体设备结果。
- **影响范围**：QAM-10 production/runtime 验证；关联 QAM-09 image/build 接缝（BU-12/13）。

## Architecture and Data Flow

```text
Root Layout（Server Component）
  └─ resolveAgentEntryTheme() [server-only，build-time env]
       └─ Registry[Theme]（可序列化 config）
            └─ AgentEntryGate（client）
                 ├─ /chat* → 不探测、不挂载 dynamic Entry
                 ├─ 非 Chat → GET /api/auth/me
                 │    ├─ 非 200 / network error → 静默隐藏
                 │    └─ 200 → dynamic import AgentEntry
                 └─ generation + AbortController → 丢弃迟到结果

AgentEntry
  ├─ DOM button（首帧前 hidden/disabled/tabIndex=-1）
  ├─ Suspense + DOM ErrorBoundary → useGLTF(model) shared cache
  │    └─ clone Object3D → 原生 canvas + R3F createRoot
  │         ├─ WebGLRenderer(low-power, DPR 1..1.5, demand)
  │         ├─ PMREM/RoomEnvironment + ResizeObserver/contextlost
  │         ├─ gl.render 成功后 queueMicrotask(onReady(model))
  │         └─ unmount → observer/listener/root/renderer/PMREM/canvas cleanup
  ├─ ready → accessible button/tooltip/clearance → router.push('/chat')
  └─ chunk/GLB/WebGL/render failure → 入口隐藏，宿主继续可操作

source.glb（固定 hash）
  └─ candidates: weld → simplify → resize → tangents → meshopt
       └─ candidate report（validator/decoded triangle/texture/budget/hash）
            └─ user selection（exact candidate + hash）
                 └─ promote → public/.../scene.glb + optimization recipe
                      ├─ check:quick：当前验证结构/预算，尚未强制批准 hash
                      └─ Docker Web image：历史 smoke 验证仅含两份正式 GLB
```

身份事实与 Session/Cookie 由 QAM-01 提供；QAM-10 的 `authenticated` 只是显示状态，静态 GLB URL 也不是资源授权边界。`/chat` 解析和聊天能力属于 QAM-02。Next/Docker/Compose 的总体构建与运行责任属于 QAM-09；QAM-10 只拥有合法主题、Registry、selection/recipe/hash、正式 GLB 和入口专属 production 证据。CSP 文件虽为 Cross-cutting，`wasm-unsafe-eval`/`blob:` 对 Meshopt/内嵌纹理的必要性及无外联证据归 QAM-10；全站策略最小化不在本报告重复计分。

## Verified Strengths

- QAM-10 具有独立资产事实、WebGL 生命周期与变化驱动，和当前 QAM 粒度一致；`PROJECT_VIEW.md` 已把 QAM-01/QAM-02/QAM-09/Cross-cutting 接缝与 BU-11～14 分开，避免把显示 Gate 误当授权或把 image 传播重复计分（[`PROJECT_VIEW.md`](../../PROJECT_VIEW.md#L847-L936)、E1/E2）。
- Root Layout 保持 Server Component，只传一个构建期解析后的可序列化 Registry entry；resolver 由 `server-only` 守卫并对非法值回退 default，真实 Next config Node 测试本轮 3/3 通过（[`layout.tsx`](../../app/layout.tsx#L62-L70)、[`resolve-agent-entry-theme.ts`](../../components/agent-entry/resolve-agent-entry-theme.ts#L1-L7)、[`agent-entry-build-config.test.ts`](../../tests/lib/agent-entry-build-config.test.ts#L10-L32)，E2/E3）。
- Gate 在 Chat 首屏完全不探测认证，非 Chat 的请求带 `no-store`、same-origin credential、AbortSignal 与 generation；本轮组件测试证明 Chat 排除、401/500/network、迟到 200、Strict Mode 和成功路径 11/11（[`AgentEntryGate.tsx`](../../components/agent-entry/AgentEntryGate.tsx#L12-L47)、[`agent-entry-gate.test.tsx`](../../tests/component/agent-entry-gate.test.tsx#L36-L131)，本轮 E3）。
- 入口使用原生 DOM button，首帧前不可见/不可交互/不可聚焦；ready 后支持鼠标、Enter、Space、touch、focus tooltip、Escape 和 reduced-motion，并有去重导航锁。当前组件 9/9 通过，历史 production browser 进一步覆盖真实触摸与路由（[`AgentEntry.tsx`](../../components/agent-entry/AgentEntry.tsx#L11-L100)、[`agent-entry.test.tsx`](../../tests/component/agent-entry.test.tsx#L37-L125)，本轮组件 E3 + 历史浏览器 E3）。
- `onReady` 不在 GLB load 或 R3F configure 时早报，而在 demand frame 的真实 `gl.render(scene,camera)` 成功后排队提交；初始化/渲染/context-lost 错误均进入隐藏路径，PMREM、observer、listener、root、renderer 与 canvas 有对应 cleanup（[`AgentEntryScene.tsx`](../../components/agent-entry/AgentEntryScene.tsx#L15-L116)，E2；feat-040 历史 production 故障/生命周期 E3）。
- 当前两份正式 GLB 均无外部 URI，仅使用白名单 Meshopt/quantization；本轮 checker 真解码 Meshopt 后再次 validator，实测 default/birthday 分别为 1,829,016/2,046,212 bytes、94,703/97,721 面、三张 2048 JPEG、0 error/0 warning，预算全部通过（[`agent-entry-assets.ts`](../../scripts/lib/agent-entry-assets.ts#L52-L217)、本轮 `check:agent-entry-assets`，E3）。
- source、selection、四档 candidate reports、promotion recipe 和正式资产均保留机器记录；本轮 `sha256sum` 证明两个 source 与两个正式文件仍匹配记录，feat-040 历史两轮候选生成 hash 一致且人工选定两个 5% 候选（[`selection.json`](../../3d-source/agent-entry/selection.json#L1-L16)、[`agent-entry-review/README.md`](../spec/agent-entry-review/README.md#L1-L28)，本轮 E3 + 历史 E3）。
- 本轮 Compose config 对缺省/default/birthday 均证明主题只进入 Web build arg、不进入运行时 service/Worker；feat-040 历史真实 Compose image 进一步证明 image 不含 source/candidate 且只含两份正式 GLB（[`docker-compose.yml`](../../docker-compose.yml#L130-L177)、[`compose-deployment-smoke.ts`](../../scripts/compose-deployment-smoke.ts#L269-L301)、[`compose-deployment-smoke.ts`](../../scripts/compose-deployment-smoke.ts#L433-L472)，本轮 config E3 + 历史 image E3）。
- production CSP 保留同源默认策略，只为实际 decoder/内嵌纹理增加 `wasm-unsafe-eval` 与 blob，JavaScript `unsafe-eval` 仍限 development；本轮 6/6 验证策略 contract，feat-040 历史真实 production decoder 无 CSP violation/外部 WASM/HDR（[`proxy.ts`](../../proxy.ts#L112-L141)、[`security-headers.test.ts`](../../tests/server/security-headers.test.ts#L50-L78)，本轮 Node E3 + 历史浏览器 E3）。

## Recommended Improvements

1. 修复 **QAM-10-001**：先闭合正式 GLB、selection、recipe、candidate report 与 image hash；这是最小且收益最高的资产事实源修正，不改变模型、预算或人工选择。
2. 修复 **QAM-10-002**：统一 Theme ID contract，并让 Registry、正式目录、资产记录和 production matrix 的精确集合成为快速门禁；不要扩展为运行时远程主题系统。
3. 修复 **QAM-10-003**：在离开 Chat、重新聚焦/可见或明确退出时轻量重验身份，复用现有 request generation 与 GLTF cache，避免陈旧入口而不增加认证能力。
4. 关闭 **QAM-10-005**：在隔离工作树或串行门禁中重跑两个构建主题的 production E2E 和真实 image hash 集成；保留现有失败注入、pageerror/CSP/外联/Canvas 断言。
5. 处理 **QAM-10-004**：以目标实体 iOS/Android 设备补 GPU、键盘、旋转和非零 safe-area 观察，或由产品明确接受该证据边界；不以 Avatar、动画、TTS 或新 3D 功能替代质量验证。

## Sustainable Review Record

### 当前开放问题

| ID | Priority | 状态 | 首次发现 | 直接责任 | 关联责任 |
| --- | --- | --- | --- | --- | --- |
| QAM-10-001 | P2 | `open` | 2026-09-12；正式资产 checker 不强制 selection/recipe/image hash 一致（E2；当前文件一致为 E3） | QAM-10 asset provenance/formal asset | QAM-09 image 接缝（BU-12） |
| QAM-10-002 | P2 | `open` | 2026-09-12；Theme allowlist 跨 runtime/asset/E2E/Compose 重复（E2） | QAM-10 theme contract | QAM-09 build matrix（BU-12） |
| QAM-10-003 | P2 | `open` | 2026-09-12；成功认证状态在 Root Layout 生命周期内不重验（本轮组件 E3） | QAM-10 Gate/client state | QAM-01 auth contract（BU-11） |
| QAM-10-004 | P2 | `open` | 2026-09-12；实体 GPU/系统键盘/非零 safe-area 未验证（E1/E2；软件浏览器为历史 E3） | QAM-10 performance/overlay/accessibility | 宿主关键表单（BU-14） |
| QAM-10-005 | P2 | `open` | 2026-09-12；本轮无两主题 production WebGL/CSP/image E3（历史 E3） | QAM-10 production verification | QAM-09 image/CSP 接缝（BU-12/13） |

### 关联但不重复登记的问题

- QAM-01 拥有 Session/Cookie 与 `/api/auth/me` 正确性；QAM-10-003 只登记成功状态缓存后的显示/资源生命周期，不把入口可见性写成授权缺陷。
- QAM-02 拥有 `/chat` 默认房间解析、Room/Message/SSE 与 Chat UI；QAM-10 只验证 DOM navigation 发起和 Chat 路由排除，不评价目标页业务。
- QAM-09 拥有 Docker build arg 传播、Web image 与 Compose 拓扑；QAM-10-001/002/005 只登记主题/正式资产领域 contract 和入口专属验证，image 总体问题通过 BU-12 关联。
- 全站 CSP 最小化属于 Cross-cutting；本报告只评价 Meshopt/blob 权限必要性、production decoder 可运行与不发生外联，不因单一 `proxy.ts` 重复建立跨模块缺陷。

### 复审触发条件

- 修改 `AgentEntryGate` 的路由/认证探测、缓存、AbortController/generation，或 QAM-01 的 `/api/auth/me`/logout contract。
- 修改 Registry/resolver、Theme ID、`NEXT_PUBLIC_AGENT_ENTRY_THEME`、Next/Docker/Compose build 传播，或新增/删除正式主题。
- 修改 `AgentEntry`/Scene/Model、Three/R3F/Drei/Meshopt 版本、首帧 ready、frame loop、DPR、clone/cache、renderer/PMREM/observer/listener/context cleanup 或故障边界。
- 修改 source/formal GLB、selection、optimization recipes、candidate reports、预算、validator/extension policy、candidate/promote/check 或 `.dockerignore`/image asset assertions。
- 修改入口 fixed overlay、z-index、clearance、safe-area、tooltip、keyboard/touch/focus/reduced-motion，或宿主关键表单/Modal 布局。
- 修复或重新验证 QAM-10-001～005；尤其在评分上调前重跑当前快照两主题 production browser，并区分软件 Chromium与实体设备证据。

### 只追加评分历史

| 日期 | Score | Score Level | Gate | Final | Delta | 变更证据 |
| --- | ---: | --- | --- | --- | --- | --- |
| 2026-09-12 | 84 | L3 | L2 | L2 | `baseline` | QAM-10 初审；本轮正式资产 checker、Node 31/31、组件 20/20、CSP 6/6、缺省/default/birthday Compose config 与四份文件 hash 核对通过。feat-040 两主题 production/Compose image 和 feat-046 总体 `check:full` 仅作为历史 E3；本轮未运行 production browser/Compose。开放 QAM-10-001～005，最高风险 WebGL/CSP/image 无当前 E3，故 Gate/Final=L2。 |

复审时保留上述问题 ID 和历史行；只在代码、资产或风险匹配证据变化时重算受影响维度，并重新核对 100 分合计、Gate 与 Final。问题状态只能使用 `open`、`resolved`、`accepted-risk`、`not-reproduced`。
