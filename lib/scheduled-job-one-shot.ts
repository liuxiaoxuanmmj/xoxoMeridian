import { CronExpressionParser } from "cron-parser";
import { z } from "zod";

/**
 * The single source of truth for how a scheduled job's stored trigger fields
 * are derived from what the caller asked for.
 *
 * Both authoring entries — the room HTTP routes and the Agent `schedule.*`
 * tools — resolve their writes through here, so the one-shot rules cannot drift
 * apart between the UI and the Agent again.
 */

// A one-off scheduled for an absolute datetime may land slightly in the past by
// the time planning latency finishes — fire it anyway, but refuse anything that
// is clearly too stale to be what the user meant.
export const FIRE_AT_GRACE_MS = 5 * 60 * 1000;

export const scheduledJobFireAtSchema = z.string().datetime({ offset: true });

type ScheduledJobTriggerInput = {
  fireAt?: unknown;
  cron?: unknown;
};

export function hasExactlyOneScheduledJobTrigger(
  input: ScheduledJobTriggerInput,
): boolean {
  return (input.fireAt !== undefined) !== (input.cron !== undefined);
}

export function hasAtMostOneScheduledJobTrigger(
  input: ScheduledJobTriggerInput,
): boolean {
  return !(input.fireAt !== undefined && input.cron !== undefined);
}

export type ScheduledJobFireAtReason = "invalid" | "too-old";

/**
 * Raised when a supplied `fireAt` cannot be honoured. Callers map `reason` to
 * their own contract (HTTP 400, Agent tool error) so each keeps its wording.
 */
export class ScheduledJobFireAtError extends Error {
  constructor(
    readonly reason: ScheduledJobFireAtReason,
    readonly fireAt: string,
  ) {
    super(
      reason === "invalid"
        ? `Invalid fireAt '${fireAt}': not a valid ISO datetime.`
        : `fireAt '${fireAt}' is more than 5 minutes in the past.`,
    );
    this.name = "ScheduledJobFireAtError";
  }
}

/**
 * HTTP-facing text for a rejected `fireAt`, shared by the create and update
 * routes so both describe the same failure the same way. The Agent tools use
 * their own wording, which also tells the model to ask the user.
 */
export function fireAtErrorMessage(error: ScheduledJobFireAtError): string {
  return error.reason === "invalid"
    ? "Invalid fireAt datetime"
    : "fireAt is more than 5 minutes in the past";
}

/**
 * Raised when a cron expression cannot be parsed in its timezone. Its message
 * matches the wording the Agent tools already used, so they can let it through
 * unchanged; the HTTP routes restate it without the quoted expression.
 */
export class ScheduledJobCronError extends Error {
  constructor(
    readonly cron: string,
    readonly detail: string,
  ) {
    super(`Invalid cron expression '${cron}': ${detail}`);
    this.name = "ScheduledJobCronError";
  }
}

/**
 * Raised when `timezone` is not an IANA zone this runtime knows. The recurring
 * path surfaces a bad zone as a cron-parser failure; the one-shot path builds
 * its display cron with `Intl`, which throws a bare `RangeError` — typed here so
 * callers can keep answering 400 instead of leaking a 500.
 */
export class ScheduledJobTimezoneError extends Error {
  constructor(readonly timezone: string) {
    super(`Unknown timezone '${timezone}'.`);
    this.name = "ScheduledJobTimezoneError";
  }
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function isValidCron(cron: string, timezone: string): boolean {
  try {
    // `parse` is lazy: it does not touch the timezone (or reject an impossible
    // expression such as `0 0 30 2 *`) until `next` is called, so a bare parse
    // reports success for an unknown zone.
    CronExpressionParser.parse(cron, { tz: timezone }).next();
    return true;
  } catch {
    return false;
  }
}

// Derive a display-only cron from a concrete fireAt so the DB column (NOT NULL)
// always has a parseable value. Uses the wall-clock minute/hour of the fireAt
// in the given timezone — the value is cosmetic because runOnce=true disables
// the job after firing, but it still needs to round-trip through cron-parser,
// and the scheduler derives the *next* instant from cron on every claim.
export function synthesizeCronFromDate(fireAt: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(fireAt);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "0";
  return `${Number(minute)} ${Number(hour) % 24} * * *`;
}

/**
 * Resolves a one-shot request into the fields persisted on a job.
 *
 * `fireAt` always forces `runOnce`; a caller-supplied cron is only kept when it
 * parses, otherwise the wall clock of the fire instant is synthesized into one.
 */
export function resolveOneShotSchedule(input: {
  fireAt: string;
  cron?: string | null;
  timezone: string;
  now?: number;
  /** How to treat a fireAt that already passed within the grace window. */
  onGracePast?: "push-one-second" | "keep";
}): { nextRunAt: Date; cron: string; runOnce: true } {
  const { fireAt, timezone } = input;
  const parsedFireAt = scheduledJobFireAtSchema.safeParse(fireAt);
  if (!parsedFireAt.success) {
    throw new ScheduledJobFireAtError("invalid", fireAt);
  }
  const requested = new Date(parsedFireAt.data);
  // Checked before the cron is chosen: the zone is persisted either way and the
  // scheduler reads it back, so a bad one has to fail even alongside a valid cron.
  if (!isValidTimezone(timezone)) {
    throw new ScheduledJobTimezoneError(timezone);
  }

  const now = input.now ?? Date.now();
  const diff = requested.getTime() - now;
  if (diff < -FIRE_AT_GRACE_MS) {
    throw new ScheduledJobFireAtError("too-old", fireAt);
  }

  // Slightly-in-the-past or now → push by 1s so the near-term scheduler picks it
  // up via setTimeout instead of the `lte: now` batch in the same tick.
  const nextRunAt = diff < 0 && input.onGracePast !== "keep"
    ? new Date(now + 1000)
    : requested;

  const cron = input.cron && isValidCron(input.cron, timezone)
    ? input.cron
    : synthesizeCronFromDate(requested, timezone);

  return { nextRunAt, cron, runOnce: true };
}

/** Resolves a recurring request into the fields persisted on a job. */
export function resolveRecurringSchedule(input: {
  cron: string;
  timezone: string;
  now?: Date;
}): { nextRunAt: Date; cron: string; runOnce: false } {
  let nextRunAt: Date;
  try {
    nextRunAt = CronExpressionParser.parse(input.cron, {
      tz: input.timezone,
      ...(input.now ? { currentDate: input.now } : {}),
    }).next().toDate();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ScheduledJobCronError(input.cron, detail);
  }
  return { nextRunAt, cron: input.cron, runOnce: false };
}
