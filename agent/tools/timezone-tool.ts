import type { AgentTool } from "@/agent/types";
import { NO_TOOL_RETRY } from "@/agent/tool-errors";
import { resolveParticipantPair } from "@/lib/participant-resolution";

type TimezoneInput = {
  fromLabel?: string;
  fromTimezone?: string;
  toLabel?: string;
  toTimezone?: string;
};

export function createTimezoneTool(): AgentTool<TimezoneInput> {
  return {
    name: "timezone.compare",
    risk: "low",
    retry: NO_TOOL_RETRY,
    description: "Compare the current local time for two timezones and return a contact suggestion.",
    schema: {
      type: "object",
      properties: {
        fromTimezone: { type: "string" },
        toTimezone: { type: "string" }
      }
    },
    async execute(input, context) {
      const { self, partner } = resolveParticipantPair(
        context.runtimeContext.participants,
        context.requestedById,
        (participant) => participant.userId
      );
      const fromTimezone = input.fromTimezone ?? self?.user.profile?.timezone ?? "Asia/Shanghai";
      const toTimezone = input.toTimezone ?? partner?.user.profile?.timezone ?? "Europe/London";

      const fromLabel = input.fromLabel ?? self?.user.displayName ?? "本人";
      const toLabel = input.toLabel ?? partner?.user.displayName ?? "对方";

      return {
        from: {
          label: fromLabel,
          timezone: fromTimezone,
          time: formatTime(fromTimezone)
        },
        to: {
          label: toLabel,
          timezone: toTimezone,
          time: formatTime(toTimezone)
        },
        suggestion: computeContactSuggestion(fromTimezone, toTimezone, fromLabel, toLabel)
      };
    }
  };
}

function formatTime(timeZone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date());
}

function getUtcOffsetMinutes(timeZone: string): number {
  const now = new Date();
  const utc = now.toLocaleString("en-US", { timeZone: "UTC" });
  const local = now.toLocaleString("en-US", { timeZone });
  return Math.round((new Date(local).getTime() - new Date(utc).getTime()) / 60_000);
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatHours(minutes: number): string {
  const h = minutes / 60;
  return Number.isInteger(h) ? `${h}` : h.toFixed(1);
}

function computeContactSuggestion(
  fromTz: string,
  toTz: string,
  fromLabel: string,
  toLabel: string
): string {
  const COMFORT_START = 9 * 60;      // 09:00
  const COMFORT_END = 22 * 60 + 30;  // 22:30

  const fromOffset = getUtcOffsetMinutes(fromTz);
  const toOffset = getUtcOffsetMinutes(toTz);
  const diff = toOffset - fromOffset;

  if (diff === 0) {
    return "两地没有时差，09:00–22:30 之间随时都方便联系。";
  }

  const diffHoursStr = formatHours(Math.abs(diff));

  // In 'from' person's local time, overlap of both sides' 09:00–22:30 window:
  //   from ∈ [COMFORT_START, COMFORT_END]
  //   to = from + diff ∈ [COMFORT_START, COMFORT_END]
  //     ⇒ from ∈ [COMFORT_START − diff, COMFORT_END − diff]
  const overlapStart = Math.max(COMFORT_START, COMFORT_START - diff);
  const overlapEnd = Math.min(COMFORT_END, COMFORT_END - diff);

  if (overlapStart >= overlapEnd) {
    return `两地时差 ${diffHoursStr} 小时，双方 09:00–22:30 没有重叠，需要一方迁就较早或较晚的时间才能联系。`;
  }

  const overlapHoursStr = formatHours(overlapEnd - overlapStart);
  const fromWindow = `${minutesToHHMM(overlapStart)}–${minutesToHHMM(overlapEnd)}`;
  const toWindow = `${minutesToHHMM(overlapStart + diff)}–${minutesToHHMM(overlapEnd + diff)}`;

  if (overlapEnd - overlapStart <= 120) {
    return `两地时差 ${diffHoursStr} 小时，适合联系的窗口较窄：${fromLabel}方 ${fromWindow} / ${toLabel}方 ${toWindow}（仅重叠 ${overlapHoursStr} 小时），建议提前约好时间。`;
  }

  return `两地时差 ${diffHoursStr} 小时，建议在 ${fromLabel}方 ${fromWindow} / ${toLabel}方 ${toWindow} 联系（重叠 ${overlapHoursStr} 小时）。`;
}
