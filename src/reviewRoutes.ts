import { Hono } from "hono";
import type { Mailer } from "./mailer.js";
import { EVENT_ID, type LifecycleStore, type ReviewRound } from "./lifecycle.js";
import { assignSpecific, autoDistribute, blindSubmission, csvCell, weightedScore } from "./review.js";

const error = (c: any, message: string, status = 400) => c.json({ error: { message } }, status as any);
export function createReviewRoutes(deps: {
  store: LifecycleStore;
  persist: () => Promise<void>;
  persona: (c: any) => { id: string; role: string; email: string; name: string };
  mailer: Mailer;
}) {
  const app = new Hono();
  const event = (c: any) => c.req.param("eventId") === EVENT_ID;
  const organizer = (c: any) => deps.persona(c).role === "organizer";
  const round = (id: string) => deps.store.reviewRounds.find((r) => r.id === id);

  app.get("/:eventId/review-rounds", (c) => event(c) ? c.json({ data: deps.store.reviewRounds }) : error(c, "event not found", 404));
  app.post("/:eventId/review-rounds", async (c) => {
    if (!event(c)) return error(c, "event not found", 404); if (!organizer(c)) return error(c, "organizer role required", 403);
    const b = await c.req.json();
    const row: ReviewRound = { id: b.id || `round-${crypto.randomUUID().slice(0, 8)}`, name: b.name || "Untitled round", opensAt: b.opensAt || new Date().toISOString(), closesAt: b.closesAt || new Date().toISOString(), status: b.status || "draft", blind: Boolean(b.blind), reviewerIds: b.reviewerIds || [], criteria: b.criteria || [] };
    deps.store.reviewRounds.push(row); await deps.persist(); return c.json({ data: row }, 201);
  });
  app.put("/:eventId/review-rounds/:id", async (c) => {
    if (!event(c)) return error(c, "event not found", 404); if (!organizer(c)) return error(c, "organizer role required", 403);
    const row = round(c.req.param("id")); if (!row) return error(c, "round not found", 404);
    Object.assign(row, await c.req.json(), { id: row.id }); await deps.persist(); return c.json({ data: row });
  });
  app.delete("/:eventId/review-rounds/:id", async (c) => {
    if (!event(c)) return error(c, "event not found", 404); if (!organizer(c)) return error(c, "organizer role required", 403);
    const index = deps.store.reviewRounds.findIndex((r) => r.id === c.req.param("id")); if (index < 0) return error(c, "round not found", 404);
    deps.store.reviewRounds.splice(index, 1); deps.store.reviewAssignments = deps.store.reviewAssignments.filter((a) => a.roundId !== c.req.param("id")); await deps.persist(); return c.body(null, 204);
  });
  app.post("/:eventId/review-assignments", async (c) => {
    if (!event(c)) return error(c, "event not found", 404); if (!organizer(c)) return error(c, "organizer role required", 403);
    const b = await c.req.json(); const r = round(b.roundId); if (!r) return error(c, "round not found", 404);
    let ids: string[] = b.submissionIds || [];
    if (b.track) ids = deps.store.submissions.filter((s) => s.category === b.track).map((s) => s.id);
    try {
      const made = b.method === "auto" ? autoDistribute(deps.store.reviewAssignments, r, ids, Number(b.cap || 5)) : assignSpecific(deps.store.reviewAssignments, r, ids, b.reviewerId, Number(b.cap || Infinity));
      deps.store.reviewAssignments.push(...made); await deps.persist(); return c.json({ data: made }, 201);
    } catch (e) { return error(c, e instanceof Error ? e.message : "assignment failed"); }
  });
  app.get("/:eventId/reviewer-queue", (c) => {
    if (!event(c)) return error(c, "event not found", 404); const p = deps.persona(c); if (p.role !== "reviewer") return error(c, "reviewer role required", 403);
    const data = deps.store.reviewAssignments.filter((a) => a.reviewerId === p.id && a.status !== "recused").map((a) => ({ ...a, round: round(a.roundId), submission: blindSubmission(deps.store.submissions.find((s) => s.id === a.submissionId)!, Boolean(round(a.roundId)?.blind)), review: deps.store.reviews.find((r) => r.submissionId === a.submissionId && r.reviewerId === p.id) }));
    return c.json({ data });
  });
  app.get("/:eventId/reviewer-queue/:submissionId", (c) => {
    if (!event(c)) return error(c, "event not found", 404); const p = deps.persona(c); if (p.role !== "reviewer") return error(c, "reviewer role required", 403);
    const assignment = deps.store.reviewAssignments.find((a) => a.submissionId === c.req.param("submissionId") && a.reviewerId === p.id && a.status !== "recused"); if (!assignment) return error(c, "assignment not found", 404);
    const r = round(assignment.roundId)!; return c.json({ data: { assignment, round: r, submission: blindSubmission(deps.store.submissions.find((s) => s.id === assignment.submissionId)!, r.blind), review: deps.store.reviews.find((x) => x.submissionId === assignment.submissionId && x.reviewerId === p.id) } });
  });
  app.post("/:eventId/reviewer-queue/:assignmentId/submit", async (c) => {
    if (!event(c)) return error(c, "event not found", 404); const p = deps.persona(c); const a = deps.store.reviewAssignments.find((x) => x.id === c.req.param("assignmentId") && x.reviewerId === p.id && x.status !== "recused"); if (!a) return error(c, "assignment not found", 404);
    const b = await c.req.json(); let review = deps.store.reviews.find((r) => r.submissionId === a.submissionId && r.reviewerId === p.id);
    if (!review) { review = { id: `review-${crypto.randomUUID().slice(0, 8)}`, submissionId: a.submissionId, reviewerId: p.id, round: "r1", scores: {}, notes: "", status: "assigned" }; deps.store.reviews.push(review); }
    const responses: Record<string, string | number> = b.responses || {}; review.responses = responses; review.scores = Object.fromEntries(Object.entries(responses).filter(([,v]) => typeof v === "number")) as Record<string,number>; review.notes = String(responses.comments || b.notes || ""); review.recommendation = String(responses.recommendation || ""); review.status = "submitted"; review.source = "human"; a.status = "completed"; a.completedAt = new Date().toISOString(); await deps.persist(); return c.json({ data: review });
  });
  app.post("/:eventId/reviewer-queue/:assignmentId/recuse", async (c) => {
    if (!event(c)) return error(c, "event not found", 404); const p = deps.persona(c); const a = deps.store.reviewAssignments.find((x) => x.id === c.req.param("assignmentId") && x.reviewerId === p.id && x.status === "assigned"); if (!a) return error(c, "assignment not found", 404);
    const b = await c.req.json().catch(() => ({})); a.status = "recused"; deps.store.reviewConflicts.push({ id: `conflict-${crypto.randomUUID().slice(0,8)}`, assignmentId: a.id, reviewerId: p.id, submissionId: a.submissionId, reason: b.reason || "Conflict of interest", createdAt: new Date().toISOString() }); await deps.persist(); return c.json({ data: a });
  });
  app.get("/:eventId/review-progress", (c) => {
    if (!event(c)) return error(c, "event not found", 404); if (!organizer(c)) return error(c, "organizer role required", 403);
    const data = deps.store.reviewRounds.flatMap((r) => r.reviewerIds.map((reviewerId) => { const rows=deps.store.reviewAssignments.filter((a)=>a.roundId===r.id&&a.reviewerId===reviewerId&&a.status!=="recused"), completed=rows.filter((a)=>a.status==="completed").length; return { roundId:r.id, roundName:r.name, reviewerId, reviewer:deps.store.personas.find((p)=>p.id===reviewerId), assigned:rows.length, completed, outstanding:rows.length-completed, percent:rows.length?Math.round(completed/rows.length*100):0 }; })); return c.json({ data });
  });
  app.post("/:eventId/review-reminders", async (c) => {
    if (!event(c)) return error(c, "event not found", 404); if (!organizer(c)) return error(c, "organizer role required", 403); const b=await c.req.json(); const sent=[];
    for (const reviewerId of b.reviewerIds || []) { const p=deps.store.personas.find((x)=>x.id===reviewerId); const outstanding=deps.store.reviewAssignments.filter((a)=>a.reviewerId===reviewerId&&a.status==="assigned").length; if (!p||!outstanding) continue; const result=await deps.mailer.send({to:p.email,subject:`${outstanding} CUE reviews outstanding`,text:`Please complete your ${outstanding} assigned review${outstanding===1?"":"s"}.`}).catch(()=>({status:"failed" as const})); deps.store.communications.push({id:`comm-${crypto.randomUUID().slice(0,8)}`,speakerId:reviewerId,subject:`${outstanding} CUE reviews outstanding`,body:`Review reminder sent to ${p.name}`,kind:"reminder",status:result.status,ics:"",createdAt:new Date().toISOString()}); sent.push({reviewerId,status:result.status}); } await deps.persist(); return c.json({data:sent});
  });
  const results = () => deps.store.submissions.map((s) => { const reviews=deps.store.reviews.filter((r)=>r.submissionId===s.id&&r.status==="submitted"&&r.source!=="ai_draft"); const scores=reviews.map((r)=>weightedScore(deps.store.reviewRounds.find((x)=>x.reviewerIds.includes(r.reviewerId))?.criteria||[],r.responses||r.scores)).filter((x):x is number=>x!==null); const recommendationCounts=Object.fromEntries([...new Set(reviews.map((r)=>r.recommendation).filter(Boolean))].map((v)=>[v,reviews.filter((r)=>r.recommendation===v).length])); return {...s,reviewerCount:reviews.length,aggregateScore:scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null,recommendationCounts}; });
  app.get("/:eventId/review-results", (c) => { if (!event(c)) return error(c,"event not found",404); if(!organizer(c)) return error(c,"organizer role required",403); return c.json({data:results()}); });
  app.get("/:eventId/review-results.csv", (c) => { if (!event(c)) return error(c,"event not found",404); if(!organizer(c)) return error(c,"organizer role required",403); const lines=[["Submission","Title","Status","Average score","Reviewer count"].map(csvCell).join(","),...results().map((r)=>[r.id,r.title,r.status,r.aggregateScore??"",r.reviewerCount].map(csvCell).join(","))]; return c.body(lines.join("\n"),200,{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=review-results.csv"}); });
  return app;
}
