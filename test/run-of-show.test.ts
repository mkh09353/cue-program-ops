import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import {
  RunOfShowPage,
  buildSheets,
  clampFilter,
  dayLabel,
  printSummary,
  isProgrammable,
  orderedDayKeys,
  resolveEventSlug,
  sessionNotes,
  unplacedSessions,
} from "../src/web/pages/RunOfShowPage.js";
import { paletteActions } from "../src/web/components/CommandPalette.js";
import { eventDayKeys, fmtTime } from "../src/web/lib/utils.js";
import { zonedDayKey } from "../src/timezone.js";

const ROUTE = "/app/schedule/run-of-show";
const TZ = "America/Los_Angeles";

const main = () => readFileSync("src/web/main.tsx", "utf8");
const page = () => readFileSync("src/web/pages/RunOfShowPage.tsx", "utf8");
const schedulePage = () => readFileSync("src/web/pages/SchedulePage.tsx", "utf8");
const css = () => readFileSync("src/web/style.css", "utf8");
const shells = () => readFileSync("src/web/components/shells.tsx", "utf8");

/**
 * Synthetic schedule payload shaped like a real GET /schedule response.
 *
 * Deliberately hostile: an out-of-order slot, a late-evening slot that lands on the
 * PREVIOUS civil day in the event timezone, a speaker id with no roster record, a
 * track id with no track, a deleted room, and cancelled/rejected sessions.
 */
function fixture() {
  return {
    event: {
      id: "evt-test",
      name: "Test Summit",
      timezone: TZ,
      startsAt: "2026-10-12T16:00:00.000Z",
      endsAt: "2026-10-14T01:00:00.000Z",
    },
    version: 7,
    rooms: [
      { id: "room-main", name: "Main Hall" },
      { id: "room-lab", name: "Workshop Lab" },
    ],
    tracks: [{ id: "track-eng", name: "Engineering" }],
    speakers: [
      { id: "spk-ada", name: "Ada Lovelace" },
      { id: "spk-grace", name: "Grace Hopper" },
    ],
    sessions: [
      {
        id: "ses-a",
        title: "Opening Keynote",
        status: "published",
        speakerIds: ["spk-ada"],
        trackIds: ["track-eng"],
      },
      // Later in the day than ses-c, but listed first: ordering must not trust input order.
      { id: "ses-b", title: "Closing Panel", status: "published", speakerIds: ["spk-grace"], trackIds: [] },
      {
        id: "ses-c",
        title: "Hands-on Lab",
        status: "scheduled",
        // spk-ghost has no roster record; track-ghost has no track record.
        speakerIds: ["spk-ada", "spk-ghost"],
        trackIds: ["track-ghost"],
        notes: "Confidence monitor + 2 handhelds",
      },
      // 7pm LA on Oct 12 == 02:00Z on Oct 13. Must bucket to Oct 12, not Oct 13.
      { id: "ses-late", title: "Evening Social", status: "published", speakerIds: [], trackIds: [] },
      // Placed but in a room that no longer exists.
      { id: "ses-orphan", title: "Orphan Session", status: "published", speakerIds: [], trackIds: [] },
      // Never programmable, even though they are placed.
      { id: "ses-cancelled", title: "Pulled Talk", status: "published", cancelled: true, speakerIds: [] },
      { id: "ses-rejected", title: "Rejected Talk", status: "rejected", speakerIds: [] },
      // Unplaced pool.
      { id: "ses-unplaced", title: "Accepted But Unplaced", status: "accepted", speakerIds: ["spk-grace"], durationMinutes: 45 },
      { id: "ses-draft", title: "Draft Idea", status: "draft", speakerIds: [] },
    ],
    slots: [
      { id: "slot-b", sessionId: "ses-b", roomId: "room-main", startsAt: "2026-10-12T21:00:00.000Z", endsAt: "2026-10-12T21:45:00.000Z" },
      { id: "slot-a", sessionId: "ses-a", roomId: "room-main", startsAt: "2026-10-12T17:00:00.000Z", endsAt: "2026-10-12T17:45:00.000Z" },
      { id: "slot-c", sessionId: "ses-c", roomId: "room-lab", startsAt: "2026-10-12T18:00:00.000Z", endsAt: "2026-10-12T19:00:00.000Z" },
      { id: "slot-late", sessionId: "ses-late", roomId: "room-main", startsAt: "2026-10-13T02:00:00.000Z", endsAt: "2026-10-13T03:00:00.000Z" },
      { id: "slot-orphan", sessionId: "ses-orphan", roomId: "room-deleted", startsAt: "2026-10-13T17:00:00.000Z", endsAt: "2026-10-13T17:30:00.000Z" },
      { id: "slot-cancelled", sessionId: "ses-cancelled", roomId: "room-main", startsAt: "2026-10-13T18:00:00.000Z", endsAt: "2026-10-13T18:30:00.000Z" },
      { id: "slot-rejected", sessionId: "ses-rejected", roomId: "room-main", startsAt: "2026-10-13T19:00:00.000Z", endsAt: "2026-10-13T19:30:00.000Z" },
    ],
    warnings: [
      {
        code: "UNSCHEDULED_ACCEPTED",
        severity: "warning",
        relatedIds: ["ses-unplaced"],
        message: "Accepted But Unplaced is accepted but unscheduled.",
      },
    ],
  };
}

// —— Route wiring ——

test("the exact nested route is registered under the organizer shell", () => {
  const src = main();
  assert.match(
    src,
    /<Route path="schedule\/run-of-show" element={<RunOfShowPage \/>} \/>/,
    "/app/schedule/run-of-show is routed",
  );
  assert.match(src, /import { RunOfShowPage } from "\.\/pages\/RunOfShowPage"/);
  // It must sit inside the /app shell block, before the reviewer routes.
  const appBlock = src.slice(src.indexOf('<Route path="/app"'), src.indexOf('<Route path="/r"'));
  assert.ok(appBlock.includes('path="schedule/run-of-show"'), "nested inside the OrganizerShell route");
});

test("palette action, schedule header link and the route all name the same path", () => {
  const action = paletteActions().find((a) => a.id === "action-run-of-show");
  assert.ok(action, "the palette still ships the run-of-show action");
  assert.equal(action!.to, ROUTE, "palette target is unchanged and exact");
  const sched = schedulePage();
  assert.match(
    sched,
    /<Button asChild variant="outline" size="sm">\s*\n\s*<Link to="\/app\/schedule\/run-of-show" data-testid="schedule-run-of-show-link">/,
    "the Schedule header entry is a small outline Button wrapping the route Link",
  );
  assert.equal(
    (sched.match(/to="\/app\/schedule\/run-of-show"/g) || []).length,
    1,
    "exactly one Link to the route",
  );
  // The route string itself, so a rename in one place fails here rather than in a browser.
  assert.ok(main().includes('path="schedule/run-of-show"'));
});

test("the Schedule edit is one additive link and leaves the pool logic alone", () => {
  const src = schedulePage();
  assert.equal((src.match(/schedule-run-of-show-link/g) || []).length, 1, "exactly one new link");
  assert.match(src, /Public HTML itinerary/, "the pre-existing itinerary action survives");
  // The unscheduled pool rule is concurrent work; our page must not have edited it.
  assert.match(src, /UNSCHEDULED_ACCEPTED/, "SchedulePage still owns its warnings-derived pool");
});

// —— Grouping, ordering, timezone ——

test("sheets group by event-local day then by canonical room order", () => {
  const sheets = buildSheets(fixture(), TZ);
  assert.deepEqual(
    sheets.map((s) => `${s.dayKey}/${s.roomName}`),
    [
      "2026-10-12/Main Hall",
      "2026-10-12/Workshop Lab",
      "2026-10-13/Unassigned room",
    ],
    "days ascend; within a day rooms follow schedule.rooms order",
  );
});

test("rows are chronological regardless of payload order", () => {
  const main = buildSheets(fixture(), TZ).find((s) => s.roomId === "room-main")!;
  assert.deepEqual(
    main.rows.map((r) => r.title),
    ["Opening Keynote", "Closing Panel", "Evening Social"],
    "sorted by startsAt, not by slot array order",
  );
});

test("late-evening slots bucket to the event-local day, not the UTC day", () => {
  const f = fixture();
  const late = f.slots.find((s) => s.id === "slot-late")!;
  assert.equal(late.startsAt.slice(0, 10), "2026-10-13", "the ISO instant is the 13th in UTC");
  assert.equal(zonedDayKey(late.startsAt, TZ), "2026-10-12", "but the 12th in event time");
  const sheet = buildSheets(f, TZ).find((s) => s.rows.some((r) => r.sessionId === "ses-late"))!;
  assert.equal(sheet.dayKey, "2026-10-12", "and the sheet follows event time");
});

test("day ordering spans the event window via eventDayKeys and absorbs stray placements", () => {
  const f = fixture();
  const span = eventDayKeys(f.event.startsAt, f.event.endsAt, TZ);
  assert.deepEqual(span, ["2026-10-12", "2026-10-13"], "eventDayKeys owns the window");
  const keys = orderedDayKeys(f, TZ);
  for (const key of span) assert.ok(keys.includes(key), `${key} is present`);
  // A placement outside the declared window still gets ordered rather than dropped.
  const stray = { ...f, slots: [...f.slots, { id: "s-x", sessionId: "ses-a", roomId: "room-main", startsAt: "2026-10-20T17:00:00.000Z", endsAt: "2026-10-20T18:00:00.000Z" }] };
  assert.deepEqual(orderedDayKeys(stray, TZ), ["2026-10-12", "2026-10-13", "2026-10-20"]);
});

test("times render in the EXPLICIT event timezone", () => {
  assert.equal(fmtTime("2026-10-12T17:00:00.000Z", TZ), "10:00 AM");
  assert.equal(fmtTime("2026-10-12T17:00:00.000Z", "America/New_York"), "1:00 PM");
  // The page passes the payload's timezone through rather than defaulting.
  assert.match(page(), /const timeZone = d\?\.event\?\.timezone \|\| EVENT_TZ/);
  assert.match(page(), /fmtTime\(row\.startsAt, timeZone\)/);
  assert.match(page(), /fmtTime\(row\.endsAt, timeZone\)/);
  assert.match(page(), /buildSheets\(d, timeZone\)/);
});

test("day labels are full and localized to the event timezone", () => {
  assert.equal(dayLabel("2026-10-12", TZ), "Monday, October 12");
  assert.equal(dayLabel("2026-10-13", TZ), "Tuesday, October 13");
  assert.equal(dayLabel("not-a-day", TZ), "not-a-day", "bad input degrades to the key");
});

// —— Missing-value resolution ——

test("speakers and tracks resolve, and missing ones never print a raw id", () => {
  const sheets = buildSheets(fixture(), TZ);
  const lab = sheets.find((s) => s.roomId === "room-lab")!.rows[0];
  assert.equal(lab.speakers, "Ada Lovelace, Unnamed speaker", "unknown speaker id is humanized");
  assert.ok(!lab.speakers.includes("spk-"), "no raw speaker id");
  assert.equal(lab.tracks, "—", "an unresolvable track falls back to an em dash");
  assert.ok(!lab.tracks.includes("track-"), "no raw track id");

  const social = sheets.flatMap((s) => s.rows).find((r) => r.sessionId === "ses-late")!;
  assert.equal(social.speakers, "—", "no speakers at all is an em dash");
  assert.equal(social.tracks, "—");

  const orphan = sheets.find((s) => s.roomId === "room-deleted")!;
  assert.equal(orphan.roomName, "Unassigned room", "a deleted room is named, not printed as room-deleted");

  // Nothing anywhere in the built model leaks an id-looking string.
  const rendered = JSON.stringify(sheets.map((s) => [s.roomName, s.dayLabel, s.rows.map((r) => [r.title, r.speakers, r.tracks])]));
  assert.ok(!/\bspk-|\btrack-|\broom-/.test(rendered), "no raw ids in any display field");
});

test("a missing title degrades readably", () => {
  const f = fixture();
  f.sessions = [{ id: "ses-a", status: "published", speakerIds: [], trackIds: [] } as any];
  f.slots = [f.slots[1]];
  assert.equal(buildSheets(f, TZ)[0].rows[0].title, "Untitled session");
});

// —— Notes contract ——

test("optional notes render when present and abstract is never used as notes", () => {
  assert.equal(sessionNotes({ notes: "  Confidence monitor  " }), "Confidence monitor", "trimmed");
  assert.equal(sessionNotes({ avNotes: "2 handhelds" }), "2 handhelds");
  assert.equal(sessionNotes({ productionNotes: "Roll VT" }), "Roll VT");
  assert.equal(sessionNotes({ runOfShowNotes: "Walk-in music" }), "Walk-in music");
  assert.equal(sessionNotes({ operationalNotes: "Stage reset" }), "Stage reset");
  assert.equal(
    sessionNotes({ abstract: "A practical session on reliable systems." }),
    "",
    "an abstract is speaker copy, not an AV cue",
  );
  assert.equal(sessionNotes({ notes: "   " }), "", "whitespace is not notes");
  assert.equal(sessionNotes(undefined), "");
  assert.ok(!/notes.*abstract|abstract.*\bnotes\b/i.test(page().match(/export function sessionNotes[\s\S]*?\n}/)![0]));
});

test("a session with no notes yields an empty, writable ruled cell", () => {
  const rows = buildSheets(fixture(), TZ).flatMap((s) => s.rows);
  assert.equal(rows.find((r) => r.sessionId === "ses-c")!.notes, "Confidence monitor + 2 handhelds");
  assert.equal(rows.find((r) => r.sessionId === "ses-a")!.notes, "", "no notes means empty, not a placeholder string");
  // The blank cell is a ruled writing line, hidden from assistive tech.
  assert.match(page(), /row\.notes \|\| <span className="ros-blank" aria-hidden \/>/);
  assert.match(css(), /\.ros-blank\s*{[^}]*border-bottom:\s*1px dotted/);
  assert.match(css(), /\.ros-blank\s*{[^}]*min-height/);
});

// —— Unplaced section ——

test("the unplaced section lists accepted sessions that have no slot", () => {
  const unplaced = unplacedSessions(fixture());
  assert.deepEqual(unplaced.map((s: any) => s.id), ["ses-unplaced"]);
});

test("placed, cancelled, rejected and draft sessions stay out of the unplaced section", () => {
  const { warnings, ...noWarnings } = fixture();
  // A payload with NO warnings key exercises the fallback predicate. An EMPTY
  // warnings array is different and must be trusted as "nothing is unscheduled" —
  // that is the same rule SchedulePage applies.
  assert.deepEqual(unplacedSessions({ ...fixture(), warnings: [] }), [], "empty warnings means the server says none");
  const ids = unplacedSessions(noWarnings).map((s: any) => s.id);
  assert.deepEqual(ids, ["ses-unplaced"], "only accepted-and-unplaced survives the fallback rule");
  for (const excluded of ["ses-a", "ses-cancelled", "ses-rejected", "ses-draft"]) {
    assert.ok(!ids.includes(excluded), `${excluded} is not offered as unplaced`);
  }
  // A cancelled accepted session is never "unplaced" either.
  const cancelledAccepted = { sessions: [{ id: "ses-x", status: "accepted", cancelled: true }], slots: [] };
  assert.deepEqual(unplacedSessions(cancelledAccepted), []);
});

test("non-programmable placed sessions never reach a sheet", () => {
  const titles = buildSheets(fixture(), TZ).flatMap((s) => s.rows.map((r) => r.title));
  assert.ok(!titles.includes("Pulled Talk"), "a cancelled session is off the sheet");
  assert.ok(!titles.includes("Rejected Talk"), "a rejected session is off the sheet");
  assert.equal(isProgrammable({ status: "published" }), true);
  assert.equal(isProgrammable({ status: "scheduled" }), true);
  assert.equal(isProgrammable({ status: "approved" }), true);
  assert.equal(isProgrammable({ status: "accepted" }), true);
  assert.equal(isProgrammable({ status: "published", cancelled: true }), false);
  for (const status of ["rejected", "withdrawn", "declined", "draft", "submitted", "waitlisted", "unknown"]) {
    assert.equal(isProgrammable({ status }), false, `${status} is not programmable`);
  }
  assert.equal(isProgrammable(null), false);
});

// —— Header / footer / slug ——

test("every sheet carries the day label and room name for its header and footer", () => {
  const sheet = buildSheets(fixture(), TZ)[0];
  assert.equal(sheet.dayLabel, "Monday, October 12");
  assert.equal(sheet.roomName, "Main Hall");
  const src = page();
  // Header: event name, day, room, "Run of show", generated stamp.
  assert.match(src, /<p className="ros-eyebrow">{eventName}<\/p>/);
  assert.match(src, /<h2 className="ros-title">{sheet\.dayLabel}<\/h2>/);
  assert.match(src, /<p className="ros-room">{sheet\.roomName}<\/p>/);
  assert.match(src, /<p className="ros-kicker">Run of show<\/p>/);
  assert.match(src, /<p>Generated {stamp}<\/p>/);
  assert.match(src, /const stamp = generatedAt\.toLocaleString\(/);
  // Footer: the event slug.
  assert.match(src, /<footer className="ros-foot">[\s\S]*?<span>{slug}<\/span>/);
});

test("the footer slug is derived, never hardcoded", () => {
  const src = page();
  assert.ok(!/ai-engineer-summit/.test(src), "no seeded slug is baked into the page");
  assert.match(src, /const slug = d \? resolveEventSlug\(d\) : ""/);
  // With the default active event, the real slug wins.
  assert.equal(resolveEventSlug(fixture()), "ai-engineer-summit");
});

test("an unknown active event falls back to a slugified event name", async () => {
  // Runs last-ish on purpose: this mutates the module-level active event.
  const { setActiveEventId } = await import("../src/web/lib/api.js");
  setActiveEventId("evt-not-in-catalog");
  assert.equal(resolveEventSlug(fixture()), "test-summit", "slugified from schedule.event.name");
  assert.equal(
    resolveEventSlug({ event: { id: "evt-bare", name: "" } }),
    "evt-bare",
    "and finally the event id rather than an empty footer",
  );
});

// —— Empty / defensive ——

test("an empty or malformed payload produces no sheets instead of throwing", () => {
  assert.deepEqual(buildSheets(null, TZ), []);
  assert.deepEqual(buildSheets({}, TZ), []);
  assert.deepEqual(buildSheets({ slots: [], sessions: [] }, TZ), []);
  assert.deepEqual(unplacedSessions(null), []);
  assert.deepEqual(unplacedSessions({}), []);
});

// —— ARIA + testid hooks ——

test("the page shell renders its hooks before any data arrives", () => {
  const html = renderToStaticMarkup(
    createElement(StaticRouter, { location: ROUTE } as any, createElement(RunOfShowPage)),
  );
  assert.match(html, /data-testid="run-of-show-page"/);
  assert.match(html, /data-testid="run-of-show-controls"/);
  assert.match(html, /data-testid="run-of-show-print"/);
  assert.match(html, /data-testid="run-of-show-day"/);
  assert.match(html, /data-testid="run-of-show-room"/);
  assert.match(html, /aria-label="Print the run of show"/);
  assert.match(html, /aria-label="Filter sheets by day"/);
  assert.match(html, /aria-label="Filter sheets by room"/);
  assert.match(html, /Run of show/);
  // Selects are labelled, not placeholder-only.
  assert.match(html, /<label for="ros-day"/);
  assert.match(html, /<label for="ros-room"/);
  assert.match(html, /id="ros-day"/);
  assert.match(html, /id="ros-room"/);
  // Screen chrome is inside the print-hidden wrapper.
  assert.match(html, /class="ros-screen-only"/);
});

test("sheets, tables, rows and the unplaced section expose stable testids and labels", () => {
  const src = page();
  assert.match(src, /data-testid={`run-of-show-sheet-\$\{sheet\.id\}`}/);
  assert.match(src, /data-testid={`run-of-show-table-\$\{sheet\.id\}`}/);
  assert.match(src, /data-testid={`run-of-show-row-\$\{row\.sessionId\}`}/);
  assert.match(src, /data-testid="run-of-show-unplaced"/);
  assert.match(src, /data-testid="run-of-show-unplaced-table"/);
  assert.match(src, /data-testid={`run-of-show-unplaced-row-\$\{session\.id\}`}/);
  assert.match(src, /aria-label={`Run of show — \$\{sheet\.dayLabel\}, \$\{sheet\.roomName\}`}/);
  assert.match(src, /aria-label="Accepted sessions not yet placed"/);
  // Print is a real button calling the browser print dialog.
  assert.match(src, /onClick={\(\) => window\.print\(\)}/);
  // Column headings are scoped for screen readers.
  assert.equal((src.match(/scope="col"/g) || []).length, 10, "five columns on both tables");
  assert.match(src, />Notes \/ AV</);
});

test("the page refetches on mutations and event switches", () => {
  const src = page();
  assert.match(src, /api\.schedule\(\)/, "canonical schedule payload");
  assert.match(src, /return subscribeData\(load\)/, "shared refetch subscription");
  assert.ok(!/evt-[a-z0-9-]+/.test(src.replace(/evt-bare|evt-not-in-catalog/g, "")), "no hardcoded event id");
});

// —— Filter reset / clamping across an event switch ——

test("a filter naming something the new event does not have collapses to all", () => {
  const rooms = ["room-main", "room-lab"];
  assert.equal(clampFilter("room-main", rooms), "room-main", "a live selection is kept");
  assert.equal(clampFilter("all", rooms), "all");
  assert.equal(clampFilter("all", []), "all", "an event with no sheets still shows All");
  // The audit bug: a room id carried over from the previous event.
  assert.equal(clampFilter("room-main", ["room-devflow-1"]), "all", "a stale room id cannot filter");
  assert.equal(clampFilter("2026-10-12", ["2027-05-12"]), "all", "nor a stale day key");
});

test("the select value and the filter can never disagree", () => {
  const src = page();
  // Both the <select> and the sheet filter read the CLAMPED value, so the control
  // can never display "All rooms" while a stale id is still filtering.
  assert.match(src, /const activeDay = clampFilter\(day, dayKeys\)/);
  assert.match(src, /const activeRoom = clampFilter\(\s*room,\s*roomOptions\.map\(\(r\) => r\.id\),\s*\)/);
  assert.match(src, /value={activeDay}/);
  assert.match(src, /value={activeRoom}/);
  assert.match(src, /activeDay === "all" \|\| s\.dayKey === activeDay/);
  assert.match(src, /activeRoom === "all" \|\| s\.roomId === activeRoom/);
  assert.ok(!/value={day}/.test(src) && !/value={room}/.test(src), "raw state never drives a select");
});

test("switching events resets the filters without looping on ordinary refetches", () => {
  const src = page();
  // Keyed on the payload's event id.
  assert.match(src, /const eventId = d\?\.event\?\.id \? String\(d\.event\.id\) : ""/);
  assert.match(src, /useEffect\(\(\) => {[\s\S]*?seenEventId\.current && seenEventId\.current !== eventId[\s\S]*?setDay\("all"\)[\s\S]*?setRoom\("all"\)[\s\S]*?}, \[eventId\]\)/);
  // A ref, not state: the guard itself must not trigger a re-render.
  assert.match(src, /const seenEventId = useRef<string>\(""\)/);
  // Depends on the id only, so a refetch of the SAME event never resets a selection.
  assert.ok(!/}, \[d\]\);[\s\S]{0,80}setRoom\("all"\)/.test(src), "not keyed on the whole payload");
});

// —— Count copy and empty state vs. the always-final unplaced sheet ——

test("the count names the unplaced sheet as its own page", () => {
  assert.equal(printSummary(3, 3, 0), "3 day sheets · 3 placed sessions · 3 pages total");
  assert.equal(
    printSummary(3, 3, 2),
    "3 day sheets · 3 placed sessions · plus 1 “Not yet placed” sheet (2 sessions) · 4 pages total",
    "the extra printed page is stated, not hidden",
  );
  assert.equal(
    printSummary(1, 1, 1),
    "1 day sheet · 1 placed session · plus 1 “Not yet placed” sheet (1 session) · 2 pages total",
    "singulars throughout",
  );
  // The audit case: a room filter matching nothing, but unplaced work still prints.
  assert.match(
    printSummary(0, 0, 2),
    /^0 day sheets · 0 placed sessions · plus 1 .*1 page total$/,
    "the unplaced sheet alone is one page — and is still announced",
  );
  assert.equal(printSummary(0, 0, 0), "0 day sheets · 0 placed sessions · 0 pages total");
});

test("'Nothing to print' only appears when nothing will actually print", () => {
  const src = page();
  assert.match(
    src,
    /{!loading && d && !visible\.length && !unplaced\.length \? \(/,
    "the empty notice requires BOTH no day sheets and no unplaced sessions",
  );
  // And when only the unplaced sheet will print, the page says so instead.
  assert.match(src, /{!loading && d && !visible\.length && unplaced\.length \? \(/);
  assert.match(src, /only the “Not yet placed” sheet will print/);
  assert.match(src, /{printSummary\(visible\.length, placedCount, unplaced\.length\)}/);
});

test("the unplaced section stays outside the day/room filter", () => {
  const src = page();
  // It is rendered from `unplaced`, never from `visible`, because an unplaced
  // session has no day and no room to filter on.
  assert.match(src, /{unplaced\.length \? \(\s*\n\s*<section className="ros-sheet" data-testid="run-of-show-unplaced"/);
  const unplacedBlock = src.slice(src.indexOf('data-testid="run-of-show-unplaced"'));
  assert.ok(!/activeDay|activeRoom|visible/.test(unplacedBlock), "no filter reaches the final sheet");
  // And it is the LAST section, so the page-break reset lands on it.
  assert.ok(
    src.indexOf('data-testid="run-of-show-unplaced"') > src.lastIndexOf("{visible.map((sheet) => ("),
    "the unplaced sheet renders after every day sheet",
  );
});

// —— Print CSS source contracts ——

test("print CSS starts a fresh page per sheet and never splits a row", () => {
  const src = css();
  assert.match(src, /@media print/);
  const print = src.slice(src.indexOf("@media print"));
  // Portrait WITHOUT naming a sheet size: forcing A4 would misfit Letter stock.
  assert.match(print, /@page\s*{[\s\S]*?size:\s*portrait;/, "portrait, adapts to A4 or Letter");
  assert.ok(!/size:\s*A4/i.test(print), "no hardcoded A4 sheet size");
  assert.ok(!/size:\s*letter/i.test(print), "and no hardcoded Letter either");
  assert.match(print, /@page\s*{[\s\S]*?margin:\s*12mm/, "safe margins retained");
  assert.match(print, /\.ros-sheet\s*{[^}]*break-after:\s*page/, "each day+room sheet starts a page");
  assert.match(print, /\.ros-sheet\s*{[^}]*page-break-after:\s*always/, "legacy alias for older engines");
  // Anchored to the real last child of .ros-page, not the fragile :last-of-type.
  assert.match(
    print,
    /\.ros-page > \.ros-sheet:last-child\s*{[^}]*break-after:\s*auto/,
    "no trailing blank page",
  );
  assert.match(print, /\.ros-page > \.ros-sheet:last-child\s*{[^}]*page-break-after:\s*auto/);
  // Strip comments first: the rule's own comment explains why :last-of-type was dropped.
  const printRules = print.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/:last-of-type/.test(printRules), "the fragile :last-of-type selector is gone");
  assert.match(page(), /data-testid="run-of-show-page" className="ros-page"/, "the wrapper the selector needs");
  // Row and header break avoidance are screen+print rules.
  assert.match(src, /\.ros-row\s*{[^}]*break-inside:\s*avoid/);
  assert.match(src, /\.ros-row\s*{[^}]*page-break-inside:\s*avoid/);
  assert.match(src, /\.ros-sheet-head\s*{[^}]*break-inside:\s*avoid/);
  assert.match(src, /\.ros-table thead\s*{[\s\S]*?display:\s*table-header-group/, "headings repeat per page");
});

test("print CSS hides the shell and every screen-only control", () => {
  const print = css().slice(css().indexOf("@media print"));
  assert.match(print, /\[data-print="hide"\][\s\S]{0,40}\.ros-screen-only\s*{\s*display:\s*none/);
  assert.match(print, /\[data-print="main"\]\s*{[^}]*padding:\s*0/, "shell padding is reset");
  assert.match(print, /\[data-print="main"\] > div\s*{[^}]*max-width:\s*none/, "canvas max-width is reset");
  // The hooks actually exist on the organizer shell.
  const shell = shells();
  assert.match(shell, /<aside data-print="hide"/);
  assert.match(shell, /<header data-print="hide"/);
  assert.match(shell, /<main id="main" data-print="main"/);
  // And the page wraps its controls in the print-hidden class.
  assert.match(page(), /className="ros-screen-only"/);
});

test("print CSS is black on white", () => {
  const print = css().slice(css().indexOf("@media print"));
  assert.match(print, /html,\s*\n?\s*body\s*{[^}]*background:\s*#fff/);
  assert.match(print, /html,\s*\n?\s*body\s*{[^}]*color:\s*#000/);
  assert.match(print, /\.ros-table th,[\s\S]*?color:\s*#000/);
  assert.match(print, /background:\s*#fff\s*!important/);
  assert.match(print, /a\[href\]::after\s*{[^}]*content:\s*""/, "no printed link URLs");
});
