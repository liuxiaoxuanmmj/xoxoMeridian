import "server-only";

import { agentEntryThemes, type AgentEntryTheme } from "@/components/agent-entry/agent-entry.types";

export function resolveAgentEntryTheme(raw: string | undefined = process.env.NEXT_PUBLIC_AGENT_ENTRY_THEME): AgentEntryTheme {
  return agentEntryThemes.find((theme) => theme === raw) ?? "default";
}
