"use client";

import { useEffect, useState } from "react";

import type { ChatUser, LifeMemo, LifeNote, LifeReminder } from "@/components/chat/types";

export function LifePanel({
  participants,
  notes,
  memos,
  reminders
}: {
  participants: ChatUser[];
  notes: LifeNote[];
  memos: LifeMemo[];
  reminders: LifeReminder[];
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const me = participants[0];
  const her = participants[1];

  return (
    <aside className="hidden min-h-0 w-80 shrink-0 overflow-y-auto border-l border-warm-200 bg-white/72 p-4 xl:block">
      <div className="space-y-4">
        <section className="rounded-lg border border-skysoft-100 bg-skysoft-50 p-4">
          <h2 className="text-sm font-semibold text-ink">两地时间</h2>
          <div className="mt-3 space-y-3 text-sm">
            {[me, her].filter(Boolean).map((user) => (
              <div key={user.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{user.displayName}</p>
                  <p className="text-xs text-ink/55">{user.profile?.city ?? "未设置城市"}</p>
                </div>
                <p className="text-right font-semibold text-skysoft-500">{formatTime(now, user.profile?.timezone)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-warm-200 bg-warm-50 p-4">
          <h2 className="text-sm font-semibold text-ink">天气</h2>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            {her?.profile?.city ?? "她那边"}：Mock 天气部分多云，约 16°C。接入真实天气 API 后会由 weather.get 工具刷新。
          </p>
        </section>

        <PanelSection title="提醒事项" empty="还没有提醒事项">
          {reminders.map((reminder) => (
            <div key={reminder.id} className="rounded-lg border border-warm-200 bg-white p-3 text-sm">
              <p className="font-medium text-ink">{reminder.title}</p>
              {reminder.dueAt ? <p className="mt-1 text-xs text-ink/55">{formatDateTime(reminder.dueAt, reminder.timezone)}</p> : null}
            </div>
          ))}
        </PanelSection>

        <PanelSection title="备忘录" empty="还没有备忘录">
          {memos.map((memo) => (
            <div key={memo.id} className="rounded-lg border border-sage-100 bg-white p-3 text-sm">
              <p className="font-medium text-ink">{memo.title}</p>
              <p className="mt-1 leading-5 text-ink/65">{memo.content}</p>
            </div>
          ))}
        </PanelSection>

        <PanelSection title="小便签" empty="还没有便签">
          {notes.map((note) => (
            <div key={note.id} className="rounded-lg border border-warm-200 bg-white p-3 text-sm leading-5 text-ink/70">
              {note.content}
            </div>
          ))}
        </PanelSection>
      </div>
    </aside>
  );
}

function PanelSection({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-ink">{title}</h2>
      <div className="space-y-2">{hasChildren ? children : <p className="rounded-lg border border-dashed border-ink/15 p-3 text-sm text-ink/45">{empty}</p>}</div>
    </section>
  );
}

function formatTime(now: Date, timezone?: string) {
  if (!timezone) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit"
  }).format(now);
}

function formatDateTime(value: string, timezone?: string | null) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone ?? undefined,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
