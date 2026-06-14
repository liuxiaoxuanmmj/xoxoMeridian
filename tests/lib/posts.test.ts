import { describe, expect, it } from "vitest";
import { formatPostTime, generateSlug } from "@/lib/posts";

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

  it("handles Chinese characters", () => {
    expect(generateSlug("你好 世界")).toBe("你好-世界");
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
