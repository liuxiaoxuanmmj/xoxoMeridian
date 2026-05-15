import type { AgentTool } from "@/agent/types";

type TimezoneInput = {
  fromLabel?: string;
  fromTimezone?: string;
  toLabel?: string;
  toTimezone?: string;
};

export function createTimezoneTool(): AgentTool<TimezoneInput> {
  return {
    name: "timezone.compare",
    description: "Compare the current local time for two timezones and return a contact suggestion.",
    schema: {
      type: "object",
      properties: {
        fromTimezone: { type: "string" },
        toTimezone: { type: "string" }
      }
    },
    async execute(input, context) {
      const first = context.runtimeContext.participants[0]?.user;
      const second = context.runtimeContext.participants[1]?.user;
      const fromTimezone = input.fromTimezone ?? first?.profile?.timezone ?? "Asia/Shanghai";
      const toTimezone = input.toTimezone ?? second?.profile?.timezone ?? "Europe/London";

      return {
        from: {
          label: input.fromLabel ?? first?.displayName ?? "本人",
          timezone: fromTimezone,
          time: formatTime(fromTimezone)
        },
        to: {
          label: input.toLabel ?? second?.displayName ?? "对方",
          timezone: toTimezone,
          time: formatTime(toTimezone)
        },
        suggestion: "优先选择双方当地时间 09:00 到 22:30 的重叠时段联系。"
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
