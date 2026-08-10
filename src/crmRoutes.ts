import { Hono } from "hono";
import {
  addContactToEvent,
  addNote,
  commitCsvImport,
  createContact,
  crmDashboard,
  CRM_STAGES,
  deleteContact,
  deleteSegment,
  ensureCrm,
  filterContacts,
  mergeContacts,
  moveStage,
  recordCampaign,
  renderCrmTemplate,
  saveSegment,
  seedCrmDemo,
  syncEventSpeakersIntoCrm,
  updateContact,
  validateCsvImport,
  type CrmContactQuery,
  type CrmStage,
} from "./crm.js";
import { ensureSpeakerPersona } from "./speakerMgmt.js";
import type { LifecycleStore } from "./lifecycle.js";
import type { Mailer } from "./mailer.js";

const fail = (c: any, message: string, status = 400) =>
  c.json({ error: { code: status === 404 ? "NOT_FOUND" : status === 403 ? "FORBIDDEN" : "VALIDATION_ERROR", message } }, status);

export function createCrmRoutes(deps: {
  store: LifecycleStore;
  persist: () => Promise<void>;
  persona: (c: any) => { id: string; role: string; name: string; email: string };
  mailer: Mailer;
}) {
  const app = new Hono();
  const org = (c: any) => deps.persona(c).role === "organizer";
  const requireOrg = (c: any) => {
    if (!org(c)) return fail(c, "organizer role required", 403);
    return null;
  };

  // Ensure seed present for organizer demo surfaces
  app.use("/api/crm/*", async (c, next) => {
    seedCrmDemo(deps.store);
    return next();
  });

  app.get("/api/crm/dashboard", (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    return c.json({ data: crmDashboard(deps.store) });
  });

  app.get("/api/crm/stages", (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    return c.json({ data: CRM_STAGES });
  });

  app.get("/api/crm/contacts", (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    const query: CrmContactQuery = {
      q: c.req.query("q") || undefined,
      tag: c.req.query("tag") || undefined,
      company: c.req.query("company") || undefined,
      stage: c.req.query("stage") || undefined,
      tagsAny: c.req.query("tags")?.split(",").map((t) => t.trim()).filter(Boolean),
    };
    const data = filterContacts(query, deps.store);
    return c.json({ data, meta: { total: ensureCrm(deps.store).contacts.length, filtered: data.length } });
  });

  app.post("/api/crm/contacts", async (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = await c.req.json();
    const p = deps.persona(c);
    const made = createContact(b, { id: p.id, name: p.name });
    if (!made.ok) return fail(c, made.error);
    await deps.persist();
    return c.json({ data: made.contact }, 201);
  });

  app.get("/api/crm/contacts/:id", (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    const contact = ensureCrm(deps.store).contacts.find((x) => x.id === c.req.param("id"));
    if (!contact) return fail(c, "contact not found", 404);
    return c.json({ data: contact });
  });

  app.patch("/api/crm/contacts/:id", async (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = await c.req.json();
    const updated = updateContact(c.req.param("id"), b);
    if (!updated.ok) return fail(c, updated.error, updated.error.includes("not found") ? 404 : 400);
    await deps.persist();
    return c.json({ data: updated.contact });
  });

  app.delete("/api/crm/contacts/:id", async (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    if (!deleteContact(c.req.param("id"))) return fail(c, "contact not found", 404);
    await deps.persist();
    return c.body(null, 204);
  });

  app.post("/api/crm/contacts/:id/notes", async (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = await c.req.json();
    const p = deps.persona(c);
    const made = addNote(c.req.param("id"), b.body || b.note || "", { id: p.id, name: p.name });
    if (!made.ok) return fail(c, made.error, made.error.includes("not found") ? 404 : 400);
    await deps.persist();
    return c.json({ data: made.note, contact: made.contact }, 201);
  });

  app.post("/api/crm/contacts/:id/stage", async (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = await c.req.json();
    const p = deps.persona(c);
    const moved = moveStage(c.req.param("id"), b.stage as CrmStage, { id: p.id, name: p.name }, b.note);
    if (!moved.ok) return fail(c, moved.error, moved.error.includes("not found") ? 404 : 400);
    await deps.persist();
    return c.json({ data: moved.contact });
  });

  app.post("/api/crm/contacts/:id/add-to-event", async (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = await c.req.json().catch(() => ({}));
    if (b.role === "reviewer") {
      const contact=ensureCrm(deps.store).contacts.find(x=>x.id===c.req.param("id"));if(!contact)return fail(c,"contact not found",404);
      let reviewer=deps.store.personas.find(x=>x.email.toLowerCase()===contact.email.toLowerCase());if(reviewer&&reviewer.role!=="reviewer")return fail(c,"email belongs to another event role");
      if(!reviewer){reviewer={id:`rev-crm-${contact.id.slice(-8)}`,role:"reviewer",name:contact.name,email:contact.email};deps.store.personas.push(reviewer)}
      const round=deps.store.reviewRounds.find(x=>x.id===(b.roundId||"round-initial"))||deps.store.reviewRounds[0];if(!round)return fail(c,"review round not found",404);if(!round.reviewerIds.includes(reviewer.id))round.reviewerIds.push(reviewer.id);
      await deps.persist();return c.json({data:{contact,reviewerId:reviewer.id,roundId:round.id,role:"reviewer",created:true}},201);
    }
    const result = addContactToEvent(c.req.param("id"), b, deps.store);
    if (!result.ok) return fail(c, result.error, result.error.includes("not found") ? 404 : 400);
    const profile=deps.store.profiles.find(p=>p.speakerId===result.speakerId); if(profile)ensureSpeakerPersona(profile as any,deps.store);
    await deps.persist();
    return c.json({ data: result }, result.created ? 201 : 200);
  });

  app.post("/api/crm/contacts/merge", async (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = await c.req.json();
    const p = deps.persona(c);
    const merged = mergeContacts(b.primaryId, b.secondaryId, { id: p.id, name: p.name }, deps.store);
    if (!merged.ok) return fail(c, merged.error, merged.error.includes("not found") ? 404 : 400);
    await deps.persist();
    return c.json({ data: merged.contact });
  });

  app.post("/api/crm/import/validate", async (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = await c.req.json();
    const csv = String(b.csv || b.text || "");
    return c.json({ data: validateCsvImport(csv) });
  });

  app.post("/api/crm/import", async (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = await c.req.json();
    const p = deps.persona(c);
    const result = commitCsvImport(String(b.csv || b.text || ""), { mergeDuplicates: Boolean(b.mergeDuplicates) }, { id: p.id, name: p.name });
    await deps.persist();
    return c.json({ data: result });
  });

  app.get("/api/crm/segments", (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    const crm = ensureCrm(deps.store);
    const data = crm.segments.map((s) => ({
      ...s,
      count: filterContacts(s.filters, deps.store).length,
    }));
    return c.json({ data });
  });

  app.post("/api/crm/segments", async (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = await c.req.json();
    const made = saveSegment(b);
    if (!made.ok) return fail(c, made.error);
    await deps.persist();
    return c.json({ data: made.segment }, 201);
  });

  app.delete("/api/crm/segments/:id", async (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    if (!deleteSegment(c.req.param("id"))) return fail(c, "segment not found", 404);
    await deps.persist();
    return c.body(null, 204);
  });

  app.get("/api/crm/pipeline", (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    const contacts = ensureCrm(deps.store).contacts;
    const columns = CRM_STAGES.map((s) => ({
      ...s,
      contacts: contacts.filter((c) => c.stage === s.id),
    }));
    return c.json({ data: { columns, stages: CRM_STAGES } });
  });

  app.post("/api/crm/sync-event-speakers", async (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    const result = syncEventSpeakersIntoCrm(deps.store);
    await deps.persist();
    return c.json({ data: result });
  });

  app.post("/api/crm/communicate", async (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    const b = await c.req.json();
    const ids: string[] = Array.isArray(b.contactIds) ? b.contactIds : [];
    if (!ids.length) return fail(c, "contactIds required");
    const subjectTpl = String(b.subject || "").trim();
    const bodyTpl = String(b.body || "").trim();
    if (!subjectTpl || !bodyTpl) return fail(c, "subject and body are required");
    const crm = ensureCrm(deps.store);
    const sends = [];
    for (const contactId of ids) {
      const contact = crm.contacts.find((x) => x.id === contactId);
      if (!contact) {
        sends.push({ contactId, email: "", status: "failed" as const, error: "contact not found" });
        continue;
      }
      const subject = renderCrmTemplate(subjectTpl, contact);
      const text = renderCrmTemplate(bodyTpl, contact);
      try {
        const result = await deps.mailer.send({ to: contact.email, subject, text });
        sends.push({ contactId, email: contact.email, status: result.status });
        addNote(contactId, `Email sent: ${subject} (${result.status})`, {
          id: deps.persona(c).id,
          name: deps.persona(c).name,
        });
      } catch (error) {
        sends.push({
          contactId,
          email: contact.email,
          status: "failed" as const,
          error: error instanceof Error ? error.message : "send failed",
        });
      }
    }
    const campaign = recordCampaign({
      subject: subjectTpl,
      body: bodyTpl,
      templateKey: b.templateKey,
      sends,
    });
    await deps.persist();
    return c.json({ data: { campaign, sends } }, 201);
  });

  app.get("/api/crm/campaigns", (c) => {
    const denied = requireOrg(c);
    if (denied) return denied;
    return c.json({ data: ensureCrm(deps.store).campaigns });
  });

  return app;
}
