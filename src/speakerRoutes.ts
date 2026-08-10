import { Hono } from "hono";
import {
  EVENT_ID,
  readiness,
  reminderPlans,
  sendTemplate,
  type LifecycleStore,
} from "./lifecycle.js";
import type { Mailer } from "./mailer.js";
import type { Repository } from "./domain.js";
import {
  addSpeakerManual,
  ensureSpeakerPersona,
  applyHeadshot,
  assignGeneralTasks,
  enrichSpeakerMgmtDemo,
  importSpeakersCsv,
  mergeSpeakerRecords,
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
        code: status === 404 ? "NOT_FOUND" : status === 403 ? "FORBIDDEN" : "VALIDATION_ERROR",
        message,
      },
    },
    status,
  );

export function createSpeakerRoutes(deps: {
  store: LifecycleStore;
  persist: () => Promise<void>;
  persona: (c: any) => { id: string; role: string; name: string; email: string; speakerId?: string };
  mailer: Mailer;
  repo: Repository;
}) {
  const app = new Hono();
  const org = (c: any) => deps.persona(c).role === "organizer";
  const requireOrg = (c: any) => (!org(c) ? fail(c, "organizer role required", 403) : null);
  const speakerIdOf = (c: any) => deps.persona(c).speakerId;

  const eventOk = (c: any) => c.req.param("eventId") === EVENT_ID;
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
        });
        made.communication.status = result.status;
      } catch {
        made.communication.status = "failed";
      }
    }
    await syncProfileToSchedule(made.speakerId, deps.store, deps.repo);
    await deps.persist();
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
    await deps.persist();
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
    await deps.persist();
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
    const comm = sendTemplate("accepted", speakerId, title, "acceptance");
    try {
      const result = await deps.mailer.send({ to: profile.email, subject: comm.subject, text: comm.body });
      comm.status = result.status;
    } catch {
      comm.status = "failed";
    }
    await deps.persist();
    return c.json({ data: { communication: comm, portalPath: "/p" } });
  });

  app.post("/api/events/:eventId/speakers/import", async (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = await c.req.json();
    const result = importSpeakersCsv(String(b.csv || b.text || ""), { sendInvite: Boolean(b.sendInvite) }, deps.store);
    await deps.persist();
    return c.json({ data: result });
  });

  app.post("/api/events/:eventId/speakers/merge", async (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404); const denied=requireOrg(c); if(denied)return denied;
    const b=await c.req.json(); const merged=mergeSpeakerRecords(b.primaryId,b.secondaryId,deps.store);
    if(!merged.ok)return fail(c,merged.error,merged.error.includes("not found")?404:400); await deps.persist(); return c.json({data:merged.profile});
  });

  app.post("/api/events/:eventId/speakers/:speakerId/sessions/:sessionId/link", async (c) => {
    if (!eventOk(c)) return fail(c,"event not found",404); const denied=requireOrg(c);if(denied)return denied;
    const profile=deps.store.profiles.find(p=>p.speakerId===c.req.param("speakerId")),session=deps.store.sessions.find(s=>s.id===c.req.param("sessionId"));
    if(!profile||!session)return fail(c,"speaker or session not found",404); session.speakerId=profile.speakerId; await deps.persist(); return c.json({data:session});
  });

  app.post("/api/events/:eventId/speakers/tasks", async (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = await c.req.json();
    const made = assignGeneralTasks(b, deps.store);
    if (!made.ok) return fail(c, made.error);
    await deps.persist();
    return c.json({ data: made.tasks }, 201);
  });

  // —— Speaker self-service (overrides/enhances) ——
  app.put("/api/speaker/events/:eventId/profile", async (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const speakerId = speakerIdOf(c);
    if (!speakerId) return fail(c, "speaker persona required", 403);
    const b = await c.req.json().catch(() => null);
    if (!b) return fail(c, "JSON body required");
    const { headshot, ...profileFields } = b as typeof b & {
      headshot?: { name: string; mime?: string; dataBase64?: string; dataUrl?: string };
    };
    const updated = updateSpeakerSelf(speakerId, profileFields, deps.store);
    if (!updated.ok) return fail(c, updated.error);
    if (headshot?.name && headshot.dataUrl) {
      const [prefix,dataBase64=""] = headshot.dataUrl.split(","); const mime=headshot.mime||prefix.match(/^data:([^;]+)/)?.[1]||"image/png";
      const check=validateUpload({mime,size:atob(dataBase64).length,dataBase64},["image/png","image/jpeg"]); if(!check.ok)return fail(c,check.error);
      let task=deps.store.deliverableTasks.find(t=>t.speakerId===speakerId&&t.acceptedTypes.some(x=>x.startsWith("image/")));
      if(!task){task={id:`deliverable-headshot-${speakerId}`,name:"Upload Final Headshot",instructions:"Speaker profile headshot",dueAt:new Date().toISOString(),speakerId,sessionId:deps.store.sessions.find(s=>s.speakerId===speakerId)?.id,fileRequired:true,acceptedTypes:["image/png","image/jpeg"],status:"incomplete",createdAt:new Date().toISOString()};deps.store.deliverableTasks.push(task)}
      const made=addFileVersion(deps.store,{task,name:headshot.name,mime,size:atob(dataBase64).length,dataBase64,uploadedBy:speakerId,kind:"headshot"});
      updated.profile.headshotName=headshot.name; updated.profile.headshotUrl=`/api/content/files/${made.file.id}/versions/${made.version.id}`;
      applyHeadshot(speakerId,{name:headshot.name},deps.store);
    }
    const profileTask = deps.store.tasks.find((t) => t.speakerId === speakerId && t.type === "profile");
    if (profileTask && (updated.profile.bio || "").trim().length > 20) profileTask.status = "completed";
    await syncProfileToSchedule(speakerId, deps.store, deps.repo);
    await deps.persist();
    return c.json({ data: { profile: updated.profile, readiness: readiness(speakerId) } });
  });

  app.post("/api/speaker/events/:eventId/profile/headshot", async (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const speakerId = speakerIdOf(c);
    if (!speakerId) return fail(c, "speaker persona required", 403);
    const b = await c.req.json().catch(() => null);
    if (!b?.name) return fail(c, "name required");
    const result = applyHeadshot(speakerId, b, deps.store);
    if (!result.ok) return fail(c, result.error, 404);
    await syncProfileToSchedule(speakerId, deps.store, deps.repo);
    await deps.persist();
    return c.json({ data: { profile: result.profile, readiness: readiness(speakerId) } }, 201);
  });

  app.post("/api/speaker/events/:eventId/tasks/:id/form", async (c) => {
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
    const speakerId = speakerIdOf(c);
    if (!speakerId) return fail(c, "speaker persona required", 403);
    const b = await c.req.json().catch(() => ({}));
    const result = submitFormTask(c.req.param("id"), speakerId, b.answers || b, deps.store);
    if (!result.ok) return fail(c, result.error, result.error.includes("not found") ? 404 : 400);
    await deps.persist();
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
    if (!eventOk(c)) return fail(c, "event not found", 404);
    boot();
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
      const profile = deps.store.profiles.find((p) => p.speakerId === speakerId);
      const sub = deps.store.submissions.find((s) => s.speakerId === speakerId && s.status === "accepted");
      const title = sub?.title || "your session";
      let row;
      // Prefer explicit compose-field subject/body (edited in UI) over stored template content.
      const hasCompose = typeof b.subject === "string" || typeof b.body === "string";
      if (hasCompose) {
        const tpl = b.templateKey
          ? deps.store.templates.find((t) => t.key === b.templateKey || t.id === b.templateKey)
          : undefined;
        const preview = renderMergePreview(
          {
            subject: typeof b.subject === "string" ? b.subject : tpl?.subject || "Message from CUE",
            body: typeof b.body === "string" ? b.body : tpl?.body || "",
            includeCalendarLinks: Boolean((b as any).includeCalendarLinks ?? tpl?.includeCalendarLinks),
          },
          speakerId,
          deps.store,
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
        deps.store.communications.unshift(row);
      } else if (b.templateKey) {
        row = sendTemplate(
          b.templateKey,
          speakerId,
          title,
          b.templateKey === "task_reminder" ? "reminder" : b.templateKey === "accepted" ? "acceptance" : "custom",
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
            attachments: row.ics
              ? [{ filename: "invite.ics", content: row.ics, contentType: "text/calendar" as const }]
              : undefined,
          });
          row.status = result.status;
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
        kind: row.kind,
        createdAt: row.createdAt,
        hasIcs: Boolean(row.ics),
      });
    }
    await deps.persist();
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
        legacy: reminderPlans(),
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
      const row = sendTemplate("task_reminder", speakerId, names[0] || "tasks", "reminder");
      row.body = `Hi ${profile.name.split(" ")[0]},\n\nOutstanding onboarding tasks:\n- ${names.join("\n- ")}\n\nComplete them in your portal: /p\n`;
      try {
        const result = await deps.mailer.send({ to: profile.email, subject: row.subject, text: row.body });
        row.status = result.status;
      } catch {
        row.status = "failed";
      }
      sent.push({ speakerId, email: profile.email, status: row.status, tasks: items.length });
    }
    await deps.persist();
    return c.json({ data: { sent, count: sent.length, planned: plans.length } });
  });

  return app;
}
