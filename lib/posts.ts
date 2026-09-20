import { pinyin } from "pinyin-pro";
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

// 候选 slug 最多尝试的序号，超过即认为无法分配并上抛最后一次冲突。
export const POST_SLUG_ATTEMPT_LIMIT = 5;

// 真实 PostgreSQL 探针结果：Post 唯一冲突为 { code: "P2002", meta: { target: ["slug"] } }。
// 只按唯一字段归因，缺少 target 的 P2002 不在此重试，避免把其他唯一约束冲突当作 slug 竞态。
function isPostSlugConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, meta } = error as { code?: unknown; meta?: { target?: unknown } };
  if (code !== "P2002") return false;
  const target = meta?.target;
  if (typeof target === "string") return target === "slug";
  return Array.isArray(target) && target.includes("slug");
}

function slugCandidate(baseSlug: string, attempt: number): string {
  return attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
}

/**
 * 在数据库唯一约束上原子分配 slug：直接以候选 slug 写入，冲突则递增后缀重试。
 * 唯一性事实由数据库裁定，因此并发写入同一候选时不会退化为“检查后再写”的竞态 500；
 * 非 slug 冲突及其他数据库错误原样上抛。
 */
export async function writePostWithUniqueSlug<T>(
  baseSlug: string,
  write: (slug: string) => Promise<T>
): Promise<T> {
  let conflict: unknown;
  for (let attempt = 1; attempt <= POST_SLUG_ATTEMPT_LIMIT; attempt++) {
    try {
      return await write(slugCandidate(baseSlug, attempt));
    } catch (error) {
      if (!isPostSlugConflict(error)) throw error;
      conflict = error;
    }
  }
  throw conflict;
}
