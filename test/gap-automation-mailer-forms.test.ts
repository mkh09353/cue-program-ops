import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { getEventStore, resetEventRegistry, SECOND_EVENT_ID } from "../src/events.js";
import { EVENT_ID } from "../src/lifecycle.js";
import { MockMailer, type Mailer } from "../src/mailer.js";
import { MemoryRepository } from "../src/repository.js";

const org={"content-type":"application/json","x-demo-persona":"org-swyx"};
const json=async(r:Response)=>(await r.json()) as any;

test("scheduled automation processes due reminders for every registered event",async()=>{
  resetEventRegistry(); const app=createApp({repo:new MemoryRepository()});
  for(const [eventId,suffix] of [[EVENT_ID,"one"],[SECOND_EVENT_ID,"two"]] as const){const life=getEventStore(eventId)!;const speakerId=`spk-auto-${suffix}`;life.profiles.push({speakerId,name:`Automation ${suffix}`,email:`auto-${suffix}@example.test`} as any);life.tasks.push({id:`task-auto-${suffix}`,speakerId,title:"Due automation task",type:"confirm",required:true,status:"not_started",dueAt:new Date(Date.now()+86400000).toISOString()})}
  const response=await app.request("https://cue.internal/api/internal/automation/run",{method:"POST",headers:{"x-cue-automation":"scheduled"}});assert.equal(response.status,200);const result=(await json(response)).data;
  assert.ok(result.eventResults.some((x:any)=>x.eventId===EVENT_ID&&x.speakerSent>=1));assert.ok(result.eventResults.some((x:any)=>x.eventId===SECOND_EVENT_ID&&x.speakerSent>=1));
  for(const eventId of [EVENT_ID,SECOND_EVENT_ID]){const life=getEventStore(eventId)!;assert.ok(life.communications.some(c=>c.subject.includes("Reminder")),`${eventId} logs its reminder`);assert.equal(life.automation.eventResults?.[0]?.eventId,eventId)}resetEventRegistry();
});

test("provider id is retained per recipient while mock sends stay unchanged",async()=>{
  resetEventRegistry();const real:Mailer={async send(){return {status:"sent",providerId:"re_evidence_123"}}};const app=createApp({repo:new MemoryRepository(),mailer:real});
  const sent=await app.request(`/api/events/${EVENT_ID}/comms/send`,{method:"POST",headers:org,body:JSON.stringify({templateKey:"task_reminder",speakerId:"spk-ada"})});assert.equal(sent.status,201);assert.equal((await json(sent)).data[0].providerId,"re_evidence_123");
  const detail=(await json(await app.request(`/api/events/${EVENT_ID}/speakers/spk-ada`,{headers:org}))).data;assert.equal(detail.communications.find((c:any)=>c.providerId)?.providerId,"re_evidence_123");
  resetEventRegistry();const mockApp=createApp({repo:new MemoryRepository(),mailer:new MockMailer()});const mocked=(await json(await mockApp.request(`/api/events/${EVENT_ID}/comms/send`,{method:"POST",headers:org,body:JSON.stringify({templateKey:"task_reminder",speakerId:"spk-ada"})}))).data[0];assert.equal(mocked.status,"mock_sent");assert.equal(mocked.providerId,undefined);resetEventRegistry();
});

test("organizer-assigned form task round-trips schema and speaker responses",async()=>{
  resetEventRegistry();const app=createApp({repo:new MemoryRepository()});const schema=[{key:"shirt_size",label:"Shirt size",type:"select",required:true,options:["S","M","L"]},{key:"av_needs",label:"AV needs",type:"textarea",required:false},{key:"arrival_date",label:"Arrival date",type:"text",required:true}];
  const assigned=await app.request(`/api/events/${EVENT_ID}/speakers/tasks`,{method:"POST",headers:org,body:JSON.stringify({title:"Speaker details form",type:"form",speakerIds:["spk-ada"],dueAt:new Date(Date.now()+86400000).toISOString(),formSchema:schema})});assert.equal(assigned.status,201);const task=(await json(assigned)).data[0];const persona=getEventStore(EVENT_ID)!.personas.find(p=>p.speakerId==="spk-ada")!;const speakerHeaders={"content-type":"application/json","x-demo-persona":persona.id};
  const portalResponse=await app.request(`/api/speaker/events/${EVENT_ID}/tasks/${task.id}`,{headers:speakerHeaders});assert.equal(portalResponse.status,200);const portal=(await json(portalResponse)).data.task;assert.deepEqual(portal.formSchema,schema);
  const submitted=await app.request(`/api/speaker/events/${EVENT_ID}/tasks/${task.id}/form`,{method:"POST",headers:speakerHeaders,body:JSON.stringify({answers:{shirt_size:"M",av_needs:"HDMI confidence monitor",arrival_date:"2026-10-11"}})});assert.equal(submitted.status,200);
  const record=(await json(await app.request(`/api/events/${EVENT_ID}/speakers/spk-ada`,{headers:org}))).data;const answered=record.tasks.find((t:any)=>t.id===task.id);assert.equal(answered.formAnswers.av_needs,"HDMI confidence monitor");assert.equal(answered.status,"completed");resetEventRegistry();
});
