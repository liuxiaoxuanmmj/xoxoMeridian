"use client";

import type { ChatUser } from "@/components/chat/types";

export function LeftRail({
  currentUser,
  participants,
  onQuickPrompt
}: {
  currentUser: ChatUser;
  participants: ChatUser[];
  onQuickPrompt: (prompt: string) => void;
}) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-warm-200 bg-white/72 p-4 lg:block">
      <div className="space-y-5">
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
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-ink">快捷工具</h2>
          <div className="mt-3 space-y-2">
            <QuickButton label="查她那边天气" onClick={() => onQuickPrompt("@小助手 查一下她那边今天的天气")} />
            <QuickButton label="看看两地时间" onClick={() => onQuickPrompt("@小助手 比较一下我们现在的时差和适合联系时间")} />
            <QuickButton label="创建早安提醒" onClick={() => onQuickPrompt("@小助手 明天提醒我给她发早安")} />
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
