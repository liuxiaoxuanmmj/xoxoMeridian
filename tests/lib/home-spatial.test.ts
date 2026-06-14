import { describe, expect, it } from "vitest";
import {
  clampPhotoSize,
  getRectCenter,
  isConnectablePair,
  isHomeBlankTarget,
} from "@/lib/home-spatial";

describe("home-spatial helpers", () => {
  it("clamps photo resize while preserving aspect ratio", () => {
    expect(clampPhotoSize({ width: 80, aspectRatio: 4 / 3 })).toEqual({
      width: 120,
      height: 90,
    });
    expect(clampPhotoSize({ width: 900, aspectRatio: 4 / 3 })).toEqual({
      width: 640,
      height: 480,
    });
    expect(clampPhotoSize({ width: 300, aspectRatio: 3 / 2 })).toEqual({
      width: 300,
      height: 200,
    });
  });

  it("computes a rect center relative to the home board rect", () => {
    const rect = { left: 60, top: 120, width: 200, height: 100 };
    const boardRect = { left: 10, top: 20 };

    expect(getRectCenter(rect, boardRect)).toEqual({ x: 150, y: 150 });
  });

  it("allows post-photo and photo-photo connections but rejects post-post", () => {
    expect(isConnectablePair("post", "photo")).toBe(true);
    expect(isConnectablePair("photo", "post")).toBe(true);
    expect(isConnectablePair("photo", "photo")).toBe(true);
    expect(isConnectablePair("post", "post")).toBe(false);
  });

  it("treats interactive elements as non-blank targets", () => {
    const button = { closest: (selector: string) => selector.includes("button") ? {} : null } as HTMLElement;
    const blank = { closest: () => null } as unknown as HTMLElement;

    expect(isHomeBlankTarget(button)).toBe(false);
    expect(isHomeBlankTarget(blank)).toBe(true);
  });
});
