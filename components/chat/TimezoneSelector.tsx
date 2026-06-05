import type { ChatUser } from "@/components/chat/types";

type TimezoneSelectorProps = {
  value: string;
  onChange: (tz: string) => void;
  participants: ChatUser[];
  label?: string;
};

export function TimezoneSelector({
  value,
  onChange,
  participants,
  label = "时区",
}: TimezoneSelectorProps) {
  const options = buildTimezoneOptions(participants);

  return (
    <div>
      <label className="block text-sm font-medium text-black/70">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-[10px] border border-[#d9d9d9] bg-white px-4 py-3 text-[15px] leading-normal transition-colors duration-200 focus:border-[#3a5b22] focus:ring-2 focus:ring-[#3a5b22]/15 focus:outline-none cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function buildTimezoneOptions(participants: ChatUser[]) {
  const seen = new Set<string>();
  const options: Array<{ label: string; value: string }> = [];

  for (const p of participants) {
    const tz = p.profile?.timezone;
    if (tz && !seen.has(tz)) {
      seen.add(tz);
      options.push({ label: `${p.displayName} (${tz})`, value: tz });
    }
  }

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!seen.has(browserTz)) {
    options.push({ label: `本机 (${browserTz})`, value: browserTz });
  }

  return options;
}

/** 从参与者中获取默认时区 */
export function getDefaultTimezone(participants: ChatUser[]): string {
  return (
    participants[0]?.profile?.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
}
