import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { EVENT_ID } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";
import { MAX_RECENT_PLACEMENTS, recordPlacement, validateSlot } from "../src/schedule.js";
import { zonedDayKey, zonedWallTimeToIso } from "../src/timezone.js";

const H = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const post = (app: any, path: string, body: unknown) =>
  app.request(path, { method: "POST", headers: H, body: JSON.stringify(body) });
const json = async (res: Response) => (await res.json()) as any;
const schedule = async (app: any) => await json(await app.request(`/api/events/${EVENT_ID}/schedule`));
const placeBody = (sched: any, sessionId: string, day: string, time: string, roomId: string) => {
  const startsAt = zonedWallTimeToIso(day, time);
  const duration = sched.sessions.find((s: any) => s.id === sessionId)?.durationMinutes || 45;
  return {
    slot: { id: `slot-${sessionId}`, sessionId, roomId, startsAt, endsAt: new Date(Date.parse(startsAt) + duration * 60000).toISOString() },
    version: sched.version,
    acknowledge: [] as string[],
  };
};

/** Item 2: placements are recorded on the canonical schedule and survive a reload. */
test("recent placements persist on the schedule and are returned on reload", async () => {
  const repo = new MemoryRepository();
  const app = createApp({ repo });
  const before = await schedule(app);
  assert.ok(!before.lastPlacements?.length, "no placements yet");

  // Place on Wednesday — the exact case that looked "lost" on a Monday-default reload.
  const res = await post(app, `/api/events/${EVENT_ID}/schedule/move`, placeBody(before, "ses-sam", "2026-10-14", "15:45", "room-main"));
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.ok(body.placement, "the move response carries a placement receipt");
  assert.equal(body.placement.dayKey, "2026-10-14");
  assert.equal(body.placement.roomName, "Main Hall");
  assert.equal(body.placement.title, "Eval Harnesses Teams Actually Use");
  assert.equal(body.placement.source, "manual");

  // A fresh GET (what a browser reload does) still shows it.
  const after = await schedule(app);
  assert.equal(after.lastPlacements.length, 1);
  assert.equal(after.lastPlacements[0].sessionId, "ses-sam");
  assert.equal(after.lastPlacements[0].dayKey, "2026-10-14");
  assert.equal(zonedDayKey(after.lastPlacements[0].startsAt), "2026-10-14");

  // It is stored on the schedule object itself, so snapshots carry it automatically.
  const stored = await (repo as any).getSchedule(EVENT_ID);
  assert.equal(stored.lastPlacements[0].sessionId, "ses-sam");
});

/** Newest-first, de-duplicated per session, and bounded to five. */
test("recent placements are newest-first, deduplicated and capped", () => {
  const data: any = {
    version: 1,
    event: { startsAt: "2026-10-12T16:00:00.000Z", endsAt: "2026-10-15T01:00:00.000Z", timezone: "America/Los_Angeles" },
    rooms: [{ id: "room-main", name: "Main Hall" }],
    tracks: [],
    speakers: [],
    slots: [],
    sessions: Array.from({ length: 7 }, (_, i) => ({
      id: `s${i}`,
      title: `Session ${i}`,
      abstract: "",
      speakerIds: [],
      trackIds: [],
      durationMinutes: 45,
      status: "accepted",
      publishStatus: "draft",
      slug: `s${i}`,
    })),
  };
  for (let i = 0; i < 7; i++) {
    recordPlacement(data, { id: `slot-s${i}`, sessionId: `s${i}`, roomId: "room-main", startsAt: `2026-10-12T1${i}:00:00.000Z`, endsAt: `2026-10-12T1${i}:45:00.000Z` });
  }
  assert.equal(data.lastPlacements.length, MAX_RECENT_PLACEMENTS);
  assert.equal(data.lastPlacements[0].sessionId, "s6", "newest first");

  // Re-placing an existing session moves it to the top instead of duplicating.
  recordPlacement(data, { id: "slot-s3", sessionId: "s3", roomId: "room-main", startsAt: "2026-10-13T09:00:00.000Z", endsAt: "2026-10-13T09:45:00.000Z" });
  assert.equal(data.lastPlacements[0].sessionId, "s3");
  assert.equal(data.lastPlacements.filter((p: any) => p.sessionId === "s3").length, 1);
  assert.equal(data.lastPlacements.length, MAX_RECENT_PLACEMENTS);
});

/** AI-accepted placements are recorded too, tagged as such. */
test("AI accepted placements are recorded as ai-sourced", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  await schedule(app);
  const gen = await json(await post(app, `/api/events/${EVENT_ID}/agenda/proposals/generate`, { dayStartHour: 9, dayEndHour: 17, slotMinutes: 30 }));
  assert.ok(gen.data.placements.length);
  const accepted = await post(app, `/api/events/${EVENT_ID}/agenda/proposals/${gen.data.id}/accept`, {});
  assert.equal(accepted.status, 200);
  const after = await schedule(app);
  assert.ok(after.lastPlacements.length >= 1);
  assert.ok(after.lastPlacements.every((p: any) => p.source === "ai"));
  assert.ok(after.lastPlacements.every((p: any) => p.title && p.roomName && p.dayKey));
});

/** Item 5: a room clash names the room, the wall-clock window and the occupant. */
test("room overlap conflict names the room, window and occupying session", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const sched = await schedule(app);
  const res = await post(app, `/api/events/${EVENT_ID}/schedule/move`, placeBody(sched, "ses-sam", "2026-10-12", "10:00", "room-main"));
  assert.equal(res.status, 409);
  const body = await json(res);
  const roomConflict = body.conflicts.find((c: any) => c.code === "ROOM_OVERLAP");
  assert.ok(roomConflict, "a room clash must be reported");
  assert.match(roomConflict.message, /^Main Hall is already occupied/);
  assert.match(roomConflict.message, /10:00–10:45/, "names the occupied wall-clock window");
  assert.match(roomConflict.message, /by Analytical Engines in Practice\.$/, "names the occupying session");

  // The pure validator agrees (used by the dialog's pre-check).
  const direct = validateSlot(sched, placeBody(sched, "ses-sam", "2026-10-12", "10:00", "room-main").slot as any);
  assert.match(direct.conflicts.find((c) => c.code === "ROOM_OVERLAP")!.message, /Main Hall is already occupied 10:00–10:45 by Analytical Engines in Practice\./);
});

/** Item 3: a stale version that retries into a real conflict must surface that conflict. */
test("stale-version retry that hits a conflict returns the real conflict, not a bare error", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const stale = await schedule(app);

  // Advance the schedule so the captured version goes stale.
  assert.equal((await post(app, `/api/events/${EVENT_ID}/schedule/move`, placeBody(stale, "ses-reliable-agents", "2026-10-14", "09:00", "room-main"))).status, 200);

  // First attempt with the stale version → 409 "stale schedule", no conflicts.
  const staleAttempt = await post(app, `/api/events/${EVENT_ID}/schedule/move`, placeBody(stale, "ses-sam", "2026-10-12", "10:00", "room-main"));
  assert.equal(staleAttempt.status, 409);
  const staleBody = await json(staleAttempt);
  assert.match(staleBody.error, /stale/i);
  assert.equal((staleBody.conflicts || []).length, 0, "the stale response carries no conflict detail");

  // The retry (fresh version) is what must surface the real reason to the dialog.
  const fresh = await schedule(app);
  const retry = await post(app, `/api/events/${EVENT_ID}/schedule/move`, placeBody(fresh, "ses-sam", "2026-10-12", "10:00", "room-main"));
  assert.equal(retry.status, 409);
  const retryBody = await json(retry);
  const hard = retryBody.conflicts.filter((c: any) => c.severity === "hard");
  assert.ok(hard.length, "the retry response carries the real conflicts the dialog renders");
  assert.ok(hard.some((c: any) => c.code === "ROOM_OVERLAP"));
  assert.match(hard.find((c: any) => c.code === "ROOM_OVERLAP").message, /Main Hall is already occupied/);

  // Nothing was placed by either attempt.
  const after = await schedule(app);
  assert.ok(!after.slots.some((s: any) => s.sessionId === "ses-sam" && s.roomId === "room-main"));
});

/** The dialog wiring: one success path, one failure path, and it never closes on failure. */
test("place dialog routes both first attempt and stale retry through shared handlers", () => {
  const page = readFileSync(new URL("../src/web/pages/SchedulePage.tsx", import.meta.url), "utf8");
  const submit = page.slice(page.indexOf("const submitPlace"), page.indexOf("if (!d && !err) return <Spinner"));
  assert.match(submit, /const succeed = \(placed: any\) =>/);
  assert.match(submit, /const fail = \(result:/);
  assert.match(submit, /if \(again\.ok\) return succeed\(slot\);\s*\n\s*return fail\(again\);/, "retry failure goes through fail()");
  assert.ok(!/setPlace\(null\)/.test(submit.slice(submit.indexOf("const fail"))), "fail() never closes the dialog");
  assert.match(submit, /Never close on failure/);
});

/** Items 1 + 4: day auto-switch, flash highlight, rich toast, remembered tab. */
test("schedule page announces placements and restores the last viewed day", () => {
  const page = readFileSync(new URL("../src/web/pages/SchedulePage.tsx", import.meta.url), "utf8");
  // Item 1
  assert.match(page, /const announcePlacement = \(slot: any, verb = "Placed"\)/);
  assert.match(page, /setSelectedDay\(dayKey\)/);
  assert.match(page, /setJustPlaced\(slot\.sessionId\)/);
  assert.match(page, /window\.setTimeout\(\(\) => setJustPlaced/, "highlight clears itself");
  assert.match(page, /toast\(`\$\{verb\} · \$\{day\?\.label \|\| dayKey\} · \$\{fmtTime\(slot\.startsAt\)\} · \$\{roomName\}`\)/);
  assert.match(page, /announcePlacement\(slot, "Scheduled"\)/, "drag-drop path announces too");
  assert.match(page, /ring-2 ring-brand-500/, "flash outline");
  // Item 2
  assert.match(page, /data-testid="recent-placements"/);
  assert.match(page, /d\.lastPlacements \|\| \[\]/);
  // Item 4
  assert.match(page, /sessionStorage\.getItem\("cue-schedule-day"\)/);
  assert.match(page, /sessionStorage\.setItem\("cue-schedule-day", selectedDay\)/);
});
