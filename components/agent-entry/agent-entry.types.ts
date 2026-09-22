import type { EntryMotionController } from "@/components/agent-entry/agent-entry-behavior";

export const agentEntryThemes = ["default", "birthday-2026"] as const;

export type AgentEntryTheme = (typeof agentEntryThemes)[number];
export type Vector3Tuple = readonly [number, number, number];

export interface AgentEntryThemeConfig {
  feedback: "light" | "static";
  model: string;
  camera: {
    position: Vector3Tuple;
    target: Vector3Tuple;
    fov: number;
    near: number;
    far: number;
  };
  scale: number;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  layout: {
    mobileSize: number;
    desktopSize: number;
    mobileBottom: number;
    desktopBottom: number;
    mobileRight: number;
    desktopRight: number;
  };
  ui: {
    ariaLabel: string;
    accent: string;
  };
  capabilities: {
    animationClips: readonly string[];
    morphTargets: readonly string[];
  };
}

export interface AgentEntryProps {
  config: AgentEntryThemeConfig;
}

export interface AgentEntrySceneProps extends AgentEntryProps {
  motion: EntryMotionController;
  onReady: (model: string) => void;
  onError: () => void;
}
