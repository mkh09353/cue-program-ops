import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { MemoryRepository } from "../src/repository.js";
import { MockAcceleventsClient } from "../src/accelevents.js";

const post=(app:ReturnType<typeof createApp>,path:string,body:unknown,headers:Record<string,string>={})=>app.request(path,{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body)});

test("accepted canonical session schedules, publishes only eligible speakers, and reaches sync preview",async()=>{
 const repo=new MemoryRepository(), app=createApp({repo,client:new MockAcceleventsClient()});
 const created=await post(app,"/api/public/events/ai-engineer-summit/submissions",{name:"Canonical Person",email:"canonical@example.test",answers:{title:"Canonical Talk",abstract:"A canonical test session",category:"Engineering",format:"Talk",experience:"advanced"}});
 const submission=await created.json(); const id=submission.data.id;
 await post(app,`/api/events/evt-ai-summit-2026/submissions/${id}/decision`,{nextStatus:"accepted"},{"x-demo-role":"organizer"});
 const schedule=await (await app.request("/api/events/evt-ai-summit-2026/schedule")).json(); const session=schedule.sessions.find((x:any)=>x.title==="Canonical Talk"); assert.ok(session);
 const move=await post(app,"/api/events/evt-ai-summit-2026/schedule/move",{version:schedule.version,slot:{id:"slot-canonical",sessionId:session.id,roomId:"room-community",startsAt:"2026-10-12T20:00:00.000Z",endsAt:"2026-10-12T20:45:00.000Z"},acknowledge:[]}); assert.equal(move.status,200);
 const preview=await (await post(app,"/sync/preview",{eventId:"evt-ai-summit-2026"})).json(); assert.ok(preview.items.some((x:any)=>x.localId===session.id));
 const after=await (await app.request("/api/events/evt-ai-summit-2026/schedule")).json(); const item=after.sessions.find((x:any)=>x.id===session.id); item.publishStatus="published"; item.status="published"; await repo.putSchedule("evt-ai-summit-2026",after);
 const itinerary=await (await app.request("/public/events/evt-ai-summit-2026/itinerary.json")).json(); assert.ok(itinerary.sessions.some((x:any)=>x.title==="Canonical Talk"));
 const speakers=await (await app.request("/public/events/evt-ai-summit-2026/speakers.json")).json(); assert.ok(speakers.speakers.some((x:any)=>x.name==="Canonical Person")); assert.ok(!speakers.speakers.some((x:any)=>x.name==="Grace Hopper"));
});

test("hard schedule conflict returns 409 without mutating canonical version",async()=>{const app=createApp({repo:new MemoryRepository()});const before=await (await app.request("/api/events/evt-ai-summit-2026/schedule")).json();const response=await post(app,"/api/events/evt-ai-summit-2026/schedule/move",{version:before.version,slot:{id:"blocked",sessionId:"ses-reliable-agents",roomId:"room-main",startsAt:"2026-10-12T17:00:00.000Z",endsAt:"2026-10-12T17:45:00.000Z"}});assert.equal(response.status,409);const after=await (await app.request("/api/events/evt-ai-summit-2026/schedule")).json();assert.equal(after.version,before.version);assert.equal(after.slots.length,before.slots.length)});
