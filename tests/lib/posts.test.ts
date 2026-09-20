import { describe, expect, it, vi } from "vitest";
import {
  POST_SLUG_ATTEMPT_LIMIT,
  formatPostTime,
  generateSlug,
  resolveAuthorLocation,
  writePostWithUniqueSlug,
} from "@/lib/posts";

describe("generateSlug", () => {
  it("converts title to lowercase kebab-case", () => {
    expect(generateSlug("Hello World")).toBe("hello-world");
  });

  it("removes special characters", () => {
    expect(generateSlug("Hello! @World #2024")).toBe("hello-world-2024");
  });

  it("collapses multiple dashes", () => {
    expect(generateSlug("foo---bar")).toBe("foo-bar");
  });

  it("trims to 80 characters", () => {
    const long = "a".repeat(100);
    expect(generateSlug(long).length).toBeLessThanOrEqual(80);
  });

  it("transliterates Chinese titles to pinyin", () => {
    expect(generateSlug("你好 世界")).toBe("ni-hao-shi-jie");
  });

  it("transliterates Chinese and preserves English in mixed titles", () => {
    expect(generateSlug("我的 Hello World 博客")).toBe("wo-de-hello-world-bo-ke");
  });

  it("does not trigger pinyin for purely ASCII titles", () => {
    expect(generateSlug("Hello World 2024")).toBe("hello-world-2024");
  });

  it("handles special characters mixed with Chinese", () => {
    expect(generateSlug("你好!!! 世界???")).toBe("ni-hao-shi-jie");
  });

  it("handles single Chinese character", () => {
    expect(generateSlug("康")).toBe("kang");
  });

  it("falls back when every title character is removed", () => {
    expect(generateSlug("!!! 😄 ???")).toBe("post");
  });
});

// Prisma P2002 的真实形状由真实 PostgreSQL 探针确认：{ code, meta: { modelName, target: ["slug"] } }。
function slugConflictError() {
  return Object.assign(new Error("Unique constraint failed on the fields: (`slug`)"), {
    code: "P2002",
    meta: { modelName: "Post", target: ["slug"] },
  });
}

describe("writePostWithUniqueSlug", () => {
  it("首次尝试直接用基础 slug 写入并返回结果", async () => {
    const write = vi.fn(async (slug: string) => ({ slug }));

    await expect(writePostWithUniqueSlug("hello-world", write)).resolves.toEqual({
      slug: "hello-world",
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("hello-world");
  });

  it("遇到 slug 唯一冲突时按 -2、-3 顺延后缀重试并返回成功结果", async () => {
    const attempted: string[] = [];
    const write = vi.fn(async (slug: string) => {
      attempted.push(slug);
      if (attempted.length < 3) throw slugConflictError();
      return { slug };
    });

    await expect(writePostWithUniqueSlug("hello-world", write)).resolves.toEqual({
      slug: "hello-world-3",
    });
    expect(attempted).toEqual(["hello-world", "hello-world-2", "hello-world-3"]);
  });

  it("非冲突数据库错误不重试并原样上抛", async () => {
    const failure = Object.assign(new Error("Can't reach database server"), { code: "P1001" });
    const write = vi.fn(async () => {
      throw failure;
    });

    await expect(writePostWithUniqueSlug("hello-world", write)).rejects.toBe(failure);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("无法归因到 slug 的唯一冲突不重试并原样上抛", async () => {
    const otherTarget = Object.assign(new Error("Unique constraint failed on the fields: (`email`)"), {
      code: "P2002",
      meta: { modelName: "User", target: ["email"] },
    });
    const write = vi.fn(async () => {
      throw otherTarget;
    });

    await expect(writePostWithUniqueSlug("hello-world", write)).rejects.toBe(otherTarget);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("连续冲突到尝试上限后上抛最后一次冲突", async () => {
    const attempted: string[] = [];
    const write = vi.fn(async (slug: string) => {
      attempted.push(slug);
      throw slugConflictError();
    });

    await expect(writePostWithUniqueSlug("hello-world", write)).rejects.toMatchObject({
      code: "P2002",
    });
    expect(write).toHaveBeenCalledTimes(POST_SLUG_ATTEMPT_LIMIT);
    expect(attempted).toEqual([
      "hello-world",
      "hello-world-2",
      "hello-world-3",
      "hello-world-4",
      "hello-world-5",
    ]);
  });
});

describe("formatPostTime", () => {
  describe("time formatting", () => {
    it("formats using provided timezone", () => {
      const date = new Date("2026-06-13T14:30:00+08:00");
      const result = formatPostTime(date, { timezone: "Asia/Shanghai" });
      expect(result).toContain("2026");
      expect(result).toContain("06");
      expect(result).toContain("14:30");
    });

    it("defaults to UTC when no opts provided", () => {
      const date = new Date("2026-06-13T14:30:00Z");
      const result = formatPostTime(date);
      expect(result).toContain("14:30");
    });

    it("defaults to UTC when opts is null", () => {
      const date = new Date("2026-06-13T14:30:00Z");
      const result = formatPostTime(date, null);
      expect(result).toContain("14:30");
    });
  });

  describe("resolveAuthorLocation", () => {
    it("prioritizes Post snapshot fields over profile", () => {
      const result = resolveAuthorLocation({
        authorCity: "Tokyo",
        authorCountry: "Japan",
        authorTimezone: "Asia/Tokyo",
        author: { profile: { city: "Beijing", country: "China", timezone: "Asia/Shanghai" } },
      });
      expect(result).toEqual({ timezone: "Asia/Tokyo", city: "Tokyo", country: "Japan" });
    });

    it("falls back to profile when Post fields are null", () => {
      const result = resolveAuthorLocation({
        authorCity: null,
        authorCountry: null,
        authorTimezone: null,
        author: { profile: { city: "Beijing", country: "China", timezone: "Asia/Shanghai" } },
      });
      expect(result).toEqual({ timezone: "Asia/Shanghai", city: "Beijing", country: "China" });
    });

    it("returns undefineds when both snapshot and profile are null/absent", () => {
      const result = resolveAuthorLocation({
        authorCity: null,
        authorCountry: null,
        authorTimezone: null,
      });
      expect(result).toEqual({ timezone: undefined, city: undefined, country: undefined });
    });
  });

  describe("location label", () => {
    const date = new Date("2026-06-13T14:30:00Z");

    it("shows city and country when both present", () => {
      const result = formatPostTime(date, { city: "Beijing", country: "China" });
      expect(result).toContain("Beijing, China");
    });

    it("shows city only and no country label when no country", () => {
      const result = formatPostTime(date, { city: "Tokyo" });
      expect(result).toContain("Tokyo");
      // should NOT have a ", Country" suffix — only the date's own comma
      expect(result).not.toMatch(/, [A-Z][a-z]+$/);
    });

    it("shows country only when no city", () => {
      const result = formatPostTime(date, { country: "Japan" });
      expect(result).toContain("Japan");
    });

    it("shows em-dash when no location data", () => {
      const result = formatPostTime(date);
      expect(result).toContain("—");
    });

    it("normalizes Chinese city and country names", () => {
      const result = formatPostTime(date, { city: "北京", country: "中国" });
      expect(result).toContain("Beijing, China");
    });

    it("handles empty strings gracefully", () => {
      const result = formatPostTime(date, { city: "", country: "" });
      expect(result).toContain("—");
    });

    it("returns em-dash when country is sentinel '—'", () => {
      const result = formatPostTime(date, { country: "—" });
      expect(result).toContain("—");
    });
  });
});
