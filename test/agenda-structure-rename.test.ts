import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { EVENT_ID } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";
import { capacityWarningMessage, validateSlot } from "../src/schedule.js";
import { capacityWarning } from "../src/web/pages/SchedulePage.js";

const org = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const json = async (res: Response) => (await res.json()) as any;
const send = (app: any, method: string, path: string, body?: unknown, headers: any = org) =>
  app.request(path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test("room rename keeps the id, the placements and bumps the schedule version", async () => {
  const repo = new MemoryRepository();
  const app = createApp({ repo });
  const before = await json(await app.request(`/api/events/${EVENT_ID}/schedule`, { headers: org }));
  const slotsInMain = before.slots.filter((s: any) => s.roomId === "room-main").map((s: any) => s.id);
  assert.ok(slotsInMain.length >= 1, "fixture needs a placement in the room we rename");

  const renamed = await send(app, "PATCH", `/api/events/${EVENT_ID}/agenda/rooms/room-main`, { name: "Room 2A" });
  assert.equal(renamed.status, 200);
  assert.equal((await json(renamed)).data.id, "room-main", "id is stable");

  const after = await json(await app.request(`/api/events/${EVENT_ID}/schedule`, { headers: org }));
  const room = after.rooms.find((r: any) => r.id === "room-main");
  assert.equal(room.name, "Room 2A");
  assert.ok(!after.rooms.some((r: any) => r.name === "Main Hall"), "old name is gone");
  assert.deepEqual(
    after.slots.filter((s: any) => s.roomId === "room-main").map((s: any) => s.id),
    slotsInMain,
    "existing placements stay linked to the renamed room",
  );
  assert.ok(after.version > before.version, "schedule version advances");

  // The canonical stored schedule was mutated (not just the response).
  const stored = await (repo as any).getSchedule(EVENT_ID);
  assert.equal(stored.rooms.find((r: any) => r.id === "room-main").name, "Room 2A");
});

test("room rename accepts capacity and rejects blank, duplicate, unknown and bad capacity", async () => {
  const app = createApp({ repo: new MemoryRepository() });

  const withCapacity = await send(app, "PATCH", `/api/events/${EVENT_ID}/agenda/rooms/room-lab`, { capacity: 200 });
  assert.equal(withCapacity.status, 200);
  assert.equal((await json(withCapacity)).data.capacity, 200);

  const blank = await send(app, "PATCH", `/api/events/${EVENT_ID}/agenda/rooms/room-lab`, { name: "   " });
  assert.equal(blank.status, 400);
  assert.match((await json(blank)).error.message, /room name is required/);

  // Case-insensitive duplicate against another room.
  const dupe = await send(app, "PATCH", `/api/events/${EVENT_ID}/agenda/rooms/room-lab`, { name: "  main hall  " });
  assert.equal(dupe.status, 409);
  assert.match((await json(dupe)).error.message, /another room already uses that name/);

  // Renaming to its own name (different case) is allowed.
  assert.equal((await send(app, "PATCH", `/api/events/${EVENT_ID}/agenda/rooms/room-lab`, { name: "workshop lab" })).status, 200);

  assert.equal((await send(app, "PATCH", `/api/events/${EVENT_ID}/agenda/rooms/room-nope`, { name: "Ghost" })).status, 404);
  assert.equal((await send(app, "PATCH", `/api/events/${EVENT_ID}/agenda/rooms/room-lab`, { capacity: 0 })).status, 400);
  assert.equal((await send(app, "PATCH", `/api/events/${EVENT_ID}/agenda/rooms/room-lab`, { capacity: -5 })).status, 400);
});

test("track rename persists canonically and validates like rooms", async () => {
  const repo = new MemoryRepository();
  const app = createApp({ repo });
  const before = await json(await app.request(`/api/events/${EVENT_ID}/schedule`, { headers: org }));
  const track = before.tracks[0];
  const sessionsOnTrack = before.sessions.filter((s: any) => s.trackIds?.includes(track.id)).map((s: any) => s.id);

  const renamed = await send(app, "PATCH", `/api/events/${EVENT_ID}/agenda/tracks/${track.id}`, { name: "Platform & Infra" });
  assert.equal(renamed.status, 200);
  assert.equal((await json(renamed)).data.id, track.id, "track id is stable");

  const after = await json(await app.request(`/api/events/${EVENT_ID}/schedule`, { headers: org }));
  assert.equal(after.tracks.find((t: any) => t.id === track.id).name, "Platform & Infra");
  assert.deepEqual(
    after.sessions.filter((s: any) => s.trackIds?.includes(track.id)).map((s: any) => s.id),
    sessionsOnTrack,
    "sessions keep their track link",
  );
  assert.ok(after.version > before.version);
  assert.equal((await (repo as any).getSchedule(EVENT_ID)).tracks.find((t: any) => t.id === track.id).name, "Platform & Infra");

  assert.equal((await send(app, "PATCH", `/api/events/${EVENT_ID}/agenda/tracks/${track.id}`, { name: "" })).status, 400);
  const other = after.tracks.find((t: any) => t.id !== track.id);
  assert.equal((await send(app, "PATCH", `/api/events/${EVENT_ID}/agenda/tracks/${track.id}`, { name: other.name.toUpperCase() })).status, 409);
  assert.equal((await send(app, "PATCH", `/api/events/${EVENT_ID}/agenda/tracks/track-nope`, { name: "Ghost" })).status, 404);
  // Optional canonical property from the model.
  const capped = await send(app, "PATCH", `/api/events/${EVENT_ID}/agenda/tracks/${track.id}`, { maxConcurrent: 2 });
  assert.equal(capped.status, 200);
  assert.equal((await json(capped)).data.maxConcurrent, 2);
});

test("structure mutations require an organizer persona", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const speaker = { "content-type": "application/json", "x-demo-persona": "spk-ada" };
  assert.equal((await send(app, "PATCH", `/api/events/${EVENT_ID}/agenda/rooms/room-main`, { name: "Nope" }, speaker)).status, 403);
  assert.equal((await send(app, "PATCH", `/api/events/${EVENT_ID}/agenda/tracks/track-eng`, { name: "Nope" }, speaker)).status, 403);
  const after = await json(await app.request(`/api/events/${EVENT_ID}/schedule`, { headers: org }));
  assert.equal(after.rooms.find((r: any) => r.id === "room-main").name, "Main Hall", "nothing changed");
});

test("room creation stays instant and accepts an optional positive capacity", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const withCap = await json(await send(app, "POST", `/api/events/${EVENT_ID}/agenda/rooms`, { name: "Room 2A", capacity: 120 }));
  assert.equal(withCap.data.capacity, 120);
  assert.ok(withCap.data.id.startsWith("room-"));

  const without = await json(await send(app, "POST", `/api/events/${EVENT_ID}/agenda/rooms`, { name: "Room 2B" }));
  assert.equal(without.data.capacity, undefined, "capacity stays optional");

  // A capacity-bearing runtime room now participates in the advisory warning.
  const sched = await json(await app.request(`/api/events/${EVENT_ID}/schedule`, { headers: org }));
  const session = sched.sessions.find((s: any) => (s.capacity || 0) > 120);
  assert.ok(session, "fixture needs a session bigger than the new room");
  const conflicts = validateSlot(sched, {
    id: "probe",
    sessionId: session.id,
    roomId: withCap.data.id,
    startsAt: "2026-10-14T18:00:00.000Z",
    endsAt: "2026-10-14T18:45:00.000Z",
  } as any).conflicts;
  const capacity = conflicts.find((c) => c.code === "CAPACITY");
  assert.ok(capacity, "runtime room with capacity produces the advisory warning");
  assert.equal(capacity!.severity, "warning", "capacity never becomes a hard conflict");
});

test("capacity warning copy states expected, capacity, overage and that it is advisory", () => {
  const message = capacityWarningMessage(700, "Workshop Lab", 150);
  assert.match(message, /Expected attendance 700/);
  assert.match(message, /Workshop Lab capacity 150/);
  assert.match(message, /over by 550/);
  assert.match(message, /advisory only, placement is allowed/);

  // The organizer cards render the identical sentence (one source of truth).
  assert.equal(capacityWarning({ capacity: 700 }, { name: "Workshop Lab", capacity: 150 }), message);
  assert.equal(capacityWarning({ capacity: 100 }, { name: "Main Hall", capacity: 900 }), "", "no warning when it fits");
  assert.equal(capacityWarning({ capacity: 100 }, { name: "New Room" }), "", "unknown room capacity stays silent");

  // Server conflict carries the same copy, still only a warning.
  const conflict = validateSlot(
    {
      version: 1,
      rooms: [{ id: "r", name: "Workshop Lab", capacity: 150 }],
      tracks: [],
      speakers: [],
      slots: [],
      sessions: [{ id: "s", title: "Big", abstract: "", speakerIds: [], trackIds: [], durationMinutes: 45, capacity: 700, status: "accepted", publishStatus: "draft", slug: "s" }],
    } as any,
    { id: "x", sessionId: "s", roomId: "r", startsAt: "2026-10-12T17:00:00.000Z", endsAt: "2026-10-12T17:45:00.000Z" } as any,
  ).conflicts.find((c) => c.code === "CAPACITY")!;
  assert.equal(conflict.severity, "warning");
  assert.equal(conflict.message, message);
});

/** Organizer controls exist for renaming and for the optional capacity input. */
test("schedule page exposes inline rename controls and a capacity input", () => {
  const page = readFileSync(new URL("../src/web/pages/SchedulePage.tsx", import.meta.url), "utf8");
  assert.match(page, /aria-label="New room capacity"/);
  assert.match(page, /api\.createAgendaRoom\(capacity > 0 \? \{ name, capacity \} : \{ name \}\)/);
  assert.match(page, /data-testid=\{`rename-\$\{view === "track" \? "track" : "room"\}-\$\{lane\.id\}`\}/);
  assert.match(page, /agenda\/\$\{path\}\/\$\{encodeURIComponent\(renaming\.id\)\}/);
  assert.match(page, /method: "PATCH"/);
  assert.ok(!/window\.prompt|\bprompt\(/.test(page), "inline form, not a browser prompt");
  // Full advisory sentence on list/week cards, not just a badge.
  assert.match(page, /data-testid=\{`capacity-warning-list-\$\{slot\.sessionId\}`\}/);
  assert.match(page, /data-testid=\{`capacity-warning-week-\$\{slot\.sessionId\}`\}/);
});
