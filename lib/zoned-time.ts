/**
 * Wall-clock ↔ `Date` conversion in an explicit IANA timezone.
 *
 * A `datetime-local` input carries the wall clock shown to the user but no
 * zone, so a value like `2026-05-09T20:40` is ambiguous until it is paired with
 * a zone. These helpers make the zone explicit in both directions so a schedule
 * can be displayed and re-submitted without shifting the instant.
 */

const WALL_CLOCK_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function part(parts: Intl.DateTimeFormatPart[], type: string): number {
  const found = parts.find((entry) => entry.type === type);
  if (!found) {
    throw new Error(`Timezone formatting did not produce a '${type}' part.`);
  }
  return Number(found.value);
}

/**
 * Offset of `timeZone` at `instant`, in milliseconds east of UTC.
 *
 * Only the second-resolution fields are read back, so the sub-second part of
 * `instant` is dropped before subtracting; otherwise a date with milliseconds
 * would appear to sit in a fractional offset.
 */
function offsetMsAt(instant: Date, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(instant);
  // `hour12: false` renders midnight as "24" in some engines.
  const asUtc = Date.UTC(
    part(parts, "year"),
    part(parts, "month") - 1,
    part(parts, "day"),
    part(parts, "hour") % 24,
    part(parts, "minute"),
    part(parts, "second"),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Renders `date` as `YYYY-MM-DDTHH:mm` on the wall clock of `timeZone`. */
export function formatWallClockInZone(date: Date, timeZone: string): string {
  const parts = formatterFor(timeZone).formatToParts(date);
  const pad = (value: number) => String(value).padStart(2, "0");
  const wallClock = [
    String(part(parts, "year")).padStart(4, "0"),
    pad(part(parts, "month")),
    pad(part(parts, "day")),
  ].join("-");
  const time = [
    pad(part(parts, "hour") % 24),
    pad(part(parts, "minute")),
  ].join(":");
  return `${wallClock}T${time}`;
}

/** True when `ms` renders as exactly `value` on `timeZone`'s wall clock. */
function rendersWallClock(ms: number, value: string, timeZone: string): boolean {
  return formatWallClockInZone(new Date(ms), timeZone) === value;
}

/**
 * Interprets `value` (`YYYY-MM-DDTHH:mm`) as a wall clock in `timeZone`.
 *
 * The offset is solved in two passes because the offset that applies to the
 * result can differ from the one at the first guess — that is exactly what
 * happens across a DST boundary.
 *
 * Two wall clocks per year are not one-to-one with instants, and each is
 * resolved the way `Temporal`'s `compatible` disambiguation does:
 *
 * - **Ambiguous** (the repeated hour of a fall-back transition) — both offsets
 *   agree, so the first guess wins and the earlier of the two instants is
 *   returned.
 * - **Skipped** (the missing hour of a spring-forward transition) — neither
 *   candidate renders the requested clock, so the later instant is taken, which
 *   is the gap shifted forward: 02:30 in a zone that jumps 02:00→03:00 yields
 *   03:30. `cron-parser` resolves the same expression the same way, so a
 *   cron-derived and a wall-clock-derived instant agree.
 */
export function wallClockInZoneToDate(value: string, timeZone: string): Date {
  const match = WALL_CLOCK_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid wall-clock datetime: ${value}`);
  }

  const [, year, month, day, hour, minute] = match;
  const asUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );

  const firstOffset = offsetMsAt(new Date(asUtc), timeZone);
  const firstInstant = asUtc - firstOffset;
  const secondOffset = offsetMsAt(new Date(firstInstant), timeZone);
  if (secondOffset === firstOffset) {
    return new Date(firstInstant);
  }

  // The guesses disagree, so one of them straddles a transition. Trust whichever
  // actually renders the requested clock rather than assuming which pass won.
  const secondInstant = asUtc - secondOffset;
  const wallClock = value.trim();
  if (rendersWallClock(secondInstant, wallClock, timeZone)) {
    return new Date(secondInstant);
  }
  if (rendersWallClock(firstInstant, wallClock, timeZone)) {
    return new Date(firstInstant);
  }
  return new Date(Math.max(firstInstant, secondInstant));
}
