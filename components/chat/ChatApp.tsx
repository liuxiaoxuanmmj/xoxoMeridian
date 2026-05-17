"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AgentStatusBadge } from "@/components/chat/AgentStatusBadge";
import { LeftRail } from "@/components/chat/LeftRail";
import { LifePanel } from "@/components/chat/LifePanel";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { MessageList } from "@/components/chat/MessageList";
import type { ChatMessage, ChatUser, RoomSnapshot } from "@/components/chat/types";
import { dedupedReplace } from "@/lib/router-dedup";

type ConnState = "connecting" | "open" | "reconnecting";

// Reuses prev-tick references for items that are deeply unchanged so React.memo
// downstream can skip re-rendering them.
function stableMergeBy<T>(prev: T[], next: T[], getKey: (item: T) => string): T[] {
  if (prev === next) return prev;
  if (prev.length === 0 && next.length === 0) return prev;
  const prevByKey = new Map(prev.map((item) => [getKey(item), item]));
  let identical = prev.length === next.length;
  const merged: T[] = new Array(next.length);
  for (let i = 0; i < next.length; i++) {
    const item = next[i];
    const old = prevByKey.get(getKey(item));
    if (old && JSON.stringify(old) === JSON.stringify(item)) {
      merged[i] = old;
      if (prev[i] !== old) identical = false;
    } else {
      merged[i] = item;
      identical = false;
    }
  }
  return identical ? prev : merged;
}

function mergeSnapshot(prev: RoomSnapshot, next: RoomSnapshot): RoomSnapshot {
  const messages = stableMergeBy(prev.messages, next.messages, (m) => m.id);
  const memos = stableMergeBy(prev.memos, next.memos, (m) => m.id);
  const scheduledJobs = stableMergeBy(
    prev.scheduledJobs,
    next.scheduledJobs,
    (j) => j.id
  );

  const participants = stableMergeBy(
    prev.room.participants,
    next.room.participants,
    (p) => p.user.id
  );
  const room =
    participants === prev.room.participants &&
    prev.room.id === next.room.id &&
    prev.room.name === next.room.name
      ? prev.room
      : { ...next.room, participants };

  const agentStatus =
    JSON.stringify(prev.agentStatus) === JSON.stringify(next.agentStatus)
      ? prev.agentStatus
      : next.agentStatus;

  // rooms is undefined when the snapshot was built without a userId (e.g. legacy
  // callers); treat that as "keep prev" so a transient un-scoped tick can't
  // flicker the sidebar to empty.
  const rooms = next.rooms
    ? stableMergeBy(prev.rooms ?? [], next.rooms, (r) => r.id)
    : prev.rooms;

  // No-op tick: every field is reference-equal to prev, so return prev itself
  // instead of a fresh object — otherwise React.memo on consumers (MessageList,
  // LifePanel, LeftRail) is defeated by a new top-level identity every ~2s.
  if (
    room === prev.room &&
    messages === prev.messages &&
    memos === prev.memos &&
    scheduledJobs === prev.scheduledJobs &&
    agentStatus === prev.agentStatus &&
    rooms === prev.rooms
  ) {
    return prev;
  }

  return { room, messages, memos, scheduledJobs, agentStatus, rooms };
}

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
        messages: stableMergeBy(current.messages, payload.messages, (m) => m.id)
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

  const replaceMessage = useCallback((tempId: string, real: ChatMessage) => {
    setSnapshot((current) => {
      const idx = current.messages.findIndex((m) => m.id === tempId);
      if (idx < 0) {
        if (current.messages.some((m) => m.id === real.id)) return current;
        return { ...current, messages: [...current.messages, real] };
      }
      // SSE may have already pushed the real id in another slot; drop the temp.
      if (current.messages.some((m, i) => i !== idx && m.id === real.id)) {
        return { ...current, messages: current.messages.filter((_, i) => i !== idx) };
      }
      const next = current.messages.slice();
      next[idx] = real;
      return { ...current, messages: next };
    });
  }, []);

  const removeMessage = useCallback((messageId: string) => {
    setSnapshot((current) => {
      if (!current.messages.some((m) => m.id === messageId)) return current;
      return { ...current, messages: current.messages.filter((m) => m.id !== messageId) };
    });
  }, []);

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
        const next = JSON.parse((event as MessageEvent).data) as RoomSnapshot;
        setSnapshot((prev) => mergeSnapshot(prev, next));
      });

      // Server tells us this cookie has been superseded by a newer login on
      // another browser. Close the stream permanently (skip reconnect), drop
      // the cookie, bounce to the login page.
      source.addEventListener("kicked", () => {
        if (terminated || cancelled) return;
        terminated = true;
        source?.close();
        source = null;
        // The "kicked" event means the session is already invalid on the server
        // (sessionVersion mismatch). Calling /api/auth/logout here is redundant
        // and can cause a race condition where a newly logged-in session gets
        // invalidated by a stale tab's logout call.
        dedupedReplace(router, "/");
      });

      // Server tells us the room we're viewing was deleted (or we were
      // removed from it). Fall back to the default room via /chat.
      source.addEventListener("roomDeleted", () => {
        terminated = true;
        source?.close();
        source = null;
        dedupedReplace(router, "/chat");
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
          rooms={snapshot.rooms ?? []}
          onQuickPrompt={(prompt) => {
            setDraftPrompt(prompt);
          }}
        />

        <section className="flex min-w-0 flex-1 flex-col">
          <MessageList currentUser={currentUser} messages={snapshot.messages} />
          <MessageComposer
            currentUser={currentUser}
            externalDraft={draftPrompt}
            onSendComplete={replaceMessage}
            onSendFailed={removeMessage}
            onSent={appendMessage}
            roomId={roomId}
          />
        </section>

        <LifePanel memos={snapshot.memos} participants={participants} roomId={roomId} scheduledJobs={snapshot.scheduledJobs ?? []} />
      </div>
    </main>
  );
}
