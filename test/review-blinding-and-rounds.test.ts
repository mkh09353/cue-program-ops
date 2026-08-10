import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";
import { blindSubmission } from "../src/review.js";

const h = (persona: string) => ({ "content-type": "application/json", "x-demo-persona": persona });
const json = async (res: Response) => (await res.json()) as any;
const CO_AUTHOR = { id: "spk-co-marcus", name: "Marcus Okafor", email: "marcus.okafor@example.test", role: "co-author" as const };

/** Put a co-author on a blinded round's assigned submission and return the ids involved. */
function seedCoAuthorOnBlindAssignment() {
  const assignment = store.reviewAssignments.find((a) => a.status !== "recused")!;
  const round = store.reviewRounds.find((r) => r.id === assignment.roundId)!;
  round.blind = true;
  const submission = store.submissions.find((s) => s.id === assignment.submissionId)!;
  submission.additionalSpeakers = [{ ...CO_AUTHOR }];
  return { assignment, round, submission };
}

const leaks = (payload: unknown) => {
  const text = JSON.stringify(payload);
  return [CO_AUTHOR.name, CO_AUTHOR.email, CO_AUTHOR.id].filter((needle) => text.includes(needle));
};

test("blindSubmission strips co-author identity but keeps the participant count", () => {
  const submission: any = {
    id: "sub-blind-unit",
    name: "Priya Raman",
    email: "priya@example.test",
    speakerId: "spk-priya",
    title: "Taming 40-Minute CI",
    abstract: "…",
    answers: { title: "Taming", speaker_bio: "Principal Engineer" },
    additionalSpeakers: [{ ...CO_AUTHOR }],
  };
  const open = blindSubmission(submission, false);
  assert.equal((open as any).additionalSpeakers[0].name, "Marcus Okafor", "non-blind rounds are untouched");

  const blinded: any = blindSubmission(submission, true);
  assert.equal(blinded.name, "Anonymous speaker");
  assert.equal(blinded.email, undefined);
  assert.equal(blinded.speakerId, undefined);
  assert.deepEqual(leaks(blinded), [], "no co-author name, email or id survives blinding");
  assert.equal(blinded.coAuthorCount, 1, "reviewers may see how many participants there are");
  assert.equal(blinded.additionalSpeakers[0].name, "Anonymous co-author");
  assert.equal(blinded.additionalSpeakers[0].email, "");
  assert.equal(blinded.additionalSpeakers[0].id, "");
  assert.equal(blinded.additionalSpeakers[0].role, "co-author", "role labels are safe to keep");
  assert.equal(blinded.answers.speaker_bio, undefined, "identity-bearing answers stay filtered");

  // A submission with no co-authors reports zero and omits the array.
  const solo: any = blindSubmission({ ...submission, additionalSpeakers: [] }, true);
  assert.equal(solo.coAuthorCount, 0);
  assert.equal(solo.additionalSpeakers, undefined);
});

test("blinded reviewer queue and detail never expose co-author identity", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const { assignment, submission } = seedCoAuthorOnBlindAssignment();
  const reviewer = assignment.reviewerId;

  const queue = await json(await app.request(`/api/events/${EVENT_ID}/reviewer-queue`, { headers: h(reviewer) }));
  assert.equal(queue.data.length > 0, true);
  const row = queue.data.find((a: any) => a.submissionId === submission.id)!;
  assert.equal(row.submission.name, "Anonymous speaker");
  assert.deepEqual(leaks(queue.data), [], "queue payload carries no co-author identity");
  assert.equal(row.submission.coAuthorCount, 1);

  const detail = await json(
    await app.request(`/api/events/${EVENT_ID}/reviewer-queue/${submission.id}`, { headers: h(reviewer) }),
  );
  assert.equal(detail.data.submission.name, "Anonymous speaker");
  assert.deepEqual(leaks(detail.data), [], "detail payload carries no co-author identity");

  // The reviewer-scoped submission read is blinded too.
  const scoped = await app.request(`/api/events/${EVENT_ID}/submissions/${submission.id}`, { headers: h(reviewer) });
  if (scoped.status === 200) assert.deepEqual(leaks(await json(scoped)), []);
});

test("organizers keep full co-author identity and role labels", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const { submission } = seedCoAuthorOnBlindAssignment();

  const detail = await json(await app.request(`/api/events/${EVENT_ID}/submissions/${submission.id}`, { headers: h("org-swyx") }));
  assert.equal(detail.data.name, submission.name, "lead author visible to organizers");
  const co = detail.data.additionalSpeakers.find((p: any) => p.email === CO_AUTHOR.email);
  assert.ok(co, "co-author is still on the organizer record");
  assert.equal(co.name, "Marcus Okafor");
  assert.equal(co.role, "co-author", "role label preserved for the organizer participant list");

  const list = await json(await app.request(`/api/events/${EVENT_ID}/submissions`, { headers: h("org-swyx") }));
  const listed = list.data.find((s: any) => s.id === submission.id);
  assert.equal(listed.additionalSpeakers[0].name, "Marcus Okafor");
});

test("two rounds keep independent names, windows and scorecards after editing one", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const org = h("org-swyx");
  const mk = (name: string, opensAt: string, closesAt: string, criteria: any[]) =>
    app.request(`/api/events/${EVENT_ID}/review-rounds`, {
      method: "POST",
      headers: org,
      body: JSON.stringify({ name, opensAt, closesAt, status: "draft", blind: false, reviewerIds: [], criteria }),
    });

  const tag = Date.now();
  const initial = (await json(await mk(`Initial Review ${tag}`, "2026-08-01T00:00:00.000Z", "2026-10-15T23:59:00.000Z", [
    { id: "orig", label: "Originality", type: "rating", weight: 2, min: 1, max: 5 },
  ]))).data;
  const final = (await json(await mk(`Final Review ${tag}`, "2026-10-16T00:00:00.000Z", "2026-11-30T23:59:00.000Z", [
    { id: "final", label: "Final Score", type: "rating", weight: 1, min: 1, max: 10 },
    { id: "comments", label: "Comments", type: "text", weight: 0 },
  ]))).data;

  // Editing the first round must not disturb the second (the server contract behind ABS-01).
  const edited = await app.request(`/api/events/${EVENT_ID}/review-rounds/${initial.id}`, {
    method: "PUT",
    headers: org,
    body: JSON.stringify({
      name: `Initial Review ${tag}`,
      criteria: [
        { id: "orig", label: "Originality", type: "rating", weight: 2, min: 1, max: 5 },
        { id: "rel", label: "Relevance", type: "rating", weight: 1, min: 1, max: 5 },
      ],
    }),
  });
  assert.equal(edited.status, 200);

  const rounds = (await json(await app.request(`/api/events/${EVENT_ID}/review-rounds`, { headers: org }))).data;
  const reloadedFinal = rounds.find((r: any) => r.id === final.id);
  assert.equal(reloadedFinal.name, `Final Review ${tag}`);
  assert.equal(reloadedFinal.opensAt, "2026-10-16T00:00:00.000Z");
  assert.equal(reloadedFinal.closesAt, "2026-11-30T23:59:00.000Z");
  assert.deepEqual(
    reloadedFinal.criteria.map((c: any) => [c.label, c.type, c.weight, c.min ?? null, c.max ?? null]),
    [["Final Score", "rating", 1, 1, 10], ["Comments", "text", 0, null, null]],
    "the untouched round keeps its own scorecard",
  );
  const reloadedInitial = rounds.find((r: any) => r.id === initial.id);
  assert.deepEqual(reloadedInitial.criteria.map((c: any) => c.label), ["Originality", "Relevance"]);
});

/**
 * ABS-01 client half: a sibling refresh must not reset an editor with unsaved edits.
 * Asserted structurally (no DOM harness in this repo) against the specific mechanism.
 */
test("RoundEditor preserves a dirty draft across sibling reloads", () => {
  const page = readFileSync(new URL("../src/web/pages/ReviewManagementPages.tsx", import.meta.url), "utf8");
  const editor = page.slice(page.indexOf("function RoundEditor"), page.indexOf("export function EvaluationPlanPage"));

  // The unconditional reset that discarded sibling drafts is gone.
  assert.ok(
    !/useEffect\(\(\)=>setDraft\(structuredClone\(round\)\),\[round\]\)/.test(editor),
    "the unconditional draft reset must not return",
  );
  // Local edits mark the draft dirty, and a dirty draft is never overwritten.
  assert.match(editor, /const setDraft = \(next: any\) => \{\s*setDirty\(true\);/);
  assert.match(editor, /if \(dirty\) return;/, "sync bails out while there are unsaved edits");
  // Switching round identity does re-sync and clears the flag.
  assert.match(editor, /roundIdRef\.current !== round\.id/);
  assert.match(editor, /setDirty\(false\);\s*setDraftState\(structuredClone\(round\)\);/);
  // A successful save adopts the server copy and clears dirty (no stale save semantics).
  assert.match(editor, /setDraftState\(structuredClone\(savedRound\.data\)\);\s*setDirty\(false\);/);
  // Unsaved state is visible to the organizer.
  assert.match(editor, /dirty \? "Save round \*" : "Save round"/);
});
