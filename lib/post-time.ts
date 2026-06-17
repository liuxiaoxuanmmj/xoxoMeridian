import { normalizeCityName, normalizeCountryName } from "@/lib/geo-normalize";

type LocationProfile = {
  city?: string | null;
  country?: string | null;
  timezone?: string | null;
} | null | undefined;

type PostWithLocation = {
  authorCity?: string | null;
  authorCountry?: string | null;
  authorTimezone?: string | null;
  author?: { profile?: LocationProfile } | null;
};

/** Extract location from user profile for Prisma Post create data. */
export function snapshotProfileLocation(profile: LocationProfile) {
  return {
    authorCity: profile?.city ?? null,
    authorCountry: profile?.country ?? null,
    authorTimezone: profile?.timezone ?? null,
  };
}

/** Resolve display location for formatPostTime: Post snapshot fields take priority, profile is the fallback. */
export function resolveAuthorLocation(post: PostWithLocation) {
  return {
    timezone: post.authorTimezone ?? post.author?.profile?.timezone,
    city: post.authorCity ?? post.author?.profile?.city,
    country: post.authorCountry ?? post.author?.profile?.country,
  };
}

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
