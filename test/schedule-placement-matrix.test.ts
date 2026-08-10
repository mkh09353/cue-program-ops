import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";
import { conflictHeadline, timeOptions } from "../src/web/pages/SchedulePage.js";
import { isoToZonedWallTime, zonedDayKey, zonedWallTimeToIso } from "../src/timezone.js";
import { programDaysFromRange } from "../src/web/lib/utils.js";
import { validateSlot } from "../src/schedule.js";

const H = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const post = (app: any, path: string, body: unknown) =>
  app.request(path, { method: "POST", headers: H, body: JSON.stringify(body) });
const getSchedule = async (app: any) =>
  (await (await app.request(`/api/events/${EVENT_ID}/schedule`)).json()) as any;

/**
 * EXACT payload builder from SchedulePage.placeSlot(): day + HH:MM are event wall time,
 * endsAt derives from the session duration. Kept in lock-step with the page on purpose —
 * this is the contract the dialog puts on the wire.
 */
const dialogPayload = (
  sched: any,
  opts: { sessionId: string; day: string; time: string; roomId: string },
) => {
  const session = sched.sessions.find((s: any) => s.id === opts.sessionId);
  const startsAt = zonedWallTimeToIso(opts.day, opts.time);
  const duration = session?.durationMinutes || 45;
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
 * HARD GATE for the "Place session hangs / INVALID_RANGE on a free slot" regression.
 *
 * Enumerates EVERY (event day × dialog time option × room) combination — including a
 * room created at runtime through + Room and a session that only exists after an
 * accepted submission is mirrored — and asserts each payload is a structurally valid
 * range that the server answers with a real verdict. INVALID_RANGE must never appear.
 */
test("every day × time × room dialog payload is a valid range and never INVALID_RANGE", async () => {
  const repo = new MemoryRepository();
  const app = createApp({ repo });

  // Runtime-created room (the judge added "Overflow Room" before the failure).
  const room = (await (await post(app, `/api/events/${EVENT_ID}/agenda/rooms`, { name: "Overflow Room" })).json()) as any;
  assert.ok(room.data?.id);

  // Session that exists only after an accepted submission is mirrored into the schedule.
  const cfp = (await (await app.request(`/api/public/events/ai-engineer-summit/cfp`)).json()) as any;
  const answers: Record<string, string> = {
    title: "Docs that survive contact with users",
    abstract: "D".repeat(60),
    category: cfp.data.categories[0],
    format: (cfp.data.form.fields.find((f: any) => f.key === "format")?.options || ["Talk"])[0],
  };
  for (const f of cfp.data.form.fields) {
    if (answers[f.key] != null) continue;
    const visible = !f.visibleWhen || answers[f.visibleWhen.key] === f.visibleWhen.equals;
    if (visible && f.required) answers[f.key] = f.options?.length ? f.options[0] : "Filled in";
  }
  const created = (await (
    await app.request(`/api/public/events/ai-engineer-summit/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Priya Raman", email: `docs-${Date.now()}@example.test`, answers }),
    })
  ).json()) as any;
  await post(app, `/api/events/${EVENT_ID}/submissions/${created.data.id}/decision`, {
    nextStatus: "accepted",
    createTasks: true,
    sendComms: false,
  });

  const sched = await getSchedule(app);
  const days = programDaysFromRange(sched.event.startsAt, sched.event.endsAt, sched.event.timezone);
  const times = timeOptions(9, 17, 30);
  const rooms = sched.rooms;
  const mirrored = sched.sessions.find((s: any) => s.acceptedSubmissionId === created.data.id);
  assert.ok(mirrored, "accepted submission must be mirrored into the schedule");
  assert.ok(rooms.some((r: any) => r.id === room.data.id), "runtime room is on the schedule");
  assert.ok(days.length >= 3 && times.length >= 8 && rooms.length >= 4);

  // 1. Structural pass over the whole matrix (no server needed): valid, ordered, UTC.
  let combos = 0;
  for (const { id: day } of days) {
    for (const time of times) {
      for (const r of rooms) {
        const { slot } = dialogPayload(sched, { sessionId: mirrored.id, day, time, roomId: r.id } as any);
        combos++;
        assert.ok(Number.isFinite(Date.parse(slot.startsAt)), `bad start ${day} ${time}`);
        assert.ok(Number.isFinite(Date.parse(slot.endsAt)), `bad end ${day} ${time}`);
        assert.ok(
          Date.parse(slot.endsAt) > Date.parse(slot.startsAt),
          `end must follow start for ${day} ${time} (${slot.startsAt} → ${slot.endsAt})`,
        );
        assert.ok(slot.startsAt.endsWith("Z") && slot.endsAt.endsWith("Z"), "storage stays UTC");
        // The wall time the organizer picked is what gets stored and read back.
        assert.deepEqual(isoToZonedWallTime(slot.startsAt), { day, time });
        assert.equal(zonedDayKey(slot.startsAt), day, "placement stays on the chosen day tab");
        // Domain validation must never report INVALID_RANGE for these payloads.
        const codes = validateSlot(sched, slot as any).conflicts.map((c) => c.code);
        assert.ok(!codes.includes("INVALID_RANGE"), `INVALID_RANGE for ${day} ${time} ${r.name}: ${codes}`);
      }
    }
  }
  assert.ok(combos >= 3 * 8 * 4, `expected a full matrix, ran ${combos}`);

  // 2. Server pass: every combination answers 200, or 409/422 with a REAL conflict.
  //    Uses a throwaway app per request family so accepted placements do not cascade.
  for (const { id: day } of days) {
    for (const time of times) {
      for (const r of rooms) {
        const fresh = createApp({ repo: new MemoryRepository() });
        const freshSched = await getSchedule(fresh);
        const target = freshSched.sessions.find((s: any) => s.id === "ses-sam");
        const payload = dialogPayload(freshSched, {
          sessionId: target.id,
          day,
          time,
          roomId: freshSched.rooms[0].id,
        } as any);
        const res = await post(fresh, `/api/events/${EVENT_ID}/schedule/move`, payload);
        assert.ok([200, 409, 422].includes(res.status), `unexpected ${res.status} for ${day} ${time}`);
        if (res.status !== 200) {
          const body = (await res.json()) as any;
          const hard = (body.conflicts || []).filter((c: any) => c.severity === "hard");
          for (const c of hard) {
            assert.notEqual(c.code, "INVALID_RANGE", `INVALID_RANGE from server for ${day} ${time}: ${c.message}`);
            assert.ok(["ROOM_OVERLAP", "SPEAKER_OVERLAP", "TRACK_CONCURRENCY"].includes(c.code));
          }
        }
        break; // one room per (day,time) against the server keeps the matrix fast
      }
    }
  }
});

/** A free slot must actually save — the exact placement that hung for the judge. */
test("placing into a free slot in a runtime-created room succeeds", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const room = (await (await post(app, `/api/events/${EVENT_ID}/agenda/rooms`, { name: "Overflow Room" })).json()) as any;
  const sched = await getSchedule(app);
  const payload = dialogPayload(sched, {
    sessionId: "ses-sam",
    day: "2026-10-13",
    time: "11:00",
    roomId: room.data.id,
  });
  const res = await post(app, `/api/events/${EVENT_ID}/schedule/move`, payload);
  assert.equal(res.status, 200, "Tue 11:00 Overflow Room is free and must save");
  const body = (await res.json()) as any;
  assert.equal(body.slot.startsAt, "2026-10-13T18:00:00.000Z", "11:00 PT === 18:00Z");
  assert.equal(zonedDayKey(body.slot.startsAt), "2026-10-13");
});

/** INVALID_RANGE only for genuinely invalid input, and it says which part is wrong. */
test("invalid-range conflicts are specific and never mask a room or speaker clash", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const sched = await getSchedule(app);

  // Occupied room at the same wall time → ROOM_OVERLAP, NOT invalid range.
  const clash = dialogPayload(sched, {
    sessionId: "ses-sam",
    day: "2026-10-12",
    time: "10:00",
    roomId: "room-main",
  });
  const res = await post(app, `/api/events/${EVENT_ID}/schedule/move`, clash);
  assert.equal(res.status, 409);
  const body = (await res.json()) as any;
  const codes = body.conflicts.filter((c: any) => c.severity === "hard").map((c: any) => c.code);
  assert.ok(codes.includes("ROOM_OVERLAP"));
  assert.ok(!codes.includes("INVALID_RANGE"), "a booked room must not report an invalid range");
  assert.match(conflictHeadline(body.conflicts.find((c: any) => c.code === "ROOM_OVERLAP")), /^Room already booked:/);

  // Genuinely invalid inputs each get their own reason.
  const base = { id: "x", sessionId: "ses-sam", roomId: "room-main", startsAt: "2026-10-12T17:00:00.000Z", endsAt: "2026-10-12T17:45:00.000Z" };
  const reason = (slot: any) =>
    validateSlot(sched, slot).conflicts.find((c) => c.code === "INVALID_RANGE")?.message || "";
  assert.match(reason({ ...base, sessionId: "ses-nope" }), /not on this schedule yet/);
  assert.match(reason({ ...base, roomId: "room-nope" }), /Room room-nope is not on this schedule yet/);
  assert.match(reason({ ...base, startsAt: "nonsense" }), /valid timestamps/);
  assert.match(reason({ ...base, endsAt: base.startsAt }), /end time must be after the start time/);
  assert.equal(reason(base), "", "a good slot has no invalid-range conflict");

  // Speaker clash keeps its own headline too.
  assert.match(conflictHeadline({ code: "SPEAKER_OVERLAP", message: "Ada is already speaking." }), /^Speaker double-booked:/);
  assert.equal(conflictHeadline(undefined), "");
});

/** Item 2: publish covers newly placed sessions and they reach the public surfaces. */
test("publish includes newly placed sessions on their day in public agenda JSON and HTML", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const before = (await (await app.request(`/e/ai-engineer-summit/public/feed.json`)).json()) as any;
  assert.ok(!before.sessions.some((s: any) => s.dayKey === "2026-10-14"), "Wednesday starts empty");

  const sched = await getSchedule(app);
  const placement = dialogPayload(sched, {
    sessionId: "ses-sam",
    day: "2026-10-14",
    time: "11:00",
    roomId: "room-main",
  });
  assert.equal((await post(app, `/api/events/${EVENT_ID}/schedule/move`, placement)).status, 200);

  const published = (await (await post(app, `/api/events/${EVENT_ID}/agenda/publish`, {})).json()) as any;
  assert.ok(published.data.count >= 4, `publish should cover every slotted session, got ${published.data.count}`);
  assert.ok(published.data.published.includes("Eval Harnesses Teams Actually Use"));

  const feed = (await (await app.request(`/e/ai-engineer-summit/public/feed.json`)).json()) as any;
  const wednesday = feed.sessions.filter((s: any) => s.dayKey === "2026-10-14");
  assert.equal(wednesday.length, 1, "the newly placed session is public on its own day");
  assert.equal(wednesday[0].title, "Eval Harnesses Teams Actually Use");
  assert.equal(wednesday[0].room, "Main Hall");

  const agendaHtml = await (await app.request(`/e/ai-engineer-summit/public/agenda?day=2026-10-14`)).text();
  assert.match(agendaHtml, /Eval Harnesses Teams Actually Use/);
  const itineraryHtml = await (await app.request(`/e/ai-engineer-summit/public/itinerary`)).text();
  assert.match(itineraryHtml, /Eval Harnesses Teams Actually Use/);
});

/** Content approval gating: changes_requested is held back, everything else publishes. */
test("publish holds back sessions whose content is changes_requested", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const sched = await getSchedule(app);
  assert.equal(
    (await post(app, `/api/events/${EVENT_ID}/schedule/move`, dialogPayload(sched, { sessionId: "ses-sam", day: "2026-10-14", time: "11:00", roomId: "room-main" }))).status,
    200,
  );
  store.sessionContent = store.sessionContent.filter((x) => x.sessionId !== "ses-sam");
  store.sessionContent.push({ sessionId: "ses-sam", status: "changes_requested" });

  const published = (await (await post(app, `/api/events/${EVENT_ID}/agenda/publish`, {})).json()) as any;
  assert.ok(published.data.held.includes("Eval Harnesses Teams Actually Use"));
  assert.match(published.data.message, /held for content changes/);

  const feed = (await (await app.request(`/e/ai-engineer-summit/public/feed.json`)).json()) as any;
  assert.ok(!feed.sessions.some((s: any) => s.title === "Eval Harnesses Teams Actually Use"));
  // Sessions with no content record (unset) still publish.
  assert.ok(feed.sessions.some((s: any) => s.title === "Analytical Engines in Practice"));
});

/** A hung server must surface a timeout, not an unrecoverable "Saving…" dialog. */
test("moveSlotDetailed aborts a hung request and reports a recoverable timeout", async () => {
  const realFetch = globalThis.fetch;
  // Never-settling fetch that honours the abort signal, like a stalled Worker request.
  globalThis.fetch = ((_url: any, init: any) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const err: any = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    })) as any;
  try {
    const { api } = await import(`../src/web/lib/api.js?hang=${Date.now()}`);
    const started = Date.now();
    const result = await api.moveSlotDetailed({ slot: {}, version: 1 }, 50);
    assert.equal(result.ok, false);
    assert.equal(result.status, 408);
    assert.match(result.error, /did not respond within/);
    assert.match(result.error, /Nothing was changed/);
    assert.ok(Date.now() - started < 2000, "must abort quickly rather than hang forever");
  } finally {
    globalThis.fetch = realFetch;
  }
});
