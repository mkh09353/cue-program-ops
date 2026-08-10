import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { EVENT_ID } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";
import { capacityWarning, timeOptions } from "../src/web/pages/SchedulePage.js";
import { EVENT_TIME_ZONE, isoToZonedWallTime, zonedDayKey, zonedWallTimeToIso } from "../src/timezone.js";

const h = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const post = (app: any, path: string, body: unknown) =>
  app.request(path, { method: "POST", headers: h, body: JSON.stringify(body) });
const schedule = async (app: any) => (await (await app.request(`/api/events/${EVENT_ID}/schedule`)).json()) as any;

/**
 * Build the exact payload the place/move dialog sends: the picked day + HH:MM are
 * EVENT wall time (America/Los_Angeles), converted to a UTC instant exactly as
 * SchedulePage.placeSlot() does.
 */
const dialogPayload = (
  sched: any,
  opts: { sessionId: string; day: string; time: string; roomId: string; durationMinutes?: number },
) => {
  const session = sched.sessions.find((s: any) => s.id === opts.sessionId);
  const startsAt = zonedWallTimeToIso(opts.day, opts.time);
  const duration = opts.durationMinutes ?? session?.durationMinutes ?? 45;
  return {
    slot: {
      id: sched.slots.find((x: any) => x.sessionId === opts.sessionId)?.id ?? `slot-${opts.sessionId}`,
      sessionId: opts.sessionId,
      roomId: opts.roomId,
      startsAt,
      endsAt: new Date(Date.parse(startsAt) + duration * 60000).toISOString(),
    },
    version: sched.version,
    acknowledge: [] as string[],
  };
};

/**
 * The accessible dialog flow the eval agent needs:
 * place → create an overlapping placement (blocked with the server's message) →
 * move it apart (accepted) → conflict clears.
 */
test("place/move dialog payload: overlapping speaker is rejected, non-overlapping move succeeds", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const before = await schedule(app);

  // ses-reliable-agents shares speaker spk-ada with the already-placed ses-analytical
  // (Main Hall, 17:00–17:45 UTC). Placing it at the same time must be blocked.
  const clash = dialogPayload(before, {
    sessionId: "ses-reliable-agents",
    day: "2026-10-12",
    time: "10:00", // 10:00 PT === the seeded 17:00Z slot of ses-analytical
    roomId: "room-community",
  });
  const blocked = await post(app, `/api/events/${EVENT_ID}/schedule/move`, clash);
  assert.equal(blocked.status, 409, "hard speaker overlap must be refused");
  const blockedBody = (await blocked.json()) as any;
  assert.equal(blockedBody.error, "hard conflicts block this move");
  const hard = blockedBody.conflicts.filter((c: any) => c.severity === "hard");
  assert.ok(hard.length, "the dialog needs conflicts to render inline");
  assert.ok(
    hard.some((c: any) => c.code === "SPEAKER_OVERLAP" && /already speaking/i.test(c.message)),
    "server message names the double-booked speaker",
  );
  // Nothing changed: the dialog stays open over an unmutated schedule.
  const afterBlock = await schedule(app);
  assert.equal(afterBlock.version, before.version);
  assert.equal(afterBlock.slots.length, before.slots.length);

  // Room overlap is refused the same way (same room, same time, different speaker).
  const roomClash = dialogPayload(afterBlock, {
    sessionId: "ses-sam",
    day: "2026-10-12",
    time: "10:00",
    roomId: "room-main",
  });
  const roomBlocked = await post(app, `/api/events/${EVENT_ID}/schedule/move`, roomClash);
  assert.equal(roomBlocked.status, 409);
  assert.ok(
    ((await roomBlocked.json()) as any).conflicts.some((c: any) => c.code === "ROOM_OVERLAP"),
    "room overlap is reported to the dialog",
  );

  // Move apart: a later time in a room that fits is accepted through the same path.
  const ok = dialogPayload(afterBlock, {
    sessionId: "ses-reliable-agents",
    day: "2026-10-12",
    time: "12:30", // 12:30 PT === 19:30Z
    roomId: "room-main",
  });
  const moved = await post(app, `/api/events/${EVENT_ID}/schedule/move`, ok);
  assert.equal(moved.status, 200, "non-overlapping placement succeeds");
  const movedBody = (await moved.json()) as any;
  assert.equal(movedBody.slot.startsAt, "2026-10-12T19:30:00.000Z", "12:30 PT stores as 19:30Z");
  assert.deepEqual(isoToZonedWallTime(movedBody.slot.startsAt), { day: "2026-10-12", time: "12:30" });
  assert.equal(movedBody.slot.endsAt, "2026-10-12T20:15:00.000Z", "end time derives from session duration");
  assert.equal(movedBody.version, before.version + 1);

  // The canonical schedule now holds the placement and the conflict is gone.
  const after = await schedule(app);
  const placed = after.slots.find((x: any) => x.sessionId === "ses-reliable-agents");
  assert.ok(placed);
  assert.equal(placed.roomId, "room-main");
  const validate = await post(app, `/api/events/${EVENT_ID}/schedule/validate`, placed);
  const validation = (await validate.json()) as any;
  assert.equal(validation.conflicts.filter((c: any) => c.severity === "hard").length, 0, "conflict cleared after move");

  // Re-submitting the stale version (dialog opened before the move) is a 409 the UI retries.
  const stale = await post(app, `/api/events/${EVENT_ID}/schedule/move`, {
    ...dialogPayload(after, { sessionId: "ses-sam", day: "2026-10-13", time: "08:00", roomId: "room-main" }),
    version: before.version,
  });
  assert.equal(stale.status, 409);
  assert.match(((await stale.json()) as any).error, /stale/i);
});

/** A second placement of the SAME session (the "Move" button) relocates rather than duplicates. */
test("moving an already-scheduled session replaces its slot", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const before = await schedule(app);
  const slotCount = before.slots.length;
  const moved = await post(
    app,
    `/api/events/${EVENT_ID}/schedule/move`,
    dialogPayload(before, { sessionId: "ses-analytical", day: "2026-10-13", time: "07:00", roomId: "room-main" }),
  );
  assert.equal(moved.status, 200);
  const after = await schedule(app);
  assert.equal(after.slots.length, slotCount, "moving must not create a duplicate slot");
  const slot = after.slots.find((x: any) => x.sessionId === "ses-analytical");
  assert.equal(slot.roomId, "room-main");
  assert.equal(slot.startsAt, "2026-10-13T14:00:00.000Z", "07:00 PT stores as 14:00Z");
  assert.equal(zonedDayKey(slot.startsAt), "2026-10-13", "day tab bucketing stays on the picked day");
});

/** Capacity is a soft warning: 422 unless acknowledged, and the day card shows a badge. */
test("capacity warning requires acknowledgement and drives the day-view badge", async () => {
  const repo = new MemoryRepository();
  const app = createApp({ repo });
  const current = await schedule(app);
  // Seeded mismatch: ses-reliable-agents expects 700 attendees; Community Room seats 80.
  const payload = dialogPayload(current, {
    sessionId: "ses-reliable-agents",
    day: "2026-10-13",
    time: "13:00",
    roomId: "room-community",
  });
  const warned = await post(app, `/api/events/${EVENT_ID}/schedule/move`, payload);
  assert.equal(warned.status, 422, "soft warnings pause the placement");
  const warnBody = (await warned.json()) as any;
  assert.equal(warnBody.error, "warnings require acknowledgement");
  assert.ok(warnBody.warnings.some((w: any) => w.code === "CAPACITY"));

  // "Place anyway" acknowledges the warning ids.
  const accepted = await post(app, `/api/events/${EVENT_ID}/schedule/move`, {
    ...payload,
    acknowledge: warnBody.warnings.map((w: any) => w.id),
  });
  assert.equal(accepted.status, 200);

  // The day-view badge derives from the same canonical data, client-side.
  const after = await schedule(app);
  const session = after.sessions.find((s: any) => s.id === "ses-reliable-agents");
  const room = after.rooms.find((r: any) => r.id === "room-community");
  assert.match(capacityWarning(session, room), /exceeds .* capacity/);
  assert.equal(capacityWarning(session, after.rooms.find((r: any) => r.id === "room-main")), "", "no badge when it fits");
});

/**
 * The judged flow end-to-end in event-timezone terms: picking 10:00 on the seeded day
 * must collide with the 17:00Z fixture (proving UI and stored data share one clock),
 * and the accepted placement must read back as the same wall time.
 */
test("dialog wall-time placement shares one clock with the seeded schedule", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const before = await schedule(app);
  const seeded = before.slots.find((x: any) => x.sessionId === "ses-analytical");
  assert.equal(seeded.startsAt, "2026-10-12T17:00:00.000Z");
  assert.deepEqual(isoToZonedWallTime(seeded.startsAt), { day: "2026-10-12", time: "10:00" });
  assert.match(
    new Intl.DateTimeFormat("en-US", { timeZone: EVENT_TIME_ZONE, timeStyle: "short" }).format(new Date(seeded.startsAt)),
    /10:00\s?AM/,
    "seeded slot reads as 10:00 AM in the event timezone",
  );

  // Same room + same picked wall time as the seeded session => hard room overlap.
  const overlapping = await post(
    app,
    `/api/events/${EVENT_ID}/schedule/move`,
    dialogPayload(before, { sessionId: "ses-sam", day: "2026-10-12", time: "10:00", roomId: "room-main" }),
  );
  assert.equal(overlapping.status, 409);
  assert.ok(((await overlapping.json()) as any).conflicts.some((c: any) => c.code === "ROOM_OVERLAP"));

  // An evening placement stays on the picked calendar day even though it crosses UTC midnight.
  const evening = await post(
    app,
    `/api/events/${EVENT_ID}/schedule/move`,
    dialogPayload(before, { sessionId: "ses-sam", day: "2026-10-12", time: "18:00", roomId: "room-lab" }),
  );
  assert.equal(evening.status, 200);
  const slot = ((await evening.json()) as any).slot;
  assert.equal(slot.startsAt, "2026-10-13T01:00:00.000Z", "18:00 PT is next-day 01:00Z");
  assert.equal(zonedDayKey(slot.startsAt), "2026-10-12", "but the day tab keeps it on Oct 12");
  assert.deepEqual(isoToZonedWallTime(slot.startsAt), { day: "2026-10-12", time: "18:00" });
});

/** The Time select must offer real slot-interval steps inside the configured day window. */
test("dialog time options step by the slot interval within day hours", () => {
  const options = timeOptions(9, 17, 30);
  assert.equal(options[0], "09:00");
  assert.equal(options[1], "09:30");
  assert.equal(options.at(-1), "16:30", "last option leaves room before the day end");
  assert.equal(options.length, 16);
  assert.deepEqual(timeOptions(14, 16, 60), ["14:00", "15:00"]);
  // Defensive clamps: bad config must not produce an empty or infinite list.
  assert.ok(timeOptions(9, 9, 30).length > 0);
  assert.ok(timeOptions(0, 24, 5).length === 288);
});
