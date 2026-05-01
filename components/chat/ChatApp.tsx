"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AgentStatusBadge } from "@/components/chat/AgentStatusBadge";
import { LeftRail } from "@/components/chat/LeftRail";
import { LifePanel } from "@/components/chat/LifePanel";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { MessageList } from "@/components/chat/MessageList";
import type { ChatUser, RoomSnapshot } from "@/components/chat/types";

export function ChatApp({
  currentUser,
  initialSnapshot
}: {
  currentUser: ChatUser;
  initialSnapshot: RoomSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [draftPrompt, setDraftPrompt] = useState("");
  const roomId = snapshot.room.id;

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/rooms/${roomId}/messages`);
    if (response.ok) {
      const payload = await response.json();
      setSnapshot((current) => ({
        ...current,
        messages: payload.messages
      }));
    }
  }, [roomId]);

  useEffect(() => {
    const source = new EventSource(`/api/rooms/${roomId}/stream`);
    source.addEventListener("snapshot", (event) => {
      setSnapshot(JSON.parse((event as MessageEvent).data));
    });
    return () => source.close();
  }, [roomId]);

  const participants = useMemo(() => snapshot.room.participants.map((participant) => participant.user), [snapshot.room.participants]);
  const latestStatus = snapshot.agentStatus.recentTasks[0]?.status;

  return (
    <main className="flex h-screen min-h-[720px] flex-col text-ink">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-warm-200 bg-white/80 px-4 backdrop-blur">
        <div>
          <h1 className="text-base font-semibold text-ink">{snapshot.room.name}</h1>
          <p className="text-xs text-ink/50">私密双人聊天室 · 本地 Agent Runtime</p>
        </div>
        <AgentStatusBadge isWorking={snapshot.agentStatus.isWorking} latestStatus={latestStatus} />
      </header>

      <div className="flex min-h-0 flex-1">
        <LeftRail
          currentUser={currentUser}
          participants={participants}
          onQuickPrompt={(prompt) => {
            setDraftPrompt(prompt);
          }}
        />

        <section className="flex min-w-0 flex-1 flex-col">
          <MessageList currentUser={currentUser} messages={snapshot.messages} />
          <MessageComposer externalDraft={draftPrompt} roomId={roomId} onSent={refresh} />
        </section>

        <LifePanel memos={snapshot.memos} notes={snapshot.notes} participants={participants} reminders={snapshot.reminders} />
      </div>
    </main>
  );
}
