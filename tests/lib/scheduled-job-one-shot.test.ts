import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  fireAtErrorMessage,
  isValidCron,
  resolveOneShotSchedule,
  resolveRecurringSchedule,
  ScheduledJobCronError,
  ScheduledJobFireAtError,
  ScheduledJobTimezoneError,
} from "@/lib/scheduled-job-one-shot";

const TZ = "Asia/Shanghai";
const exec = promisify(execFile);

async function resolveInWorkerTimezone(workerTimezone: string) {
  const moduleUrl = new URL("../../lib/scheduled-job-one-shot.ts", import.meta.url).href;
  const script = [
    "const { resolveOneShotSchedule } = await import(" + JSON.stringify(moduleUrl) + ");",
    "const valid = resolveOneShotSchedule({",
    "  fireAt: '2030-05-09T20:40:00+01:00',",
    "  timezone: 'Europe/London',",
    "  now: Date.parse('2030-05-09T10:00:00.000Z')",
    "});",
    "let offsetless;",
    "try {",
    "  const accepted = resolveOneShotSchedule({",
    "    fireAt: '2030-05-09T20:40:00',",
    "    timezone: 'Europe/London',",
    "    now: Date.parse('2030-05-09T10:00:00.000Z')",
    "  });",
    "  offsetless = { accepted: true, nextRunAt: accepted.nextRunAt.toISOString() };",
    "} catch (error) {",
    "  offsetless = {",
    "    accepted: false,",
    "    name: error instanceof Error ? error.name : 'unknown',",
    "    reason: typeof error === 'object' && error !== null && 'reason' in error",
    "      ? error.reason",
    "      : null",
    "  };",
    "}",
    "process.stdout.write(JSON.stringify({",
    "  valid: { nextRunAt: valid.nextRunAt.toISOString(), cron: valid.cron },",
    "  offsetless",
    "}));",
  ].join("\n");
  const { stdout } = await exec(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", script],
    { env: { ...process.env, TZ: workerTimezone } },
  );

  return JSON.parse(stdout) as {
    valid: { nextRunAt: string; cron: string };
    offsetless: {
      accepted: boolean;
      nextRunAt?: string;
      name?: string;
      reason?: string | null;
    };
  };
}

describe("resolveOneShotSchedule", () => {
  it("uses the requested instant as nextRunAt", () => {
    const resolved = resolveOneShotSchedule({
      fireAt: "2030-05-09T20:40:00+08:00",
      timezone: TZ,
      now: Date.parse("2030-05-09T10:00:00.000Z"),
    });

    expect(resolved.nextRunAt.toISOString()).toBe("2030-05-09T12:40:00.000Z");
    expect(resolved.runOnce).toBe(true);
  });

  it("synthesizes a cron from the wall clock in the given timezone", () => {
    const resolved = resolveOneShotSchedule({
      fireAt: "2030-05-09T20:40:00+08:00",
      timezone: TZ,
      now: Date.parse("2030-05-09T10:00:00.000Z"),
    });

    expect(resolved.cron).toBe("40 20 * * *");
    expect(isValidCron(resolved.cron, TZ)).toBe(true);
  });

  it("synthesizes in the requested zone, not the offset's zone", () => {
    // Same instant, different display zone: the cosmetic cron has to follow the
    // zone the job is stored with, since the scheduler reads it back on claim.
    const resolved = resolveOneShotSchedule({
      fireAt: "2030-05-09T20:40:00+08:00",
      timezone: "Europe/London",
      now: Date.parse("2030-05-09T10:00:00.000Z"),
    });

    expect(resolved.cron).toBe("40 13 * * *");
    expect(resolved.nextRunAt.toISOString()).toBe("2030-05-09T12:40:00.000Z");
  });

  it("keeps a valid supplied cron instead of synthesizing one", () => {
    const resolved = resolveOneShotSchedule({
      fireAt: "2030-05-09T20:40:00+08:00",
      cron: "0 7 9 5 *",
      timezone: TZ,
      now: Date.parse("2030-05-09T10:00:00.000Z"),
    });

    expect(resolved.cron).toBe("0 7 9 5 *");
  });

  it("falls back to the synthesized cron when the supplied one is unparseable", () => {
    const resolved = resolveOneShotSchedule({
      fireAt: "2030-05-09T20:40:00+08:00",
      cron: "not a cron",
      timezone: TZ,
      now: Date.parse("2030-05-09T10:00:00.000Z"),
    });

    expect(resolved.cron).toBe("40 20 * * *");
  });

  it("fires an instant that already passed within the grace window", () => {
    const now = Date.parse("2030-05-09T12:40:00.000Z");
    const resolved = resolveOneShotSchedule({
      fireAt: "2030-05-09T12:39:30.000Z",
      timezone: TZ,
      now,
    });

    // Pushed one second past `now` so the near-term scheduler picks it up via
    // setTimeout instead of the `lte: now` batch in the same tick.
    expect(resolved.nextRunAt.getTime()).toBe(now + 1000);
    // The cron describes the instant the user asked for, not the correction:
    // it is cosmetic for a runOnce job, which the scheduler disables on fire.
    expect(resolved.cron).toBe("39 20 * * *");
  });

  it("keeps the requested instant when the caller opts out of the push", () => {
    const requested = "2030-05-09T12:39:30.000Z";
    const resolved = resolveOneShotSchedule({
      fireAt: requested,
      timezone: TZ,
      now: Date.parse("2030-05-09T12:40:00.000Z"),
      onGracePast: "keep",
    });

    expect(resolved.nextRunAt.toISOString()).toBe(requested);
  });

  it("rejects a fireAt older than the grace window", () => {
    let caught: unknown;
    try {
      resolveOneShotSchedule({
        fireAt: "2030-05-09T12:00:00.000Z",
        timezone: TZ,
        now: Date.parse("2030-05-09T12:40:00.000Z"),
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ScheduledJobFireAtError);
    expect((caught as ScheduledJobFireAtError).reason).toBe("too-old");
    expect((caught as ScheduledJobFireAtError).fireAt).toBe("2030-05-09T12:00:00.000Z");
  });

  it("rejects an unparseable fireAt", () => {
    let caught: unknown;
    try {
      resolveOneShotSchedule({ fireAt: "tomorrow", timezone: TZ, now: Date.now() });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ScheduledJobFireAtError);
    expect((caught as ScheduledJobFireAtError).reason).toBe("invalid");
  });

  it("rejects a parseable datetime without an explicit offset", () => {
    expect(() =>
      resolveOneShotSchedule({
        fireAt: "2030-05-09T20:40:00",
        timezone: "Europe/London",
        now: Date.parse("2030-05-09T10:00:00.000Z"),
      }),
    ).toThrow(ScheduledJobFireAtError);
  });

  it("keeps absolute-time semantics independent of the Worker process timezone", async () => {
    const results = await Promise.all([
      resolveInWorkerTimezone("Asia/Shanghai"),
      resolveInWorkerTimezone("America/Los_Angeles"),
    ]);

    expect(results.map((result) => result.valid)).toEqual([
      { nextRunAt: "2030-05-09T19:40:00.000Z", cron: "40 20 * * *" },
      { nextRunAt: "2030-05-09T19:40:00.000Z", cron: "40 20 * * *" },
    ]);
    expect(results.map((result) => result.offsetless)).toEqual([
      { accepted: false, name: "ScheduledJobFireAtError", reason: "invalid" },
      { accepted: false, name: "ScheduledJobFireAtError", reason: "invalid" },
    ]);
  });

  it("rejects an unknown timezone even when a valid cron is supplied", () => {
    // The zone is persisted either way, so a bad one has to fail regardless of
    // whether the cron would have masked it.
    expect(() =>
      resolveOneShotSchedule({
        fireAt: "2030-05-09T20:40:00+08:00",
        cron: "0 7 9 5 *",
        timezone: "Not/AZone",
        now: Date.parse("2030-05-09T10:00:00.000Z"),
      }),
    ).toThrow(ScheduledJobTimezoneError);
  });
});

describe("resolveRecurringSchedule", () => {
  it("resolves the next occurrence in the given timezone", () => {
    const resolved = resolveRecurringSchedule({
      cron: "40 20 * * *",
      timezone: TZ,
      now: new Date("2030-05-09T10:00:00.000Z"),
    });

    expect(resolved.nextRunAt.toISOString()).toBe("2030-05-09T12:40:00.000Z");
    expect(resolved.cron).toBe("40 20 * * *");
    expect(resolved.runOnce).toBe(false);
  });

  it("reads the cron in the zone, not UTC", () => {
    const now = new Date("2030-05-09T10:00:00.000Z");
    expect(resolveRecurringSchedule({ cron: "40 20 * * *", timezone: TZ, now }).nextRunAt.toISOString())
      .toBe("2030-05-09T12:40:00.000Z");
    expect(resolveRecurringSchedule({ cron: "40 20 * * *", timezone: "UTC", now }).nextRunAt.toISOString())
      .toBe("2030-05-09T20:40:00.000Z");
  });

  it("rolls to the next day once today's occurrence has passed", () => {
    const resolved = resolveRecurringSchedule({
      cron: "40 20 * * *",
      timezone: TZ,
      now: new Date("2030-05-09T13:00:00.000Z"),
    });

    expect(resolved.nextRunAt.toISOString()).toBe("2030-05-10T12:40:00.000Z");
  });

  it("wraps the parser failure in a typed error carrying the expression", () => {
    let caught: unknown;
    try {
      resolveRecurringSchedule({ cron: "not a cron", timezone: TZ, now: new Date() });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ScheduledJobCronError);
    expect((caught as ScheduledJobCronError).cron).toBe("not a cron");
    // The Agent tools surface this message verbatim, so it has to name the
    // expression the model sent back.
    expect((caught as ScheduledJobCronError).message).toBe(
      `Invalid cron expression 'not a cron': ${(caught as ScheduledJobCronError).detail}`,
    );
  });
});

describe("fireAtErrorMessage", () => {
  it("words each rejection reason for an HTTP client", () => {
    expect(fireAtErrorMessage(new ScheduledJobFireAtError("invalid", "tomorrow")))
      .toBe("Invalid fireAt datetime");
    expect(fireAtErrorMessage(new ScheduledJobFireAtError("too-old", "2030-01-01T00:00:00Z")))
      .toBe("fireAt is more than 5 minutes in the past");
  });
});

describe("isValidCron", () => {
  it("reports parseability in the given zone", () => {
    expect(isValidCron("40 20 * * *", TZ)).toBe(true);
    expect(isValidCron("not a cron", TZ)).toBe(false);
  });

  it("rejects an unknown zone rather than trusting a lazy parse", () => {
    expect(isValidCron("40 20 * * *", "Not/AZone")).toBe(false);
  });

  it("rejects an expression that parses but can never occur", () => {
    // February 30th: the parser accepts the shape, `next()` cannot honour it.
    expect(isValidCron("0 0 30 2 *", TZ)).toBe(false);
  });
});
