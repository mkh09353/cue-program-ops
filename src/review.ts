import type { ReviewAssignment, ReviewCriterion, ReviewRound, Submission } from "./lifecycle.js";

export function blindSubmission(submission: Submission, blind: boolean) {
  if (!blind) return submission;
  const answers = Object.fromEntries(Object.entries(submission.answers).filter(([key]) => !/(name|email|company|author|participant|speaker)/i.test(key)));
  const { name: _name, email: _email, speakerId: _speakerId, ...safe } = submission;
  return { ...safe, answers, name: "Anonymous speaker", email: undefined, speakerId: undefined };
}

export function weightedScore(criteria: ReviewCriterion[], responses: Record<string, string | number>) {
  // Only configured rating criteria are score-bearing. Numeric select indices used
  // to enter the fallback average and could drag a valid 4/5 + 2/5 result to 1.67.
  // Normalize every configured scale onto a labeled 1–5 scale before weighting.
  const values=Object.entries(responses).flatMap(([id,value])=>{
    const criterion=criteria.find(c=>c.id===id&&c.type==="rating");
    if(!criterion||typeof value!=="number"||!Number.isFinite(value))return [];
    const min=Number(criterion.min??1),max=Number(criterion.max??5);
    if(!Number.isFinite(min)||!Number.isFinite(max)||max<=min||value<min||value>max)return [];
    const normalized=1+4*(Number(value)-min)/(max-min);
    return [{id,value:normalized,criterion}];
  });
  if(!values.length)return null;
  const weighted=values.filter(x=>Number(x.criterion.weight)>0);
  if(weighted.length){const total=weighted.reduce((sum,x)=>sum+Number(x.criterion.weight),0);return weighted.reduce((sum,x)=>sum+x.value*Number(x.criterion.weight),0)/total}
  return values.reduce((sum,x)=>sum+x.value,0)/values.length;
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
        (a) => a.roundId === round.id && a.submissionId === submissionId && a.reviewerId === reviewerId,
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
