import { pinyin } from "pinyin-pro";
import { prisma } from "@/lib/prisma";
import { normalizeCityName, normalizeCountryName } from "@/lib/geo-normalize";

const CJK_RE = /[一-鿿㐀-䶿豈-﫿]/;

export function generateSlug(title: string): string {
  const needsTransliteration = CJK_RE.test(title);

  const transliterated = needsTransliteration
    ? pinyin(title, { toneType: "none", nonZh: "consecutive" }).toLowerCase()
    : title.toLowerCase();

  const slug = transliterated
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || "post";
}

export async function ensureUniqueSlug(
  baseSlug: string,
  excludeId?: string
): Promise<string> {
  let slug = baseSlug;
  let suffix = 1;
  while (true) {
    const existing = await prisma.post.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    suffix++;
    slug = `${baseSlug}-${suffix}`;
  }
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
