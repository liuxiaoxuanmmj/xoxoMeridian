import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("study room Prisma contract", () => {
  it("declares the productized timer states, modes, presence, and goals", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");

    expect(schema).toContain("enum FocusStatus");
    expect(schema).toContain("focusing");
    expect(schema).toContain("running");
    expect(schema).toContain("paused");
    expect(schema).toContain("enum StudyTimerMode");
    expect(schema).toContain("remainingSeconds");
    expect(schema).toContain("lastStudySeenAt");
    expect(schema).toContain("model StudyGoal");
    expect(schema).toContain("@@index([userId, localDate, sortOrder])");
  });
});
