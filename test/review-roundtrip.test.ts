import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";

const headers = (persona: string) => ({ "content-type": "application/json", "x-demo-persona": persona });
const parse = async (res: Response) => ({ res, body: (await res.json()) as any });

/**
 * Item 2 regression: a scorecard submitted from the reviewer queue must appear in
 * the organizer's Review history immediately (same canonical read path).
 */
test("reviewer scorecard submission shows in organizer review history immediately", async () => {
  const app = createApp();
  const queue = await parse(await app.request(`/api/events/${EVENT_ID}/reviewer-queue`, { headers: headers("rev-ada") }));
  assert.equal(queue.res.status, 200);
  const assignment = queue.body.data.find((a: any) => a.status === "assigned");
  assert.ok(assignment, "seeded reviewer needs an open assignment");
  const round = store.reviewRounds.find((r) => r.id === assignment.roundId)!;
  const rating = round.criteria.find((c) => c.type === "rating")!;

  const submitted = await parse(
    await app.request(`/api/events/${EVENT_ID}/reviewer-queue/${assignment.id}/submit`, {
      method: "POST",
      headers: headers("rev-ada"),
      body: JSON.stringify({ responses: { [rating.id]: 4, comments: "Strong, concrete case study." } }),
    }),
  );
  assert.equal(submitted.res.status, 200);

  // Organizer submission detail (Review Studio history) reads the same record.
  const detail = await parse(
    await app.request(`/api/events/${EVENT_ID}/submissions/${assignment.submissionId}`, {
      headers: headers("org-swyx"),
    }),
  );
  assert.equal(detail.res.status, 200);
  const mine = detail.body.data.reviews.find((r: any) => r.reviewerId === "rev-ada" && r.status === "submitted");
  assert.ok(mine, "organizer review history must contain the reviewer's submitted scorecard");
  assert.equal(mine.reviewerName, store.personas.find((p) => p.id === "rev-ada")!.name);
  assert.equal(mine.comment, "Strong, concrete case study.");
  assert.equal(mine.average, 4);
  assert.equal(mine.isAiDraft, false);
  assert.ok(
    mine.entries.some((e: any) => e.label === rating.label && e.value === 4),
    "criterion labels + ratings must be projected for the organizer",
  );
  assert.ok(mine.roundName, "round name must be resolvable");

  // Assignment + submission state mirrored canonically.
  assert.equal(store.reviewAssignments.find((a) => a.id === assignment.id)!.status, "completed");
  assert.equal(store.submissions.find((s) => s.id === assignment.submissionId)!.status, "under_review");

  // Organizer review list uses the same projection.
  const list = await parse(await app.request(`/api/events/${EVENT_ID}/reviews`, { headers: headers("org-swyx") }));
  const listed = list.body.data.find((r: any) => r.id === mine.id);
  assert.equal(listed.reviewerName, mine.reviewerName);
  assert.equal(listed.average, 4);
});

/** AI drafts stay marked as advisory and never look like a submitted human score. */
test("ai drafts remain flagged in the canonical review history", async () => {
  const app = createApp();
  const submissionId = store.reviews.find((r) => r.status === "assigned")?.submissionId || store.submissions[0].id;
  const review = store.reviews.find((r) => r.submissionId === submissionId)!;
  await app.request(`/api/events/${EVENT_ID}/reviews/${review.id}/ai-assist`, {
    method: "POST",
    headers: headers("org-swyx"),
    body: "{}",
  });
  const detail = await parse(
    await app.request(`/api/events/${EVENT_ID}/submissions/${submissionId}`, { headers: headers("org-swyx") }),
  );
  const row = detail.body.data.reviews.find((r: any) => r.id === review.id);
  assert.equal(row.isAiDraft, true);
  assert.equal(row.status, "assigned", "AI drafts must not count as a submitted score");
});

/** Organizer Review Studio saves mirror back onto the reviewer's assignment. */
test("organizer review save completes the matching reviewer assignment", async () => {
  const app = createApp();
  const queue = await parse(await app.request(`/api/events/${EVENT_ID}/reviewer-queue`, { headers: headers("rev-linus") }));
  const assignment = queue.body.data.find((a: any) => a.status === "assigned");
  assert.ok(assignment);
  const created = store.reviews.find(
    (r) => r.submissionId === assignment.submissionId && r.reviewerId === "rev-linus",
  ) || (() => {
    const row = {
      id: `rev-test-${assignment.submissionId}`,
      submissionId: assignment.submissionId,
      reviewerId: "rev-linus",
      round: "r1" as const,
      scores: {},
      notes: "",
      status: "assigned" as const,
    };
    store.reviews.push(row);
    return row;
  })();
  const saved = await app.request(`/api/events/${EVENT_ID}/reviews/${created.id}`, {
    method: "POST",
    headers: headers("rev-linus"),
    body: JSON.stringify({ responses: { comments: "Ready to accept" }, scores: { clarity: 5 } }),
  });
  assert.equal(saved.status, 200);
  assert.equal(store.reviewAssignments.find((a) => a.id === assignment.id)!.status, "completed");
});

test("runtime invited reviewer can traverse assignment queue detail scorecard and organizer history",async()=>{const app=createApp(),round=store.reviewRounds[0]!,email=`sam-${Date.now()}@example.test`;const invited=await parse(await app.request(`/api/events/${EVENT_ID}/review-rounds/${round.id}/reviewers`,{method:"POST",headers:headers("org-swyx"),body:JSON.stringify({name:"Sam Whitfield",email})}));assert.equal(invited.res.status,201);const reviewer=invited.body.data.reviewer,submission=store.submissions[0];const assigned=await parse(await app.request(`/api/events/${EVENT_ID}/review-assignments`,{method:"POST",headers:headers("org-swyx"),body:JSON.stringify({roundId:round.id,submissionIds:[submission.id],reviewerId:reviewer.id,method:"specific"})}));assert.equal(assigned.res.status,201);const assignment=assigned.body.data[0];const queue=await parse(await app.request(`/api/events/${EVENT_ID}/reviewer-queue`,{headers:headers(reviewer.id)}));assert.ok(queue.body.data.some((x:any)=>x.id===assignment.id));const detail=await parse(await app.request(`/api/events/${EVENT_ID}/reviewer-queue/${assignment.id}`,{headers:headers(reviewer.id)}));assert.equal(detail.res.status,200);assert.equal(detail.body.data.submission.id,submission.id);const submitted=await parse(await app.request(`/api/events/${EVENT_ID}/reviewer-queue/${assignment.id}/submit`,{method:"POST",headers:headers(reviewer.id),body:JSON.stringify({responses:{overall:5,comments:"Sam scorecard comment"}})}));assert.equal(submitted.res.status,200);const history=await parse(await app.request(`/api/events/${EVENT_ID}/submissions/${submission.id}`,{headers:headers("org-swyx")}));assert.ok(history.body.data.reviews.some((x:any)=>x.reviewerId===reviewer.id&&x.comment==="Sam scorecard comment"));});
