import { promises as fs } from "node:fs";
import path from "node:path";

import { env } from "@/lib/env";

const LOG_DIR = path.resolve(env.CHAT_LOG_DIR ?? path.join(process.cwd(), "data", "chat-logs"));
const ensuredDirs = new Set<string>();

export type ChatLogEvent =
  | { kind: "message.human"; messageId: string; senderUserId: string | null; content: string; createdAt: Date | string }
  | { kind: "message.agent"; messageId: string; senderAgentId: string; taskId: string | null; status?: string; content: string; createdAt: Date | string }
  | {
      kind: "llm.call";
      taskId: string;
      provider: string;
      model: string;
      status: "completed" | "failed";
      durationMs: number;
      requestPayload: unknown;
      responsePayload?: unknown;
      tokens?: { prompt?: number; completion?: number; total?: number };
      error?: string;
    }
  | {
      kind: "tool.call";
      taskId: string;
      toolCallId: string;
      toolName: string;
      status: "running" | "completed" | "failed";
      input?: unknown;
      output?: unknown;
      error?: string;
      durationMs?: number;
    }
  | { kind: "task.event"; taskId: string; type: string; payload?: unknown };

export async function appendChatLog(roomId: string, event: ChatLogEvent): Promise<void> {
  if (!env.AGENT_DEBUG_ENABLED) return;
  if (!roomId) return;

  let filePath: string | undefined;
  try {
    if (!ensuredDirs.has(LOG_DIR)) {
      await fs.mkdir(LOG_DIR, { recursive: true });
      ensuredDirs.add(LOG_DIR);
    }
    filePath = path.join(LOG_DIR, `${sanitize(roomId)}.jsonl`);
    const line = JSON.stringify({ ts: new Date().toISOString(), roomId, ...event }) + "\n";
    await fs.appendFile(filePath, line, "utf8");
  } catch (err) {
    const errno = (err as NodeJS.ErrnoException)?.code;
    const message = err instanceof Error ? err.message : String(err);
    console.error("[chat-log-file] append failed", {
      roomId,
      filePath,
      logDir: LOG_DIR,
      errno,
      uid: typeof process.getuid === "function" ? process.getuid() : undefined,
      message
    });
  }
}

function sanitize(id: string) {
  return id.replace(/[^A-Za-z0-9_.-]/g, "_");
}
