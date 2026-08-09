import test from "node:test";
import assert from "node:assert/strict";
import { createApp,restoreSnapshot } from "../src/app.js";
import { EVENT_ID,store } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";
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
 const repo=new MemoryRepository(),app=createApp({repo});const room=await post(app,`/api/events/${EVENT_ID}/agenda/rooms`,{name:"Overflow Room",capacity:75});assert.equal(room.status,201);const track=await post(app,`/api/events/${EVENT_ID}/agenda/tracks`,{name:"Community"});assert.equal(track.status,201);const schedule=await repo.getSchedule(EVENT_ID);assert.ok(schedule?.rooms.some(x=>x.name==="Overflow Room"));assert.ok(schedule?.tracks.some(x=>x.name==="Community"));const published=await post(app,`/api/events/${EVENT_ID}/agenda/publish`);assert.equal(published.status,200);const result=await published.json();assert.equal(result.data.status,"published");assert.ok(result.data.publicUrl.includes("itinerary"));assert.ok((await repo.getSchedule(EVENT_ID))?.sessions.filter(x=>(schedule?.slots||[]).some(slot=>slot.sessionId===x.id)).every(x=>x.publishStatus==="published"));assert.equal((await post(app,`/api/events/${EVENT_ID}/agenda/rooms`,{name:"Forbidden"},"rev-ada")).status,403);
});
