import { describe, expect, it } from "vitest";

import { formatWallClockInZone, wallClockInZoneToDate } from "@/lib/zoned-time";

describe("formatWallClockInZone", () => {
  it("renders the wall clock of the given zone, not UTC", () => {
    const instant = new Date("2026-05-09T12:40:00.000Z");
    expect(formatWallClockInZone(instant, "Asia/Shanghai")).toBe("2026-05-09T20:40");
    expect(formatWallClockInZone(instant, "UTC")).toBe("2026-05-09T12:40");
  });

  it("renders midnight as 00:00 rather than 24:00", () => {
    // Some ICU builds report `hour12: false` midnight as "24"; the helpers
    // normalise it, and a datetime-local input requires "00".
    expect(formatWallClockInZone(new Date("2026-05-09T16:00:00.000Z"), "Asia/Shanghai"))
      .toBe("2026-05-10T00:00");
  });

  it("pads month, day, hour and minute to two digits", () => {
    expect(formatWallClockInZone(new Date("2026-01-02T03:04:00.000Z"), "UTC"))
      .toBe("2026-01-02T03:04");
  });

  it("follows the zone across a DST transition", () => {
    expect(formatWallClockInZone(new Date("2026-03-08T06:30:00.000Z"), "America/New_York"))
      .toBe("2026-03-08T01:30");
    expect(formatWallClockInZone(new Date("2026-03-08T07:30:00.000Z"), "America/New_York"))
      .toBe("2026-03-08T03:30");
  });
});

describe("wallClockInZoneToDate", () => {
  it("interprets the wall clock in the given zone", () => {
    expect(wallClockInZoneToDate("2026-05-09T20:40", "Asia/Shanghai").toISOString())
      .toBe("2026-05-09T12:40:00.000Z");
    expect(wallClockInZoneToDate("2026-05-09T20:40", "UTC").toISOString())
      .toBe("2026-05-09T20:40:00.000Z");
  });

  it("round-trips through formatWallClockInZone for ordinary wall clocks", () => {
    for (const timeZone of ["Asia/Shanghai", "UTC", "Europe/London", "America/New_York"]) {
      for (const wallClock of ["2026-05-09T20:40", "2026-01-02T03:04", "2026-12-31T23:59"]) {
        const instant = wallClockInZoneToDate(wallClock, timeZone);
        expect(formatWallClockInZone(instant, timeZone)).toBe(wallClock);
      }
    }
  });

  it("resolves the repeated hour of a fall-back transition to the earlier instant", () => {
    // 01:30 happens twice in New York on 2026-11-01 (EDT then EST); the earlier
    // one is the EDT reading. Both offsets agree on the first pass, which is
    // exactly why this case never reaches the two-pass correction.
    expect(wallClockInZoneToDate("2026-11-01T01:30", "America/New_York").toISOString())
      .toBe("2026-11-01T05:30:00.000Z");
  });

  it("shifts a skipped spring-forward wall clock forward past the gap", () => {
    // 02:30 never happens in New York on 2026-03-08 (the clock jumps 02:00 to
    // 03:00), so it resolves to 03:30 EDT. Taking the *second* pass offset here
    // would land on 01:30 EST — an hour *before* what the user typed — so this
    // literal is what pins the direction.
    const resolved = wallClockInZoneToDate("2026-03-08T02:30", "America/New_York");
    expect(resolved.toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(formatWallClockInZone(resolved, "America/New_York")).toBe("2026-03-08T03:30");
  });

  it("agrees with cron-parser on how a skipped wall clock resolves", () => {
    // `cron-parser` shifts the same gap forward, so a cron-derived instant and a
    // wall-clock-derived one cannot disagree about the same local time.
    const viaCron = wallClockInZoneToDate("2026-03-08T03:30", "America/New_York");
    expect(viaCron.toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("accepts padded input and rejects anything that is not a wall clock", () => {
    expect(wallClockInZoneToDate("  2026-05-09T20:40  ", "UTC").toISOString())
      .toBe("2026-05-09T20:40:00.000Z");
    for (const bad of ["", "2026-05-09", "2026-05-09T20:40:00Z", "not-a-date", "2026/05/09 20:40"]) {
      expect(() => wallClockInZoneToDate(bad, "UTC")).toThrow(/Invalid wall-clock datetime/);
    }
  });

  it("throws for an unknown timezone rather than silently using UTC", () => {
    expect(() => wallClockInZoneToDate("2026-05-09T20:40", "Not/AZone")).toThrow(RangeError);
    expect(() => formatWallClockInZone(new Date(), "Not/AZone")).toThrow(RangeError);
  });
});
