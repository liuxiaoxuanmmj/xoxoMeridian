import { describe, it, expect } from "vitest";
import { valueSimilarity } from "@/agent/memory-dedup";

describe("valueSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(valueSimilarity("她喜欢红烧肉", "她喜欢红烧肉")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    const sim = valueSimilarity("北京朝阳区", "TypeScript编程");
    expect(sim).toBeLessThan(0.2);
  });

  it("returns high similarity for near-duplicates", () => {
    const sim = valueSimilarity("她对花生过敏", "她对花生严重过敏");
    expect(sim).toBeGreaterThan(0.5);
  });

  it("returns moderate similarity for related content", () => {
    const sim = valueSimilarity("喜欢红烧肉", "最喜欢的菜是红烧肉");
    expect(sim).toBeGreaterThan(0.3);
  });

  it("handles empty strings", () => {
    expect(valueSimilarity("", "")).toBe(1);
    expect(valueSimilarity("hello", "")).toBe(0);
    expect(valueSimilarity("", "hello")).toBe(0);
  });

  it("handles single character strings", () => {
    const sim = valueSimilarity("a", "a");
    expect(sim).toBe(1);
  });
});
