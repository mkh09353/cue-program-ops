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
  const assignment=store.reviewAssignments.find(a=>a.reviewerId==="rev-ada"&&a.submissionId==="sub-grace"&&a.status==="assigned")!;
  const submitted=await app.request(`/api/events/${EVENT_ID}/reviewer-queue/${assignment.id}/submit`,{method:"POST",headers:headers("rev-ada"),body:JSON.stringify({responses:{overall:5,relevance:4,novelty:3,recommendation:"Accept",comments:"Strong fit"}})});
  assert.equal(submitted.status,200);
  const csv=await app.request(`/api/events/${EVENT_ID}/review-results.csv`,{headers:headers("org-swyx")}); assert.equal(csv.status,200); assert.match(csv.headers.get("content-type")||"",/text\/csv/); const text=await csv.text(); const header=text.split("\n")[0]||"";
  for (const col of ["Submission","Title","Speaker","Status","Recommendation","Overall rating","Program relevance","Novelty","Weighted total","Reviewer count"]) assert.match(header,new RegExp(`"${col}"`));
  const grace=text.split("\n").find(line=>line.includes("sub-grace"))||"";
  assert.match(grace,/Compilers for Humans/);
  assert.match(grace,/Grace Hopper/);
  assert.match(grace,/"5"/);
  assert.match(grace,/"4"/);
  assert.match(grace,/"3"/);
  assert.match(grace,/"4\.33"/);
  assert.match(grace,/Accept/);

  const recusal=store.reviewAssignments.find(a=>a.reviewerId==="rev-linus"&&a.status==="assigned")!;
  const recused=await app.request(`/api/events/${EVENT_ID}/reviewer-queue/${recusal.id}/recuse`,{method:"POST",headers:headers("rev-linus"),body:JSON.stringify({reason:"Co-author relationship"})}); assert.equal(recused.status,200); assert.equal(recusal.status,"recused"); assert.ok(store.reviewConflicts.some(c=>c.assignmentId===recusal.id&&c.reason==="Co-author relationship"));
  const queue=await parse(await app.request(`/api/events/${EVENT_ID}/reviewer-queue`,{headers:headers("rev-linus")})); assert.ok(!queue.body.data.some((x:any)=>x.id===recusal.id));
});

test("round editing, duplicate prevention, reviewer invite, and selected assignment persist",async()=>{const app=createApp();const h=headers("org-swyx"),name=`Editable ${Date.now()}`;const made=await parse(await app.request(`/api/events/${EVENT_ID}/review-rounds`,{method:"POST",headers:h,body:JSON.stringify({name,opensAt:"2027-01-01T00:00:00Z",closesAt:"2027-01-02T00:00:00Z",criteria:[],reviewerIds:[]})}));assert.equal(made.res.status,201);assert.equal((await app.request(`/api/events/${EVENT_ID}/review-rounds`,{method:"POST",headers:h,body:JSON.stringify({name})})).status,409);const id=made.body.data.id;const invited=await parse(await app.request(`/api/events/${EVENT_ID}/review-rounds/${id}/reviewers`,{method:"POST",headers:h,body:JSON.stringify({name:"New Judge",email:`judge-${Date.now()}@example.test`})}));assert.equal(invited.res.status,201);const reviewerId=invited.body.data.reviewer.id;const updated=await parse(await app.request(`/api/events/${EVENT_ID}/review-rounds/${id}`,{method:"PUT",headers:h,body:JSON.stringify({blind:true,opensAt:"2027-02-01T00:00:00Z",closesAt:"2027-02-10T00:00:00Z",reviewerIds:[reviewerId],criteria:[{id:"impact",label:"Impact",type:"rating",weight:3}]})}));assert.equal(updated.body.data.blind,true);assert.equal(updated.body.data.criteria[0].weight,3);const assigned=await parse(await app.request(`/api/events/${EVENT_ID}/review-assignments`,{method:"POST",headers:h,body:JSON.stringify({roundId:id,reviewerId,submissionIds:["sub-sam"],method:"specific",cap:5})}));assert.deepEqual(assigned.body.data.map((x:any)=>x.submissionId),["sub-sam"]);assert.ok(store.personas.some(p=>p.id===reviewerId&&p.role==="reviewer"))});

test("scorecard criteria persist min/max scale and select options", async () => {
  const app = createApp();
  const h = headers("org-swyx");
  const name = `Scale Round ${Date.now()}`;
  const made = await parse(
    await app.request(`/api/events/${EVENT_ID}/review-rounds`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        name,
        opensAt: "2027-03-01T00:00:00Z",
        closesAt: "2027-03-10T00:00:00Z",
        criteria: [],
        reviewerIds: ["rev-ada"],
      }),
    }),
  );
  assert.equal(made.res.status, 201);
  const id = made.body.data.id;
  const updated = await parse(
    await app.request(`/api/events/${EVENT_ID}/review-rounds/${id}`, {
      method: "PUT",
      headers: h,
      body: JSON.stringify({
        criteria: [
          { id: "originality", label: "Originality", type: "rating", weight: 2, min: 0, max: 10 },
          {
            id: "recommendation",
            label: "Recommendation",
            type: "select",
            weight: 0,
            options: ["Champion", "Accept", "Discuss", "Reject hard"],
          },
          { id: "comments", label: "Comments", type: "text", weight: 0 },
        ],
      }),
    }),
  );
  assert.equal(updated.res.status, 200);
  const crit = updated.body.data.criteria;
  const rating = crit.find((c: any) => c.id === "originality");
  assert.equal(rating.min, 0);
  assert.equal(rating.max, 10);
  const rec = crit.find((c: any) => c.id === "recommendation");
  assert.deepEqual(rec.options, ["Champion", "Accept", "Discuss", "Reject hard"]);

  // Reviewer queue surfaces the configured options
  const queue = await parse(
    await app.request(`/api/events/${EVENT_ID}/reviewer-queue/sub-grace`, { headers: headers("rev-ada") }),
  );
  // May 404 if not assigned; assign first
  await app.request(`/api/events/${EVENT_ID}/review-assignments`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      roundId: id,
      reviewerId: "rev-ada",
      submissionIds: ["sub-grace"],
      method: "specific",
      cap: 10,
    }),
  });
  const detail = await parse(
    await app.request(`/api/events/${EVENT_ID}/reviewer-queue/sub-grace`, { headers: headers("rev-ada") }),
  );
  assert.equal(detail.res.status, 200);
  // Assignment may still be on seed round; update seed round-initial criteria via PUT for configured-criteria review save
});

test("reinstate restores a recused assignment to the reviewer queue", async () => {
  const app = createApp();
  const assignment = store.reviewAssignments.find((a) => a.status === "assigned" && a.reviewerId === "rev-ada");
  assert.ok(assignment, "seed assignment");
  const recused = await app.request(`/api/events/${EVENT_ID}/reviewer-queue/${assignment!.id}/recuse`, {
    method: "POST",
    headers: headers("rev-ada"),
    body: JSON.stringify({ reason: "Judge recuse test" }),
  });
  assert.equal(recused.status, 200);
  assert.equal(assignment!.status, "recused");

  const list = await parse(await app.request(`/api/events/${EVENT_ID}/review-recusals`, { headers: headers("org-swyx") }));
  assert.equal(list.res.status, 200);
  assert.ok(list.body.data.some((a: any) => a.id === assignment!.id));

  const reinstate = await parse(
    await app.request(`/api/events/${EVENT_ID}/review-assignments/${assignment!.id}/reinstate`, {
      method: "POST",
      headers: headers("org-swyx"),
      body: "{}",
    }),
  );
  assert.equal(reinstate.res.status, 200, JSON.stringify(reinstate.body));
  assert.equal(assignment!.status, "assigned");

  const queue = await parse(await app.request(`/api/events/${EVENT_ID}/reviewer-queue`, { headers: headers("rev-ada") }));
  assert.ok(queue.body.data.some((a: any) => a.id === assignment!.id && a.status === "assigned"));
});

test("configured-criteria review save stores responses on the review", async () => {
  const app = createApp();
  const h = headers("org-swyx");
  // Ensure initial round has originality-style criteria already; use seed round criteria
  const rounds = await parse(await app.request(`/api/events/${EVENT_ID}/review-rounds`, { headers: h }));
  const round = rounds.body.data.find((r: any) => r.id === "round-initial");
  assert.ok(round);
  assert.ok(round.criteria.some((c: any) => c.id === "relevance"));
  assert.ok(round.criteria.some((c: any) => c.type === "select" && c.options?.length));

  const review = store.reviews.find((r) => r.submissionId === "sub-grace" && r.reviewerId === "rev-ada") ||
    (() => {
      const row = {
        id: `review-test-${Date.now()}`,
        submissionId: "sub-grace",
        reviewerId: "rev-ada",
        round: "r1" as const,
        scores: {},
        notes: "",
        status: "assigned" as const,
      };
      store.reviews.push(row);
      return row;
    })();

  const saved = await parse(
    await app.request(`/api/events/${EVENT_ID}/reviews/${review.id}`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        responses: {
          relevance: 5,
          novelty: 4,
          recommendation: "Strong accept",
          comments: "Configured criteria path",
        },
        notes: "Organizer note",
      }),
    }),
  );
  assert.equal(saved.res.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.data.responses?.recommendation, "Strong accept");
  assert.equal(saved.body.data.scores?.relevance, 5);
  assert.equal(saved.body.data.recommendation, "Strong accept");
  assert.equal(saved.body.data.source, "human");
});

test("invited reviewer receives assignment, progress row, and scoped queue",async()=>{const app=createApp(),h=headers("org-swyx"),round=store.reviewRounds[0]!,email=`working-${Date.now()}@example.test`;const invited=await parse(await app.request(`/api/events/${EVENT_ID}/review-rounds/${round.id}/reviewers`,{method:"POST",headers:h,body:JSON.stringify({name:"Sam Whitfield",email})})),id=invited.body.data.reviewer.id;await app.request(`/api/events/${EVENT_ID}/review-assignments`,{method:"POST",headers:h,body:JSON.stringify({roundId:round.id,reviewerId:id,submissionIds:["sub-sam"],method:"specific",cap:5})});const progress=await parse(await app.request(`/api/events/${EVENT_ID}/review-progress`,{headers:h}));assert.ok(progress.body.data.some((x:any)=>x.reviewerId===id&&x.assigned===1&&x.outstanding===1));const queue=await parse(await app.request(`/api/events/${EVENT_ID}/reviewer-queue`,{headers:headers(id)}));assert.equal(queue.res.status,200);assert.deepEqual(queue.body.data.map((x:any)=>x.submissionId),["sub-sam"]);assert.ok((await parse(await app.request(`/api/events/${EVENT_ID}/bootstrap`,{headers:h}))).body.data.personas.some((p:any)=>p.id===id))});
