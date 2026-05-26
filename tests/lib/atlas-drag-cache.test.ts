import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setDragPosition, getDragPositions, clearDragPosition } from "@/lib/atlas-drag-cache";

describe("atlas-drag-cache", () => {
  afterEach(() => {
    // Clean up all entries
    for (const key of getDragPositions().keys()) {
      clearDragPosition(key);
    }
  });

  it("stores and retrieves a drag position", () => {
    setDragPosition("el-1", 100, 200, "user-a");
    const positions = getDragPositions();
    expect(positions.get("el-1")).toEqual(
      expect.objectContaining({ x: 100, y: 200, userId: "user-a" })
    );
  });

  it("overwrites previous position for same element", () => {
    setDragPosition("el-1", 100, 200, "user-a");
    setDragPosition("el-1", 300, 400, "user-a");
    const positions = getDragPositions();
    expect(positions.get("el-1")?.x).toBe(300);
    expect(positions.get("el-1")?.y).toBe(400);
  });

  it("clears a specific position", () => {
    setDragPosition("el-1", 100, 200, "user-a");
    setDragPosition("el-2", 300, 400, "user-b");
    clearDragPosition("el-1");
    const positions = getDragPositions();
    expect(positions.has("el-1")).toBe(false);
    expect(positions.has("el-2")).toBe(true);
  });

  it("tracks multiple elements independently", () => {
    setDragPosition("el-1", 10, 20, "user-a");
    setDragPosition("el-2", 30, 40, "user-b");
    const positions = getDragPositions();
    expect(positions.size).toBe(2);
    expect(positions.get("el-1")?.userId).toBe("user-a");
    expect(positions.get("el-2")?.userId).toBe("user-b");
  });
});
