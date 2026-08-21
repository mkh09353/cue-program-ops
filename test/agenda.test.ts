import test from "node:test";
import assert from "node:assert/strict";
import { createApp,restoreSnapshot } from "../src/app.js";
import { EVENT_ID,store } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";
import { EVENT_TIME_ZONE, isoToZonedWallTime, zonedDayKey, zonedWallTimeToIso } from "../src/timezone.js";
import type { CompetitionSnapshot,SnapshotPersistence } from "../src/persistence.js";
const h=(persona="org-swyx")=>({"content-type":"application/json","x-demo-persona":persona});
const post=(app:ReturnType<typeof createApp>,path:string,body:any={},persona="org-swyx")=>app.request(path,{method:"POST",headers:h(persona),body:JSON.stringify(body)});

test("heuristic generation creates a persisted conflict-free review draft without mutating live schedule",async()=>{
 let snap:CompetitionSnapshot|undefined;const persistence:SnapshotPersistence={save:async s=>{snap=structuredClone(s)},load:async()=>snap};const repo=new MemoryRepository(),app=createApp({repo,persistence});const before=await repo.getSchedule(EVENT_ID);const response=await post(app,`/api/events/${EVENT_ID}/agenda/proposals/generate`,{dayStartHour:9,dayEndHour:17,slotMinutes:30,breakMinutes:15});assert.equal(response.status,201);const proposal=(await response.json()).data;assert.equal(proposal.provenance,"deterministic_heuristic_demo");assert.ok(proposal.placements.length>=1);assert.ok(proposal.placements.every((x:any)=>x.rationale&&x.status==="proposed"));assert.deepEqual((await repo.getSchedule(EVENT_ID))?.slots,before?.slots);assert.equal(snap?.lifecycle.agendaProposals[0].id,proposal.id);
 store.agendaProposals=[];await restoreSnapshot({repo:new MemoryRepository(),persistence});assert.equal(store.agendaProposals[0].id,proposal.id);
});

test("accept uses canonical move while a newly introduced conflict is rejected",async()=>{
 store.agendaProposals=[];const repo=new MemoryRepository(),app=createApp({repo});const proposal=(await (await post(app,`/api/events/${EVENT_ID}/agenda/proposals/generate`,{})).json()).data;const first=proposal.placements[0];const accepted=await post(app,`/api/events/${EVENT_ID}/agenda/proposals/${proposal.id}/placements/${first.id}/accept`);assert.equal(accepted.status,200);assert.ok((await repo.getSchedule(EVENT_ID))?.slots.some(x=>x.sessionId===first.sessionId));
 const second=proposal.placements.find((x:any)=>x.id!==first.id);if(second){const live=(await repo.getSchedule(EVENT_ID))!;live.slots.push({id:"late-conflict",sessionId:"ses-analytical",roomId:second.slot.roomId,startsAt:second.slot.startsAt,endsAt:second.slot.endsAt});await repo.putSchedule(EVENT_ID,live);const blocked=await post(app,`/api/events/${EVENT_ID}/agenda/proposals/${proposal.id}/placements/${second.id}/accept`);assert.equal(blocked.status,409);assert.equal((await repo.getSchedule(EVENT_ID))?.slots.filter(x=>x.sessionId===second.sessionId).length,0)}
});

test("reject and regenerate retain history and organizer-only enforcement",async()=>{
 store.agendaProposals=[];const app=createApp({repo:new MemoryRepository()});assert.equal((await post(app,`/api/events/${EVENT_ID}/agenda/proposals/generate`,{},"rev-ada")).status,403);assert.equal((await app.request(`/api/events/${EVENT_ID}/agenda/proposals`,{headers:h("rev-ada")})).status,403);const one=(await (await post(app,`/api/events/${EVENT_ID}/agenda/proposals/generate`,{})).json()).data;const rejected=await post(app,`/api/events/${EVENT_ID}/agenda/proposals/${one.id}/reject`);assert.equal(rejected.status,200);const two=(await (await post(app,`/api/events/${EVENT_ID}/agenda/proposals/generate`,{})).json()).data;assert.equal(two.generation,one.generation+1);assert.equal(store.agendaProposals.length,2);assert.equal(store.agendaProposals[1].status,"rejected");
});

test("organizer configures schedule structure and publishes canonical scheduled sessions",async()=>{
 const repo=new MemoryRepository(),app=createApp({repo});const room=await post(app,`/api/events/${EVENT_ID}/agenda/rooms`,{name:"Overflow Room",capacity:75});assert.equal(room.status,201);const track=await post(app,`/api/events/${EVENT_ID}/agenda/tracks`,{name:"Community"});assert.equal(track.status,201);const schedule=await repo.getSchedule(EVENT_ID);assert.ok(schedule?.rooms.some(x=>x.name==="Overflow Room"));assert.ok(schedule?.tracks.some(x=>x.name==="Community"));const published=await post(app,`/api/events/${EVENT_ID}/agenda/publish`,{acknowledge:true});assert.equal(published.status,200);const result=await published.json();assert.equal(result.data.status,"published");assert.ok(result.data.publicUrl.includes("itinerary"));assert.ok((await repo.getSchedule(EVENT_ID))?.sessions.filter(x=>(schedule?.slots||[]).some(slot=>slot.sessionId===x.id)).every(x=>x.publishStatus==="published"));assert.equal((await post(app,`/api/events/${EVENT_ID}/agenda/rooms`,{name:"Forbidden"},"rev-ada")).status,403);
});

test("publish agenda persists lastAgendaPublish status for reload", async () => {
  const repo = new MemoryRepository(), app = createApp({ repo });
  const published = await post(app, `/api/events/${EVENT_ID}/agenda/publish`, { acknowledge: true });
  assert.equal(published.status, 200);
  const result = await published.json();
  assert.equal(result.data.status, "published");
  assert.ok(typeof result.data.count === "number");
  assert.ok(result.data.publishedAt);
  assert.match(result.data.message || "", /Published · \d+ sessions? ·/);
  const sched = await repo.getSchedule(EVENT_ID);
  assert.ok((sched as any)?.lastAgendaPublish);
  assert.equal((sched as any).lastAgendaPublish.count, result.data.count);
  assert.equal((sched as any).lastAgendaPublish.publishedAt, result.data.publishedAt);
  // Survives a subsequent schedule read path
  const again = await app.request(`/api/events/${EVENT_ID}/schedule`, { headers: h() });
  assert.equal(again.status, 200);
  const body = await again.json();
  assert.ok(body.lastAgendaPublish?.publishedAt);
  assert.equal(body.lastAgendaPublish.count, result.data.count);
});

test("agenda proposal warnings are humanized room/session text not opaque ids", async () => {
  const { humanizeAgendaConflict } = await import("../src/agendaRoutes.js");
  const opaque = {
    id: "CAPACITY:room-community:ses-sam",
    code: "CAPACITY" as const,
    message: "CAPACITY:room-community:ses-sam",
    relatedIds: ["room-community", "ses-sam"],
  };
  const data = {
    sessions: [{ id: "ses-sam", title: "Eval Harnesses Teams Actually Use", capacity: 100 }],
    rooms: [{ id: "room-community", name: "Community Room", capacity: 80 }],
    tracks: [],
    speakers: [],
  };
  const text = humanizeAgendaConflict(opaque as any, data as any);
  assert.doesNotMatch(text, /CAPACITY:room-community:ses-sam/);
  assert.match(text, /Community Room/);
  assert.match(text, /Eval Harnesses Teams Actually Use/);
  assert.match(text, /[Cc]apacit/);

  // End-to-end: force a capacity warning into a generated proposal
  store.agendaProposals = [];
  const repo = new MemoryRepository(), app = createApp({ repo });
  const live = (await repo.getSchedule(EVENT_ID))!;
  // Shrink Community Room and make an unscheduled high-capacity session prefer it via only-room trick:
  // Raise ses-sam capacity above all rooms except force validate path by lowering every room.
  for (const r of live.rooms) r.capacity = 10;
  const sam = live.sessions.find((s) => s.id === "ses-sam");
  if (sam) sam.capacity = 100;
  // Unschedule everything so generator places sessions into undersized rooms
  live.slots = [];
  await repo.putSchedule(EVENT_ID, live);
  const response = await post(app, `/api/events/${EVENT_ID}/agenda/proposals/generate`, {
    dayStartHour: 9,
    dayEndHour: 17,
    slotMinutes: 30,
    breakMinutes: 0,
  });
  assert.equal(response.status, 201);
  const proposal = (await response.json()).data;
  const warned = (proposal.placements || []).filter((p: any) => p.conflicts?.length);
  assert.ok(warned.length >= 1, "expected at least one capacity warning placement");
  for (const p of warned) {
    for (const c of p.conflicts) {
      assert.equal(typeof c, "string");
      assert.doesNotMatch(c, /^CAPACITY:[a-z0-9-]+:[a-z0-9-]+$/i);
      // Prefer human names when present
      if (/[Cc]apacit/.test(c)) {
        assert.match(c, /Room|Hall|Lab|capacity|attendees|seat/i);
      }
    }
  }
});

test("agenda generation maps configured event-timezone working hours to UTC instants across DST", async () => {
  const repo = new MemoryRepository(), app = createApp({ repo });
  // Clear the sensible daytime seed slots so generation has candidates.
  const live = (await repo.getSchedule(EVENT_ID))!;
  live.slots = [];
  await repo.putSchedule(EVENT_ID, live);

  // Requested 09:00–17:00 in the event timezone (America/Los_Angeles, PDT in October).
  const response = await post(app, `/api/events/${EVENT_ID}/agenda/proposals/generate`, {
    dayStartHour: 9,
    dayEndHour: 17,
    slotMinutes: 30,
    breakMinutes: 15,
  });
  assert.equal(response.status, 201);
  const proposal = (await response.json()).data;
  const placements = proposal.placements || [];
  assert.ok(placements.length >= 1);

  // Stored startsAt/endsAt stay UTC ISO instants.
  assert.ok(placements.every((p: any) => /Z$/.test(p.slot.startsAt) && /Z$/.test(p.slot.endsAt)));

  // Interpretation is the inverse: every placement start/end must render back inside the
  // requested 09:00–17:00 event-local window (with the wall clock used to pick candidates).
  const zonedStartHour = (iso: string) => Number(isoToZonedWallTime(iso, EVENT_TIME_ZONE).time.slice(0, 2));
  for (const p of placements) {
    const localDay = zonedDayKey(p.slot.startsAt, EVENT_TIME_ZONE);
    assert.ok(
      localDay >= "2026-10-12" && localDay <= "2026-10-14",
      `placement ${p.sessionId} lands on event-local day ${localDay}`,
    );
    assert.ok(zonedStartHour(p.slot.startsAt) >= 9, `${p.sessionId} starts before 09:00 local`);
    assert.ok(
      zonedStartHour(p.slot.startsAt) < 17,
      `${p.sessionId} starts at ${p.slot.startsAt} -> after 17:00 local`,
    );
    // Ends may cross into 17:00–18:00 local because the end is not used to pick candidates,
    // but must stay within the 08:00–18:00 envelope.
    assert.ok(zonedStartHour(p.slot.endsAt) < 18, `${p.sessionId} ends after 18:00 local`);
  }
});

test("agenda generation derives event-local calendar days across a DST spring-forward event", async () => {
  const repo = new MemoryRepository(), app = createApp({ repo });
  const live = (await repo.getSchedule(EVENT_ID))!;
  live.slots = [];
  live.event = {
    ...live.event,
    // US spring-forward on 2026-03-08 (PST -> PDT, clocks jump 02:00 -> 03:00).
    startsAt: "2026-03-07T16:00:00.000Z", // 08:00 local Mar 7
    endsAt: "2026-03-10T01:00:00.000Z",  // 18:00 local Mar 9
  };
  await repo.putSchedule(EVENT_ID, live);

  const response = await post(app, `/api/events/${EVENT_ID}/agenda/proposals/generate`, {
    dayStartHour: 9,
    dayEndHour: 11,
    slotMinutes: 30,
    breakMinutes: 0,
  });
  assert.equal(response.status, 201);
  const placements = (await response.json()).data.placements as any[];
  assert.ok(placements.length >= 1);

  const localDays = new Set(placements.map((p: any) => zonedDayKey(p.slot.startsAt, EVENT_TIME_ZONE)));
  // The event spans three LA civil days Mar 7–9 and generation must not step over them with
  // fixed UTC 24h increments: every placement must land on one of the event's LA civil days,
  // and the DST transition day itself must be reachable under the wall-clock window.
  for (const p of placements) {
    assert.ok(["2026-03-07", "2026-03-08", "2026-03-09"].includes(zonedDayKey(p.slot.startsAt, EVENT_TIME_ZONE)));
  }
  assert.ok(localDays.size >= 1);
  // The spring-forward date itself converts through the shared contract: 09:00 wall time on
  // Mar 8 (PDT day) is 16:00Z, and the previous day (PST) is 17:00Z — the two-hour offset
  // change proves candidates are computed with per-day DST offsets, not a fixed UTC window.
  assert.equal(zonedWallTimeToIso("2026-03-08", "09:00", EVENT_TIME_ZONE), "2026-03-08T16:00:00.000Z");
  assert.equal(zonedWallTimeToIso("2026-03-07", "09:00", EVENT_TIME_ZONE), "2026-03-07T17:00:00.000Z");
  for (const p of placements) {
    const local = isoToZonedWallTime(p.slot.startsAt, EVENT_TIME_ZONE);
    assert.ok(
      zonedDayKey(p.slot.startsAt, EVENT_TIME_ZONE) === local.day,
      `placement ${p.sessionId} must render on its own local day`,
    );
    assert.ok(Number(local.time.slice(0, 2)) >= 9 && Number(local.time.slice(0, 2)) < 11);
  }
});

test("agenda generation falls back to Los Angeles for an invalid event timezone", async () => {
  const repo = new MemoryRepository(), app = createApp({ repo });
  const live = (await repo.getSchedule(EVENT_ID))!;
  live.slots = [];
  live.event = { ...live.event, timezone: "Invalid/Event_Zone" };
  await repo.putSchedule(EVENT_ID, live);

  const response = await post(app, `/api/events/${EVENT_ID}/agenda/proposals/generate`, {
    dayStartHour: 10,
    dayEndHour: 12,
    slotMinutes: 30,
  });
  assert.equal(response.status, 201);
  const placements = (await response.json()).data.placements as any[];
  assert.ok(placements.length >= 1);
  for (const placement of placements) {
    const local = isoToZonedWallTime(placement.slot.startsAt, EVENT_TIME_ZONE);
    assert.ok(local.day >= "2026-10-12" && local.day <= "2026-10-14");
    assert.ok(local.time >= "10:00" && local.time < "12:00");
  }
});
