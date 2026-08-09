import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { cfpWindow, store, validateCfpSubmission } from "../src/lifecycle.js";
import type { SnapshotPersistence, CompetitionSnapshot } from "../src/persistence.js";

const organizer={"content-type":"application/json","x-demo-persona":"org-swyx"};
const post=(app:ReturnType<typeof createApp>,path:string,body:any,headers:Record<string,string>={"content-type":"application/json"})=>app.request(path,{method:"POST",headers,body:JSON.stringify(body)});
const valid=(email="cfp-test@example.test")=>({name:"Priya Raman",email,answers:{title:"Taming 40-Minute CI",abstract:"Detailed abstract",category:"Platform & Infra",format:"Talk (30 min)",experience:"advanced",key_takeaway:"A practical framework",audience_level:"Intermediate"}});

test("conditional required validation follows controlling answer both ways",()=>{
  const field={key:"conditional_test",label:"Workshop prerequisites",type:"textarea" as const,required:true,visibleWhen:{key:"format",equals:"Workshop (120 min)"}};
  store.form.fields.push(field);
  assert.equal(validateCfpSubmission(valid().answers,"conditional-a@example.test").ok,true);
  const workshop={...valid().answers,format:"Workshop (120 min)",workshopPlan:"Hands on",duration:"120"};
  const missing=validateCfpSubmission(workshop,"conditional-b@example.test");assert.equal(missing.ok,false);if(!missing.ok)assert.match(missing.error,/Workshop prerequisites/);
  assert.equal(validateCfpSubmission({...workshop,conditional_test:"Bring a laptop"},"conditional-c@example.test").ok,true);
  store.form.fields.pop();
});

test("organizer form config persists and public schema round-trips",async()=>{
  let saved:CompetitionSnapshot|undefined;const persistence:SnapshotPersistence={save:async(s)=>{saved=structuredClone(s)},load:async()=>saved};const app=createApp({persistence});
  const original=structuredClone(store.form);const fields=[...store.form.fields,{key:"fixture_field",label:"Fixture field",type:"select" as const,required:true,options:["One","Two"],section:"Fixture"}];
  const res=await app.request(`/api/events/${store.event.id}/forms/${store.form.id}`,{method:"PUT",headers:organizer,body:JSON.stringify({...store.form,fields})});assert.equal(res.status,200);assert.ok(saved?.lifecycle.form.fields.some(f=>f.key==="fixture_field"));
  const publicBody=await (await app.request(`/api/public/events/${store.event.slug}/cfp`)).json();assert.deepEqual(publicBody.data.form.fields.find((f:any)=>f.key==="fixture_field").options,["One","Two"]);
  store.form=original;
});

test("draft saves title-only, resumes, submits, edits, and routes category",async()=>{
  const app=createApp();const body=valid(`draft-${Date.now()}@example.test`);const draft=await post(app,`/api/public/events/${store.event.slug}/submissions`,{...body,answers:{title:body.answers.title},status:"draft"});assert.equal(draft.status,201);const d=await draft.json();assert.equal(d.data.status,"draft");
  const resumed=await (await app.request(`/api/public/events/${store.event.slug}/submissions/${d.data.id}?token=${d.data.editToken}`)).json();assert.equal(resumed.data.title,body.answers.title);
  const submitted=await app.request(`/api/public/events/${store.event.slug}/submissions/${d.data.id}`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({editToken:d.data.editToken,answers:body.answers,status:"submitted"})});assert.equal(submitted.status,200);const s=await submitted.json();assert.equal(s.data.reviewBoard,"platform-infra");
  const changed="Updated: now includes 2026 benchmark data.";const edit=await app.request(`/api/public/events/${store.event.slug}/submissions/${d.data.id}`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({editToken:d.data.editToken,answers:{abstract:changed},status:"submitted"})});assert.equal(edit.status,200);assert.equal(store.submissions.find(x=>x.id===d.data.id)?.abstract,changed);
});

test("deadline produces closed state and rejects create and edit",async()=>{
  const app=createApp();const old={closeAt:store.form.closeAt,status:store.form.status};store.form.status="open";store.form.closeAt="2000-01-01T00:00:00Z";assert.equal(cfpWindow().open,false);
  const publicBody=await (await app.request(`/api/public/events/${store.event.slug}/cfp`)).json();assert.equal(publicBody.data.window.reason,"Submissions closed");
  assert.equal((await post(app,`/api/public/events/${store.event.slug}/submissions`,valid("closed@example.test"))).status,400);
  assert.equal((await app.request(`/api/public/events/${store.event.slug}/submissions/sub-ada`,{method:"PUT",headers:{"content-type":"application/json"},body:"{}"})).status,403);Object.assign(store.form,old);
});

test("server rejects missing custom required value",async()=>{
  const app=createApp();const custom={key:"key_takeaway",label:"Key takeaway",type:"text" as const,required:true};store.form.fields.push(custom);const result=await post(app,`/api/public/events/${store.event.slug}/submissions`,{...valid("missing-required@example.test"),answers:{...valid().answers,key_takeaway:""}});assert.equal(result.status,400);assert.match(JSON.stringify(await result.json()),/Key takeaway/);store.form.fields.pop();
});
