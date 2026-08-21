import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { completeTaskForSpeaker, icsForSession, reminderPlans, reviewForRound, safeEmbed, sendTemplate, store, upsertResource, validateCfpSubmission } from "../src/lifecycle.js";

const app=createApp();
const json=async(path:string,init?:RequestInit)=>{const res=await app.request(path,init);return {res,body:await res.json()}};

test("CFP rejects invalid categories and enforces normalized-email quota",()=>{
  assert.equal(validateCfpSubmission({category:"Nope"},"quota@example.test").ok,false);
  const old=store.form.maxPerUser;store.form.maxPerUser=1;
  store.submissions.push({id:"quota-a",eventId:store.event.id,speakerId:"spk-quota",name:"Q",email:"Quota@Example.Test",title:"T",abstract:"A",category:"AI Engineering",format:"Talk (30 min)",answers:{},status:"submitted",reviewBoard:"engineering",round:"r1",createdAt:"2026-01-01T00:00:00Z"});
  const result=validateCfpSubmission({title:"T",abstract:"A",category:"AI Engineering",format:"Talk (30 min)",experience:"Beginner"}," quota@example.test ");
  assert.equal(result.ok,false);if(!result.ok)assert.match(result.error,/limit/);store.form.maxPerUser=old;
});

test("review rounds preserve R1 history when R2 is created",()=>{
  const original=store.reviews.find(r=>r.id==="rev-grace-r1")!;const before={...original,scores:{...original.scores}};
  const r2=reviewForRound(original.submissionId,original.reviewerId,"r2");r2.scores={clarity:5};r2.status="submitted";
  assert.notEqual(r2.id,original.id);assert.equal(original.round,before.round);assert.deepEqual(original.scores,before.scores);
});

test("speaker ownership and required-upload task integrity are enforced",()=>{
  const slides=store.tasks.find(t=>t.speakerId==="spk-ada"&&t.type==="slides")!;
  const other=completeTaskForSpeaker(slides.id,"spk-sam");assert.equal(other.ok,false);
  const own=completeTaskForSpeaker(slides.id,"spk-ada");assert.equal(own.ok,false);if(!own.ok)assert.match(own.error,/upload/);
  store.files.push({id:"test-ada-slides",speakerId:"spk-ada",kind:"slides",name:"deck.pdf",visibility:"private",createdAt:"2026-01-01T00:00:00Z"});
  assert.equal(completeTaskForSpeaker(slides.id,"spk-ada").ok,true);
});

test("readiness produces human-readable overdue blockers and reminders",()=>{
  const task=store.tasks.find(t=>t.speakerId==="spk-sam")!;task.status="not_started";task.dueAt="2020-01-01T00:00:00Z";
  const plan=reminderPlans(new Date("2026-01-01T00:00:00Z")).find(p=>p.taskId===task.id)!;assert.equal(plan.overdue,true);
});

test("resource CRUD sanitizer keeps only allowlisted iframe URLs",()=>{
  const resource=upsertResource({slug:"safe-test",title:"Safe",body:"wiki",published:true,embedUrl:"javascript:alert(1)"});assert.equal(resource.embedUrl,undefined);assert.equal(safeEmbed("https://www.youtube.com/embed/abc"),"https://www.youtube.com/embed/abc");
});

test("ICS derives its exact Oct schedule range with stable RFC5545 fields and is absent for drafts",()=>{
  const scheduled=store.sessions.find(s=>s.slot)!;const ics=icsForSession(scheduled)!;assert.match(ics,/X-WR-TIMEZONE:America\/Los_Angeles/);assert.match(ics,/BEGIN:VTIMEZONE/);assert.match(ics,/DTSTART;TZID=America\/Los_Angeles:20261012T100000/);assert.match(ics,/DTEND;TZID=America\/Los_Angeles:20261012T104500/);assert.match(ics,/UID:ses-analytical@cue\.local/);assert.match(ics,/DTSTAMP:20261001T000000Z/);assert.match(ics,/DESCRIPTION:Reliable systems patterns/);assert.match(ics,/LOCATION:Main Hall\\, New York\\, NY/);
  assert.equal(icsForSession({ ...scheduled, slot:undefined }),undefined);
});

test("mock acceptance comm has no localhost link and only attaches ICS when a session is scheduled",()=>{
  const scheduled=store.sessions.find(s=>s.id==="ses-analytical")!;const sent=sendTemplate("schedule_locked",scheduled.speakerId,scheduled.title);assert.ok(!sent.body.includes("localhost"));assert.match(sent.ics,/DTSTART;TZID=America\/Los_Angeles:20261012T100000/);
  const draft=store.sessions.find(s=>!s.slot)!;const none=sendTemplate("accepted",draft.speakerId,draft.title);assert.equal(none.ics,"");
});

test("speaker endpoint rejects query impersonation under a known speaker persona",async()=>{
  const {res}=await json("/api/speaker/events/evt-ai-summit-2026/tasks?speakerId=spk-ada",{headers:{"x-demo-persona":"spk-sam"}});assert.equal(res.status,200);
  const forbidden=await json("/api/speaker/events/evt-ai-summit-2026/files",{method:"POST",headers:{"content-type":"application/json","x-demo-persona":"spk-sam"},body:JSON.stringify({speakerId:"spk-ada",kind:"slides",name:"steal.pdf"})});assert.equal(forbidden.res.status,403);
});

test("command endpoint takes accepted-unscheduled KPI from canonical schedule projection",async()=>{
  const {res,body}=await json("/api/events/evt-ai-summit-2026/command",{headers:{"x-demo-persona":"org-swyx"}});assert.equal(res.status,200);
  assert.equal(body.data.kpis.acceptedUnscheduled,2);
});

test("scheduled session calendar HTTP route returns downloadable October ICS",async()=>{
  const response=await app.request("/api/calendar/ses-analytical.ics");
  assert.equal(response.status,200);
  assert.match(response.headers.get("content-type")??"",/^text\/calendar/);
  assert.match(response.headers.get("content-disposition")??"",/ses-analytical\.ics/);
  const body=await response.text();
  assert.match(body,/DTSTART;TZID=America\/Los_Angeles:20261012T100000/);
  assert.match(body,/UID:ses-analytical@cue\.local/);
});
