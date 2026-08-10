import type { ReviewAssignment, ReviewCriterion, ReviewRound, Submission } from "./lifecycle.js";

export function blindSubmission(submission: Submission, blind: boolean) {
  if (!blind) return submission;
  const answers = Object.fromEntries(Object.entries(submission.answers).filter(([key]) => !/(name|email|company|author|participant|speaker)/i.test(key)));
  const { name: _name, email: _email, speakerId: _speakerId, ...safe } = submission;
  return { ...safe, answers, name: "Anonymous speaker", email: undefined, speakerId: undefined };
}

export function weightedScore(criteria: ReviewCriterion[], responses: Record<string, string | number>) {
  const numeric = criteria.filter((c) => c.type === "rating" && Number(c.weight) > 0 && Number.isFinite(Number(responses[c.id])));
  const weight = numeric.reduce((sum, c) => sum + c.weight, 0);
  return weight ? numeric.reduce((sum, c) => sum + Number(responses[c.id]) * c.weight, 0) / weight : null;
}

export function assignSpecific(assignments: ReviewAssignment[], round: ReviewRound, submissionIds: string[], reviewerId: string, cap = Infinity) {
  if (!round.reviewerIds.includes(reviewerId)) throw new Error("reviewer is not in this round's pool");
  const active = assignments.filter((a) => a.roundId === round.id && a.reviewerId === reviewerId && a.status !== "recused").length;
  const room = Math.max(0, cap - active);
  // Drop already-assigned ids BEFORE applying the cap: a duplicate must not consume a
  // slot (selecting 2 where 1 was already assigned used to yield 0-1 new assignments).
  const deduped = [...new Set(submissionIds)].filter(
    (submissionId) =>
      !assignments.some(
        (a) => a.roundId === round.id && a.submissionId === submissionId && a.reviewerId === reviewerId && a.status !== "recused",
      ),
  );
  return deduped.slice(0, room).map((submissionId) => ({ id: `assignment-${crypto.randomUUID().slice(0, 8)}`, roundId: round.id, submissionId, reviewerId, status: "assigned" as const, createdAt: new Date().toISOString() }));
}

export function autoDistribute(assignments: ReviewAssignment[], round: ReviewRound, submissionIds: string[], cap: number) {
  const created: ReviewAssignment[] = [];
  for (const submissionId of submissionIds) {
    const candidates = round.reviewerIds.map((reviewerId) => ({ reviewerId, count: [...assignments, ...created].filter((a) => a.roundId === round.id && a.reviewerId === reviewerId && a.status !== "recused").length })).filter((x) => x.count < cap).sort((a, b) => a.count - b.count);
    if (!candidates[0]) break;
    created.push(...assignSpecific([...assignments, ...created], round, [submissionId], candidates[0].reviewerId, cap));
  }
  return created;
}

export function csvCell(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
