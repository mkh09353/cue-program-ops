/**
 * Framework-neutral timezone primitives shared by server and browser code.
 *
 * Contract: organizers pick a calendar day plus a wall-clock time; that pair means
 * that time in the EVENT's IANA zone (never the browser's). Everything we STORE stays
 * a UTC ISO instant — only entry, prefill and day-bucketing are timezone aware.
 *
 * Uses Intl/IANA data only (no dependency, no hard-coded offsets), so DST is handled
 * for any zone, not just Los Angeles.
 */

export const EVENT_TIME_ZONE = "America/Los_Angeles";

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** Cache formatters: they are expensive to build and we call these in render paths. */
const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
  let fmt = partsFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(timeZone, fmt);
  }
  return fmt;
}

function dayFormatter(timeZone: string) {
  let fmt = dayFormatters.get(timeZone);
  if (!fmt) {
    // en-CA renders ISO-shaped YYYY-MM-DD.
    fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormatters.set(timeZone, fmt);
  }
  return fmt;
}

/** Wall-clock fields of an instant in the given zone. */
function zonedFields(instant: number, timeZone: string) {
  const parts = partsFormatter(timeZone).formatToParts(new Date(instant));
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour") % 24, // some engines render midnight as 24
    minute: pick("minute"),
    second: pick("second"),
  };
}

/**
 * Zone offset in minutes east of UTC at a given instant (PDT = -420, PST = -480).
 * Derived by comparing the zone's wall fields with the same fields read as UTC —
 * exact for whole-, half- and quarter-hour zones alike.
 */
export function zoneOffsetMinutes(instant: number, timeZone: string = EVENT_TIME_ZONE): number {
  const f = zonedFields(instant, timeZone);
  const asUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60000);
}

/**
 * Interpret `day` (YYYY-MM-DD) + `time` (HH:MM or HH:MM:SS) as WALL TIME in `timeZone`
 * and return the matching UTC ISO instant.
 *
 * DST policy (deterministic, documented because it is a product decision):
 * - Spring-forward gap (a wall time that does not exist, e.g. 02:30 on the US spring
 *   transition): resolves to the instant the clock jumps to — i.e. the offset AFTER the
 *   transition is applied, so the stored instant is real and never silently "the day before".
 * - Fall-back overlap (a wall time that happens twice): resolves to the FIRST occurrence
 *   (still-daylight offset), matching how organizers read a printed agenda.
 */
export function zonedWallTimeToIso(day: string, time: string, timeZone: string = EVENT_TIME_ZONE): string {
  const dayMatch = DAY_RE.exec(String(day).trim());
  const timeMatch = TIME_RE.exec(String(time).trim());
  if (!dayMatch) throw new Error(`Invalid day "${day}" (expected YYYY-MM-DD)`);
  if (!timeMatch) throw new Error(`Invalid time "${time}" (expected HH:MM)`);
  const [, y, mo, d] = dayMatch;
  const [, h, mi, s] = timeMatch;
  const wallAsUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s || 0));

  // Two-pass resolve: the offset at the *guess* can differ from the offset at the
  // *resolved* instant right around a transition, so re-probe once and re-apply.
  const firstOffset = zoneOffsetMinutes(wallAsUtc, timeZone);
  const firstInstant = wallAsUtc - firstOffset * 60000;
  const secondOffset = zoneOffsetMinutes(firstInstant, timeZone);
  if (secondOffset === firstOffset) return new Date(firstInstant).toISOString();

  const secondInstant = wallAsUtc - secondOffset * 60000;
  // If re-applying reproduces the requested wall time we are in the normal (or
  // fall-back overlap) case and take it — that is the earlier of two occurrences.
  const check = zonedFields(secondInstant, timeZone);
  const reproduced =
    check.year === Number(y) &&
    check.month === Number(mo) &&
    check.day === Number(d) &&
    check.hour === Number(h) % 24 &&
    check.minute === Number(mi);
  // Otherwise the requested wall time does not exist (spring-forward gap): keep the
  // first candidate, which lands on the instant the clock jumps to.
  return new Date(reproduced ? secondInstant : firstInstant).toISOString();
}

/**
 * Decompose a stored UTC instant into the day + wall time an organizer sees in the
 * event zone. Inverse of zonedWallTimeToIso for every unambiguous wall time.
 */
export function isoToZonedWallTime(
  iso: string,
  timeZone: string = EVENT_TIME_ZONE,
): { day: string; time: string } {
  const instant = Date.parse(iso);
  if (!Number.isFinite(instant)) throw new Error(`Invalid ISO instant "${iso}"`);
  const f = zonedFields(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    day: `${f.year}-${pad(f.month)}-${pad(f.day)}`,
    time: `${pad(f.hour)}:${pad(f.minute)}`,
  };
}

/** Calendar day (YYYY-MM-DD) that a stored instant falls on in the event zone. */
export function zonedDayKey(iso: string, timeZone: string = EVENT_TIME_ZONE): string {
  const instant = Date.parse(iso);
  if (!Number.isFinite(instant)) return String(iso).slice(0, 10);
  return dayFormatter(timeZone).format(new Date(instant));
}
