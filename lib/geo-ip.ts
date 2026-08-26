import { isIP } from "node:net";
import { headers } from "next/headers";

import { normalizeCityName, normalizeCountryName } from "@/lib/geo-normalize";
import { prisma } from "@/lib/prisma";

export type GeoIpResult = {
  city: string;
  country: string;
  timezone: string;
};

const PRIVATE_IPV4_RANGES = [
  { start: ip4ToNum("10.0.0.0"), end: ip4ToNum("10.255.255.255") },
  { start: ip4ToNum("172.16.0.0"), end: ip4ToNum("172.31.255.255") },
  { start: ip4ToNum("192.168.0.0"), end: ip4ToNum("192.168.255.255") },
  { start: ip4ToNum("127.0.0.0"), end: ip4ToNum("127.255.255.255") },
  { start: ip4ToNum("169.254.0.0"), end: ip4ToNum("169.254.255.255") },
  { start: ip4ToNum("0.0.0.0"), end: ip4ToNum("0.255.255.255") },
  { start: ip4ToNum("224.0.0.0"), end: ip4ToNum("239.255.255.255") },
];

function ip4ToNum(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3];
}

function isPublicIPv4(ip: string): boolean {
  const num = ip4ToNum(ip);
  return !PRIVATE_IPV4_RANGES.some((r) => num >= r.start && num <= r.end);
}

function isPublicIPv6(ip: string): boolean {
  if (ip === "::1" || ip === "::") return false;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return false; // fc00::/7
  if (ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb")) return false; // fe80::/10
  return true;
}

function isPublicIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 0) return false;
  if (kind === 4) return isPublicIPv4(ip);
  return isPublicIPv6(ip);
}

export async function getPublicClientIp(): Promise<string | null> {
  const headersList = await headers();
  const forwarded = headersList.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first && isPublicIp(first)) return first;
  }
  const realIp = headersList.get("x-real-ip");
  if (realIp) {
    const trimmed = realIp.trim();
    if (trimmed && isPublicIp(trimmed)) return trimmed;
  }
  return null;
}

const PLACEHOLDER_VALUES = new Set(["", "—"]);

export function shouldSyncGeoProfile(input: {
  profile: {
    city: string | null;
    country: string | null;
    timezone: string | null;
    geoSource?: string | null;
    lastGeoIp?: string | null;
    lastGeoCheck?: Date | null;
  } | null;
  clientIp: string | null;
  now: Date;
}): boolean {
  const { profile, clientIp, now } = input;
  if (!profile || !clientIp) return false;
  if (profile.geoSource === "manual") return false;

  if (
    PLACEHOLDER_VALUES.has(profile.city ?? "—") ||
    PLACEHOLDER_VALUES.has(profile.country ?? "—") ||
    PLACEHOLDER_VALUES.has(profile.timezone ?? "—") ||
    profile.city == null ||
    profile.country == null ||
    profile.timezone == null
  ) {
    return true;
  }

  if (profile.lastGeoIp !== clientIp) return true;

  if (!profile.lastGeoCheck) return true;

  const hoursSince = (now.getTime() - profile.lastGeoCheck.getTime()) / (1000 * 60 * 60);
  if (hoursSince > 24) return true;

  return false;
}

export async function fetchGeoFromIp(ip: string): Promise<GeoIpResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const resp = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,city,timezone,query`,
      { signal: controller.signal },
    );
    if (!resp.ok) return null;

    const data = await resp.json();
    if (data?.status !== "success") return null;

    const city = typeof data.city === "string" ? data.city.trim() : "";
    const country = typeof data.country === "string" ? data.country.trim() : "";
    const timezone = typeof data.timezone === "string" ? data.timezone.trim() : "";
    const query = typeof data.query === "string" ? data.query.trim() : "";

    if (!city || !country || !timezone) return null;
    if (query && query !== ip) return null;

    return {
      city: normalizeCityName(city),
      country: normalizeCountryName(country) ?? country,
      timezone,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function syncGeoProfile(userId: string, ip: string) {
  const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const claimed = await prisma.userProfile.updateMany({
    where: {
      userId,
      geoSource: { not: "manual" },
      OR: [
        { lastGeoCheck: null },
        { lastGeoCheck: { lt: staleBefore } },
        { lastGeoIp: null },
        { lastGeoIp: { not: ip } },
        { city: "—" },
        { country: "—" },
      ],
    },
    data: {
      lastGeoCheck: new Date(),
    },
  });

  if (claimed.count === 0) return;

  const geo = await fetchGeoFromIp(ip);
  if (!geo) return;

  await prisma.userProfile.updateMany({
    where: {
      userId,
      geoSource: { not: "manual" },
    },
    data: {
      city: geo.city,
      country: geo.country,
      timezone: geo.timezone,
      lastGeoIp: ip,
      lastGeoCheck: new Date(),
    },
  });
}

export function syncGeoProfileInBackground(userId: string, ip: string): void {
  void syncGeoProfile(userId, ip).catch(() => {
    // 静默失败，不影响认证和页面渲染
  });
}
