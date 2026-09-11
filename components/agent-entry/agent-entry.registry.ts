import type { AgentEntryTheme, AgentEntryThemeConfig } from "@/components/agent-entry/agent-entry.types";

export const agentEntryRegistry = {
  default: {
    model: "/models/agent-entry/default/scene.glb",
    camera: { position: [0, 0.08, 1.9], target: [0, 0, 0], fov: 36, near: 0.01, far: 20 },
    scale: 1,
    position: [0, 0, 0],
    rotation: [0, -1.5707963267948966, 0],
    layout: { mobileSize: 160, desktopSize: 208, mobileBottom: 16, desktopBottom: 24, mobileRight: 16, desktopRight: 24 },
    ui: { tooltip: "和 Agent 聊聊", ariaLabel: "打开 Agent 聊天", accent: "#c27c88" },
    capabilities: { animationClips: [], morphTargets: [] },
  },
  "birthday-2026": {
    model: "/models/agent-entry/birthday-2026/scene.glb",
    camera: { position: [0, 0.12, 2.1], target: [0, 0, 0], fov: 36, near: 0.01, far: 20 },
    scale: 1,
    position: [0, 0, 0],
    rotation: [0, -1.5707963267948966, 0],
    layout: { mobileSize: 160, desktopSize: 208, mobileBottom: 16, desktopBottom: 24, mobileRight: 16, desktopRight: 24 },
    ui: { tooltip: "来参加生日派对 🎂", ariaLabel: "打开 Agent 聊天", accent: "#c79845" },
    capabilities: { animationClips: [], morphTargets: [] },
  },
} as const satisfies Record<AgentEntryTheme, AgentEntryThemeConfig>;
