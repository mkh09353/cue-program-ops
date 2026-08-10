import test from "node:test";import assert from "node:assert/strict";import {eventDateTimeLocal,eventLocalToIso} from "../src/web/pages/ReviewManagementPages.js";
import {EVENT_TIME_ZONE,isoToZonedWallTime,zonedDayKey,zonedWallTimeToIso,zoneOffsetMinutes} from "../src/timezone.js";

const wall = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: EVENT_TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );

test("review round datetime-local round-trips in event timezone",()=>{for(const local of ["2027-01-15T09:30","2027-07-15T09:30"]){const iso=eventLocalToIso(local);assert.equal(eventDateTimeLocal(iso),local)}});

/** A picked wall time means that time in Los Angeles, stored as a UTC instant. */
test("wall time converts to the UTC instant that reads back as the same LA clock time", () => {
  // Summer (PDT, UTC-7): 10:00 PT === 17:00Z, matching the seeded schedule fixtures.
  const summer = zonedWallTimeToIso("2026-10-12", "10:00");
  assert.equal(summer, "2026-10-12T17:00:00.000Z");
  assert.match(wall(summer), /Oct 12, 2026, 10:00\s?AM/);

  // Winter (PST, UTC-8): the same wall time is a different instant.
  const winter = zonedWallTimeToIso("2027-01-15", "10:00");
  assert.equal(winter, "2027-01-15T18:00:00.000Z");
  assert.match(wall(winter), /Jan 15, 2027, 10:00\s?AM/);

  assert.notEqual(summer.slice(11), winter.slice(11), "DST must change the stored offset");
  assert.equal(zoneOffsetMinutes(Date.parse(summer)), -420);
  assert.equal(zoneOffsetMinutes(Date.parse(winter)), -480);
});

test("isoToZonedWallTime is the inverse of zonedWallTimeToIso across DST", () => {
  for (const day of ["2026-03-07", "2026-03-09", "2026-06-15", "2026-10-12", "2026-11-02", "2027-01-15"]) {
    for (const time of ["00:00", "09:30", "13:45", "23:15"]) {
      const iso = zonedWallTimeToIso(day, time);
      assert.deepEqual(isoToZonedWallTime(iso), { day, time }, `${day} ${time}`);
      assert.ok(iso.endsWith("Z"), "storage stays a UTC ISO instant");
    }
  }
});

test("DST transition days resolve deterministically", () => {
  // Spring forward 2026-03-08: 02:00–03:00 PT does not exist; a gap time shifts forward.
  const gap = zonedWallTimeToIso("2026-03-08", "02:30");
  assert.equal(gap, "2026-03-08T10:30:00.000Z");
  assert.match(wall(gap), /Mar 8, 2026, 3:30\s?AM/);
  // Times on either side of the gap are exact.
  assert.equal(zonedWallTimeToIso("2026-03-08", "01:30"), "2026-03-08T09:30:00.000Z");
  assert.equal(zonedWallTimeToIso("2026-03-08", "03:30"), "2026-03-08T10:30:00.000Z");

  // Fall back 2026-11-01: 01:30 PT happens twice; we take the first (PDT) occurrence.
  const ambiguous = zonedWallTimeToIso("2026-11-01", "01:30");
  assert.equal(ambiguous, "2026-11-01T08:30:00.000Z");
  assert.match(wall(ambiguous), /Nov 1, 2026, 1:30\s?AM/);
  // A 9am placement on each side of the boundary keeps its wall time.
  assert.equal(isoToZonedWallTime(zonedWallTimeToIso("2026-10-31", "09:00")).time, "09:00");
  assert.equal(isoToZonedWallTime(zonedWallTimeToIso("2026-11-02", "09:00")).time, "09:00");
});

test("zonedDayKey buckets instants by LA calendar day, not UTC", () => {
  // 18:00 PT on Oct 12 is 01:00Z on Oct 13 — it must stay on the Oct 12 day tab.
  assert.equal(zonedDayKey("2026-10-13T01:00:00.000Z"), "2026-10-12");
  assert.equal(zonedDayKey(zonedWallTimeToIso("2026-10-12", "18:00")), "2026-10-12");
  assert.equal(zonedDayKey("2026-10-12T17:00:00.000Z"), "2026-10-12");
  // Early-morning UTC before the PT day starts belongs to the previous civil day.
  assert.equal(zonedDayKey("2026-10-12T06:00:00.000Z"), "2026-10-11");
  // Unparseable input degrades to the leading date-shaped slice rather than throwing.
  assert.equal(zonedDayKey("not-a-date"), "not-a-date");
});

test("invalid wall-time input is rejected rather than silently mis-stored", () => {
  assert.throws(() => zonedWallTimeToIso("10-12-2026", "10:00"), /Invalid day/);
  assert.throws(() => zonedWallTimeToIso("2026-10-12", "10am"), /Invalid time/);
  assert.throws(() => isoToZonedWallTime("nonsense"), /Invalid ISO instant/);
});

test("other IANA zones work through the same primitives", () => {
  assert.equal(zonedWallTimeToIso("2026-10-12", "10:00", "UTC"), "2026-10-12T10:00:00.000Z");
  assert.equal(zonedWallTimeToIso("2026-10-12", "10:00", "Europe/Berlin"), "2026-10-12T08:00:00.000Z");
  // Half-hour offset zone exercises the minute-level offset maths.
  assert.equal(zonedWallTimeToIso("2026-10-12", "10:00", "Asia/Kolkata"), "2026-10-12T04:30:00.000Z");
  assert.deepEqual(isoToZonedWallTime("2026-10-12T04:30:00.000Z", "Asia/Kolkata"), { day: "2026-10-12", time: "10:00" });
});
