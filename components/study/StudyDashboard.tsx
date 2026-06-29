"use client";

import { useEffect, useMemo, useState } from "react";

type StudyPageData = {
  currentState: {
    status: "idle" | "focusing";
    plannedMinutes: number;
    startedAt: string | null;
    expectedEndAt: string | null;
  };
  recentSessions: Array<{
    id: string;
    userId: string;
    startedAt: string;
    endedAt: string;
    actualMinutes: number;
  }>;
  stats: {
    todayCount: number;
    todayMinutes: number;
    weekCount: number;
    weekMinutes: number;
  };
};

function formatCountdown(expectedEndAt: string | null, fallbackMinutes: number) {
  if (!expectedEndAt) return `${String(fallbackMinutes).padStart(2, "0")}:00`;
  const diff = Math.max(0, new Date(expectedEndAt).getTime() - Date.now());
  const minutes = Math.floor(diff / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function StudyDashboard({ initialData }: { initialData: StudyPageData }) {
  const [data, setData] = useState(initialData);
  const [busy, setBusy] = useState<null | "start" | "stop">(null);
  const countdown = useMemo(
    () => formatCountdown(data.currentState.expectedEndAt, data.currentState.plannedMinutes),
    [data.currentState.expectedEndAt, data.currentState.plannedMinutes]
  );

  useEffect(() => {
    if (data.currentState.status !== "focusing") return;
    const timer = window.setInterval(() => setData((current) => ({ ...current })), 1000);
    return () => window.clearInterval(timer);
  }, [data.currentState.status]);

  async function refresh() {
    const response = await fetch("/api/study", { cache: "no-store" });
    if (!response.ok) return;
    setData(await response.json());
  }

  async function startFocus() {
    if (busy) return;
    setBusy("start");
    try {
      const response = await fetch("/api/study/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (response.ok) await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function stopFocus() {
    if (busy) return;
    setBusy("stop");
    try {
      const response = await fetch("/api/study/stop", { method: "POST" });
      if (response.ok) await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[#e4ecfc] bg-white p-8 shadow-sm">
        <p className="text-sm text-black/50">
          {data.currentState.status === "focusing" ? "专注中" : "空闲中"}
        </p>
        <div className="mt-3 text-6xl font-semibold text-[#0f172a]">{countdown}</div>
        <div className="mt-6">
          {data.currentState.status === "focusing" ? (
            <button type="button" onClick={stopFocus} className="rounded-[10px] bg-[#059669] px-4 py-2 text-white">
              {busy === "stop" ? "结束中…" : "结束专注"}
            </button>
          ) : (
            <button type="button" onClick={startFocus} className="rounded-[10px] bg-[#2563eb] px-4 py-2 text-white">
              {busy === "start" ? "开始中…" : "开始专注"}
            </button>
          )}
        </div>
        <div className="mt-4 flex gap-3 text-xs text-black/40">
          <span>自定义时长 · 待实现</span>
          <span>休息模式 · 待实现</span>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-[#e4ecfc] bg-white p-4"><p>今日番茄</p><strong>{data.stats.todayCount}</strong></div>
        <div className="rounded-lg border border-[#e4ecfc] bg-white p-4"><p>今日分钟</p><strong>{data.stats.todayMinutes}</strong></div>
        <div className="rounded-lg border border-[#e4ecfc] bg-white p-4"><p>本周番茄</p><strong>{data.stats.weekCount}</strong></div>
        <div className="rounded-lg border border-[#e4ecfc] bg-white p-4"><p>本周分钟</p><strong>{data.stats.weekMinutes}</strong></div>
      </section>

      <section className="rounded-lg border border-[#e4ecfc] bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-black">最近记录</h2>
          <span className="text-xs text-black/40">与时间轴联动</span>
        </div>
        <div className="mt-4 space-y-3">
          {data.recentSessions.length === 0 ? (
            <p className="text-sm text-black/40">还没有完成的专注记录。</p>
          ) : (
            data.recentSessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between rounded-[10px] border border-[#e4ecfc] px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-black">
                    {session.actualMinutes} 分钟
                  </p>
                  <p className="text-xs text-black/40">
                    {new Date(session.startedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                    {" - "}
                    {new Date(session.endedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <span className="text-xs text-[#059669]">已写入时间轴</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
