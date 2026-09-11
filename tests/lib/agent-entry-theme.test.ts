import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { agentEntryRegistry } from "@/components/agent-entry/agent-entry.registry";
import { agentEntryThemes } from "@/components/agent-entry/agent-entry.types";
import { resolveAgentEntryTheme } from "@/components/agent-entry/resolve-agent-entry-theme";

afterEach(() => vi.unstubAllEnvs());

describe("Agent Entry 主题契约", () => {
  it.each(agentEntryThemes)("精确解析主题 %s", (theme) => {
    expect(resolveAgentEntryTheme(theme)).toBe(theme);
  });

  it.each(["", " ", "birthday", "DEFAULT", " default", "birthday-2026 "])("非法输入 %j 回退 default", (value) => {
    expect(resolveAgentEntryTheme(value)).toBe("default");
  });

  it("读取显式环境并对缺失环境回退", () => {
    vi.stubEnv("NEXT_PUBLIC_AGENT_ENTRY_THEME", "birthday-2026");
    expect(resolveAgentEntryTheme()).toBe("birthday-2026");
    vi.stubEnv("NEXT_PUBLIC_AGENT_ENTRY_THEME", undefined);
    expect(resolveAgentEntryTheme()).toBe("default");
  });

  it.each(agentEntryThemes)("%s Registry 可以序列化且完整提供有效的场景参数", (theme) => {
    const config = agentEntryRegistry[theme];
    expect(JSON.parse(JSON.stringify(config))).toEqual(config);
    expect(config.model).toBe(`/models/agent-entry/${theme}/scene.glb`);
    expect(config.camera.near).toBeGreaterThan(0);
    expect(config.camera.far).toBeGreaterThan(config.camera.near);
    expect(config.camera.fov).toBeGreaterThan(0);
    expect(config.camera.fov).toBeLessThan(180);
    expect(config.scale).toBeGreaterThan(0);
    for (const value of [...config.position, ...config.rotation, ...config.camera.position, ...config.camera.target, ...Object.values(config.layout)]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(config.layout.mobileSize).toBeGreaterThanOrEqual(144);
    expect(config.layout.mobileSize).toBeLessThanOrEqual(176);
    expect(config.layout.desktopSize).toBeGreaterThanOrEqual(192);
    expect(config.layout.desktopSize).toBeLessThanOrEqual(240);
    expect(config.ui.ariaLabel).toBe("打开 Agent 聊天");
    expect(config.ui.tooltip.length).toBeGreaterThan(0);
    expect(config.capabilities).toEqual({ animationClips: [], morphTargets: [] });
  });
});
