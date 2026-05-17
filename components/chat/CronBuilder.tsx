"use client";

import { useMemo } from "react";

type CronBuilderProps = {
  value: string;
  onChange: (cron: string) => void;
};

const WEEKDAYS_DOW = "1-5";

const WEEKDAYS = [
  { label: "一", value: "1" },
  { label: "二", value: "2" },
  { label: "三", value: "3" },
  { label: "四", value: "4" },
  { label: "五", value: "5" },
  { label: "六", value: "6" },
  { label: "日", value: "0" },
];

const ACTIVE_CLS = "border-sage-500 bg-sage-50 font-medium text-sage-700";
const INACTIVE_CLS = "border-warm-200 text-ink/60 hover:border-warm-300";

const DOW_NAMES: Record<string, string> = {
  "0": "周日",
  "1": "周一",
  "2": "周二",
  "3": "周三",
  "4": "周四",
  "5": "周五",
  "6": "周六",
};

function isWeekdaySet(set: Set<string>): boolean {
  return set.size === 5 && ["1", "2", "3", "4", "5"].every((d) => set.has(d));
}

export function CronBuilder({ value, onChange }: CronBuilderProps) {
  const { parts, selected, description } = useMemo(() => {
    const p = parseCronParts(value);
    const s = parseDowSet(p.dow);
    return { parts: p, selected: s, description: describeCron(p) };
  }, [value]);

  const isAllDays = parts.dow === "*" || selected.size === 7;

  const updateTime = (hour: string, minute: string) => {
    const h = clamp(parseInt(hour) || 0, 0, 23);
    const m = clamp(parseInt(minute) || 0, 0, 59);
    onChange(`${m} ${h} * * ${parts.dow}`);
  };

  const toggleDay = (day: string) => {
    const next = new Set(selected);
    if (next.has(day)) {
      next.delete(day);
    } else {
      next.add(day);
    }
    const dow = next.size === 0 ? "*" : serializeDow(next);
    onChange(`${parts.minute} ${parts.hour} * * ${dow}`);
  };

  const setShortcut = (dow: string) => {
    onChange(`${parts.minute} ${parts.hour} * * ${dow}`);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-ink/70">
          执行时间
        </label>
        <div className="mt-1 flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={23}
            value={parts.hour}
            onChange={(e) => updateTime(e.target.value, parts.minute)}
            className="w-16 rounded border border-warm-300 px-2 py-1.5 text-center text-sm focus:border-sage-400 focus:outline-none"
          />
          <span className="text-ink/50">:</span>
          <input
            type="number"
            min={0}
            max={59}
            value={parts.minute}
            onChange={(e) => updateTime(parts.hour, e.target.value)}
            className="w-16 rounded border border-warm-300 px-2 py-1.5 text-center text-sm focus:border-sage-400 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-ink/70">
          重复日期
        </label>
        <div className="mt-1 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setShortcut("*")}
            className={`rounded border px-2 py-1 text-xs ${isAllDays ? ACTIVE_CLS : INACTIVE_CLS}`}
          >
            每天
          </button>
          <button
            type="button"
            onClick={() => setShortcut(WEEKDAYS_DOW)}
            className={`rounded border px-2 py-1 text-xs ${
              isWeekdaySet(selected) && !isAllDays ? ACTIVE_CLS : INACTIVE_CLS
            }`}
          >
            工作日
          </button>
          <span className="mx-0.5" />
          {WEEKDAYS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => toggleDay(d.value)}
              className={`w-7 rounded border py-1 text-xs ${
                !isAllDays && selected.has(d.value) ? ACTIVE_CLS : INACTIVE_CLS
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <p className="rounded bg-skysoft-50 px-3 py-1.5 text-xs text-skysoft-500">
        {description}
      </p>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function parseCronParts(cron: string) {
  const fields = cron.trim().split(/\s+/);
  return {
    minute: fields[0] ?? "0",
    hour: fields[1] ?? "9",
    dom: fields[2] ?? "*",
    month: fields[3] ?? "*",
    dow: fields[4] ?? "*",
  };
}

function parseDowSet(dow: string): Set<string> {
  if (dow === "*") return new Set<string>();

  const set = new Set<string>();
  for (const part of dow.split(",")) {
    const trimmed = part.trim();
    const range = trimmed.match(/^(\d)-(\d)$/);
    if (range) {
      const start = parseInt(range[1]);
      const end = parseInt(range[2]);
      for (let i = start; i <= end; i++) set.add(String(i));
    } else if (/^\d$/.test(trimmed)) {
      set.add(trimmed);
    }
  }
  return set;
}

function serializeDow(set: Set<string>): string {
  return Array.from(set)
    .map(Number)
    .sort((a, b) => a - b)
    .join(",");
}

function describeCron(parts: ReturnType<typeof parseCronParts>): string {
  const timeStr = describeTime(parts.minute, parts.hour);
  const dowStr = describeDow(parts.dow);
  return `${dowStr}${timeStr}执行`;
}

function describeTime(minute: string, hour: string): string {
  if (hour.startsWith("*/")) return `每 ${parseInt(hour.slice(2))} 小时`;
  if (minute.startsWith("*/")) return `每 ${parseInt(minute.slice(2))} 分钟`;
  if (hour === "*") return `每小时的第 ${minute.padStart(2, "0")} 分`;
  return ` ${hour.padStart(2, "0")}:${minute.padStart(2, "0")} `;
}

function describeDow(dow: string): string {
  if (dow === "*") return "每天";

  const set = parseDowSet(dow);
  if (set.size === 7) return "每天";
  if (isWeekdaySet(set)) return "工作日";
  if (set.size === 2 && set.has("0") && set.has("6")) return "周末";

  const sorted = Array.from(set)
    .map(Number)
    .sort((a, b) => a - b);
  return `每${sorted.map((d) => DOW_NAMES[String(d)] ?? `周${d}`).join("、")}`;
}
