import { Hono } from "hono";
import { MockAcceleventsClient, HttpAcceleventsClient, type AcceleventsClient } from "./accelevents.js";
import type { Repository } from "./domain.js";
import { MemoryRepository } from "./repository.js";
import { SyncService } from "./sync.js";
import {
  EVENT_ID,
  EVENT_SLUG,
  advisoryAi,
  boardForCategory,
  completeTaskForSpeaker,
  commandSnapshot,
  cfpRouteForCategory,
  cfpWindow,
  ensureOnboarding,
  ics,
  icsForSession,
  readiness,
  isSafeAccent,
  resolveDemoPersona,
  reviewForRound,
  reviewHistory,
  markReviewSubmitted,
  reminderPlans,
  safeEmbed,
  sendTemplate,
  store,
  upsertResource,
  deleteResource,
  validateCfpSubmission,
  type Role,
  type Submission,
} from "./lifecycle.js";
import { applyScheduleMove, publicSchedule, scheduleWarnings, validateSlot, type AgendaSlot } from "./schedule.js";
import { canonicalScheduleMetrics, publicSpeakers } from "./projection.js";
import { MemorySnapshotPersistence, type CompetitionSnapshot, type SnapshotPersistence } from "./persistence.js";
import { MockMailer, type Mailer } from "./mailer.js";
import { createReviewRoutes } from "./reviewRoutes.js";
import { createContentRoutes } from "./contentRoutes.js";
import { createPublicSite } from "./publicSite.js";
import { createCrmRoutes } from "./crmRoutes.js";
import { applySessionEdit } from "./sessionContent.js";
import { deleteFieldDefinition, listFieldDefinitions, saveFieldDefinition } from "./crm.js";
import { createSpeakerRoutes } from "./speakerRoutes.js";
import { blindSubmission } from "./review.js";
import { createAgendaRoutes } from "./agendaRoutes.js";

export interface AppDeps {
  repo?: Repository;
  client?: AcceleventsClient;
  persistence?: SnapshotPersistence;
  mailer?: Mailer;
}

const fail = (c: any, message: string, status = 400) =>
  c.json({ error: { code: status === 404 ? "NOT_FOUND" : status === 403 ? "FORBIDDEN" : "VALIDATION_ERROR", message } }, status);

/** Demo-only identity: a known persona id wins; legacy role header is retained for existing judge flows. */
const personaOf = (c: any) => {
  const id = c.req.header("x-demo-persona");
  if (id) return resolveDemoPersona(id);
  const role = c.req.header("x-demo-role") as Role | undefined;
  return store.personas.find((p) => p.role === role) || resolveDemoPersona();
};
const actor = (c: any): Role => personaOf(c).role;
const speakerIdOf = (c: any) => personaOf(c).speakerId;

function htmlPage(title: string, body: string, extraHead = "") {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  :root{color-scheme:light;--ink:#12141A;--bg:#F7F4EF;--card:#fff;--muted:#5c6170;--line:#e7e2d9;--accent:#5B5CFF;--ok:#1B7F4E}
  *{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:var(--bg);color:var(--ink)}
  header{padding:20px 18px;border-bottom:1px solid var(--line);background:var(--card);position:sticky;top:0}
  header b{font-size:18px;letter-spacing:-.03em}header p{margin:4px 0 0;color:var(--muted);font-size:13px}
  main{padding:18px;max-width:960px;margin:0 auto}
  .grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px}
  .card h3{margin:0 0 6px;font-size:16px;letter-spacing:-.02em}.card p{margin:0;color:var(--muted);font-size:13px;line-height:1.45}
  .pill{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:#eef0ff;color:var(--accent);padding:4px 8px;border-radius:999px;margin-bottom:8px}
  .meta{font-size:12px;color:var(--muted);margin-top:8px}
  .row{display:flex;gap:10px;align-items:flex-start;border-bottom:1px solid var(--line);padding:12px 0}
  .row:last-child{border-bottom:0}.time{min-width:88px;font-weight:700;font-size:13px}
  .avatar{width:48px;height:48px;border-radius:999px;background:linear-gradient(135deg,#5B5CFF,#c7f464);display:grid;place-items:center;color:white;font-weight:800;margin-bottom:10px}
  @media(max-width:520px){.grid{grid-template-columns:1fr}.time{min-width:72px}}
</style>
${extraHead}
</head>
<body>
<header><b>${title}</b><p>Powered by CUE · mobile-friendly public embed</p></header>
<main>${body}</main>
</body></html>`;
}

export function createApp(deps: AppDeps = {}) {
  const repo = deps.repo ?? new MemoryRepository();
  const client = deps.client ?? new MockAcceleventsClient();
  const persistence = deps.persistence ?? new MemorySnapshotPersistence();
  const mailer = deps.mailer ?? new MockMailer();
  const sync = new SyncService(repo, client);
  const app = new Hono();
  /** Save after mutations. Failures are observable but never roll back valid in-memory work. */
  const persist = async () => {
    const memory = repo as MemoryRepository & { exportSyncState?: () => CompetitionSnapshot["sync"]; getSchedule?: (id:string) => Promise<any> };
    try {
      // Keep optional snapshot-export failures from changing an otherwise valid request result.
      const syncState = memory.exportSyncState?.() as CompetitionSnapshot["sync"] | undefined;
      await persistence.save({version:1,eventId:EVENT_ID,savedAt:new Date().toISOString(),lifecycle:structuredClone(store),schedule:await memory.getSchedule?.(EVENT_ID),sync:syncState || {links:[],runs:[],items:[]}});
    } catch (error) { console.error("CUE snapshot persistence failed", error instanceof Error ? error.message : "unknown error"); }
  };
  const deliver = async (row: ReturnType<typeof sendTemplate>) => {
    const to=store.profiles.find(p=>p.speakerId===row.speakerId)?.email || store.submissions.find(s=>s.speakerId===row.speakerId)?.email;
    if (!to) { row.status="failed"; return; }
    try { row.status=(await mailer.send({to,subject:row.subject,text:row.body,attachments:row.ics?[{filename:"invite.ics",content:row.ics,contentType:"text/calendar"}]:undefined})).status; }
    catch (error) { row.status="failed"; console.error("CUE mail delivery failed", error instanceof Error ? error.message : "unknown error"); }
  };
  app.use("/api/events/:eventId/*", async (c, next) => c.req.param("eventId") === EVENT_ID ? next() : fail(c, "event not found", 404));
  app.route("/", createSpeakerRoutes({ store, persist, persona: personaOf, mailer, repo }));
  app.route("/api/events", createReviewRoutes({ store, persist, persona: personaOf, mailer }));
  app.route("/", createContentRoutes({ store, persist, persona: personaOf, mailer, repo }));
  app.route("/", createPublicSite({ repo }));
  // CRM typed custom-field definitions. Registered here (not in crmRoutes.ts) to keep
  // this addition isolated from the contact/merge handlers.
  app.get("/api/crm/field-definitions", (c) => c.json({ data: listFieldDefinitions() }));
  app.post("/api/crm/field-definitions", async (c) => {
    if (actor(c) !== "organizer") return fail(c, "organizer role required", 403);
    const b = (await c.req.json().catch(() => null)) as any;
    if (!b) return fail(c, "JSON body required");
    const saved = saveFieldDefinition(b);
    if (!saved.ok) return fail(c, saved.error);
    await persist();
    return c.json({ data: saved.definition }, 201);
  });
  app.delete("/api/crm/field-definitions/:key", async (c) => {
    if (actor(c) !== "organizer") return fail(c, "organizer role required", 403);
    if (!deleteFieldDefinition(c.req.param("key"))) return fail(c, "field definition not found", 404);
    await persist();
    return c.body(null, 204);
  });
  app.route("/", createCrmRoutes({ store, persist, persona: personaOf, mailer }));
  app.route("/", createAgendaRoutes({ store, repo, persist, persona: personaOf }));
  app.get("/api/events/:eventId/automation",(c)=>c.json({data:store.automation||{enabled:true,schedule:"0 * * * *",speakerSent:0,reviewerSent:0,status:"never"}}));
  app.post("/api/internal/automation/run",async(c)=>{
    if(c.req.header("x-cue-automation")!=="scheduled"||new URL(c.req.url).hostname!=="cue.internal")return fail(c,"automation caller required",403);
    const state=store.automation||(store.automation={enabled:true,schedule:"0 * * * *",speakerSent:0,reviewerSent:0,status:"never"});let speakerSent=0,reviewerSent=0;
    try{const plans=reminderPlans(),deliverableIds=store.deliverableTasks.filter(x=>x.status!=="complete"&&Date.parse(x.dueAt)<=Date.now()+7*86400000).map(x=>x.speakerId),speakerIds=[...new Set([...plans.map(x=>x.speakerId),...deliverableIds])];for(const speakerId of speakerIds){const row=sendTemplate("task_reminder",speakerId,"outstanding tasks and deliverables","reminder");await deliver(row);speakerSent++}for(const reviewerId of [...new Set(store.reviewAssignments.filter(a=>a.status==="assigned").map(a=>a.reviewerId))]){const p=store.personas.find(x=>x.id===reviewerId&&x.role==="reviewer");if(!p)continue;const outstanding=store.reviewAssignments.filter(a=>a.reviewerId===reviewerId&&a.status==="assigned").length,result=await mailer.send({to:p.email,subject:`${outstanding} CUE reviews outstanding`,text:`Please complete your ${outstanding} assigned reviews.`}).catch(()=>({status:"failed" as const}));store.communications.push({id:`comm-${crypto.randomUUID().slice(0,8)}`,speakerId:reviewerId,subject:`${outstanding} CUE reviews outstanding`,body:`Scheduled reviewer reminder for ${p.name}`,kind:"reminder",status:result.status,ics:"",createdAt:new Date().toISOString()});reviewerSent++}Object.assign(state,{lastRunAt:new Date().toISOString(),speakerSent,reviewerSent,status:"completed"});await persist();return c.json({data:state})}catch(error){Object.assign(state,{lastRunAt:new Date().toISOString(),speakerSent,reviewerSent,status:"failed"});await persist();return fail(c,error instanceof Error?error.message:"automation failed",500)}
  });
  app.get("/api/events/:eventId/embed-configs",(c)=>c.json({data:store.embedConfigs||[]}));
  app.post("/api/events/:eventId/embed-configs",async(c)=>{if(actor(c)!=="organizer")return fail(c,"organizer role required",403);const b=await c.req.json().catch(()=>null) as any;if(!b?.name||!["sessions","speakers","agenda","itinerary","gallery"].includes(b.widget))return fail(c,"name and valid widget required");store.embedConfigs||=[];const accent=isSafeAccent(b.theme?.accent)?String(b.theme.accent).trim():undefined;if(b.theme?.accent&&!accent)return fail(c,"accent must be a hex color like #4B5563");const row={id:`embed-${crypto.randomUUID().slice(0,8)}`,name:String(b.name),widget:b.widget,filters:{track:b.filters?.track||undefined,format:b.filters?.format||undefined,room:b.filters?.room||undefined,day:b.filters?.day||undefined},theme:{accent},fields:{speakers:b.fields?.speakers!==false,room:b.fields?.room!==false,track:b.fields?.track!==false,description:b.fields?.description!==false},createdAt:new Date().toISOString()};store.embedConfigs.push(row);await persist();return c.json({data:row},201)});
  app.delete("/api/events/:eventId/embed-configs/:id",async(c)=>{if(actor(c)!=="organizer")return fail(c,"organizer role required",403);const i=(store.embedConfigs||[]).findIndex(x=>x.id===c.req.param("id"));if(i<0)return fail(c,"embed config not found",404);store.embedConfigs.splice(i,1);await persist();return c.body(null,204)});

  app.get("/health", (c) =>
    c.json({ ok: true, mode: client instanceof MockAcceleventsClient ? "mock" : "configured", product: "CUE" }),
  );
  app.get("/demo", async (c) => c.json(await repo.getData("evt-ai-summit-2026")));

  // —— Bootstrap / command ——
  app.get("/api/events/:eventId/bootstrap", (c) => {
    if (c.req.param("eventId") !== EVENT_ID) return fail(c, "event not found", 404);
    for (const profile of store.profiles) {
      const persona=store.personas.find(p=>p.id===profile.speakerId);
      if(persona) Object.assign(persona,{role:"speaker",name:profile.name,email:profile.email,speakerId:profile.speakerId});
      else store.personas.push({id:profile.speakerId,role:"speaker",name:profile.name,email:profile.email,speakerId:profile.speakerId});
    }
    return c.json({
      data: {
        event: store.event,
        actor: actor(c),
        personas: store.personas,
        form: store.form,
        boards: store.boards,
        rooms: store.rooms,
        tracks: store.tracks,
        templates: store.templates,
        store: {
          submissions: store.submissions,
          reviews: store.reviews,
          tasks: store.tasks,
          files: store.files,
          communications: store.communications,
          resources: store.resources,
          sessions: store.sessions,
          profiles: store.profiles,
        },
        readiness: store.submissions
          .filter((s) => s.status === "accepted")
          .map((s) => ({ speakerId: s.speakerId, name: s.name, ...readiness(s.speakerId) })),
      },
    });
  });

  app.get("/api/events/:eventId/command", async (c) => {
    if (c.req.param("eventId") !== EVENT_ID) return fail(c, "event not found", 404);
    // Schedule projection is the canonical source for the command-center schedule KPI.
    const metrics = await canonicalScheduleMetrics(repo as any, EVENT_ID);
    const snapshot = commandSnapshot();
    snapshot.kpis.acceptedUnscheduled = metrics.acceptedUnscheduled;
    const blocker = snapshot.blockers.find((item) => item.id === "unscheduled");
    if (metrics.acceptedUnscheduled === 0) snapshot.blockers = snapshot.blockers.filter((item) => item.id !== "unscheduled");
    else if (blocker) blocker.label = `${metrics.acceptedUnscheduled} accepted session${metrics.acceptedUnscheduled === 1 ? "" : "s"} still unscheduled`;
    else snapshot.blockers.push({ id:"unscheduled", severity:"warn", label:`${metrics.acceptedUnscheduled} accepted session${metrics.acceptedUnscheduled === 1 ? "" : "s"} still unscheduled`, href:"/app/schedule" });
    return c.json({ data: snapshot });
  });

  app.put("/api/events/:eventId/settings", async (c) => {
    if (actor(c) !== "organizer") return fail(c, "organizer role required", 403);
    const b = (await c.req.json().catch(() => null)) as Partial<typeof store.event> | null;
    if (!b) return fail(c, "JSON body required");
    Object.assign(store.event, {
      name: b.name ?? store.event.name,
      website: b.website ?? store.event.website,
      location: b.location ?? store.event.location,
      timezone: b.timezone ?? store.event.timezone,
    });
    await persist();
    return c.json({ data: store.event });
  });

  // —— Forms ——
  app.get("/api/events/:eventId/forms", (c) => c.json({ data: [store.form] }));
  app.get("/api/events/:eventId/forms/:id", (c) => {
    if (store.form.id !== c.req.param("id")) return fail(c, "form not found", 404);
    return c.json({ data: store.form });
  });
  app.put("/api/events/:eventId/forms/:id", async (c) => {
    if (actor(c) !== "organizer") return fail(c, "organizer role required", 403);
    if (store.form.id !== c.req.param("id")) return fail(c, "form not found", 404);
    const b = (await c.req.json().catch(() => null)) as Partial<typeof store.form> | null;
    if (!b) return fail(c, "JSON body required");
    if (b.title) store.form.title = String(b.title);
    if (b.welcomeMd != null) store.form.welcomeMd = String(b.welcomeMd);
    if (b.successMd != null) store.form.successMd = String(b.successMd);
    if (b.status === "open" || b.status === "closed") store.form.status = b.status;
    if (b.openAt) store.form.openAt = String(b.openAt);
    if (b.closeAt) store.form.closeAt = String(b.closeAt);
    if (typeof b.maxPerUser === "number") store.form.maxPerUser = b.maxPerUser;
    if (Array.isArray(b.fields)) {
      const allowed = new Set(["text", "textarea", "select", "checkbox", "file", "speaker_block"]);
      const keys = new Set<string>();
      const fields = b.fields.map((raw: any) => {
        const field: any = {
          key: String(raw.key || "").trim(),
          label: String(raw.label || "").trim(),
          type: String(raw.type || "text"),
          required: Boolean(raw.required),
        };
        if (Array.isArray(raw.options)) field.options = raw.options.map(String).filter(Boolean);
        if (raw.section) field.section = String(raw.section);
        if (raw.helpText != null && String(raw.helpText).trim()) field.helpText = String(raw.helpText);
        if (raw.visibleWhen && raw.visibleWhen.key) {
          field.visibleWhen = {
            key: String(raw.visibleWhen.key),
            equals: String(raw.visibleWhen.equals ?? ""),
          };
        }
        return field;
      }).filter((field: any) => field.key && field.label && allowed.has(field.type) && !keys.has(field.key) && keys.add(field.key));
      if (!fields.some((field: any) => field.key === "title")) return fail(c, "title field is required");
      store.form.fields = fields as typeof store.form.fields;
    }
    if (Array.isArray(b.routes)) store.form.routes = b.routes as typeof store.form.routes;
    await persist();
    return c.json({ data: store.form });
  });

  // —— Public CFP ——
  app.get("/api/public/events/:slug/cfp", (c) => {
    if (c.req.param("slug") !== EVENT_SLUG && c.req.param("slug") !== "ai-engineer-sandbox-event")
      return fail(c, "event not found", 404);
    return c.json({
      data: {
        event: store.event,
        form: {
          ...store.form,
          // Track names have one source of truth: category field options. Older
          // snapshots may contain a hand-written legacy track line in welcome copy.
          welcomeMd: store.form.welcomeMd
            .split("\n")
            .filter((line) => !/^\s*(tracks?|categories)\s*:/i.test(line))
            .join("\n"),
          routes: store.form.routes.filter((route) =>
            (store.form.fields.find((f) => f.key === "category")?.options || []).includes(route.category),
          ),
        },
        categories: store.form.fields.find((f) => f.key === "category")?.options || [],
        window: cfpWindow(),
      },
    });
  });

  app.post("/api/public/events/:slug/submissions", async (c) => {
    if (c.req.param("slug") !== EVENT_SLUG && c.req.param("slug") !== "ai-engineer-sandbox-event") return fail(c, "event not found", 404);
    if (!cfpWindow().open) return fail(c, cfpWindow().reason);
    const b = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b) return fail(c, "JSON body required");
    const answers = (b.answers || {}) as Record<string, unknown>;
    const category = String(answers.category || "");
    const format = String(answers.format || "Talk");
    const requestedStatus = b.status === "draft" ? "draft" : "submitted";
    const normalizedEmail = String(b.email || "").trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return fail(c, "valid email is required");
    if (!String(answers.title || "").trim()) return fail(c, "Session title is required");
    const check = requestedStatus === "submitted" ? validateCfpSubmission(answers, normalizedEmail) : null;
    if (check && !check.ok) return fail(c, check.error);
    const route = requestedStatus === "submitted" ? cfpRouteForCategory(category) : { boardId: "draft", boardLabel: "Draft" };
    const id = `sub-${crypto.randomUUID().slice(0, 8)}`;
    const existingProfile = store.profiles.find((profile) => profile.email.toLowerCase() === normalizedEmail);
    const speakerId = existingProfile?.speakerId || `spk-${crypto.randomUUID().slice(0, 8)}`;
    const name = String(b.name || "Guest speaker");
    const email = String(b.email || "");
    if (!name.trim() || !email.trim()) return fail(c, "name and email are required");
    const submission: Submission = {
      id,
      eventId: EVENT_ID,
      speakerId,
      name,
      email: normalizedEmail,
      title: String(answers.title),
      abstract: String(answers.abstract),
      category,
      format,
      answers,
      status: requestedStatus,
      reviewBoard: route.boardId,
      round: "r1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editToken: crypto.randomUUID(),
      additionalSpeakers: normalizeAdditionalSpeakers(answers.additionalSpeakers),
    };
    store.submissions.unshift(submission);
    if (!existingProfile) store.profiles.push({ speakerId, name, email: normalizedEmail, bio: String(answers.speaker_bio || "") });
    if (!store.personas.some((persona) => persona.id === speakerId)) store.personas.push({ id: speakerId, role: "speaker", name, email: normalizedEmail, speakerId });
    if (requestedStatus === "submitted") store.reviews.push({
      id: `rev-${id}-r1`,
      submissionId: id,
      reviewerId: "rev-ada",
      round: "r1",
      scores: { relevance: 0, novelty: 0, clarity: 0, depth: 0 },
      notes: "",
      status: "assigned",
    });
    if (requestedStatus === "submitted") { const comm=sendTemplate("cfp_received", speakerId, submission.title, "cfp_received"); await deliver(comm); }
    await persist();
    return c.json(
      { data: { id, status: requestedStatus, reviewBoard: route.boardId, boardLabel: route.boardLabel, speakerId, editToken: submission.editToken, editUrl: `/e/${EVENT_SLUG}/cfp?submission=${id}&token=${submission.editToken}` } },
      201,
    );
  });

  app.get("/api/public/events/:slug/submissions/:id", (c) => {
    const submission = store.submissions.find((row) => row.id === c.req.param("id"));
    if (!submission || c.req.query("token") !== submission.editToken) return fail(c, "submission not found", 404);
    return c.json({ data: { ...submission, editable: cfpWindow().open } });
  });

  app.put("/api/public/events/:slug/submissions/:id", async (c) => {
    if (!cfpWindow().open) return fail(c, "Submission editing is closed", 403);
    const submission = store.submissions.find((row) => row.id === c.req.param("id"));
    const b = await c.req.json().catch(() => null) as any;
    if (!submission || !b || b.editToken !== submission.editToken) return fail(c, "submission not found", 404);
    const answers = { ...submission.answers, ...(b.answers || {}) };
    const nextStatus = b.status === "draft" ? "draft" : "submitted";
    if (!String(answers.title || "").trim()) return fail(c, "Session title is required");
    if (nextStatus === "submitted") { const check = validateCfpSubmission(answers, submission.email); if (!check.ok) return fail(c, check.error); submission.reviewBoard = cfpRouteForCategory(String(answers.category)).boardId; }
    Object.assign(submission, { title: String(answers.title), abstract: String(answers.abstract || ""), category: String(answers.category || ""), format: String(answers.format || ""), answers, additionalSpeakers:normalizeAdditionalSpeakers(answers.additionalSpeakers,submission.additionalSpeakers), status: nextStatus, updatedAt: new Date().toISOString() });
    if (nextStatus === "submitted" && !store.reviews.some((review) => review.submissionId === submission.id)) store.reviews.push({ id:`rev-${submission.id}-r1`,submissionId:submission.id,reviewerId:"rev-ada",round:"r1",scores:{ relevance:0,novelty:0,clarity:0,depth:0 },notes:"",status:"assigned" });
    await persist(); return c.json({ data: { ...submission, editable: true, editUrl: `/e/${EVENT_SLUG}/cfp?submission=${submission.id}&token=${submission.editToken}` } });
  });

  app.put("/api/speaker/events/:eventId/submissions/:id", async (c) => {
    if (!cfpWindow().open) return fail(c, "Submission editing is closed", 403);
    const speakerId = speakerIdOf(c); const submission = store.submissions.find((row) => row.id === c.req.param("id"));
    if (!speakerId || !submission || submission.speakerId !== speakerId) return fail(c, "submission not found", 404);
    const b = await c.req.json().catch(() => null) as any; if (!b) return fail(c, "JSON body required");
    const answers = { ...submission.answers, ...(b.answers || {}) }; const check = validateCfpSubmission(answers, submission.email); if (!check.ok) return fail(c, check.error);
    Object.assign(submission, { title:String(answers.title),abstract:String(answers.abstract),category:String(answers.category),format:String(answers.format),answers,additionalSpeakers:normalizeAdditionalSpeakers(answers.additionalSpeakers,submission.additionalSpeakers),reviewBoard:cfpRouteForCategory(String(answers.category)).boardId,updatedAt:new Date().toISOString() });
    await persist(); return c.json({ data: submission });
  });

  // —— Submissions / review ——
  app.get("/api/events/:eventId/submissions", (c) => {
    if (c.req.param("eventId") !== EVENT_ID) return fail(c, "event not found", 404);
    const filter = c.req.query("filter");
    const persona = personaOf(c);
    let rows = persona.role === "reviewer" ? store.submissions.filter((s) => store.reviewAssignments.some((a) => a.submissionId === s.id && a.reviewerId === persona.id && a.status !== "recused")) : [...store.submissions];
    if (filter === "pending") rows = rows.filter((s) => ["submitted", "under_review"].includes(s.status));
    if (filter === "accepted") rows = rows.filter((s) => s.status === "accepted");
    if (filter === "rejected") rows = rows.filter((s) => s.status === "rejected");
    if (filter === "unscored") {
      const open = new Set(store.reviews.filter((r) => r.status === "assigned").map((r) => r.submissionId));
      rows = rows.filter((s) => open.has(s.id));
    }
    return c.json({
      data: rows.map((s) => ({
        ...(persona.role === "reviewer" ? blindSubmission(s, Boolean(store.reviewRounds.find((r) => r.id === store.reviewAssignments.find((a) => a.submissionId === s.id && a.reviewerId === persona.id)?.roundId)?.blind)) : s),
        avgScore: avgScore(s.id),
        reviews: reviewHistory(s.id),
        decisionEmailAt: store.communications.find(x=>x.submissionId===s.id&&(x.kind==="acceptance"||x.kind==="rejection"))?.createdAt,
      })),
    });
  });

  app.get("/api/events/:eventId/submissions/:id", (c) => {
    if (c.req.param("eventId") !== EVENT_ID) return fail(c, "event not found", 404);
    const s = store.submissions.find((x) => x.id === c.req.param("id"));
    if (!s) return fail(c, "submission not found", 404);
    const persona = personaOf(c);
    if (persona.role === "reviewer" && !store.reviewAssignments.some((a) => a.submissionId === s.id && a.reviewerId === persona.id && a.status !== "recused")) return fail(c, "submission not assigned", 404);
    if (persona.role === "speaker" && persona.speakerId !== s.speakerId) return fail(c, "submission not found", 404);
    const assignment = store.reviewAssignments.find((a) => a.submissionId === s.id && a.reviewerId === persona.id && a.status !== "recused");
    const projected = persona.role === "reviewer" ? blindSubmission(s, Boolean(store.reviewRounds.find((r) => r.id === assignment?.roundId)?.blind)) : s;
    return c.json({
      data: {
        ...projected,
        reviews: reviewHistory(s.id).filter((r) => persona.role !== "reviewer" || r.reviewerId === persona.id),
        profile: persona.role === "reviewer" ? undefined : store.profiles.find((p) => p.speakerId === s.speakerId),
        avgScore: avgScore(s.id),
      },
    });
  });

  app.get("/api/events/:eventId/reviews", (c) => {
    const persona = personaOf(c);
    const rows =
      persona.role === "organizer"
        ? store.reviews
        : store.reviews.filter((r) => r.reviewerId === persona.id && store.reviewAssignments.some((a) => a.submissionId === r.submissionId && a.reviewerId === persona.id && a.status !== "recused"));
    return c.json({
      data: rows.map((r) => ({
        // Canonical projection: reviewer name, round, criterion labels, average.
        ...(reviewHistory(r.submissionId).find((x) => x.id === r.id) || r),
        submission: (() => { const s=store.submissions.find((x) => x.id === r.submissionId); const a=store.reviewAssignments.find((x)=>x.submissionId===r.submissionId&&x.reviewerId===persona.id); return s ? blindSubmission(s, persona.role === "reviewer" && Boolean(store.reviewRounds.find((x)=>x.id===a?.roundId)?.blind)) : undefined; })(),
      })),
    });
  });

  app.post("/api/events/:eventId/reviews/:id", async (c) => {
    const role = actor(c);
    if (role !== "reviewer" && role !== "organizer") return fail(c, "reviewer role required", 403);
    const r = store.reviews.find((x) => x.id === c.req.param("id"));
    if (!r) return fail(c, "review not found", 404);
    if (role === "reviewer" && r.reviewerId !== personaOf(c).id) return fail(c, "review not assigned", 403);
    const b = (await c.req.json()) as {
      scores?: Record<string, number>;
      responses?: Record<string, string | number>;
      notes?: string;
      round?: string;
    };
    const legacyRound = b.round === "r1" || b.round === "r2" || b.round === "final" ? b.round : undefined;
    const target =
      legacyRound && legacyRound !== r.round ? reviewForRound(r.submissionId, r.reviewerId, legacyRound) : r;
    if (b.responses) {
      target.responses = b.responses;
      const numeric = Object.fromEntries(
        Object.entries(b.responses).filter(([, v]) => typeof v === "number"),
      ) as Record<string, number>;
      target.scores = { ...target.scores, ...numeric, ...(b.scores || {}) };
      if (b.responses.recommendation != null) target.recommendation = String(b.responses.recommendation);
      if (b.responses.comments != null && b.notes == null) target.notes = String(b.responses.comments);
    } else {
      target.scores = b.scores || target.scores;
    }
    target.notes = b.notes ?? target.notes;
    target.source = "human";
    // Canonical mirror: also completes the reviewer's assignment + advances status.
    markReviewSubmitted(target);
    const sub = store.submissions.find((s) => s.id === r.submissionId);
    if (sub && legacyRound) sub.round = legacyRound;
    await persist();
    return c.json({ data: target });
  });

  app.post("/api/events/:eventId/reviews/:id/ai-assist", (c) => {
    let r = store.reviews.find((x) => x.id === c.req.param("id"));
    // Runtime-invited reviewers may have an assignment before their Review row
    // exists. The scorecard can request a draft with the assignment id.
    if (!r) {
      const assignment = store.reviewAssignments.find((x) => x.id === c.req.param("id"));
      if (assignment) {
        const persona = resolveDemoPersona(c.req.header("x-demo-persona"));
        if (persona.role === "reviewer" && assignment.reviewerId !== persona.id) return fail(c, "assignment not found", 404);
        r = {
          id: `review-${crypto.randomUUID().slice(0, 8)}`,
          submissionId: assignment.submissionId,
          reviewerId: assignment.reviewerId,
          round: "r1",
          roundId: assignment.roundId,
          scores: {},
          notes: "",
          status: "assigned",
        };
        store.reviews.push(r);
      }
    }
    if (!r) return fail(c, "review not found", 404);
    const sub = store.submissions.find((s) => s.id === r.submissionId);
    if (!sub) return fail(c, "submission not found", 404);
    const draft = advisoryAi(sub);
    r.aiDraft = draft.notes;
    r.scores = draft.scores;
    r.notes = draft.notes;
    r.source = "ai_draft";
    // Keep assigned — human must submit
    r.status = "assigned";
    return c.json({ data: { aiDraft: r.aiDraft, scores: r.scores, notes: r.notes, advisory: true } });
  });

  app.post("/api/events/:eventId/submissions/:id/decision", async (c) => {
    if (actor(c) !== "organizer") return fail(c, "organizer role required", 403);
    const s = store.submissions.find((x) => x.id === c.req.param("id"));
    if (!s) return fail(c, "submission not found", 404);
    const b = (await c.req.json()) as {
      nextStatus?: string;
      sendComms?: boolean;
      createTasks?: boolean;
    };
    if (!["accepted", "rejected", "waitlisted"].includes(b.nextStatus || "")) return fail(c, "invalid decision");
    s.status = b.nextStatus as typeof s.status;
    s.round = "final";
    let comm = null as ReturnType<typeof sendTemplate> | null;
    if (s.status === "accepted") {
      if (b.createTasks !== false) ensureOnboarding(s);
      if (b.sendComms !== false) { comm = sendTemplate("accepted", s.speakerId, s.title, "acceptance"); await deliver(comm); }
      // Mirror into schedule engine pool so Schedule board shows the new accepted session.
      await mirrorAcceptedToSchedule(repo, s);
    } else if (s.status === "rejected" && b.sendComms !== false) {
      comm = sendTemplate("rejected", s.speakerId, s.title, "rejection"); await deliver(comm);
    }
    await persist();
    return c.json({
      data: {
        submission: s,
        tasks: store.tasks.filter((t) => t.speakerId === s.speakerId),
        session: store.sessions.find((x) => x.submissionId === s.id),
        communication: comm,
      },
    });
  });

  // —— Speakers / portal ——
  app.get("/api/events/:eventId/speakers", (c) => {
    const accepted = store.submissions.filter((s) => s.status === "accepted");
    return c.json({
      data: accepted.map((s) => {
        const profile = store.profiles.find((p) => p.speakerId === s.speakerId);
        const ready = readiness(s.speakerId);
        return {
          ...s,
          profile,
          readiness: ready,
          tasks: store.tasks.filter((t) => t.speakerId === s.speakerId),
          files: store.files.filter((f) => f.speakerId === s.speakerId),
        };
      }),
    });
  });

  app.get("/api/speaker/events/:eventId/home", (c) => {
    const speakerId = speakerIdOf(c);
    if (!speakerId) return fail(c, "speaker persona required", 403);
    const profile = store.profiles.find((p) => p.speakerId === speakerId);
    const tasks = store.tasks.filter((t) => t.speakerId === speakerId);
    const subs = store.submissions.filter((s) => s.speakerId === speakerId);
    const files = store.files.filter((f) => f.speakerId === speakerId);
    const sessions = store.sessions.filter((s) => s.speakerId === speakerId);
    const comms = store.communications.filter((x) => x.speakerId === speakerId);
    const window = cfpWindow();
    return c.json({
      data: {
        speakerId,
        profile,
        tasks,
        submissions: subs,
        files,
        sessions,
        communications: comms,
        readiness: readiness(speakerId),
        resources: store.resources.filter((r) => r.published).map((r) => ({ ...r, embedUrl: safeEmbed(r.embedUrl) })),
        cfpOpen: window.open,
        cfpClosedReason: window.open ? undefined : window.reason,
      },
    });
  });

  app.get("/api/speaker/events/:eventId/tasks", (c) => {
    const speakerId = speakerIdOf(c);
    if (!speakerId) return fail(c, "speaker persona required", 403);
    return c.json({ data: { tasks: store.tasks.filter((t) => t.speakerId === speakerId), readiness: readiness(speakerId) } });
  });

  app.patch("/api/speaker/events/:eventId/tasks/:id", async (c) => {
    const speakerId=speakerIdOf(c); if(!speakerId) return fail(c,"speaker persona required",403);
    const b = (await c.req.json().catch(() => ({}))) as { status?: string };
    const result=b.status === "not_started" ? (()=>{const t=store.tasks.find(x=>x.id===c.req.param("id"));if(!t||t.speakerId!==speakerId)return {ok:false as const,error:"cannot modify another speaker's task"};t.status="not_started";return {ok:true as const,task:t}})() : completeTaskForSpeaker(c.req.param("id"),speakerId);
    if(!result.ok)return fail(c,result.error,result.error.includes("not found")?404:403);
    await persist();
    return c.json({ data: { task: result.task, readiness: readiness(speakerId) } });
  });

  app.put("/api/speaker/events/:eventId/profile", async (c) => {
    const speakerId = speakerIdOf(c);
    if (!speakerId) return fail(c, "speaker persona required", 403);
    const b = (await c.req.json().catch(() => null)) as Partial<(typeof store.profiles)[0]> | null;
    if (!b) return fail(c, "JSON body required");
    let p = store.profiles.find((x) => x.speakerId === speakerId);
    if (!p) {
      p = { speakerId, name: String(b.name || ""), email: String(b.email || ""), bio: "" };
      store.profiles.push(p);
    }
    Object.assign(p, {
      name: b.name ?? p.name,
      email: b.email ?? p.email,
      bio: b.bio ?? p.bio,
      company: b.company ?? p.company,
      title: b.title ?? p.title,
      linkedin: b.linkedin ?? p.linkedin,
      x: b.x ?? p.x,
      website: b.website ?? p.website,
    });
    const profileTask = store.tasks.find((t) => t.speakerId === speakerId && t.type === "profile");
    if (profileTask && p.bio.trim().length > 20) profileTask.status = "completed";
    await persist();
    return c.json({ data: { profile: p, readiness: readiness(speakerId) } });
  });

  app.post("/api/speaker/events/:eventId/files", async (c) => {
    const b = (await c.req.json().catch(() => null)) as {
      speakerId?: string;
      kind?: "headshot" | "slides" | "supporting_document";
      name?: string;
    } | null;
    if (!b?.kind || !b.name) return fail(c, "kind and name required");
    const speakerId = speakerIdOf(c);
    if (!speakerId) return fail(c, "speaker persona required", 403);
    if (b.speakerId && b.speakerId !== speakerId) return fail(c, "cannot upload for another speaker", 403);
    const f = {
      id: crypto.randomUUID(),
      speakerId,
      kind: b.kind,
      name: b.name,
      visibility: b.kind === "headshot" ? ("public" as const) : ("private" as const),
      createdAt: new Date().toISOString(),
    };
    store.files.push(f);
    const profile = store.profiles.find((p) => p.speakerId === speakerId);
    if (b.kind === "headshot" && profile) profile.headshotName = b.name;
    const typeMap = { headshot: "headshot", slides: "slides", supporting_document: "supporting_doc" } as const;
    const task = store.tasks.find((t) => t.speakerId === speakerId && t.type === typeMap[b.kind!]);
    if (task) task.status = "completed";
    await persist();
    return c.json({ data: { file: f, readiness: readiness(speakerId) } }, 201);
  });

  app.get("/api/speaker/events/:eventId/resources", (c) =>
    c.json({
      data: store.resources.filter((r) => r.published).map((r) => ({ ...r, embedUrl: safeEmbed(r.embedUrl) })),
    }),
  );

  app.get("/api/speaker/events/:eventId/resources/:slug", (c) => {
    const r = store.resources.find((x) => x.slug === c.req.param("slug") && x.published);
    if (!r) return fail(c, "resource not found", 404);
    return c.json({ data: { ...r, embedUrl: safeEmbed(r.embedUrl) } });
  });

  // Organizer-managed wiki resources. Raw script HTML is never accepted as an embed: only safeEmbed URLs survive.
  app.get("/api/events/:eventId/resources", (c) => c.json({ data: store.resources }));
  app.post("/api/events/:eventId/resources", async (c) => {
    if (actor(c) !== "organizer") return fail(c, "organizer role required", 403);
    const b = await c.req.json().catch(() => null) as Partial<typeof store.resources[number]> | null;
    if (!b?.slug || !b.title || b.body == null) return fail(c, "slug, title, and body required");
    const resource=upsertResource({ slug: b.slug, title: b.title, body: b.body, published: !!b.published, embedUrl: b.embedUrl }); await persist(); return c.json({ data: resource }, 201);
  });
  app.put("/api/events/:eventId/resources/:id", async (c) => {
    if (actor(c) !== "organizer") return fail(c, "organizer role required", 403);
    const old=store.resources.find((r)=>r.id===c.req.param("id")); if(!old)return fail(c,"resource not found",404);
    const b=await c.req.json().catch(()=>null) as Partial<typeof old>|null;if(!b)return fail(c,"JSON body required");
    const resource=upsertResource({id:old.id,slug:b.slug??old.slug,title:b.title??old.title,body:b.body??old.body,published:b.published??old.published,embedUrl:b.embedUrl}); await persist(); return c.json({data:resource});
  });
  app.delete("/api/events/:eventId/resources/:id", async (c) => { if(actor(c)!=="organizer")return fail(c,"organizer role required",403);if(!deleteResource(c.req.param("id")))return fail(c,"resource not found",404);await persist();return c.body(null,204) });

  // —— Comms ——
  app.get("/api/events/:eventId/comms/templates", (c) => c.json({ data: store.templates }));
  app.put("/api/events/:eventId/comms/templates/:id", async (c) => {
    if (actor(c) !== "organizer") return fail(c, "organizer role required", 403);
    const t = store.templates.find((x) => x.id === c.req.param("id"));
    if (!t) return fail(c, "template not found", 404);
    const b = (await c.req.json().catch(() => null)) as Partial<typeof t> | null;
    if (!b) return fail(c, "JSON body required");
    if (b.subject != null) t.subject = String(b.subject);
    if (b.body != null) t.body = String(b.body);
    if (typeof b.includeCalendarLinks === "boolean") t.includeCalendarLinks = b.includeCalendarLinks;
    await persist();
    return c.json({ data: t });
  });
  app.get("/api/events/:eventId/comms/log", (c) => c.json({ data: store.communications }));
  app.post("/api/events/:eventId/comms/decisions/preview", async (c) => {
    if (actor(c) !== "organizer") return fail(c, "organizer role required", 403);
    const b=await c.req.json();const sub=store.submissions.find(s=>s.id===b.submissionId&&["accepted","rejected"].includes(s.status));if(!sub)return fail(c,"decided submission not found",404);
    const merge=(text:string)=>text.replaceAll("{{name}}",sub.name).replaceAll("{{talk_title}}",sub.title).replaceAll("{{decision}}",sub.status);
    return c.json({data:{submissionId:sub.id,to:sub.email,subject:merge(String(b.subject||"Decision for {{talk_title}}")),body:merge(String(b.body||"Hi {{name}}, your proposal {{talk_title}} was {{decision}}."))}});
  });
  app.post("/api/events/:eventId/comms/decisions/send", async (c) => {
    if (actor(c) !== "organizer") return fail(c, "organizer role required", 403);
    const b=await c.req.json(),cohorts=Array.isArray(b.cohorts)?b.cohorts:["accepted","rejected"],targets=store.submissions.filter(s=>cohorts.includes(s.status));const rows=[];
    for(const sub of targets){const merge=(text:string)=>text.replaceAll("{{name}}",sub.name).replaceAll("{{talk_title}}",sub.title).replaceAll("{{decision}}",sub.status);const subject=merge(String(b.subject||"Decision for {{talk_title}}")),body=merge(String(b.body||"Hi {{name}}, your proposal {{talk_title}} was {{decision}}."));const result=await mailer.send({to:sub.email,subject,text:body}).catch(()=>({status:"failed" as const}));const row={id:`comm-${crypto.randomUUID()}`,speakerId:sub.speakerId,submissionId:sub.id,subject,body,kind:(sub.status==="accepted"?"acceptance":"rejection") as "acceptance"|"rejection",status:result.status,ics:"",createdAt:new Date().toISOString()};store.communications.unshift(row);rows.push(row)}await persist();return c.json({data:rows},201);
  });
  app.post("/api/events/:eventId/comms/reminders/plan", (c) => {
    if (actor(c) !== "organizer") return fail(c, "organizer role required", 403);
    return c.json({ data: reminderPlans() });
  });
  app.post("/api/events/:eventId/comms/send", async (c) => {
    if (actor(c) !== "organizer") return fail(c, "organizer role required", 403);
    const b = (await c.req.json().catch(() => null)) as {
      templateKey?: string;
      speakerId?: string;
      speakerIds?: string[];
      subject?: string;
      body?: string;
      includeCalendarLinks?: boolean;
    } | null;
    if (!b) return fail(c, "JSON body required");
    const ids = b.speakerIds || (b.speakerId ? [b.speakerId] : []);
    if (!ids.length) return fail(c, "speakerId or speakerIds required");
    const hasCompose = typeof b.subject === "string" || typeof b.body === "string";
    if (!b.templateKey && !hasCompose) return fail(c, "templateKey or subject/body required");
    const { renderMergePreview } = await import("./speakerMgmt.js");
    const sent = [];
    for (const speakerId of ids) {
      const sub = store.submissions.find((s) => s.speakerId === speakerId && s.status === "accepted");
      const title = sub?.title || "your session";
      if (hasCompose) {
        const tpl = b.templateKey ? store.templates.find((t) => t.key === b.templateKey || t.id === b.templateKey) : undefined;
        const preview = renderMergePreview(
          {
            subject: typeof b.subject === "string" ? b.subject : tpl?.subject || "Message from CUE",
            body: typeof b.body === "string" ? b.body : tpl?.body || "",
            includeCalendarLinks: Boolean(b.includeCalendarLinks ?? tpl?.includeCalendarLinks),
          },
          speakerId,
          store,
        );
        const row = {
          id: `comm-${crypto.randomUUID()}`,
          speakerId,
          subject: preview.subject,
          body: preview.body,
          kind: (b.templateKey === "task_reminder" ? "reminder" : "custom") as "reminder" | "custom",
          status: "mock_sent" as "mock_sent",
          ics: "",
          createdAt: new Date().toISOString(),
        };
        store.communications.unshift(row);
        sent.push(row);
      } else {
        sent.push(sendTemplate(b.templateKey!, speakerId, title, b.templateKey === "task_reminder" ? "reminder" : "custom"));
      }
    }
    await Promise.all(sent.map(deliver)); await persist();
    return c.json({ data: sent }, 201);
  });

  app.get("/api/communications/:id/calendar.ics", (c) => {
    const x = store.communications.find((row) => row.id === c.req.param("id"));
    if (!x) return c.text("not found", 404);
    return new Response(x.ics, {
      headers: { "content-type": "text/calendar", "content-disposition": "attachment; filename=invite.ics" },
    });
  });

  app.get("/api/calendar/:filename", (c) => {
    const filename = c.req.param("filename");
    const sessionId = filename.endsWith(".ics") ? filename.slice(0, -4) : filename;
    const life = store.sessions.find((s) => s.id === sessionId);
    if (!life?.slot) return c.json({ error: "scheduled session not found" }, 404);
    const body = icsForSession(life)!;
    return new Response(body, {
      headers: { "content-type": "text/calendar", "content-disposition": `attachment; filename=${sessionId}.ics` },
    });
  });

  app.get("/api/events/:eventId/dashboard", async (c) => {
    const metrics=await canonicalScheduleMetrics(repo as any,c.req.param("eventId"));
    return c.json({data:{speakers:store.submissions.filter((s)=>s.status==="accepted").map((s)=>({speakerId:s.speakerId,name:s.name,...readiness(s.speakerId)})),metrics}});
  });

  // —— Schedule (preserve engines) ——
  app.get("/api/events/:eventId/schedule", async (c) => {
    for (const accepted of store.submissions.filter((x) => x.status === "accepted")) await mirrorAcceptedToSchedule(repo, accepted);
    const r = repo as Repository & { getSchedule?: (id: string) => Promise<any> };
    const s = await r.getSchedule?.(c.req.param("eventId"));
    return s ? c.json({ ...s, warnings: scheduleWarnings(s) }) : c.json({ error: "event not found" }, 404);
  });
  app.post("/api/events/:eventId/schedule/validate", async (c) => {
    if (actor(c) !== "organizer") return fail(c, "organizer role required", 403);
    const r = repo as Repository & { getSchedule?: (id: string) => Promise<any> };
    const s = await r.getSchedule?.(c.req.param("eventId"));
    const slot = await c.req.json<AgendaSlot>().catch(() => null);
    if (!s || !slot) return c.json({ error: "schedule and slot are required" }, 400);
    return c.json(validateSlot(s, slot));
  });
  app.post("/api/events/:eventId/schedule/sessions",async(c)=>{if(actor(c)!=="organizer")return fail(c,"organizer role required",403);const r=repo as Repository&{getSchedule?:(id:string)=>Promise<any>;putSchedule?:(id:string,s:any)=>Promise<void>},s=await r.getSchedule?.(c.req.param("eventId")),b=await c.req.json();if(!s||!String(b.title||"").trim()||!Array.isArray(b.speakerIds)||!b.speakerIds.length)return fail(c,"title and speakers are required");const row={id:`session-${crypto.randomUUID().slice(0,8)}`,title:String(b.title),abstract:String(b.abstract||""),speakerIds:b.speakerIds.filter((id:string)=>s.speakers.some((x:any)=>x.id===id)),trackIds:b.trackId?[b.trackId]:[],durationMinutes:Number(b.durationMinutes||45),status:"accepted",publishStatus:"draft",slug:`session-${Date.now()}`};if(!row.speakerIds.length)return fail(c,"valid speakers are required");s.sessions.push(row);s.version++;await r.putSchedule?.(c.req.param("eventId"),s);await persist();return c.json({data:row},201)});
  app.patch("/api/events/:eventId/schedule/sessions/:sessionId",async(c)=>{
    if(actor(c)!=="organizer")return fail(c,"organizer role required",403);
    const r=repo as Repository&{getSchedule?:(id:string)=>Promise<any>;putSchedule?:(id:string,s:any)=>Promise<void>};
    const sched=await r.getSchedule?.(c.req.param("eventId"));
    const b=await c.req.json().catch(()=>null) as any;if(!b)return fail(c,"JSON body required");
    // Same shared mutation as the Content editor: canonical propagation + history.
    const persona=personaOf(c);
    const result=applySessionEdit({store,schedule:sched,id:c.req.param("sessionId"),patch:b,editor:{id:persona.id,name:persona.name}});
    if(!result.ok)return fail(c,result.error,result.status);
    if(sched){sched.version++;await r.putSchedule?.(c.req.param("eventId"),sched)}
    await persist();
    return c.json({data:result.session||result.draft});
  });
  app.post("/api/events/:eventId/schedule/move", async (c) => {
    if (actor(c) !== "organizer") return fail(c, "organizer role required", 403);
    const r = repo as Repository & {
      getSchedule?: (id: string) => Promise<any>;
      putSchedule?: (id: string, s: any) => Promise<void>;
    };
    const s = await r.getSchedule?.(c.req.param("eventId"));
    const body = await c.req
      .json<{ slot: AgendaSlot; version: number; acknowledge?: string[] }>()
      .catch(() => null);
    if (!s || !body?.slot || typeof body.version !== "number" || !body.slot.sessionId || !body.slot.roomId || !body.slot.startsAt || !body.slot.endsAt) return c.json({ error: "schedule move requires { slot: { sessionId, roomId, startsAt, endsAt }, version }" }, 400);
    const result=applyScheduleMove(s,body.slot,body.version,body.acknowledge);
    if(!result.ok)return c.json({error:result.error,version:result.version,conflicts:result.conflicts,warnings:result.warnings},result.status);
    await r.putSchedule?.(c.req.param("eventId"), s);
    // Mirror into lifecycle session drafts when ids align
    const life = store.sessions.find((x) => x.id === body.slot.sessionId);
    if (life) {
      life.status = "scheduled";
      life.roomId = body.slot.roomId;
      life.slot = { startsAt: body.slot.startsAt, endsAt: body.slot.endsAt };
    }
    await persist();
    return c.json({ slot: body.slot, version: s.version, warnings: result.warnings });
  });

  // JSON feeds (kept)
  app.get("/public/events/:eventId/itinerary.json", async (c) => {
    const r = repo as Repository & { getSchedule?: (id: string) => Promise<any> };
    const s = await r.getSchedule?.(c.req.param("eventId"));
    return s
      ? c.json({ eventId: c.req.param("eventId"), sessions: publicSchedule(s) })
      : c.json({ error: "event not found" }, 404);
  });
  app.get("/public/events/:eventId/speakers.json", async (c) => {
    const r = repo as Repository & { getSchedule?: (id: string) => Promise<any> };
    const s = await r.getSchedule?.(c.req.param("eventId"));
    return s
      ? c.json({
          eventId: c.req.param("eventId"),
          speakers: publicSpeakers(s)
            .map(({ id, name, bio, company, headshotUrl }: any) => ({ id, name, bio, company, headshotUrl })),
        })
      : c.json({ error: "event not found" }, 404);
  });

  // —— HTML embeds (judge-visible) ——


  // Friendly aliases used by Publish UI
  app.get("/embed/:eventId/gallery", (c) => c.redirect(`/public/events/${c.req.param("eventId")}/gallery`));
  app.get("/embed/:eventId/itinerary", (c) => c.redirect(`/public/events/${c.req.param("eventId")}/itinerary`));

  app.get("/api/public/events/:slug/speakers", (c) =>
    c.json({
      data: store.submissions
        .filter((s) => s.status === "accepted")
        .map((s) => ({
          name: s.name,
          title: s.title,
          category: s.category,
          bio: store.profiles.find((p) => p.speakerId === s.speakerId)?.bio,
          company: store.profiles.find((p) => p.speakerId === s.speakerId)?.company,
        })),
    }),
  );
  app.get("/api/public/events/:slug/schedule", (c) =>
    c.json({ data: store.sessions.filter((s) => s.status === "published" || s.status === "scheduled") }),
  );

  // —— Sync ——
  async function run(c: any, mode: "dry_run" | "live") {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.eventId !== "string") return c.json({ error: "body.eventId must be a string" }, 400);
    try {
      const result=await sync.execute(body.eventId, mode); await persist(); return c.json(result, mode === "dry_run" ? 200 : 201);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "sync failed" }, 404);
    }
  }
  app.post("/sync/preview", (c) => run(c, "dry_run"));
  app.post("/sync/run", (c) => run(c, "live"));
  app.get("/sync/runs", async (c) => {
    const eventId = c.req.query("eventId");
    if (!eventId) return c.json({ error: "eventId query parameter is required" }, 400);
    return c.json(await repo.listRuns(eventId));
  });
  app.get("/sync/runs/:id", async (c) => {
    const runRow = await repo.getRun(c.req.param("id"));
    if (!runRow) return c.json({ error: "run not found" }, 404);
    return c.json({ run: runRow, items: await repo.listItems(runRow.id) });
  });
  app.post("/sync/runs/:id/retry", async (c) => {
    const old = await repo.getRun(c.req.param("id"));
    if (!old) return c.json({ error: "run not found" }, 404);
    return c.json(await sync.execute(old.eventId, "live", old.id), 201);
  });

  return app;
}

function avgScore(submissionId: string) {
  const submitted = store.reviews.filter((r) => r.submissionId === submissionId && r.status === "submitted");
  if (!submitted.length) return null;
  const totals = submitted.map((r) => {
    const vals = Object.values(r.scores);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });
  return Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10;
}

function escapeHtml(s: string) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] || "")
    .join("")
    .toUpperCase();
}
function toIcs(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

async function mirrorAcceptedToSchedule(repo: Repository, s: Submission) {
  const r = repo as Repository & {
    getSchedule?: (id: string) => Promise<any>;
    putSchedule?: (id: string, schedule: any) => Promise<void>;
  };
  if (!r.getSchedule || !r.putSchedule) return;
  const sched = await r.getSchedule(EVENT_ID);
  if (!sched) return;
  const sessionId = `ses-${s.id}`;
  let track = sched.tracks.find((t: any) => t.name.trim().toLowerCase() === s.category.trim().toLowerCase())?.id;
  if (!track && s.category.trim()) {
    const base=`track-${s.category.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"")||"general"}`;
    track=sched.tracks.some((t:any)=>t.id===base)?`${base}-${crypto.randomUUID().slice(0,6)}`:base;
    sched.tracks.push({id:track,name:s.category.trim(),color:"#64748b"});
  }
  const existing=sched.sessions.find((x: any) => x.id === sessionId || x.id === s.id || x.acceptedSubmissionId === s.id);
  if(existing){existing.trackIds=track?[track]:existing.trackIds;existing.speakerIds=[s.speakerId,...(s.additionalSpeakers||[]).map(x=>x.id)];await r.putSchedule(EVENT_ID,sched);return}
  if (!existing) {
    sched.speakers = sched.speakers || [];
    const allSpeakers=[{id:s.speakerId,name:s.name,email:s.email},...(s.additionalSpeakers||[])];
    for(const person of allSpeakers) if (!sched.speakers.some((sp: any) => sp.id === person.id)) {
      const profile = store.profiles.find((p) => p.speakerId === person.id);
      sched.speakers.push({
        id: person.id,
        name: person.name,
        email: profile?.email || person.email,
        bio: profile?.bio || s.abstract,
        company: profile?.company,
        isPublic: true,
        acceptedSubmissionId: s.id,
      });
    }
    sched.sessions.push({
      id: sessionId,
      acceptedSubmissionId:s.id,
      title: s.title,
      abstract: s.abstract,
      speakerIds: allSpeakers.map((x)=>x.id),
      trackIds: track ? [track] : [],
      durationMinutes: s.format === "Workshop" ? 60 : 45,
      status: "accepted",
      publishStatus: "draft",
      slug: sessionId,
    });
    // Keep lifecycle session id aligned when possible
    const life = store.sessions.find((x) => x.submissionId === s.id);
    if (life) life.id = sessionId;
    await r.putSchedule(EVENT_ID, sched);
  }
}

function normalizeAdditionalSpeakers(value:unknown,previous:Submission["additionalSpeakers"]=[]) {
  return (Array.isArray(value)?value:[]).map((x:any,i)=>({id:previous[i]?.id||`spk-co-${crypto.randomUUID().slice(0,8)}`,name:String(x?.name||"").trim(),email:String(x?.email||"").trim().toLowerCase(),role:x?.role==="co-author"?"co-author" as const:"co-presenter" as const})).filter(x=>x.name&&/^\S+@\S+\.\S+$/.test(x.email));
}

export function configuredClient(env: Record<string, string | undefined>): AcceleventsClient {
  return env.ACCELEVENTS_LIVE === "true" &&
    env.ACCELEVENTS_BASE_URL &&
    env.ACCELEVENTS_EVENT_ID &&
    env.ACCELEVENTS_TOKEN
    ? new HttpAcceleventsClient(env.ACCELEVENTS_BASE_URL, env.ACCELEVENTS_EVENT_ID, env.ACCELEVENTS_TOKEN)
    : new MockAcceleventsClient();
}

/** Load is intentionally explicit because Worker fetch handlers cannot await construction. */
export async function restoreSnapshot(deps: { repo: Repository; persistence: SnapshotPersistence }) {
  const snapshot=await deps.persistence.load(EVENT_ID);
  if (!snapshot) return false;
  const target=deps.repo as MemoryRepository & { putSchedule?: (id:string,s:any)=>Promise<void>; importSyncState?: (s:CompetitionSnapshot["sync"])=>void };
  if (snapshot.schedule && target.putSchedule) await target.putSchedule(EVENT_ID,snapshot.schedule);
  target.importSyncState?.(snapshot.sync);
  // Keep the exported singleton identity so existing lifecycle helpers continue to reference it.
  for (const key of Object.keys(store) as (keyof typeof store)[]) {
    const restored = snapshot.lifecycle[key];
    if (restored !== undefined) (store as any)[key]=structuredClone(restored);
  }
  // Optional CRM extension may not be present on older snapshots or on the typed store keys.
  const life = snapshot.lifecycle as typeof snapshot.lifecycle & { crm?: unknown };
  if (life.crm !== undefined) (store as any).crm = structuredClone(life.crm);
  return true;
}
