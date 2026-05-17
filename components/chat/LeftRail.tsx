"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import type { ChatUser, RoomSummary } from "@/components/chat/types";
import { MENTION_AGENT } from "@/lib/identity";

export function LeftRail({
  currentUser,
  participants,
  currentRoomId,
  rooms,
  onQuickPrompt
}: {
  currentUser: ChatUser;
  participants: ChatUser[];
  currentRoomId: string;
  rooms: RoomSummary[];
  onQuickPrompt: (prompt: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "create" | "wipe" | "delete">(null);

  const onCreate = async () => {
    if (busy) return;
    setBusy("create");
    try {
      const resp = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!resp.ok) throw new Error(`create failed: ${resp.status}`);
      const data = await resp.json();
      router.push(`/chat/${data.room.id}`);
    } catch (err) {
      alert(`创建会话失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const onWipe = async () => {
    if (busy) return;
    if (!confirm("清空当前会话的所有消息 / 备忘 / 提醒 / 记忆？房间本身保留。此操作不可撤销。")) return;
    setBusy("wipe");
    try {
      const resp = await fetch(`/api/rooms/${currentRoomId}/messages`, { method: "DELETE" });
      if (!resp.ok) throw new Error(`wipe failed: ${resp.status}`);
      router.refresh();
    } catch (err) {
      alert(`清空失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async () => {
    if (busy) return;
    if (!confirm("删除整个会话窗口（含所有数据）？此操作不可撤销。")) return;
    setBusy("delete");
    try {
      const resp = await fetch(`/api/rooms/${currentRoomId}`, { method: "DELETE" });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error ?? `delete failed: ${resp.status}`);
      }
      router.push("/chat");
    } catch (err) {
      alert(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <aside className="hidden w-64 shrink-0 border-r border-warm-200 bg-white/72 p-4 lg:block">
      <div className="space-y-5">
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">会话列表</h2>
            <button
              type="button"
              onClick={onCreate}
              disabled={busy !== null}
              className="rounded border border-sage-300 bg-sage-50 px-2 py-0.5 text-xs font-medium text-sage-700 hover:bg-sage-100 disabled:opacity-50"
            >
              + 新建
            </button>
          </div>
          <div className="mt-2 max-h-60 space-y-1 overflow-y-auto">
            {rooms.map((room) => {
              const active = room.id === currentRoomId;
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => !active && router.push(`/chat/${room.id}`)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs ${
                    active
                      ? "bg-sage-100 font-medium text-sage-800"
                      : "text-ink/70 hover:bg-warm-100"
                  }`}
                >
                  <span className="truncate">{room.name}</span>
                  <span className="ml-2 shrink-0 text-[10px] text-ink/40">{room.messageCount}</span>
                </button>
              );
            })}
            {rooms.length === 0 && <p className="px-2 py-1 text-xs text-ink/40">载入中…</p>}
          </div>
          <div className="mt-2 flex gap-1">
            <button
              type="button"
              onClick={onWipe}
              disabled={busy !== null}
              className="flex-1 rounded border border-warm-300 bg-white px-2 py-1 text-xs text-ink/70 hover:bg-warm-100 disabled:opacity-50"
              title="清空当前会话的所有数据，保留房间"
            >
              {busy === "wipe" ? "清空中…" : "清空当前"}
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy !== null}
              className="flex-1 rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
              title="彻底删除整个会话窗口"
            >
              {busy === "delete" ? "删除中…" : "删除会话"}
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-ink">房间成员</h2>
          <div className="mt-3 space-y-2">
            {participants.map((user) => (
              <div key={user.id} className="flex items-center gap-3 rounded-lg border border-warm-200 bg-white p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-warm-100 text-sm font-semibold text-warm-700">
                  {user.avatarLabel}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {user.displayName}
                    {user.id === currentUser.id ? " · 当前" : ""}
                  </p>
                  <p className="truncate text-xs text-ink/50">{user.profile?.city ?? "未设置城市"}</p>
                  {user.id === currentUser.id ? (
                    <Link className="text-[11px] text-sage-700 hover:underline" href="/me">
                      个人设置
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-ink">快捷工具</h2>
          <div className="mt-3 space-y-2">
            <QuickButton label="查对方天气" onClick={() => onQuickPrompt(`${MENTION_AGENT} 查一下对方今天的天气`)} />
            <QuickButton label="看看两地时间" onClick={() => onQuickPrompt(`${MENTION_AGENT} 比较一下我们现在的时差和适合联系时间`)} />
            <QuickButton label="创建早安提醒" onClick={() => onQuickPrompt(`${MENTION_AGENT} 明天提醒我给对方发早安`)} />
          </div>
        </section>
      </div>
    </aside>
  );
}

function QuickButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="w-full rounded-lg border border-sage-100 bg-sage-50 px-3 py-2 text-left text-sm font-medium text-sage-700 transition hover:bg-sage-100"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
