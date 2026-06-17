import { pinyin } from "pinyin-pro";
import { prisma } from "@/lib/prisma";
export { formatPostTime, resolveAuthorLocation, snapshotProfileLocation } from "@/lib/post-time";

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
