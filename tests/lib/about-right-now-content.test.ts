import { describe, expect, it } from "vitest";

import { RIGHT_NOW_PEOPLE } from "@/app/about/right-now-content";

describe("about right-now duo content", () => {
  it("contains exactly oo and xx in display order", () => {
    expect(RIGHT_NOW_PEOPLE.map((person) => person.id)).toEqual(["oo", "xx"]);
  });

  it("uses opposite desktop layouts and opposite photo rotations", () => {
    const [oo, xx] = RIGHT_NOW_PEOPLE;

    expect(oo.layout).toBe("photo-left");
    expect(xx.layout).toBe("photo-right");
    expect(oo.rotation).toBeLessThan(0);
    expect(xx.rotation).toBeGreaterThan(0);
  });

  it("keeps text content plain instead of module-like metadata", () => {
    for (const person of RIGHT_NOW_PEOPLE) {
      expect(person.body.length).toBeGreaterThanOrEqual(2);
      expect(person.body.every((paragraph) => paragraph.length >= 24)).toBe(true);
      expect(Object.keys(person)).not.toContain("chips");
      expect(Object.keys(person)).not.toContain("stats");
      expect(Object.keys(person)).not.toContain("badges");
      expect(Object.keys(person)).not.toContain("photoLabel");
      expect(Object.keys(person)).not.toContain("tone");
    }
  });

  it("uses required local portrait image paths", () => {
    for (const person of RIGHT_NOW_PEOPLE) {
      expect(person.imageSrc).toMatch(/^\/images\/about\/(oo|xx)\.(jpg|jpeg|png|webp)$/);
      expect(person.imageAlt).toContain(person.name);
    }
  });
});
