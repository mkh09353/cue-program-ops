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
  ensureOnboarding,
  ics,
  icsForSession,
  readiness,
  resolveDemoPersona,
  reviewForRound,
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
import { publicSchedule, scheduleWarnings, validateSlot, type AgendaSlot } from "./schedule.js";
import { canonicalScheduleMetrics, publicSpeakers } from "./projection.js";
import { MemorySnapshotPersistence, type CompetitionSnapshot, type SnapshotPersistence } from "./persistence.js";
import { MockMailer, type Mailer } from "./mailer.js";
import { createReviewRoutes } from "./reviewRoutes.js";
import { createPublicSite } from "./publicSite.js";
import { blindSubmission } from "./review.js";

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
    }
    catch (error) { console.error("CUE snapshot persistence failed", error instanceof Error ? error.message : "unknown error"); }
  };
  const deliver = async (row: ReturnType<typeof sendTemplate>) => {
    const to=store.profiles.find(p=>p.speakerId===row.speakerId)?.email || store.submissions.find(s=>s.speakerId===row.speakerId)?.email;
    if (!to) { row.status="failed"; return; }
    try { row.status=(await mailer.send({to,subject:row.subject,text:row.body,attachments:row.ics?[{filename:"invite.ics",content:row.ics,contentType:"text/calendar"}]:undefined})).status; }
    catch (error) { row.status="failed"; console.error("CUE mail delivery failed", error instanceof Error ? error.message : "unknown error"); }
  };
  app.use("/api/events/:eventId/*", async (c, next) => c.req.param("eventId") === EVENT_ID ? next() : fail(c, "event not found", 404));
  app.route("/api/events", createReviewRoutes({ store, persist, persona: personaOf, mailer }));
  app.route("/", createPublicSite({ repo }));

  app.get("/health", (c) =>
    c.json({ ok: true, mode: client instanceof MockAcceleventsClient ? "mock" : "configured", product: "CUE" }),
  );
  app.get("/demo", async (c) => c.json(await repo.getData("evt-ai-summit-2026")));

  // —— Bootstrap / command ——
  app.get("/api/events/:eventId/bootstrap", (c) => {
    if (c.req.param("eventId") !== EVENT_ID) return fail(c, "event not found", 404);
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
    if (b.closeAt) store.form.closeAt = String(b.closeAt);
    if (typeof b.maxPerUser === "number") store.form.maxPerUser = b.maxPerUser;
    if (Array.isArray(b.fields)) store.form.fields = b.fields as typeof store.form.fields;
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
        form: store.form,
        categories: store.form.fields.find((f) => f.key === "category")?.options || [],
      },
    });
  });

  app.post("/api/public/events/:slug/submissions", async (c) => {
    if (c.req.param("slug") !== EVENT_SLUG && c.req.param("slug") !== "ai-engineer-sandbox-event") return fail(c, "event not found", 404);
    if (store.form.status === "closed" || Date.parse(store.form.closeAt) <= Date.now()) return fail(c, "CFP is closed");
    const b = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b) return fail(c, "JSON body required");
    const answers = (b.answers || {}) as Record<string, unknown>;
    const category = String(answers.category || "");
    const format = String(answers.format || "Talk");
    const check = validateCfpSubmission(answers, String(b.email || ""));
    if (!check.ok) return fail(c, check.error);
    const route = check.route;
    const id = `sub-${crypto.randomUUID().slice(0, 8)}`;
    const speakerId = `spk-${id}`;
    const name = String(b.name || "Guest speaker");
    const email = String(b.email || "");
    if (!name.trim() || !email.trim()) return fail(c, "name and email are required");
    const submission: Submission = {
      id,
      eventId: EVENT_ID,
      speakerId,
      name,
      email: check.normalizedEmail,
      title: String(answers.title),
      abstract: String(answers.abstract),
      category,
      format,
      answers,
      status: "submitted",
      reviewBoard: route.boardId,
      round: "r1",
      createdAt: new Date().toISOString(),
    };
    store.submissions.unshift(submission);
    store.profiles.push({ speakerId, name, email, bio: "" });
    store.reviews.push({
      id: `rev-${id}-r1`,
      submissionId: id,
      reviewerId: "rev-ada",
      round: "r1",
      scores: { relevance: 0, novelty: 0, clarity: 0, depth: 0 },
      notes: "",
      status: "assigned",
    });
    const comm=sendTemplate("cfp_received", speakerId, submission.title, "cfp_received");
    await deliver(comm); await persist();
    return c.json(
      { data: { id, status: "submitted", reviewBoard: route.boardId, boardLabel: route.boardLabel, speakerId } },
      201,
    );
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
        reviews: store.reviews.filter((r) => r.submissionId === s.id),
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
        reviews: store.reviews.filter((r) => r.submissionId === s.id && (persona.role !== "reviewer" || r.reviewerId === persona.id)),
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
        ...r,
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
    const b = (await c.req.json()) as { scores?: Record<string, number>; notes?: string; round?: "r1" | "r2" | "final" };
    const target = b.round && b.round !== r.round ? reviewForRound(r.submissionId, r.reviewerId, b.round) : r;
    target.scores = b.scores || target.scores;
    target.notes = b.notes ?? target.notes;
    target.status = "submitted";
    target.source = "human";
    const sub = store.submissions.find((s) => s.id === r.submissionId);
    if (sub && sub.status === "submitted") sub.status = "under_review";
    if (sub && b.round) sub.round = b.round;
    await persist();
    return c.json({ data: target });
  });

  app.post("/api/events/:eventId/reviews/:id/ai-assist", (c) => {
    const r = store.reviews.find((x) => x.id === c.req.param("id"));
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
    } | null;
    if (!b?.templateKey) return fail(c, "templateKey required");
    const ids = b.speakerIds || (b.speakerId ? [b.speakerId] : []);
    if (!ids.length) return fail(c, "speakerId or speakerIds required");
    const sent = ids.map((speakerId) => {
      const sub = store.submissions.find((s) => s.speakerId === speakerId && s.status === "accepted");
      const title = sub?.title || "your session";
      return sendTemplate(b.templateKey!, speakerId, title, b.templateKey === "task_reminder" ? "reminder" : "custom");
    });
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
    if (!s || !body) return c.json({ error: "schedule and move are required" }, 400);
    if (body.version !== s.version) return c.json({ error: "stale schedule", version: s.version }, 409);
    const result = validateSlot(s, body.slot);
    const hard = result.conflicts.filter((x) => x.severity === "hard");
    if (hard.length) return c.json({ error: "hard conflicts block this move", ...result }, 409);
    const warnings = result.conflicts.filter((x) => x.severity === "warning");
    if (warnings.some((x) => !body.acknowledge?.includes(x.id)))
      return c.json({ error: "warnings require acknowledgement", ...result }, 422);
    const i = s.slots.findIndex((x: AgendaSlot) => x.sessionId === body.slot.sessionId);
    if (i >= 0) s.slots[i] = body.slot;
    else s.slots.push(body.slot);
    s.version++;
    await r.putSchedule?.(c.req.param("eventId"), s);
    // Mirror into lifecycle session drafts when ids align
    const life = store.sessions.find((x) => x.id === body.slot.sessionId);
    if (life) {
      life.status = "scheduled";
      life.roomId = body.slot.roomId;
      life.slot = { startsAt: body.slot.startsAt, endsAt: body.slot.endsAt };
    }
    await persist();
    return c.json({ slot: body.slot, version: s.version, warnings });
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
  app.get("/public/events/:eventId/gallery", async (c) => {
    const r = repo as Repository & { getSchedule?: (id: string) => Promise<any> };
    const s = await r.getSchedule?.(c.req.param("eventId"));
    const accepted = store.submissions.filter((x) => x.status === "accepted");
    const speakers = s ? publicSpeakers(s) : accepted.map((x) => ({
        id: x.speakerId,
        name: x.name,
        bio: store.profiles.find((p) => p.speakerId === x.speakerId)?.bio || x.abstract,
        company: store.profiles.find((p) => p.speakerId === x.speakerId)?.company,
      }));
    const cards = speakers
      .map(
        (sp: any) => `<article class="card"><div class="avatar">${escapeHtml(initials(sp.name))}</div>
        <h3>${escapeHtml(sp.name)}</h3>
        <p>${escapeHtml(sp.company || "AI Engineer Summit")}</p>
        <p>${escapeHtml((sp.bio || "").slice(0, 160))}</p></article>`,
      )
      .join("");
    return c.html(htmlPage("Speaker gallery · AI Engineer Summit", `<div class="grid">${cards || "<p>No public speakers yet.</p>"}</div>`));
  });

  app.get("/public/events/:eventId/itinerary", async (c) => {
    const r = repo as Repository & { getSchedule?: (id: string) => Promise<any> };
    const s = await r.getSchedule?.(c.req.param("eventId"));
    let rows = "";
    if (s) {
      const sessions = publicSchedule(s);
      rows = sessions
        .map((sess) => {
          const start = new Date(sess.startsAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
            timeZone: "UTC",
          });
          const end = new Date(sess.endsAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
            timeZone: "UTC",
          });
          return `<div class="row"><div class="time">${start}–${end}</div><div>
            <span class="pill">${escapeHtml((sess.tracks || []).join(" · ") || "General")}</span>
            <h3 style="margin:0 0 4px;font-size:16px">${escapeHtml(sess.title)}</h3>
            <p class="meta">${escapeHtml(sess.room)} · ${escapeHtml(
              (sess.speakers || []).map((x: any) => x.name).join(", "),
            )}</p>
            <p>${escapeHtml((sess.abstract || "").slice(0, 180))}</p>
          </div></div>`;
        })
        .join("");
    }
    return c.html(
      htmlPage(
        "Schedule itinerary · AI Engineer Summit",
        `<section class="card">${rows || "<p>No published sessions yet.</p>"}</section>`,
      ),
    );
  });

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
  if (!sched.sessions.some((x: any) => x.id === sessionId || x.id === s.id)) {
    const track =
      sched.tracks.find((t: any) => t.name.toLowerCase() === s.category.toLowerCase())?.id ||
      sched.tracks[0]?.id;
    sched.speakers = sched.speakers || [];
    if (!sched.speakers.some((sp: any) => sp.id === s.speakerId)) {
      const profile = store.profiles.find((p) => p.speakerId === s.speakerId);
      sched.speakers.push({
        id: s.speakerId,
        name: s.name,
        email: profile?.email || s.email,
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
      speakerIds: [s.speakerId],
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
  return true;
}
