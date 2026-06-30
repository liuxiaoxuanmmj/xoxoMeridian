"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import type { ChatUser, RoomSnapshot } from "@/components/chat/types";
import { MiniRoomChat } from "@/components/study/MiniRoomChat";

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
  currentUser?: ChatUser;
  chatSnapshot?: RoomSnapshot | null;
};

type TimerMode = "focus" | "short" | "long";
const TIMER_DURATIONS: Record<TimerMode, number> = {
  focus: 25,
  short: 5,
  long: 15,
};
const MODE_LABELS: Record<TimerMode, string> = {
  focus: "专注",
  short: "短休",
  long: "长休",
};

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// ── Circular Timer Ring ──────────────────────────────────────────────────────

function TimerRing({
  progress,
  isRunning,
}: {
  progress: number;
  isRunning: boolean;
}) {
  const R = 80;
  const C = 2 * Math.PI * R;

  return (
    <div className="relative flex items-center justify-center">
      {isRunning && (
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 200,
            height: 200,
            background: "#3a5b22",
            opacity: 0.06,
          }}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <svg
        width={190}
        height={190}
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={95}
          cy={95}
          r={R}
          fill="none"
          stroke="#e8e8e8"
          strokeWidth={8}
        />
        <motion.circle
          cx={95}
          cy={95}
          r={R}
          fill="none"
          stroke="#3a5b22"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - progress)}
          transition={{ duration: 0.6, ease: "linear" }}
        />
      </svg>
    </div>
  );
}

// ── Mode Tabs ─────────────────────────────────────────────────────────────────

function ModeTabs({
  mode,
  onModeChange,
  disabled,
}: {
  mode: TimerMode;
  onModeChange: (m: TimerMode) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex rounded-[10px] bg-[#f1f5f0] p-1 gap-1">
      {(Object.keys(MODE_LABELS) as TimerMode[]).map((m) => {
        const active = mode === m;
        const isPlaceholder = m !== "focus";
        return (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            disabled={disabled}
            className={`px-4 py-1.5 rounded-[8px] text-xs font-medium transition-colors ${
              active
                ? "bg-white text-[#3a5b22] shadow-sm"
                : isPlaceholder
                  ? "text-black/25"
                  : "text-black/40 hover:text-black/60"
            }`}
            title={isPlaceholder ? "即将推出" : undefined}
          >
            {MODE_LABELS[m]}
            {isPlaceholder && (
              <span className="ml-1 text-[9px] align-super opacity-50">
                soon
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-[10px] border border-[#e8e8e8] bg-[#fafbfc] p-4">
      <p className="text-[11px] text-black/40">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[#3a5b22]">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-black/30">{sub}</p>}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export function StudyDashboard({ initialData }: { initialData: StudyPageData }) {
  const [data, setData] = useState(initialData);
  const [busy, setBusy] = useState<null | "start" | "stop">(null);
  const [mode, setMode] = useState<TimerMode>("focus");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const plannedSeconds = (TIMER_DURATIONS[mode] ?? 25) * 60;
  const remainingSeconds = Math.max(0, plannedSeconds - elapsedSeconds);
  const progress = plannedSeconds > 0 ? elapsedSeconds / plannedSeconds : 0;
  const isRunning = data.currentState.status === "focusing";

  // Tick every second while focusing
  useEffect(() => {
    if (!isRunning) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = data.currentState.startedAt
      ? new Date(data.currentState.startedAt).getTime()
      : Date.now();
    setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRunning, data.currentState.startedAt]);

  const displayTime = useMemo(() => {
    if (isRunning) return formatCountdown(remainingSeconds);
    return formatCountdown(plannedSeconds);
  }, [isRunning, remainingSeconds, plannedSeconds]);

  const startFocus = useCallback(async () => {
    if (busy) return;
    setBusy("start");
    try {
      const response = await fetch("/api/study/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannedMinutes: TIMER_DURATIONS[mode] }),
      });
      if (response.ok) {
        const result = await response.json();
        setData((prev) => ({ ...prev, currentState: result.state }));
      }
    } finally {
      setBusy(null);
    }
  }, [busy, mode]);

  const stopFocus = useCallback(async () => {
    if (busy) return;
    setBusy("stop");
    try {
      const response = await fetch("/api/study/stop", { method: "POST" });
      if (response.ok) {
        const result = await response.json();
        setData((prev) => ({
          ...prev,
          currentState: { ...result.state, plannedMinutes: prev.currentState.plannedMinutes },
        }));
        // Refresh full data to get updated stats
        const refreshResponse = await fetch("/api/study", { cache: "no-store" });
        if (refreshResponse.ok) {
          setData(await refreshResponse.json());
        }
      }
    } finally {
      setBusy(null);
    }
  }, [busy]);

  const todayHours = Math.floor(data.stats.todayMinutes / 60);
  const todayMins = data.stats.todayMinutes % 60;
  const todayFocusStr = data.stats.todayMinutes > 0
    ? `${todayHours}h ${todayMins}m`
    : "0m";

  return (
    <div className="space-y-5">
      {/* ── Main Grid: Sidebar + Timer ── */}
      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        {/* ── Left Sidebar ── */}
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.08 }}
          className="flex flex-col gap-4"
        >
          {/* Stats */}
          <section className="rounded-[10px] border border-[#e8e8e8] bg-white p-5">
            <h2 className="text-xs font-semibold text-black/50 uppercase tracking-wider mb-4">
              今日概览
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-black/60">专注番茄</span>
                <span className="text-sm font-semibold text-[#3a5b22]">
                  {data.stats.todayCount} 个
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-black/60">累计专注</span>
                <span className="text-sm font-semibold text-black">
                  {todayFocusStr}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-black/60">本周番茄</span>
                <span className="text-sm font-semibold text-[#3a5b22]">
                  {data.stats.weekCount} 个
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-black/60">本周分钟</span>
                <span className="text-sm font-semibold text-black">
                  {data.stats.weekMinutes} min
                </span>
              </div>
            </div>
          </section>

          {/* Placeholder: Goals */}
          <section className="rounded-[10px] border border-[#e8e8e8] bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-black/50 uppercase tracking-wider">
                今日清单
              </h2>
              <span className="text-[10px] text-black/25 bg-[#f1f5f0] px-1.5 py-0.5 rounded-full">
                soon
              </span>
            </div>
            <p className="text-xs text-black/30 leading-relaxed">
              专注时记录待办事项。
              <br />
              完成一项勾选一项。
            </p>
          </section>

          {/* Placeholder: Quote */}
          <div className="rounded-[10px] border border-[#e8e8e8] bg-[#2a2420] p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full bg-red-400/70" />
              <div className="w-2 h-2 rounded-full bg-yellow-400/70" />
              <div className="w-2 h-2 rounded-full bg-green-400/70" />
            </div>
            <p className="text-xs leading-relaxed text-[#7da878] font-mono">
              <span className="text-black/40">$ </span>
              学如逆水行舟，
              <br />
              <span className="text-black/40">  </span>
              不进则退。
            </p>
          </div>
        </motion.div>

        {/* ── Center: Timer ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="flex flex-col gap-4"
        >
          {/* Timer Card */}
          <section className="rounded-[10px] border border-[#e8e8e8] bg-white p-8 flex flex-col items-center shadow-sm">
            {/* Mode tabs */}
            <ModeTabs
              mode={mode}
              onModeChange={setMode}
              disabled={isRunning}
            />

            {/* Ring + Time display */}
            <div className="relative flex items-center justify-center mt-6 mb-5">
              <TimerRing progress={progress} isRunning={isRunning} />
              <div className="absolute flex flex-col items-center">
                <motion.div
                  key={mode}
                  className="text-[10px] font-semibold uppercase tracking-widest mb-1 text-[#3a5b22]/60"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.6 }}
                >
                  {MODE_LABELS[mode]}
                </motion.div>
                <motion.div
                  key={displayTime}
                  className="text-5xl font-bold tabular-nums text-black"
                  animate={isRunning ? { opacity: [1, 0.85, 1] } : {}}
                  transition={{ duration: 2.4, repeat: Infinity }}
                >
                  {displayTime}
                </motion.div>
                {/* Pomodoro dots */}
                <div className="flex gap-1 mt-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full transition-colors duration-300"
                      style={{
                        backgroundColor:
                          i < data.stats.todayCount % 4
                            ? "#3a5b22"
                            : "#e8e8e8",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3">
              <AnimatePresence mode="wait">
                {isRunning ? (
                  <motion.button
                    key="stop"
                    type="button"
                    onClick={stopFocus}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    whileTap={{ scale: 0.94 }}
                    className="rounded-[10px] bg-[#3a5b22] px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#2f4d1c] disabled:opacity-50"
                    disabled={busy !== null}
                  >
                    {busy === "stop" ? "结束中…" : "结束专注"}
                  </motion.button>
                ) : (
                  <motion.button
                    key="start"
                    type="button"
                    onClick={startFocus}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    whileTap={{ scale: 0.94 }}
                    className="rounded-[10px] bg-[#3a5b22] px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#2f4d1c] disabled:opacity-50"
                    disabled={busy !== null}
                  >
                    {busy === "start" ? "开始中…" : "开始专注"}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Status text */}
            <AnimatePresence>
              {isRunning && (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="text-xs text-black/40 mt-4"
                >
                  专注中 · 保持专注，你做得很好 ✨
                </motion.p>
              )}
            </AnimatePresence>

            {/* Placeholder hints */}
            <div className="mt-4 flex gap-3 text-xs text-black/25">
              <span>自定义时长 · 待实现</span>
              <span>短休/长休 · 待实现</span>
            </div>
          </section>

          {/* Ambient Sounds Placeholder */}
          <section className="rounded-[10px] border border-[#e8e8e8] bg-white p-5">
            <h2 className="text-xs font-semibold text-black/50 uppercase tracking-wider mb-4">
              氛围音效
            </h2>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "雨声", icon: "🌧" },
                { label: "咖啡馆", icon: "☕" },
                { label: "森林", icon: "🌿" },
                { label: "轻音乐", icon: "🎵" },
              ].map((sound) => (
                <div
                  key={sound.label}
                  className="flex flex-col items-center gap-1 rounded-[10px] border border-[#e8e8e8] bg-[#fafbfc] px-2 py-3 text-center opacity-40 cursor-not-allowed"
                  title="即将推出"
                >
                  <span className="text-lg">{sound.icon}</span>
                  <span className="text-[10px] text-black/40">{sound.label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Motivation strip */}
          <div className="rounded-[10px] border border-[#e8e8e8] bg-gradient-to-r from-[#f1f5f0] to-[#eaf0ea] px-5 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-black">
                今日已专注 {todayFocusStr}
              </p>
              <p className="text-xs text-black/40">
                {data.stats.weekCount > 0
                  ? `本周累计 ${data.stats.weekCount} 次 · 继续加油 🌱`
                  : "开始你的第一次专注吧 🌱"}
              </p>
            </div>
            <div className="flex gap-0.5 items-end">
              {Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 rounded-sm"
                  style={{
                    backgroundColor:
                      i < Math.min(data.stats.todayCount, 7)
                        ? "#3a5b22"
                        : "#e8e8e8",
                    height: 8 + (i % 3) * 4,
                  }}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Recent Sessions ── */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16 }}
        className="rounded-[10px] border border-[#e8e8e8] bg-white p-6 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-black/50 uppercase tracking-wider">
            最近记录
          </h2>
          <span className="text-[10px] text-black/25">与时间轴联动</span>
        </div>
        <div className="mt-4 space-y-2">
          {data.recentSessions.length === 0 ? (
            <p className="text-xs text-black/40 py-4 text-center">
              还没有完成的专注记录。
            </p>
          ) : (
            data.recentSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-[10px] border border-[#e8e8e8] bg-[#fafbfc] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-black">
                    {session.actualMinutes} 分钟
                  </p>
                  <p className="text-xs text-black/40">
                    {new Date(session.startedAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" — "}
                    {new Date(session.endedAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className="text-[10px] text-[#3a5b22]/60">已写入时间轴</span>
              </div>
            ))
          )}
        </div>
      </motion.section>

      {/* ── Mini Room Chat ── */}
      {data.chatSnapshot && data.currentUser && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-[10px] border border-[#e8e8e8] bg-white shadow-sm overflow-hidden"
        >
          <MiniRoomChat
            currentUser={data.currentUser}
            initialSnapshot={data.chatSnapshot}
          />
        </motion.section>
      )}
    </div>
  );
}
