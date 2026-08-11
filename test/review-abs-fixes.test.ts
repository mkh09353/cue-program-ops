import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { defaultProgressRoundId } from "../src/web/pages/ReviewManagementPages.js";

const h = (id: string) => ({ "content-type": "application/json", "x-demo-persona": id });
const read = async (r: Response) => ({ status: r.status, body: (await r.json().catch(() => null)) as any });
const post = (app: any, path: string, body: unknown, persona = "org-swyx") =>
  app.request(path, { method: "POST", headers: h(persona), body: JSON.stringify(body) });

// —— ABS-08 ——

test("ABS-08: a newly assigned round shows exactly 2 assigned / 0 complete despite seeded assignments elsewhere", async () => {
  const app = createApp();
  const reviewer = store.personas.find((p) => p.role === "reviewer")!;
  // Seeded round already holds assignments for this reviewer pool.
  const seededBefore = (await read(await app.request(`/api/events/${EVENT_ID}/review-progress?roundId=round-initial`, { headers: h("org-swyx") }))).body.data;

  const round = (await read(await post(app, `/api/events/${EVENT_ID}/review-rounds`, {
    name: `Fresh Round ${Date.now()}`, status: "open", reviewerIds: [reviewer.id], criteria: [],
  }))).body.data;
  const subs = store.submissions.filter((s) => s.status !== "draft").slice(0, 2);
  assert.equal(subs.length, 2, "fixture needs two assignable submissions");
  await post(app, `/api/events/${EVENT_ID}/review-assignments`, {
    roundId: round.id, reviewerId: reviewer.id, submissionIds: subs.map((s) => s.id), method: "specific",
  });

  const rows = (await read(await app.request(`/api/events/${EVENT_ID}/review-progress?roundId=${round.id}`, { headers: h("org-swyx") }))).body.data;
  assert.equal(rows.length, 1, "only the assigned reviewer appears");
  assert.equal(rows[0].assigned, 2);
  assert.equal(rows[0].completed, 0);
  assert.equal(rows[0].roundId, round.id);
  // Assignments in other rounds are untouched and excluded.
  const seededAfter = (await read(await app.request(`/api/events/${EVENT_ID}/review-progress?roundId=round-initial`, { headers: h("org-swyx") }))).body.data;
  assert.deepEqual(
    seededAfter.map((r: any) => [r.reviewerId, r.assigned]),
    seededBefore.map((r: any) => [r.reviewerId, r.assigned]),
    "seeded round counts are unchanged by the new round's assignments",
  );
});

test("ABS-08: the round that received the newest assignment becomes the default, across statuses", async () => {
  const app = createApp();
  const reviewer = store.personas.find((p) => p.role === "reviewer")!;
  const draftRound = (await read(await post(app, `/api/events/${EVENT_ID}/review-rounds`, {
    name: `Draft Round ${Date.now()}`, status: "draft", reviewerIds: [reviewer.id], criteria: [],
  }))).body.data;
  const sub = store.submissions.find((s) => s.status !== "draft")!;
  await post(app, `/api/events/${EVENT_ID}/review-assignments`, {
    roundId: draftRound.id, reviewerId: reviewer.id, submissionIds: [sub.id], method: "specific",
  });

  const rounds = (await read(await app.request(`/api/events/${EVENT_ID}/review-rounds`, { headers: h("org-swyx") }))).body.data;
  const target = rounds.find((r: any) => r.id === draftRound.id);
  assert.ok(target.lastAssignmentAt, "round list exposes lastAssignmentAt");
  // A draft round with the newest assignment must win over an older open round.
  assert.equal(defaultProgressRoundId(rounds), draftRound.id);
});

test("ABS-08: default round selection is deterministic for edge cases", () => {
  assert.equal(defaultProgressRoundId([]), "");
  assert.equal(defaultProgressRoundId([{ id: "a" }, { id: "b" }]), "a", "no assignments anywhere → first round");
  assert.equal(
    defaultProgressRoundId([
      { id: "old", status: "open", lastAssignmentAt: "2026-01-01T00:00:00.000Z" },
      { id: "new", status: "draft", lastAssignmentAt: "2026-09-09T00:00:00.000Z" },
      { id: "none", status: "open" },
    ]),
    "new",
  );
});

test("ABS-08: duplicate round names are rejected by the server and surfaced by the UI", async () => {
  const app = createApp();
  const existing = store.reviewRounds[0]!;
  const dup = await read(await post(app, `/api/events/${EVENT_ID}/review-rounds`, { name: existing.name, status: "open" }));
  assert.equal(dup.status, 409);
  assert.match(String(dup.body.error.message), /already exists/i);

  const src = readFileSync("src/web/pages/ReviewManagementPages.tsx", "utf8");
  assert.match(src, /catch \(e: any\) \{[\s\S]{0,400}already exists/, "Add round catches and explains the conflict");
  assert.match(src, /data-testid="round-create-error"/, "the conflict is rendered, not swallowed");
  assert.ok(!/await api\.createReviewRound\([^)]*\);\s*\n\s*setName\(""\);/.test(src), "no unguarded create call remains");
  assert.match(src, /createReviewRound\(\{ name: name\.trim\(\), status: "open"/, "new rounds are created open so they can take assignments");
});

test("ABS-08: the progress page scopes rows and totals to the selected round only", () => {
  const src = readFileSync("src/web/pages/ReviewManagementPages.tsx", "utf8");
  assert.match(src, /const rows = roundId \? data\.filter\(\(r: any\) => r\.roundId === roundId\) : data/, "rows are filtered to the selected round");
  assert.match(src, /data-testid="progress-total-assigned"/);
  assert.match(src, /data-testid="progress-total-complete"/);
  assert.match(src, /Counts cover this round only/);
  assert.ok(!/\{data\.map\(\(r\) => \(/.test(src), "unscoped data.map row rendering is gone");
  // The default selection must not be restricted to open rounds any more.
  assert.ok(!/rounds\.filter\(r=>r\.status==="open"\)/.test(src), "status no longer gates the default round");
});

// —— ABS-14 ——

test("ABS-14: ai-assist works from an assignment id when no review row exists yet", async () => {
  const app = createApp();
  const reviewer = store.personas.find((p) => p.role === "reviewer")!;
  const round = (await read(await post(app, `/api/events/${EVENT_ID}/review-rounds`, {
    name: `AI Round ${Date.now()}`, status: "open", reviewerIds: [reviewer.id], criteria: [],
  }))).body.data;
  const sub = store.submissions.find((s) => s.status !== "draft" && !store.reviews.some((r) => r.submissionId === s.id))
    || store.submissions.find((s) => s.status !== "draft")!;
  const assignment = (await read(await post(app, `/api/events/${EVENT_ID}/review-assignments`, {
    roundId: round.id, reviewerId: reviewer.id, submissionIds: [sub.id], method: "specific",
  }))).body.data[0];
  assert.ok(assignment, "assignment created");

  const reviewsBefore = store.reviews.filter((r) => r.submissionId === sub.id).length;
  const draft = await read(await app.request(`/api/events/${EVENT_ID}/reviews/${assignment.id}/ai-assist`, {
    method: "POST", headers: h("org-swyx"), body: "{}",
  }));
  assert.equal(draft.status, 200);
  const numeric = Object.values(draft.body.data.scores || {}).filter((v) => typeof v === "number");
  assert.ok(numeric.length >= 1, "draft returns numeric scores");
  assert.ok(String(draft.body.data.notes || "").length > 20, "draft returns a rationale");
  assert.equal(draft.body.data.advisory, true, "provenance stays advisory");
  assert.ok(store.reviews.filter((r) => r.submissionId === sub.id).length > reviewsBefore, "a review row is materialized from the assignment");
  const created = store.reviews.find((r) => r.submissionId === sub.id && r.source === "ai_draft")!;
  assert.equal(created.status, "assigned", "AI never advances the submission on its own");
});

test("ABS-14: organizers can list a submission's assignments for the draft fallback", async () => {
  const app = createApp();
  const reviewer = store.personas.find((p) => p.role === "reviewer")!;
  const round = (await read(await post(app, `/api/events/${EVENT_ID}/review-rounds`, {
    name: `Listing Round ${Date.now()}`, status: "open", reviewerIds: [reviewer.id], criteria: [],
  }))).body.data;
  const sub = store.submissions.find((s) => s.status !== "draft")!;
  await post(app, `/api/events/${EVENT_ID}/review-assignments`, {
    roundId: round.id, reviewerId: reviewer.id, submissionIds: [sub.id], method: "specific",
  });
  const listed = await read(await app.request(`/api/events/${EVENT_ID}/submissions/${sub.id}/assignments`, { headers: h("org-swyx") }));
  assert.equal(listed.status, 200);
  assert.ok(listed.body.data.some((a: any) => a.roundId === round.id && a.reviewerId === reviewer.id));
  assert.ok(listed.body.data.every((a: any) => a.id && a.status !== "recused"));
  // Scoping: reviewers must not read the organizer assignment map.
  assert.equal((await app.request(`/api/events/${EVENT_ID}/submissions/${sub.id}/assignments`, { headers: h(reviewer.id) })).status, 403);
  assert.equal((await app.request(`/api/events/${EVENT_ID}/submissions/sub-nope/assignments`, { headers: h("org-swyx") })).status, 404);
});

test("ABS-14: both scorecards render inline loading then numeric scores and rationale", () => {
  for (const path of ["src/web/pages/SubmissionsPages.tsx", "src/web/pages/PublicReviewerPages.tsx"]) {
    const src = readFileSync(path, "utf8");
    assert.match(src, /data-testid="ai-draft-button"/, `${path}: the action is reachable`);
    assert.match(src, /data-testid="ai-draft-panel"/, `${path}: inline panel exists`);
    assert.match(src, /data-testid="ai-draft-loading"/, `${path}: inline loading state`);
    assert.match(src, /data-testid="ai-draft-scores"/, `${path}: numeric scores rendered inline`);
    assert.match(src, /data-testid="ai-draft-rationale"/, `${path}: rationale rendered inline`);
    assert.match(src, /Drafting AI review…/, `${path}: button reports progress`);
    assert.match(src, /setAiDraft\(\{ ?status: ?"loading" ?\}\)/, `${path}: loading is set before the await`);
    assert.match(src, /AI advisory draft/, `${path}: provenance preserved`);
    assert.match(src, /aria-live="polite"/, `${path}: announced to assistive tech`);
  }
  const studio = readFileSync("src/web/pages/SubmissionsPages.tsx", "utf8");
  assert.match(studio, /disabled=\{busy \|\| \(!activeReview && !assignments\.length\)\}/, "enabled when only an assignment exists");
  assert.match(studio, /const target = activeReview\?\.id \|\| assignments\[0\]\?\.id/, "falls back to the assignment id");
  assert.match(studio, /api\.submissionAssignments\(id!\)/, "studio loads assignments");
});
