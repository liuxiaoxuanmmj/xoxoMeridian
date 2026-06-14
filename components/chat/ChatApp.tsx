"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AgentStatusBadge } from "@/components/chat/AgentStatusBadge";
import { LeftRail } from "@/components/chat/LeftRail";
import { LifePanel } from "@/components/chat/LifePanel";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { BrandBadge } from "@/components/layout/BrandBadge";
import { MessageList } from "@/components/chat/MessageList";
import type { ChatMessage, ChatUser, RoomSnapshot } from "@/components/chat/types";
import { dedupedReplace } from "@/lib/router-dedup";
import { stableMergeBy } from "@/lib/stable-merge";

type ConnState = "connecting" | "open" | "reconnecting";

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
  const [authSyncing, setAuthSyncing] = useState(false);
  const [connState, setConnState] = useState<ConnState>("connecting");
  const roomId = snapshot.room.id;
  const router = useRouter();
  const activeUser = currentUser;

  useEffect(() => {
    setSnapshot(initialSnapshot);
    setConnState("connecting");
  }, [initialSnapshot]);

  useEffect(() => {
    let cancelled = false;
    const syncCurrentSessionUser = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "same-origin"
        });
        if (response.status === 401) {
          dedupedReplace(router, "/");
          return;
        }
        if (!response.ok) return;

        const sessionUser = (await response.json()) as ChatUser;
        if (cancelled) return;
        if (sessionUser.id !== currentUser.id) {
          setAuthSyncing(true);
          window.location.replace(`/chat?auth=${encodeURIComponent(sessionUser.id)}-${Date.now()}`);
        }
      } catch {
        // Keep the server-rendered user during transient network failures.
      }
    };

    void syncCurrentSessionUser();
    window.addEventListener("focus", syncCurrentSessionUser);
    window.addEventListener("pageshow", syncCurrentSessionUser);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", syncCurrentSessionUser);
      window.removeEventListener("pageshow", syncCurrentSessionUser);
    };
  }, [currentUser.id, router]);

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
        message.senderType === "human" && message.senderId === activeUser.id && !message.sender
          ? {
              ...message,
              sender: {
                id: activeUser.id,
                displayName: activeUser.displayName,
                avatarLabel: activeUser.avatarLabel
              }
            }
          : message;

      setSnapshot((current) => {
        if (current.messages.some((m) => m.id === enriched.id)) return current;
        return { ...current, messages: [...current.messages, enriched] };
      });
    },
    [activeUser]
  );

  const replaceMessage = useCallback((tempId: string, real: ChatMessage) => {
    const senderId = real.senderId;
    if (real.senderType === "human" && senderId && senderId !== currentUser.id) {
      setAuthSyncing(true);
      window.location.replace(`/chat?auth=${encodeURIComponent(senderId)}-${Date.now()}`);
      return;
    }

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
  }, [currentUser.id]);

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
    const reconnect = reconnectRef.current;

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
      source.addEventListener("kicked", async () => {
        if (terminated || cancelled) return;
        terminated = true;
        source?.close();
        source = null;
        try {
          const response = await fetch("/api/auth/me", {
            cache: "no-store",
            credentials: "same-origin"
          });
          if (response.ok) {
            const user = (await response.json()) as ChatUser;
            window.location.replace(`/chat?auth=${encodeURIComponent(user.id)}-${Date.now()}`);
            return;
          }
        } catch {
          // Fall back to the unauthenticated route below.
        }
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
      if (reconnect.timer !== null) {
        window.clearTimeout(reconnect.timer);
        reconnect.timer = null;
      }
      reconnect.attempt = 0;
      source?.close();
    };
  }, [roomId, refresh, router]);

  const participants = useMemo(() => snapshot.room.participants.map((participant) => participant.user), [snapshot.room.participants]);
  const latestStatus = snapshot.agentStatus.recentTasks[0]?.status;

  if (authSyncing) {
    return (
      <main className="flex h-screen min-h-[720px] items-center justify-center bg-sage-50 text-sm text-black/50">
        正在同步登录状态…
      </main>
    );
  }

  return (
    <main className="flex h-screen min-h-[720px] flex-col bg-sage-50 text-ink">
      <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-[#e8e8e8] bg-white/95 backdrop-blur-sm px-5">
        <div className="flex items-center gap-6">
          <BrandBadge />
          <Link
            href="/home"
            className="text-xs font-medium text-black/50 hover:text-black transition-colors"
          >
            Blog
          </Link>
          <Link
            href="/chat"
            className="text-xs font-medium text-[#3a5b22] transition-colors"
          >
            Chat
          </Link>
          <span className="text-black/20">|</span>
          <span className="text-xs font-medium text-black/70">{snapshot.room.name}</span>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-xs text-black/40">
            {connState !== "open" && (
              <span className="inline-flex items-center gap-1 text-sage-600">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sage-500" />
                {connState === "connecting" ? "连接中…" : "重连中…"}
              </span>
            )}
          </p>
          <AgentStatusBadge isWorking={snapshot.agentStatus.isWorking} latestStatus={latestStatus} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <LeftRail
          currentUser={activeUser}
          currentRoomId={roomId}
          participants={participants}
          rooms={snapshot.rooms ?? []}
        />

        <section className="flex min-w-0 flex-1 flex-col">
          <MessageList currentUser={activeUser} messages={snapshot.messages} />
          <MessageComposer
            currentUser={activeUser}
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
