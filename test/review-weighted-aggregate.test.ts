import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { EVENT_ID, store, weightedAverage, weightedMath, roundAggregate } from "../src/lifecycle.js";
import { weightedScore } from "../src/review.js";
import { weightedAverageScores, weightedMathLabel } from "../src/web/lib/utils.js";
import { resetEventRegistry } from "../src/events.js";
import { MemoryRepository } from "../src/repository.js";

const ORG = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const json = async (r: Response) => (await r.json()) as any;
const CRITERIA = [
  { id: "originality", label: "Originality", type: "rating", weight: 2, min: 1, max: 5 },
  { id: "relevance", label: "Relevance", type: "rating", weight: 1, min: 1, max: 5 },
];

/** Build a round + assignment and submit one scorecard. */
async function scoreOnce(app: any, responses: Record<string, number>) {
  const reviewer = store.personas.find((p) => p.role === "reviewer")!;
  const round = (await json(await app.request(`/api/events/${EVENT_ID}/review-rounds`, {
    method: "POST", headers: ORG,
    body: JSON.stringify({ name: `Weighted ${Date.now()}${Math.random()}`, status: "open", reviewerIds: [reviewer.id], criteria: CRITERIA }),
  }))).data;
  const submission = store.submissions.find((s) => s.status !== "draft")!;
  const assignment = (await json(await app.request(`/api/events/${EVENT_ID}/review-assignments`, {
    method: "POST", headers: ORG,
    body: JSON.stringify({ roundId: round.id, reviewerId: reviewer.id, submissionIds: [submission.id], method: "specific" }),
  }))).data[0];
  await app.request(`/api/events/${EVENT_ID}/reviewer-queue/${assignment.id}/submit`, {
    method: "POST",
    headers: { ...ORG, "x-demo-persona": reviewer.id, "x-demo-role": "reviewer" },
    body: JSON.stringify({ responses }),
  });
  return { round, submission, reviewer };
}

test("weights 2 and 1 with scores 4 and 3 aggregate to 3.67, not 3.5", () => {
  const scores = { originality: 4, relevance: 3 };
  assert.equal(roundAggregate(weightedAverage(CRITERIA, scores)), 3.67, "server helper is weighted");
  assert.equal(weightedAverageScores(scores, CRITERIA), 3.67, "client helper agrees");
  assert.notEqual(weightedAverageScores(scores, CRITERIA), 3.5, "the plain mean is not used");
  // The judged case: 4 (w2) and 2 (w1) -> 3.33, not 3.
  assert.equal(roundAggregate(weightedAverage(CRITERIA, { originality: 4, relevance: 2 })), 3.33);
  assert.equal(weightedAverageScores({ originality: 4, relevance: 2 }, CRITERIA), 3.33);
});

test("the client helper never drifts from the server helper", () => {
  const cases = [
    { originality: 5, relevance: 1 },
    { originality: 1, relevance: 5 },
    { originality: 3, relevance: 3 },
    { originality: 4 },
    {},
    { originality: 99 },
  ];
  for (const scores of cases) {
    assert.equal(
      weightedAverageScores(scores, CRITERIA),
      roundAggregate(weightedAverage(CRITERIA, scores)),
      `client and server disagree for ${JSON.stringify(scores)}`,
    );
  }
  // And both agree with the existing reviewer-facing aggregation.
  assert.equal(
    Math.round((weightedScore(CRITERIA as any, { originality: 4, relevance: 2 }) || 0) * 100) / 100,
    3.33,
  );
});

test("unweighted criteria fall back to a plain mean, and scales normalize", () => {
  const unweighted = [
    { id: "a", type: "rating", weight: 0, min: 1, max: 5 },
    { id: "b", type: "rating", weight: 0, min: 1, max: 5 },
  ];
  assert.equal(weightedAverageScores({ a: 4, b: 2 }, unweighted), 3, "no weights -> plain mean");
  // A 1-10 criterion is normalized onto 1-5 before weighting.
  const mixed = [
    { id: "wide", type: "rating", weight: 1, min: 1, max: 10 },
    { id: "narrow", type: "rating", weight: 1, min: 1, max: 5 },
  ];
  assert.equal(weightedAverageScores({ wide: 10, narrow: 5 }, mixed), 5, "top of each scale is 5");
  assert.equal(weightedAverageScores({ wide: 1, narrow: 1 }, mixed), 1, "bottom of each scale is 1");
  // Non-rating and out-of-range values are ignored.
  assert.equal(weightedAverageScores({ originality: 4, comments: "text" as any }, CRITERIA), 4);
  assert.equal(weightedAverageScores({}, CRITERIA), null);
});

test("the arithmetic is shown transparently", () => {
  assert.equal(weightedMath(CRITERIA, { originality: 4, relevance: 3 }), "(2x4 + 1x3)/3 = 3.67");
  assert.equal(weightedMathLabel({ originality: 4, relevance: 2 }, CRITERIA), "(2x4 + 1x2)/3 = 3.33");
  assert.equal(weightedMathLabel({}, CRITERIA), "");
});

test("every displayed surface reports the weighted aggregate", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  const { submission, reviewer } = await scoreOnce(app, { originality: 4, relevance: 3 });

  // Organizer inbox score column.
  const inbox = (await json(await app.request(`/api/events/${EVENT_ID}/submissions`, { headers: ORG }))).data
    .find((s: any) => s.id === submission.id);
  assert.equal(inbox.avgScore, 3.67, "inbox column is weighted");

  // Submission detail.
  const detail = (await json(await app.request(`/api/events/${EVENT_ID}/submissions/${submission.id}`, { headers: ORG }))).data;
  assert.equal(detail.avgScore, 3.67, "detail aggregate is weighted");

  // Review history row, with its arithmetic.
  const history = detail.reviews.find((r: any) => r.reviewerId === reviewer.id);
  assert.equal(history.average, 3.67, "review history is weighted");
  assert.equal(history.averageMath, "(2x4 + 1x3)/3 = 3.67", "and shows the maths");

  // Results table.
  const results = (await json(await app.request(`/api/events/${EVENT_ID}/review-results`, { headers: ORG }))).data
    .find((r: any) => r.id === submission.id);
  assert.ok(Math.abs(Number(results.aggregateScore) - 3.6666666666666665) < 1e-9, "results aggregate is weighted");
  resetEventRegistry();
});

test("the review UI renders weighted figures, not plain means", () => {
  const src = readFileSync("src/web/pages/SubmissionsPages.tsx", "utf8");
  // The live scorecard total.
  assert.match(src, /const total = weightedAverageScores\(scores as any, criteria as any\)/);
  assert.match(src, /data-testid="scorecard-weighted-average"/);
  assert.match(src, /Weighted average/);
  assert.match(src, /data-testid="scorecard-average-math"/);
  assert.ok(!/Rating average/.test(src), "the misleading 'Rating average' label is gone");
  // History rows prefer the server's weighted number and show the maths.
  assert.match(src, /Weighted avg \{avg\}/);
  assert.match(src, /const math = r\.averageMath \|\| ""/);
  // The inbox prefers the weighted per-review average.
  assert.match(src, /r\.average != null \? Number\(r\.average\) : averageScores\(r\.scores\)/);
  assert.ok(
    !/ratingCriteria\.reduce\(\(a: number, c: any\) => a \+ \(Number\(scores\[c\.id\]\) \|\| 0\), 0\) \/ ratingCriteria\.length/.test(src),
    "no unweighted recomputation remains",
  );
});
