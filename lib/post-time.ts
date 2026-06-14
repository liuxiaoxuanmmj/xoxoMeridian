import { normalizeCityName, normalizeCountryName } from "@/lib/geo-normalize";

export function formatPostTime(
  date: Date,
  opts?: { timezone?: string | null; city?: string | null; country?: string | null } | null
): string {
  const tz = opts?.timezone || "UTC";
  const formatted = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }).format(date);

  const city = opts?.city ? normalizeCityName(opts.city) : null;
  const country = normalizeCountryName(opts?.country);

  let location: string;
  if (city && country) {
    location = `${city}, ${country}`;
  } else if (city) {
    location = city;
  } else if (country) {
    location = country;
  } else {
    location = "—";
  }

  return `${formatted}  ${location}`;
}
