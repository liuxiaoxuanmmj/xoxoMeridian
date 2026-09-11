# Agent Entry 候选评审

状态：2026-09-10 用户明确选择两个主题均为 5%；已按所列 SHA-256 提升正式 scene.glb。人工选择记录位于 3d-source/agent-entry/selection.json，完整 recipe 位于 optimization-recipes.json。2026-09-11 按用户要求清理 `docs/spec` 中用于选型的截图和 JSON 中间产物，本文件保留结论与复建信息。

相同实际 Entry/Scene/Model、锁定 Drei/Meshopt 解码器，桌面 1440×900/DPR 1、移动 390×844/DPR 1。当前软件渲染 Chromium 仅作为功能与视觉检查，不代表实体移动设备性能。相机参数见 Registry；两主题 rotation=[0,-π/2,0]。

|主题|比例|MiB|三角面|SHA-256|
|---|---:|---:|---:|---|
|default|5%|1.74|94703|f8a6b76bbe0658c6f322cd7ed5989173efcafd03b6dca072e5002bac409b12d2|
|default|7.5%|2.04|142057|badc216427da29c192599f14f51f29722da6b151c677f11eb3a87658638c10d8|
|birthday-2026|5%|1.95|97721|a7ec571a233f7ae0b569a0c525cbcab6d5f33988ea005a6d940d8ce8d7c9dab1|
|birthday-2026|7.5%|2.30|146583|5a7a25bd57b7aac2943691e16395cd9d57584e6e75c277ada60fd2642f7cbbf0|

两个档位均满足 8 MiB/150000 面/2048 纹理预算；validator errors/warnings 均为 0。检查器在 Meshopt 解码后再次验证并核对默认场景实例计数；不支持扩展的 info 消息已记录解释。增加显式 tangents 步骤，消除源模型缺少切线导致的可移植性 warning。

两个主题均已按用户选择采用 5%：在 208/160 px 入口尺寸下，默认角色的脸、手、星星与背包，以及生日主题的角色、蛋糕和帽子仍清晰可辨；与相邻 7.5% 未观察到明显边缘破损、孔洞或主体裁切。该结论是本次截图观察；用户随后明确回复“两个均选择 5%”。

源 hash、CLI 版本、所有命令参数与候选指标保存在 3d-source/agent-entry/candidate-reports 下对应 JSON（交付时已清理候选大文件）；候选由原始源文件分别生成，没有连续简化。生成命令：npm run agent-entry:assets -- candidates --theme default（birthday-2026 同理）。

已按 selection.json 中的精确路径/hash 完成 promote；优化产物必须通过 check:agent-entry-assets。复建时先运行两个主题的 candidates 命令；同一锁文件的两轮独立生成均与上述 hash 一致，再按已记录选择运行：

```bash
npm run agent-entry:assets -- promote --theme default --candidate public/.agent-entry-candidates/default/ratio-5.glb --sha256 f8a6b76bbe0658c6f322cd7ed5989173efcafd03b6dca072e5002bac409b12d2
npm run agent-entry:assets -- promote --theme birthday-2026 --candidate public/.agent-entry-candidates/birthday-2026/ratio-5.glb --sha256 a7ec571a233f7ae0b569a0c525cbcab6d5f33988ea005a6d940d8ce8d7c9dab1
npm run check:agent-entry-assets
```

实施于 2026-09-11 完成。默认主题 production 为 16/16，生日主题 production 全量为 26/26；真实 PostgreSQL 为 18 文件/48 项，最终 init 为 65 文件/412 项，Compose init/Web/Worker 和模型镜像检查通过。覆盖率为 statements 44.38%、branches 38.94%、functions 48.87%、lines 45.10%；生日主题报告为 total 26、expected 26、unexpected 0、flaky 0、skipped 0、errors 0。入口从认证成功到 ready 的软件 Chromium 观测为 2676 ms，三次路由往返的未强制 GC 堆观测均为 23100000 bytes，静止绘制计数保持不变。早期失败、权限对照和完整命令见 progress.md。

窄屏下为页面末尾预留可滚动空间，确保个人设置保存和 Post 删除等控件可到达。320/390/1280 px 表单、横屏、触摸、reduced-motion 和输入时缩短视口已验证。实体移动性能、系统软键盘和非零安全区未实测；生产审计的既有 2 high 由独立 feat-041 后续处理。
