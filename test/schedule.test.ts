import test from "node:test";
import assert from "node:assert/strict";
import { demoSchedule } from "../src/repository.js";
import { overlaps, scheduleWarnings, validateSlot } from "../src/schedule.js";
import { canonicalFromSchedule, publicSpeakers } from "../src/projection.js";
import { isoToZonedWallTime } from "../src/timezone.js";

test("half-open ranges allow adjacent sessions",()=>assert.equal(overlaps({startsAt:"2026-10-12T17:00:00.000Z",endsAt:"2026-10-12T17:45:00.000Z"},{startsAt:"2026-10-12T17:45:00.000Z",endsAt:"2026-10-12T18:00:00.000Z"}),false));
test("speaker and room conflicts are hard and deterministic",()=>{const candidate={id:"preview",sessionId:"ses-reliable-agents",roomId:"room-main",startsAt:"2026-10-12T17:00:00.000Z",endsAt:"2026-10-12T17:45:00.000Z"};const one=validateSlot(structuredClone(demoSchedule),candidate);const shuffled={...structuredClone(demoSchedule),slots:[...demoSchedule.slots].reverse(),sessions:[...demoSchedule.sessions].reverse()};const two=validateSlot(shuffled,candidate);assert.deepEqual(one.conflicts,two.conflicts);assert.deepEqual(one.conflicts.map(x=>x.code),["ROOM_OVERLAP","SPEAKER_OVERLAP"]);assert.ok(one.conflicts.every(x=>x.severity==="hard"))});
test("capacity is warning and accepted unscheduled sessions are visible",()=>{const candidate={id:"preview",sessionId:"ses-product",roomId:"room-community",startsAt:"2026-10-12T19:00:00.000Z",endsAt:"2026-10-12T19:45:00.000Z"};assert.equal(validateSlot(demoSchedule,candidate).conflicts[0]?.code,"CAPACITY");assert.equal(scheduleWarnings(demoSchedule).map(x=>x.relatedIds[0]).join(","),"ses-reliable-agents,ses-sam")});
test("canonical projection only exposes eligible public speakers",()=>{assert.deepEqual(publicSpeakers(demoSchedule).map(x=>x.id),["spk-ada","spk-lin","spk-margaret"]);const out=canonicalFromSchedule("evt-ai-summit-2026",demoSchedule);assert.ok(out.sessions.some(x=>x.id==="ses-analytical"));assert.ok(out.sessions.every(x=>x.startsAt.startsWith("2026-10-1")))});
test("repository seed slots render within 08:00-18:00 America/Los_Angeles",()=>{
 for(const slot of demoSchedule.slots){
  for(const key of ["startsAt","endsAt"] as const){
   const {time}=isoToZonedWallTime(slot[key]);
   const hour=Number(time.slice(0,2)),minute=Number(time.slice(3,5));
   assert.ok(hour>=8&&hour<=18,`${slot.id} ${key} ${slot[key]} renders ${time} local — outside 08:00-18:00`);
   if(hour===18)assert.equal(minute,0,`${slot.id} ${key} renders after the 18:00 local boundary`);
  }
 }
});
