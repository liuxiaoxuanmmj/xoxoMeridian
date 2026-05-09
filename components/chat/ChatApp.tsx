"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AgentStatusBadge } from "@/components/chat/AgentStatusBadge";
import { LeftRail } from "@/components/chat/LeftRail";
import { LifePanel } from "@/components/chat/LifePanel";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { MessageList } from "@/components/chat/MessageList";
import type { ChatMessage, ChatUser, RoomSnapshot } from "@/components/chat/types";

type ConnState = "connecting" | "open" | "reconnecting";

export function ChatApp({
  currentUser,
  initialSnapshot
}: {
  currentUser: ChatUser;
  initialSnapshot: RoomSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [connState, setConnState] = useState<ConnState>("connecting");
  const roomId = snapshot.room.id;
  const router = useRouter();

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/rooms/${roomId}/messages`, {
      cache: "no-store"
    });
    if (response.ok) {
      const payload = await response.json();
      setSnapshot((current) => ({
        ...current,
        messages: payload.messages
      }));
    }
  }, [roomId]);

  const appendMessage = useCallback(
    (message: ChatMessage) => {
      // Attach the current user's display info so the optimistic bubble doesn't
      // render as "未知"; the real row from SSE/refresh will overwrite by id.
      const enriched: ChatMessage =
        message.senderType === "human" && message.senderId === currentUser.id && !message.sender
          ? {
              ...message,
              sender: {
                id: currentUser.id,
                displayName: currentUser.displayName,
                avatarLabel: currentUser.avatarLabel
              }
            }
          : message;

      setSnapshot((current) => {
        if (current.messages.some((m) => m.id === enriched.id)) return current;
        return { ...current, messages: [...current.messages, enriched] };
      });
    },
    [currentUser]
  );

  // Custom reconnect loop. EventSource reconnects by itself, but silently — we
  // want a visible "reconnecting" state and a GET /messages sync after recovery
  // so the user never stares at a stale list while nginx has dropped the SSE.
  const reconnectRef = useRef<{ attempt: number; timer: number | null }>({
    attempt: 0,
    timer: null
  });

  useEffect(() => {
    let cancelled = false;
    let terminated = false;
    let source: EventSource | null = null;

    const connect = () => {
      if (cancelled || terminated) return;
      setConnState(reconnectRef.current.attempt === 0 ? "connecting" : "reconnecting");
      source = new EventSource(`/api/rooms/${roomId}/stream`);

      source.addEventListener("open", () => {
        const wasReconnect = reconnectRef.current.attempt > 0;
        reconnectRef.current.attempt = 0;
        setConnState("open");
        if (wasReconnect) {
          void refresh();
        }
      });

      source.addEventListener("snapshot", (event) => {
        setSnapshot(JSON.parse((event as MessageEvent).data));
      });

      // Server tells us this cookie has been superseded by a newer login on
      // another browser. Close the stream permanently (skip reconnect), drop
      // the cookie, bounce to the login page.
      source.addEventListener("kicked", () => {
        terminated = true;
        source?.close();
        source = null;
        void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
          router.replace("/");
        });
      });

      // Server tells us the room we're viewing was deleted (or we were
      // removed from it). Fall back to the default room via /chat.
      source.addEventListener("roomDeleted", () => {
        terminated = true;
        source?.close();
        source = null;
        router.replace("/chat");
      });

      source.addEventListener("error", () => {
        if (cancelled || terminated) return;
        source?.close();
        source = null;
        setConnState("reconnecting");
        const attempt = Math.min(reconnectRef.current.attempt + 1, 6);
        reconnectRef.current.attempt = attempt;
        const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
        reconnectRef.current.timer = window.setTimeout(connect, delay);
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectRef.current.timer !== null) {
        window.clearTimeout(reconnectRef.current.timer);
        reconnectRef.current.timer = null;
      }
      reconnectRef.current.attempt = 0;
      source?.close();
    };
  }, [roomId, refresh, router]);

  const participants = useMemo(() => snapshot.room.participants.map((participant) => participant.user), [snapshot.room.participants]);
  const latestStatus = snapshot.agentStatus.recentTasks[0]?.status;

  return (
    <main className="flex h-screen min-h-[720px] flex-col text-ink">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-warm-200 bg-white/80 px-4 backdrop-blur">
        <div>
          <h1 className="text-base font-semibold text-ink">{snapshot.room.name}</h1>
          <p className="text-xs text-ink/50">
            私密双人聊天室 · 本地 Agent Runtime
            {connState !== "open" && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-600">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                {connState === "connecting" ? "连接中…" : "重连中…"}
              </span>
            )}
          </p>
        </div>
        <AgentStatusBadge isWorking={snapshot.agentStatus.isWorking} latestStatus={latestStatus} />
      </header>

      <div className="flex min-h-0 flex-1">
        <LeftRail
          currentUser={currentUser}
          currentRoomId={roomId}
          participants={participants}
          onQuickPrompt={(prompt) => {
            setDraftPrompt(prompt);
          }}
        />

        <section className="flex min-w-0 flex-1 flex-col">
          <MessageList currentUser={currentUser} messages={snapshot.messages} />
          <MessageComposer externalDraft={draftPrompt} roomId={roomId} onSent={appendMessage} />
        </section>

        <LifePanel memos={snapshot.memos} notes={snapshot.notes} participants={participants} reminders={snapshot.reminders} roomId={roomId} scheduledJobs={snapshot.scheduledJobs ?? []} />
      </div>
    </main>
  );
}
