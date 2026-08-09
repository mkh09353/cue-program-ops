import test from "node:test";
import assert from "node:assert/strict";
import { createApp, restoreSnapshot } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";
import type { CompetitionSnapshot, SnapshotPersistence } from "../src/persistence.js";

const headers=(persona:string)=>({"content-type":"application/json","x-demo-persona":persona});
const parse=async(res:Response)=>({res,body:await res.json() as any});

test("round CRUD persists in lifecycle snapshots and can be restored",async()=>{
  let saved: CompetitionSnapshot|undefined;
  const persistence: SnapshotPersistence={load:async()=>saved,save:async(s)=>{saved=structuredClone(s)}};
  const app=createApp({persistence});
  const made=await parse(await app.request(`/api/events/${EVENT_ID}/review-rounds`,{method:"POST",headers:headers("org-swyx"),body:JSON.stringify({name:"Test Round",status:"draft",blind:true,opensAt:"2027-01-01T00:00:00Z",closesAt:"2027-01-10T00:00:00Z",reviewerIds:["rev-ada"],criteria:[{id:"fit",label:"Fit",type:"rating",weight:2}]})}));
  assert.equal(made.res.status,201); assert.ok(saved?.lifecycle.reviewRounds.some(r=>r.id===made.body.data.id));
  store.reviewRounds=store.reviewRounds.filter(r=>r.id!==made.body.data.id);
  await restoreSnapshot({repo:new MemoryRepository(),persistence});
  assert.ok(store.reviewRounds.some(r=>r.id===made.body.data.id));
  const updated=await app.request(`/api/events/${EVENT_ID}/review-rounds/${made.body.data.id}`,{method:"PUT",headers:headers("org-swyx"),body:JSON.stringify({name:"Renamed"})}); assert.equal(updated.status,200);
  const removed=await app.request(`/api/events/${EVENT_ID}/review-rounds/${made.body.data.id}`,{method:"DELETE",headers:headers("org-swyx")}); assert.equal(removed.status,204);
});

test("reviewer queues are assignment scoped and blind responses redact identity",async()=>{
  const app=createApp();
  const ada=await parse(await app.request(`/api/events/${EVENT_ID}/reviewer-queue`,{headers:headers("rev-ada")}));
  assert.equal(ada.res.status,200); assert.ok(ada.body.data.every((x:any)=>x.reviewerId==="rev-ada"));
  assert.equal(ada.body.data[0].submission.name,"Anonymous speaker"); assert.equal(ada.body.data[0].submission.email,undefined);
  const unassigned=await app.request(`/api/events/${EVENT_ID}/reviewer-queue/sub-sam`,{headers:headers("rev-ada")}); assert.equal(unassigned.status,404);
  const other=await app.request(`/api/events/${EVENT_ID}/reviewer-queue/sub-grace`,{headers:headers("rev-linus")}); assert.equal(other.status,404);
  const legacy=await app.request(`/api/events/${EVENT_ID}/submissions/sub-sam`,{headers:headers("rev-ada")}); assert.equal(legacy.status,404);
});

test("CFP close date and schedule mutation role are enforced",async()=>{
  const app=createApp(); const closeAt=store.form.closeAt,status=store.form.status; store.form.status="open";store.form.closeAt="2000-01-01T00:00:00Z";
  const closed=await app.request(`/api/public/events/${store.event.slug}/submissions`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"}); assert.equal(closed.status,400); store.form.closeAt=closeAt;store.form.status=status;
  const move=await app.request(`/api/events/${EVENT_ID}/schedule/move`,{method:"POST",headers:headers("spk-sam"),body:"{}"}); assert.equal(move.status,403);
  const unknown=await app.request("/api/events/unknown/submissions",{headers:headers("org-swyx")}); assert.equal(unknown.status,404);
});

test("results CSV contains score columns and reviewer recusal removes assignment",async()=>{
  const app=createApp();
  const csv=await app.request(`/api/events/${EVENT_ID}/review-results.csv`,{headers:headers("org-swyx")}); assert.equal(csv.status,200); assert.match(csv.headers.get("content-type")||"",/text\/csv/); const text=await csv.text(); assert.match(text,/Average score/); assert.match(text,/Submission/);
  const assignment=store.reviewAssignments.find(a=>a.reviewerId==="rev-linus"&&a.status==="assigned")!;
  const recused=await app.request(`/api/events/${EVENT_ID}/reviewer-queue/${assignment.id}/recuse`,{method:"POST",headers:headers("rev-linus"),body:JSON.stringify({reason:"Co-author relationship"})}); assert.equal(recused.status,200); assert.equal(assignment.status,"recused"); assert.ok(store.reviewConflicts.some(c=>c.assignmentId===assignment.id&&c.reason==="Co-author relationship"));
  const queue=await parse(await app.request(`/api/events/${EVENT_ID}/reviewer-queue`,{headers:headers("rev-linus")})); assert.ok(!queue.body.data.some((x:any)=>x.id===assignment.id));
});

test("round editing, duplicate prevention, reviewer invite, and selected assignment persist",async()=>{const app=createApp();const h=headers("org-swyx"),name=`Editable ${Date.now()}`;const made=await parse(await app.request(`/api/events/${EVENT_ID}/review-rounds`,{method:"POST",headers:h,body:JSON.stringify({name,opensAt:"2027-01-01T00:00:00Z",closesAt:"2027-01-02T00:00:00Z",criteria:[],reviewerIds:[]})}));assert.equal(made.res.status,201);assert.equal((await app.request(`/api/events/${EVENT_ID}/review-rounds`,{method:"POST",headers:h,body:JSON.stringify({name})})).status,409);const id=made.body.data.id;const invited=await parse(await app.request(`/api/events/${EVENT_ID}/review-rounds/${id}/reviewers`,{method:"POST",headers:h,body:JSON.stringify({name:"New Judge",email:`judge-${Date.now()}@example.test`})}));assert.equal(invited.res.status,201);const reviewerId=invited.body.data.reviewer.id;const updated=await parse(await app.request(`/api/events/${EVENT_ID}/review-rounds/${id}`,{method:"PUT",headers:h,body:JSON.stringify({blind:true,opensAt:"2027-02-01T00:00:00Z",closesAt:"2027-02-10T00:00:00Z",reviewerIds:[reviewerId],criteria:[{id:"impact",label:"Impact",type:"rating",weight:3}]})}));assert.equal(updated.body.data.blind,true);assert.equal(updated.body.data.criteria[0].weight,3);const assigned=await parse(await app.request(`/api/events/${EVENT_ID}/review-assignments`,{method:"POST",headers:h,body:JSON.stringify({roundId:id,reviewerId,submissionIds:["sub-sam"],method:"specific",cap:5})}));assert.deepEqual(assigned.body.data.map((x:any)=>x.submissionId),["sub-sam"]);assert.ok(store.personas.some(p=>p.id===reviewerId&&p.role==="reviewer"))});
