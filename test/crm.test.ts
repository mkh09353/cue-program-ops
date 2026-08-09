import test from "node:test";
import assert from "node:assert/strict";
import { createApp, restoreSnapshot } from "../src/app.js";
import { MemoryRepository } from "../src/repository.js";
import { MemorySnapshotPersistence } from "../src/persistence.js";
import { store } from "../src/lifecycle.js";
import {
  addContactToEvent,
  canTransition,
  commitCsvImport,
  createContact,
  deleteContact,
  ensureCrm,
  filterContacts,
  mergeContacts,
  moveStage,
  saveSegment,
  seedCrmDemo,
  syncEventSpeakersIntoCrm,
  validateCsvImport,
  type CrmState,
} from "../src/crm.js";

const org = { "x-demo-role": "organizer" };
const reviewer = { "x-demo-role": "reviewer" };

function freshCrm() {
  const crm = ensureCrm(store);
  crm.contacts = [];
  crm.segments = [];
  crm.campaigns = [];
  return crm;
}

test("contact CRUD + snapshot round-trip", async () => {
  freshCrm();
  const made = createContact({
    name: "Casey River",
    email: "casey.river@example.test",
    title: "Engineer",
    company: "River Co",
    tags: ["dx"],
    stage: "prospect",
  });
  assert.equal(made.ok, true);
  if (!made.ok) return;
  assert.equal(made.contact.email, "casey.river@example.test");
  assert.ok(made.contact.stageHistory.length >= 1);

  const persistence = new MemorySnapshotPersistence();
  // monkey-patch memory save/load
  let saved: any;
  (persistence as any).save = async (s: any) => {
    saved = structuredClone(s);
  };
  (persistence as any).load = async () => saved;

  const app = createApp({ repo: new MemoryRepository(), persistence });
  const createRes = await app.request("/api/crm/contacts", {
    method: "POST",
    headers: { ...org, "content-type": "application/json" },
    body: JSON.stringify({ name: "Pat Snapshot", email: "pat.snap@example.test", company: "Snap Inc" }),
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.ok(created.data.id);

  // Force persist path via a note
  const noteRes = await app.request(`/api/crm/contacts/${created.data.id}/notes`, {
    method: "POST",
    headers: { ...org, "content-type": "application/json" },
    body: JSON.stringify({ body: "Persisted note" }),
  });
  assert.equal(noteRes.status, 201);
  assert.ok(saved?.lifecycle?.crm?.contacts?.some((c: any) => c.email === "pat.snap@example.test"));

  // Wipe and restore
  const beforeCount = ensureCrm(store).contacts.length;
  ensureCrm(store).contacts = [];
  assert.equal(ensureCrm(store).contacts.length, 0);
  const ok = await restoreSnapshot({ repo: new MemoryRepository(), persistence });
  assert.equal(ok, true);
  const restored = ensureCrm(store).contacts.find((c) => c.email === "pat.snap@example.test");
  assert.ok(restored);
  assert.ok(restored!.notes.some((n) => n.body.includes("Persisted note")));
  assert.ok(ensureCrm(store).contacts.length >= 1);
  assert.ok(beforeCount >= 1);

  deleteContact(created.data.id);
});

test("CSV import validation + dedupe + merge", () => {
  freshCrm();
  createContact({ name: "Existing", email: "dup@example.test", company: "OldCo", bio: "Keep me" });

  const csv = [
    "name,email,title,company,bio",
    "New Person,new.person@example.test,Staff,NewCo,Hello",
    "No Email,,Title,Co,Bio",
    "Dup Update,dup@example.test,Principal,NewCo,Updated bio",
    "Bad Mail,not-an-email,X,Y,Z",
  ].join("\n");

  const validated = validateCsvImport(csv);
  assert.equal(validated.length, 4);
  assert.equal(validated[0]!.ok, true);
  assert.equal(validated[0]!.action, "would_create");
  assert.equal(validated[1]!.ok, false);
  assert.equal(validated[2]!.ok, true);
  assert.equal(validated[2]!.action, "would_merge");
  assert.equal(validated[3]!.ok, false);

  const skipped = commitCsvImport(csv, { mergeDuplicates: false });
  assert.equal(skipped.created, 1);
  assert.equal(skipped.merged, 0);
  assert.ok(skipped.skipped >= 2);

  // Reset dup-only for merge path
  freshCrm();
  createContact({ name: "Existing", email: "dup@example.test", company: "OldCo", bio: "Keep me" });
  const merged = commitCsvImport(csv, { mergeDuplicates: true });
  assert.equal(merged.created, 1);
  assert.equal(merged.merged, 1);
  const contact = ensureCrm(store).contacts.find((c) => c.email === "dup@example.test")!;
  assert.equal(contact.company, "NewCo");
  assert.ok(contact.bio);

  // Explicit merge of two contacts
  const a = createContact({ name: "Alpha", email: "alpha@example.test", tags: ["a"] });
  const b = createContact({ name: "Alpha Dup", email: "alpha.dup@example.test", company: "Co", tags: ["b"] });
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  const m = mergeContacts(a.contact.id, b.contact.id);
  assert.equal(m.ok, true);
  if (!m.ok) return;
  assert.ok(m.contact.tags.includes("a") && m.contact.tags.includes("b"));
  assert.equal(ensureCrm(store).contacts.some((c) => c.id === b.contact.id), false);
});

test("stage transition rules + history", () => {
  freshCrm();
  const made = createContact({ name: "Stagey", email: "stagey@example.test" });
  assert.ok(made.ok);
  if (!made.ok) return;
  assert.equal(made.contact.stage, "prospect");
  assert.equal(canTransition("prospect", "confirmed"), false);
  const bad = moveStage(made.contact.id, "confirmed");
  assert.equal(bad.ok, false);

  const ok1 = moveStage(made.contact.id, "contacted", { id: "u1", name: "Org" }, "Pinged");
  assert.equal(ok1.ok, true);
  if (!ok1.ok) return;
  assert.equal(ok1.contact.stage, "contacted");
  const ok2 = moveStage(made.contact.id, "invited");
  assert.equal(ok2.ok, true);
  const ok3 = moveStage(made.contact.id, "confirmed");
  assert.equal(ok3.ok, true);
  if (!ok3.ok) return;
  assert.ok(ok3.contact.stageHistory.length >= 4);
  assert.ok(ok3.contact.stageHistory.some((h) => h.note === "Pinged"));
  assert.equal(ok3.contact.stageHistory.at(-1)!.to, "confirmed");
});

test("segment filtering", () => {
  freshCrm();
  createContact({ name: "A", email: "a@example.test", tags: ["agents"], stage: "prospect", company: "Acme" });
  createContact({ name: "B", email: "b@example.test", tags: ["platform"], stage: "confirmed", company: "Beta" });
  createContact({ name: "C", email: "c@example.test", tags: ["agents", "keynote"], stage: "confirmed", company: "Acme" });

  assert.equal(filterContacts({ stage: "confirmed" }).length, 2);
  assert.equal(filterContacts({ tag: "agents" }).length, 2);
  assert.equal(filterContacts({ company: "Acme" }).length, 2);
  assert.equal(filterContacts({ q: "keynote" }).length, 1);
  assert.equal(filterContacts({ tagsAny: ["platform", "missing"] }).length, 1);

  const seg = saveSegment({ name: "Confirmed Acme", filters: { stage: "confirmed", company: "Acme" } });
  assert.equal(seg.ok, true);
  if (!seg.ok) return;
  assert.equal(filterContacts(seg.segment.filters).length, 1);
  assert.equal(filterContacts(seg.segment.filters)[0]!.email, "c@example.test");
});

test("add-to-event handoff creates an event speaker", () => {
  freshCrm();
  const made = createContact({
    name: "Handoff Hero",
    email: "handoff.hero@example.test",
    title: "Staff",
    company: "Hero Labs",
    bio: "From CRM",
    stage: "invited",
  });
  assert.ok(made.ok);
  if (!made.ok) return;

  const beforeProfiles = store.profiles.length;
  const result = addContactToEvent(made.contact.id);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.created, true);
  assert.ok(result.speakerId);
  assert.ok(store.profiles.length >= beforeProfiles + 1);
  const profile = store.profiles.find((p) => p.speakerId === result.speakerId);
  assert.ok(profile);
  assert.equal(profile!.email, "handoff.hero@example.test");
  assert.ok(store.submissions.some((s) => s.speakerId === result.speakerId && s.status === "accepted"));
  assert.ok(made.contact.eventHistory.some((e) => e.speakerId === result.speakerId));
  assert.equal(made.contact.stage, "confirmed");

  // Idempotent second call
  const again = addContactToEvent(made.contact.id);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.created, false);
  assert.equal(again.speakerId, result.speakerId);
});

test("organizer-only enforcement on CRM routes", async () => {
  seedCrmDemo();
  const app = createApp({ repo: new MemoryRepository() });

  const denied = await app.request("/api/crm/contacts", { headers: reviewer });
  assert.equal(denied.status, 403);

  const speakerDenied = await app.request("/api/crm/contacts", { headers: { "x-demo-role": "speaker" } });
  assert.equal(speakerDenied.status, 403);

  const allowed = await app.request("/api/crm/contacts", { headers: org });
  assert.equal(allowed.status, 200);
  const body = await allowed.json();
  assert.ok(Array.isArray(body.data));
  assert.ok(body.data.length >= 6);

  const pipeline = await app.request("/api/crm/pipeline", { headers: org });
  assert.equal(pipeline.status, 200);
  const pipe = await pipeline.json();
  assert.ok(pipe.data.columns.length >= 5);

  const importDenied = await app.request("/api/crm/import", {
    method: "POST",
    headers: { ...reviewer, "content-type": "application/json" },
    body: JSON.stringify({ csv: "name,email\nX,x@test.com" }),
  });
  assert.equal(importDenied.status, 403);
});

test("seed syncs accepted event speakers into CRM", () => {
  freshCrm();
  const result = syncEventSpeakersIntoCrm(store);
  assert.ok(result.contacts >= 1);
  // Accepted submissions should produce CRM contacts by email
  for (const sub of store.submissions.filter((s) => s.status === "accepted")) {
    const hit = ensureCrm(store).contacts.find((c) => c.email.toLowerCase() === sub.email.toLowerCase());
    assert.ok(hit, `missing CRM contact for accepted speaker ${sub.email}`);
  }
});

// Keep type import warm for snapshot shape
void 0 as unknown as CrmState;
