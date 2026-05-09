"use client";

import { useEffect, useState } from "react";

import type { ChatUser, LifeMemo, LifeNote, LifeReminder, LifeScheduledJob } from "@/components/chat/types";

type WeatherSnapshot = {
  provider: "qweather" | "mock";
  city?: string;
  condition?: string;
  temperatureC?: number;
  feelsLikeC?: number;
  humidityPercent?: number;
  wind?: { direction?: string; scale?: string };
  advice?: string;
  fallbackReason?: string;
};

type WeatherResult = {
  subject: "self" | "partner";
  displayName: string;
  city: string | null;
  snapshot: WeatherSnapshot | null;
  error: string | null;
};

const WEATHER_REFRESH_MS = 10 * 60 * 1000;

export function LifePanel({
  roomId,
  participants,
  notes,
  memos,
  reminders,
  scheduledJobs
}: {
  roomId: string;
  participants: ChatUser[];
  notes: LifeNote[];
  memos: LifeMemo[];
  reminders: LifeReminder[];
  scheduledJobs: LifeScheduledJob[];
}) {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/rooms/${roomId}/weather?who=partner`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as { results?: WeatherResult[] };
        if (cancelled) return;
        setWeather(payload.results?.[0] ?? null);
      } catch {
        if (!cancelled) setWeather(null);
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    }

    setWeatherLoading(true);
    void load();
    const timer = setInterval(load, WEATHER_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [roomId]);

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
          {weatherLoading && !weather ? (
            <p className="mt-2 text-sm leading-6 text-ink/55">读取天气中…</p>
          ) : weather?.snapshot ? (
            <WeatherCard result={weather} />
          ) : (
            <p className="mt-2 text-sm leading-6 text-ink/55">
              {weather?.error === "city not set on profile"
                ? `${weather.displayName ?? "她那边"}还没有设置城市`
                : "暂时拿不到天气，稍后会自动重试。"}
            </p>
          )}
        </section>

        <PanelSection title="提醒事项" empty="还没有提醒事项">
          {reminders.map((reminder) => (
            <div key={reminder.id} className="rounded-lg border border-warm-200 bg-white p-3 text-sm">
              <p className="font-medium text-ink">{reminder.title}</p>
              {reminder.dueAt ? <p className="mt-1 text-xs text-ink/55">{formatDateTime(reminder.dueAt, reminder.timezone)}</p> : null}
            </div>
          ))}
        </PanelSection>

        <PanelSection title="周期任务" empty="还没有周期任务">
          {scheduledJobs.map((job) => {
            const description = typeof job.payload?.description === "string" ? job.payload.description : null;
            const prompt = typeof job.payload?.prompt === "string" ? job.payload.prompt : null;
            const runOnce = job.payload?.runOnce === true;
            return (
              <div key={job.id} className="rounded-lg border border-sage-100 bg-white p-3 text-sm">
                <p className="font-medium text-ink">{description ?? prompt ?? job.cron}</p>
                <p className="mt-1 text-xs text-ink/55">
                  {runOnce
                    ? `一次性 · ${formatDateTime(job.nextRunAt, job.timezone)}`
                    : `下次：${formatDateTime(job.nextRunAt, job.timezone)} · ${job.cron}`}
                </p>
              </div>
            );
          })}
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

function WeatherCard({ result }: { result: WeatherResult }) {
  const snap = result.snapshot!;
  const isMock = snap.provider !== "qweather";
  const city = snap.city ?? result.city ?? result.displayName;
  const tempC = snap.temperatureC;
  const feelsC = snap.feelsLikeC;
  const wind = snap.wind?.direction && snap.wind?.scale ? `${snap.wind.direction} ${snap.wind.scale} 级` : null;

  const line1Parts = [
    `${city}${snap.condition ? `，${snap.condition}` : ""}`,
    tempC !== undefined ? `${tempC}°C` : null,
    feelsC !== undefined ? `体感 ${feelsC}°C` : null
  ].filter(Boolean);

  const line2Parts = [
    snap.humidityPercent !== undefined ? `湿度 ${snap.humidityPercent}%` : null,
    wind
  ].filter(Boolean);

  return (
    <div className="mt-2 space-y-1 text-sm leading-6 text-ink/75">
      <p className="text-ink">{line1Parts.join("，")}</p>
      {line2Parts.length ? <p className="text-xs text-ink/55">{line2Parts.join(" · ")}</p> : null}
      {snap.advice ? <p className="text-xs text-ink/55">{snap.advice}</p> : null}
      {isMock ? (
        <p className="text-[11px] text-amber-700/80">
          正在使用 Mock 数据{snap.fallbackReason ? `（${snap.fallbackReason}）` : ""}
        </p>
      ) : null}
    </div>
  );
}
