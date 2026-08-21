import { Hono } from "hono";
import {
  readiness,
  reminderPlans,
  sendTemplate,
  type LifecycleStore,
  issueSpeakerInvite,
  speakerInvitePath,
} from "./lifecycle.js";
import type { Mailer } from "./mailer.js";
import { brandedHtmlFor } from "./emailTemplate.js";
import type { Repository } from "./domain.js";
import {
  addSpeakerManual,
  ensureSpeakerPersona,
  applyHeadshot,
  assignGeneralTasks,
  enrichSpeakerMgmtDemo,
  importSpeakersCsv,
  mergeSpeakerRecords,
  suggestDuplicatePairs,
  listRoster,
  outstandingTaskReminders,
  progressMatrix,
  renderMergePreview,
  SPEAKER_WORKFLOW_STATUSES,
  submitFormTask,
  syncProfileToSchedule,
  updateSpeakerOrganizer,
  updateSpeakerSelf,
  type SpeakerWorkflowStatus,
} from "./speakerMgmt.js";
import { addFileVersion, validateUpload } from "./content.js";

const fail = (c: any, message: string, status = 400) =>
  c.json(
    {
      error: {
        code: status === 404 ? "NOT_FOUND" : status === 403 ? "FORBIDDEN" : status === 401 ? "UNAUTHORIZED" : "VALIDATION_ERROR",
        message,
      },
    },
    status,
  );

export function createSpeakerRoutes(deps: {
  store: LifecycleStore;
  persist: (eventId?: string, store?: LifecycleStore) => Promise<void>;
  persona: (c: any) => { id: string; role: string; name: string; email: string; speakerId?: string };
  mailer: Mailer;
  repo: Repository;
}) {
  const app = new Hono();
  const org = (c: any) => deps.persona(c).role === "organizer";
  const requireOrg = (c: any) => {
    if (org(c)) return null;
    const hasAuth = c.get("auth") || c.get("authCookiePresent");
    const demoOn = c.get("demoPersonaHeaders") !== false;
    const hasDemo = demoOn && (c.req.header("x-demo-persona") || c.req.header("x-demo-role"));
    if (hasAuth || hasDemo) return fail(c, "organizer role required", 403);
    return fail(c, "authentication required", 401);
  };
  const speakerIdOf = (c: any) => deps.persona(c).speakerId;

  const eventOk = (c: any) => c.req.param("eventId") === deps.store.event.id;
  const boot = () => enrichSpeakerMgmtDemo(deps.store);

  // —— Organizer roster ——
  app.get("/api/events/:eventId/speakers", (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const denied = requireOrg(c);
    if (denied) return denied;
    const data = listRoster(deps.store, {
      q: c.req.query("q") || undefined,
      status: c.req.query("status") || undefined,
      readiness: (c.req.query("readiness") as any) || "all",
      tag: c.req.query("tag") || undefined,
    });
    return c.json({ data, meta: { total: data.length, statuses: SPEAKER_WORKFLOW_STATUSES } });
  });

  app.get("/api/events/:eventId/speakers/progress", (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const denied = requireOrg(c);
    if (denied) return denied;
    return c.json({ data: progressMatrix(deps.store) });
  });

  /** Current duplicate suggestions for the roster panel (richer/older record first). */
  app.get("/api/events/:eventId/speakers/merge-suggestions", (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    const denied = requireOrg(c); if (denied) return denied;
    boot();
    return c.json({ data: suggestDuplicatePairs(deps.store) });
  });

  app.get("/api/events/:eventId/speakers/:speakerId", (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const denied = requireOrg(c);
    if (denied) return denied;
    const row = listRoster(deps.store).find((r) => r.speakerId === c.req.param("speakerId"));
    if (!row) return fail(c, "speaker not found", 404);
    const contentFiles = (deps.store as any).contentFiles?.filter((f: any) => f.speakerId === row.speakerId) || [];
    return c.json({
      data: {
        ...row,
        availableSessions: deps.store.sessions.map(s=>({id:s.id,title:s.title,speakerId:s.speakerId,status:s.status})),
        contentFiles: contentFiles.map((f: any) => ({
          ...f,
          currentVersion: f.versions?.find((v: any) => v.current),
        })),
        communications: deps.store.communications.filter((x) => x.speakerId === row.speakerId),
      },
    });
  });

  app.post("/api/events/:eventId/speakers", async (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = await c.req.json();
    const made = addSpeakerManual(b, deps.store);
    if (!made.ok) return fail(c, made.error);
    if (made.communication) {
      try {
        const result = await deps.mailer.send({
          to: made.profile.email,
          subject: made.communication.subject,
          text: made.communication.body,
          html: brandedHtmlFor(made.communication.subject, made.communication.body, {
            eventName: deps.store.event.name,
            kind: made.communication.kind,
          }),
        });
        made.communication.status = result.status;
        made.communication.providerId = result.providerId;
      } catch {
        made.communication.status = "failed";
      }
    }
    await syncProfileToSchedule(made.speakerId, deps.store, deps.repo);
    await deps.persist(deps.store.event.id, deps.store);
    return c.json({ data: made }, 201);
  });

  app.patch("/api/events/:eventId/speakers/:speakerId", async (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = await c.req.json();
    const updated = updateSpeakerOrganizer(c.req.param("speakerId"), b, deps.store);
    if (!updated.ok) return fail(c, updated.error, updated.error.includes("not found") ? 404 : 400);
    await syncProfileToSchedule(c.req.param("speakerId"), deps.store, deps.repo);
    await deps.persist(deps.store.event.id, deps.store);
    return c.json({ data: updated.profile });
  });

  app.post("/api/events/:eventId/speakers/:speakerId/status", async (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = await c.req.json();
    const status = b.status as SpeakerWorkflowStatus;
    if (!SPEAKER_WORKFLOW_STATUSES.some((s) => s.id === status)) return fail(c, "invalid status");
    const updated = updateSpeakerOrganizer(c.req.param("speakerId"), { workflowStatus: status }, deps.store);
    if (!updated.ok) return fail(c, updated.error, 404);
    await deps.persist(deps.store.event.id, deps.store);
    return c.json({ data: updated.profile });
  });

  app.post("/api/events/:eventId/speakers/:speakerId/invite", async (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const denied = requireOrg(c);
    if (denied) return denied;
    const speakerId = c.req.param("speakerId");
    const profile = deps.store.profiles.find((p) => p.speakerId === speakerId);
    if (!profile) return fail(c, "speaker not found", 404);
    const sub = deps.store.submissions.find((s) => s.speakerId === speakerId && s.status === "accepted");
    const title = sub?.title || "your session";
    const comm = sendTemplate("accepted", speakerId, title, "acceptance", deps.store);
    // Real per-speaker access token (same pattern as reviewer invite links).
    const invite = issueSpeakerInvite(speakerId, deps.store);
    const portalPath = invite ? speakerInvitePath(invite.token) : "/p";
    const portalUrl = `${new URL(c.req.url).origin}${portalPath}`;
    if (invite) {
      comm.body = `${comm.body}\n\nAccess your speaker portal:\n${portalUrl}\n\nThis is a personal access link for ${profile.name} — do not forward it. It expires on ${new Date(invite.expiresAt!).toDateString()}.`;
    }
    try {
      const result = await deps.mailer.send({
        to: profile.email,
        subject: comm.subject,
        text: comm.body,
        html: brandedHtmlFor(comm.subject, comm.body, {
          eventName: deps.store.event.name,
          kind: "acceptance",
          ctaUrl: portalUrl,
          ctaLabel: "Open your speaker portal",
        }),
      });
      comm.status = result.status;
      comm.providerId = result.providerId;
    } catch {
      comm.status = "failed";
    }
    await deps.persist(deps.store.event.id, deps.store);
    return c.json({ data: { communication: comm, portalPath, portalUrl, mode: "speaker_access_token", expiresAt: invite?.expiresAt } });
  });

  app.post("/api/events/:eventId/speakers/import", async (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = await c.req.json();
    const result = importSpeakersCsv(String(b.csv || b.text || ""), { sendInvite: Boolean(b.sendInvite), createAsNew: Boolean(b.createAsNew) }, deps.store);
    await deps.persist(deps.store.event.id, deps.store);
    return c.json({ data: result });
  });

  app.post("/api/events/:eventId/speakers/merge", async (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404); const denied=requireOrg(c); if(denied)return denied;
    const b=await c.req.json(); const merged=mergeSpeakerRecords(b.primaryId,b.secondaryId,deps.store);
    if(!merged.ok)return fail(c,merged.error,merged.error.includes("not found")?404:400); await deps.persist(deps.store.event.id, deps.store); return c.json({data:merged.profile});
  });

  app.post("/api/events/:eventId/speakers/merge-suggestions", async (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    const denied = requireOrg(c); if (denied) return denied;
    const b = await c.req.json().catch(() => ({}));
    const pairs = Array.isArray(b.pairs) ? b.pairs : [];
    // Omitting pairs merges every currently suggested duplicate (one-click bulk merge).
    const requested: { primaryId: string; secondaryId: string }[] = pairs.length
      ? pairs.map((pair: any) => ({ primaryId: String(pair.primaryId || ""), secondaryId: String(pair.secondaryId || "") }))
      : suggestDuplicatePairs(deps.store).map((pair) => ({ primaryId: pair.primary.speakerId, secondaryId: pair.duplicate.speakerId }));
    if (!requested.length) return fail(c, "duplicate pairs required");

    const merged: any[] = [];
    const skipped: { primaryId: string; secondaryId: string; reason: string }[] = [];
    // Overlapping pairs (A←B, A←C) and records already removed by an earlier pair in the
    // same batch must not corrupt the roster: follow the merge chain and skip gone rows.
    const redirect = new Map<string, string>();
    const resolve = (speakerId: string) => {
      const seen = new Set<string>();
      let current = speakerId;
      while (redirect.has(current) && !seen.has(current)) {
        seen.add(current);
        current = redirect.get(current)!;
      }
      return current;
    };
    const exists = (speakerId: string) => deps.store.profiles.some((p) => p.speakerId === speakerId);

    for (const pair of requested) {
      const primaryId = resolve(pair.primaryId);
      const secondaryId = resolve(pair.secondaryId);
      if (!primaryId || !secondaryId) { skipped.push({ ...pair, reason: "missing speaker id" }); continue; }
      if (primaryId === secondaryId) { skipped.push({ ...pair, reason: "already merged" }); continue; }
      if (!exists(primaryId) || !exists(secondaryId)) { skipped.push({ ...pair, reason: "speaker already removed" }); continue; }
      const result = mergeSpeakerRecords(primaryId, secondaryId, deps.store);
      if (!result.ok) { skipped.push({ ...pair, reason: result.error }); continue; }
      redirect.set(secondaryId, primaryId);
      merged.push(result.profile);
    }
    if (!merged.length && skipped.length) return fail(c, skipped[0]!.reason, skipped[0]!.reason.includes("not found") ? 404 : 400);
    await deps.persist(deps.store.event.id, deps.store);
    return c.json({ data: { merged: merged.length, profiles: merged, skipped, remaining: suggestDuplicatePairs(deps.store) } });
  });


  app.post("/api/events/:eventId/speakers/:speakerId/sessions/:sessionId/link", async (c) => {
    if (!eventOk(c)) return fail(c,"event not found",404); const denied=requireOrg(c);if(denied)return denied;
    const profile=deps.store.profiles.find(p=>p.speakerId===c.req.param("speakerId")),session=deps.store.sessions.find(s=>s.id===c.req.param("sessionId"));
    if(!profile||!session)return fail(c,"speaker or session not found",404); session.speakerId=profile.speakerId; await deps.persist(deps.store.event.id, deps.store); return c.json({data:session});
  });

  app.post("/api/events/:eventId/speakers/tasks", async (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = await c.req.json();
    const made = assignGeneralTasks(b, deps.store);
    if (!made.ok) return fail(c, made.error);
    await deps.persist(deps.store.event.id, deps.store);
    return c.json({ data: made.tasks }, 201);
  });

  // —— Speaker self-service (overrides/enhances) ——
  app.put("/api/speaker/events/:eventId/profile", async (c) => {
    const life=deps.store;if(c.req.param("eventId")!==life.event.id)return fail(c,"event not found",404);
    enrichSpeakerMgmtDemo(life);
    const speakerId = speakerIdOf(c);
    if (!speakerId) return fail(c, "speaker persona required", 403);
    const b = await c.req.json().catch(() => null);
    if (!b) return fail(c, "JSON body required");
    const { headshot, ...profileFields } = b as typeof b & {
      headshot?: { name: string; mime?: string; dataBase64?: string; dataUrl?: string };
    };
    const updated = updateSpeakerSelf(speakerId, profileFields,life);
    if (!updated.ok) return fail(c, updated.error);
    if (headshot?.name && headshot.dataUrl) {
      const [prefix,dataBase64=""] = headshot.dataUrl.split(","); const mime=headshot.mime||prefix.match(/^data:([^;]+)/)?.[1]||"image/png";
      const check=validateUpload({mime,size:atob(dataBase64).length,dataBase64},["image/png","image/jpeg"]); if(!check.ok)return fail(c,check.error);
      let task=life.deliverableTasks.find(t=>t.speakerId===speakerId&&t.acceptedTypes.some(x=>x.startsWith("image/")));
      if(!task){task={id:`deliverable-headshot-${speakerId}`,name:"Upload Final Headshot",instructions:"Speaker profile headshot",dueAt:new Date().toISOString(),speakerId,sessionId:life.sessions.find(s=>s.speakerId===speakerId)?.id,fileRequired:true,acceptedTypes:["image/png","image/jpeg"],status:"incomplete",createdAt:new Date().toISOString()};life.deliverableTasks.push(task)}
      const made=addFileVersion(life,{task,name:headshot.name,mime,size:atob(dataBase64).length,dataBase64,uploadedBy:speakerId,kind:"headshot"});
      updated.profile.headshotName=headshot.name; updated.profile.headshotUrl=`/api/events/${life.event.id}/content/files/${made.file.id}/versions/${made.version.id}`;
      applyHeadshot(speakerId,{name:headshot.name},life);
    }
    const profileTask = life.tasks.find((t) => t.speakerId === speakerId && t.type === "profile");
    if (profileTask && (updated.profile.bio || "").trim().length > 20) {
      profileTask.status = "completed";
      profileTask.completedVia = "profile_save";
    }
    await syncProfileToSchedule(speakerId,life,deps.repo);
    await deps.persist(life.event.id,life);
    return c.json({data:{profile:updated.profile,readiness:readiness(speakerId,new Date(),life)}});
  });

  app.post("/api/speaker/events/:eventId/profile/headshot", async (c) => {
    const life=deps.store;if(c.req.param("eventId")!==life.event.id)return fail(c,"event not found",404);
    enrichSpeakerMgmtDemo(life);
    const speakerId = speakerIdOf(c);
    if (!speakerId) return fail(c, "speaker persona required", 403);
    const b = await c.req.json().catch(() => null);
    if (!b?.name) return fail(c, "name required");
    const result = applyHeadshot(speakerId, b, life);
    if (!result.ok) return fail(c, result.error, 404);
    const raw=String(b.dataBase64||String(b.dataUrl||"").split(",")[1]||"");
    const mime=String(b.mime||String(b.dataUrl||"").match(/^data:([^;]+)/)?.[1]||"image/png");
    if(raw){
      const check=validateUpload({mime,size:atob(raw).length,dataBase64:raw},["image/png","image/jpeg"]);if(!check.ok)return fail(c,check.error);
      let task=life.deliverableTasks.find(t=>t.speakerId===speakerId&&t.acceptedTypes.some(x=>x.startsWith("image/")));
      if(!task){task={id:`deliverable-headshot-${speakerId}`,name:"Upload Final Headshot",instructions:"Speaker profile headshot",dueAt:new Date().toISOString(),speakerId,sessionId:life.sessions.find(s=>s.speakerId===speakerId)?.id,fileRequired:true,acceptedTypes:["image/png","image/jpeg"],status:"incomplete",createdAt:new Date().toISOString()};life.deliverableTasks.push(task)}
      const made=addFileVersion(life,{task,name:b.name,mime,size:atob(raw).length,dataBase64:raw,uploadedBy:speakerId,kind:"headshot"});
      result.profile.headshotName=b.name;result.profile.headshotUrl=`/api/events/${life.event.id}/content/files/${made.file.id}/versions/${made.version.id}`;
    }
    await syncProfileToSchedule(speakerId,life,deps.repo);
    await deps.persist(life.event.id,life);
    return c.json({data:{profile:result.profile,readiness:readiness(speakerId,new Date(),life)}},201);
  });

  app.post("/api/speaker/events/:eventId/tasks/:id/form", async (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const speakerId = speakerIdOf(c);
    if (!speakerId) return fail(c, "speaker persona required", 403);
    const b = await c.req.json().catch(() => ({}));
    const result = submitFormTask(c.req.param("id"), speakerId, b.answers || b, deps.store);
    if (!result.ok) return fail(c, result.error, result.error.includes("not found") ? 404 : 400);
    await deps.persist(deps.store.event.id, deps.store);
    return c.json({ data: { task: result.task, readiness: readiness(speakerId) } });
  });

  // —— Comms enhancements ——
  app.post("/api/events/:eventId/comms/preview", async (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = await c.req.json();
    const tpl =
      deps.store.templates.find((t) => t.key === b.templateKey || t.id === b.templateId) ||
      ({ subject: b.subject || "", body: b.body || "", includeCalendarLinks: Boolean(b.includeCalendarLinks) } as any);
    const speakerId = b.speakerId || listRoster(deps.store)[0]?.speakerId;
    if (!speakerId) return fail(c, "no speaker for preview");
    return c.json({
      data: renderMergePreview(
        {
          subject: b.subject ?? tpl.subject,
          body: b.body ?? tpl.body,
          includeCalendarLinks: b.includeCalendarLinks ?? tpl.includeCalendarLinks,
        },
        speakerId,
        deps.store,
      ),
    });
  });

  app.post("/api/events/:eventId/comms/send", async (c) => {
    const life=deps.store;if(c.req.param("eventId")!==life.event.id)return fail(c,"event not found",404);
    enrichSpeakerMgmtDemo(life);
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = (await c.req.json().catch(() => null)) as {
      templateKey?: string;
      speakerId?: string;
      speakerIds?: string[];
      subject?: string;
      body?: string;
    } | null;
    if (!b) return fail(c, "JSON body required");
    const ids = b.speakerIds?.length ? b.speakerIds : b.speakerId ? [b.speakerId] : [];
    if (!ids.length) return fail(c, "speakerId or speakerIds required");
    const sent = [];
    for (const speakerId of ids) {
      const profile = life.profiles.find((p) => p.speakerId === speakerId);
      const sub = life.submissions.find((s) => s.speakerId === speakerId && s.status === "accepted");
      const title = sub?.title || "your session";
      let row;
      // Prefer explicit compose-field subject/body (edited in UI) over stored template content.
      const hasCompose = typeof b.subject === "string" || typeof b.body === "string";
      if (hasCompose) {
        const tpl = b.templateKey
          ? life.templates.find((t) => t.key === b.templateKey || t.id === b.templateKey)
          : undefined;
        const preview = renderMergePreview(
          {
            subject: typeof b.subject === "string" ? b.subject : tpl?.subject || "Message from Ruckus",
            body: typeof b.body === "string" ? b.body : tpl?.body || "",
            includeCalendarLinks: Boolean((b as any).includeCalendarLinks ?? tpl?.includeCalendarLinks),
          },
          speakerId,
          life,
        );
        row = {
          id: `comm-${crypto.randomUUID()}`,
          speakerId,
          subject: preview.subject,
          body: preview.body,
          kind: (b.templateKey === "task_reminder"
            ? "reminder"
            : b.templateKey === "accepted"
              ? "acceptance"
              : "custom") as "reminder" | "acceptance" | "custom",
          status: "mock_sent" as "mock_sent",
          ics: "",
          createdAt: new Date().toISOString(),
        };
        life.communications.unshift(row);
      } else if (b.templateKey) {
        row = sendTemplate(
          b.templateKey,
          speakerId,
          title,
          b.templateKey === "task_reminder" ? "reminder" : b.templateKey === "accepted" ? "acceptance" : "custom",life,
        );
      } else {
        return fail(c, "templateKey or subject/body required");
      }
      if (profile?.email) {
        try {
          const result = await deps.mailer.send({
            to: profile.email,
            subject: row.subject,
            text: row.body,
            html: brandedHtmlFor(row.subject, row.body, {
              eventName: life.event.name,
              kind: row.kind,
            }),
            attachments: row.ics
              ? [{ filename: "invite.ics", content: row.ics, contentType: "text/calendar" as const }]
              : undefined,
          });
          row.status = result.status;
          row.providerId = result.providerId;
        } catch {
          row.status = "failed";
        }
      } else {
        row.status = "failed";
      }
      sent.push({
        id: row.id,
        speakerId,
        email: profile?.email,
        name: profile?.name,
        subject: row.subject,
        status: row.status,
        providerId: row.providerId,
        kind: row.kind,
        createdAt: row.createdAt,
        hasIcs: Boolean(row.ics),
      });
    }
    await deps.persist(life.event.id,life);
    // Include both array (legacy) and structured payload for UI consumers.
    return c.json({ data: sent, meta: { count: sent.length } }, 201);
  });

  app.get("/api/events/:eventId/comms/log", (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const denied = requireOrg(c);
    if (denied) return denied;
    const data = deps.store.communications.map((c) => {
      const profile = deps.store.profiles.find((p) => p.speakerId === c.speakerId);
      return {
        ...c,
        recipientEmail: profile?.email,
        recipientName: profile?.name,
        deliveryNote:
          c.status === "mock_sent"
            ? "Mock delivery (no external mail). ICS is downloadable, not pushed to a calendar provider."
            : c.status === "sent"
              ? "Provider-accepted send. Calendar invite attached when ICS present; not a guaranteed calendar delivery."
              : "Send failed",
      };
    });
    return c.json({ data });
  });

  app.post("/api/events/:eventId/comms/reminders/plan", (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const denied = requireOrg(c);
    if (denied) return denied;
    return c.json({
      data: {
        legacy: reminderPlans(new Date(), deps.store),
        dueWindow: outstandingTaskReminders(deps.store),
      },
    });
  });

  app.post("/api/events/:eventId/comms/reminders/run", async (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const denied = requireOrg(c);
    if (denied) return denied;
    const plans = outstandingTaskReminders(deps.store);
    const bySpeaker = new Map<string, typeof plans>();
    for (const p of plans) {
      const list = bySpeaker.get(p.speakerId) || [];
      list.push(p);
      bySpeaker.set(p.speakerId, list);
    }
    const sent = [];
    for (const [speakerId, items] of bySpeaker) {
      const profile = deps.store.profiles.find((p) => p.speakerId === speakerId);
      if (!profile) continue;
      const names = items.map((i) => `${i.title} (due ${i.dueAt.slice(0, 10)}${i.overdue ? ", overdue" : ""})`);
      const row = sendTemplate("task_reminder", speakerId, names[0] || "tasks", "reminder", deps.store);
      row.body = `Hi ${profile.name.split(" ")[0]},\n\nOutstanding onboarding tasks:\n- ${names.join("\n- ")}\n\nComplete them in your portal: /p\n`;
      try {
        const result = await deps.mailer.send({
          to: profile.email,
          subject: row.subject,
          text: row.body,
          html: brandedHtmlFor(row.subject, row.body, {
            eventName: deps.store.event.name,
            kind: "reminder",
            tasks: items.map((i) => ({ title: i.title, dueAt: i.dueAt, overdue: i.overdue })),
          }),
        });
        row.status = result.status;
        row.providerId = result.providerId;
      } catch {
        row.status = "failed";
      }
      sent.push({ speakerId, email: profile.email, status: row.status, tasks: items.length });
    }
    await deps.persist(deps.store.event.id, deps.store);
    return c.json({ data: { sent, count: sent.length, planned: plans.length } });
  });

  return app;
}
