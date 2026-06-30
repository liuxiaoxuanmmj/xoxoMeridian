"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatMessage, ChatUser, RoomSnapshot } from "@/components/chat/types";
import { stableMergeBy } from "@/lib/stable-merge";

export type ConnState = "connecting" | "open" | "reconnecting";

export function mergeSnapshot(prev: RoomSnapshot, next: RoomSnapshot): RoomSnapshot {
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

export type RoomChatRedirects = {
  onAuthMismatch?: (userId: string) => void;
  onUnauthenticated?: () => void;
  onRoomDeleted?: () => void;
};

export function useRoomChat({
  currentUser,
  initialSnapshot,
  redirectOnRoomDeleted = true,
  redirects,
}: {
  currentUser: ChatUser;
  initialSnapshot: RoomSnapshot;
  redirectOnRoomDeleted?: boolean;
  redirects?: RoomChatRedirects;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [authSyncing, setAuthSyncing] = useState(false);
  const [connState, setConnState] = useState<ConnState>("connecting");
  const roomId = snapshot.room.id;

  useEffect(() => {
    setSnapshot(initialSnapshot);
    setConnState("connecting");
  }, [initialSnapshot]);

  // ── Auth sync ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const syncCurrentSessionUser = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (response.status === 401) {
          redirects?.onUnauthenticated?.();
          return;
        }
        if (!response.ok) return;

        const sessionUser = (await response.json()) as ChatUser;
        if (cancelled) return;
        if (sessionUser.id !== currentUser.id) {
          setAuthSyncing(true);
          redirects?.onAuthMismatch?.(sessionUser.id);
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
  }, [currentUser.id, redirects?.onUnauthenticated, redirects?.onAuthMismatch]);

  // ── Refresh (GET /messages) ────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/rooms/${roomId}/messages`, {
      cache: "no-store",
    });
    if (response.ok) {
      const payload = await response.json();
      setSnapshot((current) => ({
        ...current,
        messages: stableMergeBy(current.messages, payload.messages, (m) => m.id),
      }));
    }
  }, [roomId]);

  // ── Message operations ─────────────────────────────────────────────────────

  const appendMessage = useCallback(
    (message: ChatMessage) => {
      // Attach the current user's display info so the optimistic bubble doesn't
      // render as "未知"; the real row from SSE/refresh will overwrite by id.
      const enriched: ChatMessage =
        message.senderType === "human" &&
        message.senderId === currentUser.id &&
        !message.sender
          ? {
              ...message,
              sender: {
                id: currentUser.id,
                displayName: currentUser.displayName,
                avatarLabel: currentUser.avatarLabel,
              },
            }
          : message;

      setSnapshot((current) => {
        if (current.messages.some((m) => m.id === enriched.id)) return current;
        return { ...current, messages: [...current.messages, enriched] };
      });
    },
    [currentUser],
  );

  const replaceMessage = useCallback(
    (tempId: string, real: ChatMessage) => {
      const senderId = real.senderId;
      if (real.senderType === "human" && senderId && senderId !== currentUser.id) {
        setAuthSyncing(true);
        redirects?.onAuthMismatch?.(senderId);
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
          return {
            ...current,
            messages: current.messages.filter((_, i) => i !== idx),
          };
        }
        const next = current.messages.slice();
        next[idx] = real;
        return { ...current, messages: next };
      });
    },
    [currentUser.id, redirects?.onAuthMismatch],
  );

  const removeMessage = useCallback((messageId: string) => {
    setSnapshot((current) => {
      if (!current.messages.some((m) => m.id === messageId)) return current;
      return {
        ...current,
        messages: current.messages.filter((m) => m.id !== messageId),
      };
    });
  }, []);

  // ── Send message (optimistic + POST + replace on success) ──────────────────

  const sendMessage = useCallback(
    async (text: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      const tempId = `temp-${
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      }`;
      const tempMessage: ChatMessage = {
        id: tempId,
        roomId: snapshot.room.id,
        senderId: currentUser.id,
        senderAgentId: null,
        senderType: "human",
        content: text,
        targetType: "all",
        status: "processing",
        metadata: null,
        createdAt: new Date().toISOString(),
      };

      appendMessage(tempMessage);

      let response: Response;
      try {
        response = await fetch(`/api/rooms/${snapshot.room.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        });
      } catch {
        removeMessage(tempId);
        return { ok: false, error: "发送失败" };
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        removeMessage(tempId);
        return { ok: false, error: payload.error ?? "发送失败" };
      }

      const payload = (await response.json().catch(() => null)) as {
        message?: ChatMessage;
      } | null;
      if (payload?.message) {
        replaceMessage(tempId, payload.message);
        return { ok: true };
      }
      removeMessage(tempId);
      return { ok: false, error: "发送失败" };
    },
    [snapshot.room.id, currentUser.id, appendMessage, removeMessage, replaceMessage],
  );

  // ── SSE connection / reconnect ─────────────────────────────────────────────

  const reconnectRef = useRef<{ attempt: number; timer: number | null }>({
    attempt: 0,
    timer: null,
  });

  useEffect(() => {
    let cancelled = false;
    let terminated = false;
    let source: EventSource | null = null;
    const reconnect = reconnectRef.current;

    const connect = () => {
      if (cancelled || terminated) return;
      setConnState(
        reconnectRef.current.attempt === 0 ? "connecting" : "reconnecting",
      );
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
            credentials: "same-origin",
          });
          if (response.ok) {
            const user = (await response.json()) as ChatUser;
            redirects?.onAuthMismatch?.(user.id);
            return;
          }
        } catch {
          // Fall back to the unauthenticated route below.
        }
        redirects?.onUnauthenticated?.();
      });

      // Server tells us the room we're viewing was deleted (or we were
      // removed from it).
      source.addEventListener("roomDeleted", () => {
        if (redirectOnRoomDeleted) {
          terminated = true;
          source?.close();
          source = null;
          redirects?.onRoomDeleted?.();
        }
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
  }, [roomId, refresh, redirectOnRoomDeleted, redirects?.onAuthMismatch, redirects?.onUnauthenticated, redirects?.onRoomDeleted]);

  return {
    snapshot,
    setSnapshot,
    connState,
    authSyncing,
    appendMessage,
    replaceMessage,
    removeMessage,
    sendMessage,
    roomId,
  };
}
