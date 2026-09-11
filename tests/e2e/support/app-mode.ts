export type E2EAppMode = "development" | "production";
export type E2EAgentEntryTheme = "default" | "birthday-2026";

export function e2eAppMode(): E2EAppMode {
  const mode = process.env.E2E_APP_MODE ?? "development";
  if (mode !== "development" && mode !== "production") {
    throw new Error("E2E_APP_MODE 只接受 development 或 production。");
  }
  return mode;
}

export function e2eAgentEntryTheme(): E2EAgentEntryTheme {
  // 显式缺省值阻止 Next 加载开发机 .env 后改变测试主题。
  const theme = process.env.NEXT_PUBLIC_AGENT_ENTRY_THEME ?? "default";
  if (theme !== "default" && theme !== "birthday-2026") {
    throw new Error("E2E 主题只接受 default 或 birthday-2026。");
  }
  return theme;
}
