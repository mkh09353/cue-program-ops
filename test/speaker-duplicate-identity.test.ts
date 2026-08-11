import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { resetEventRegistry } from "../src/events.js";
import { MemoryRepository } from "../src/repository.js";
import { addSpeakerManual, importSpeakersCsv, normSpeakerName, resolveExistingSpeaker } from "../src/speakerMgmt.js";
import { addContactToEvent } from "../src/crm.js";
import { isGeneratedAvatar, initialsAvatarDataUrl, preferUploadedHeadshot } from "../src/publicProjection.js";
import { collapseSpeakerPersonas } from "../src/web/lib/api.js";

const ORG = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const json = async (r: Response) => (await r.json()) as any;
const post = (app: any, path: string, body: unknown, headers = ORG) =>
  app.request(path, { method: "POST", headers, body: JSON.stringify(body) });
const UPLOAD = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNQLLwBRwzEcQBBIhahB1LZpgAAAABJRU5ErkJggg==";

// —— 1. duplicate-name links instead of splitting ——

test("manual add with a matching name links to the existing speaker, even on a different email", () => {
  const before = store.profiles.length;
  const first = addSpeakerManual({ name: "Nadia Testcase", email: "nadia@example.test", title: "Staff Engineer" });
  assert.ok(first.ok && first.ok !== false);
  const firstId = (first as any).speakerId;

  const second = addSpeakerManual({ name: "  nadia   testcase ", email: "nadia.other@example.test", company: "Latticework" });
  assert.ok(second.ok);
  assert.equal((second as any).speakerId, firstId, "same canonical id — no second record");
  assert.equal((second as any).linked, true);
  assert.equal((second as any).linkedBy, "name");
  assert.equal(store.profiles.filter((p) => normSpeakerName(p.name) === "nadia testcase").length, 1);

  // Merge fills blanks without destroying existing values.
  const profile = store.profiles.find((p) => p.speakerId === firstId)! as any;
  assert.equal(profile.title, "Staff Engineer", "existing field preserved");
  assert.equal(profile.company, "Latticework", "blank field filled from the new row");
  assert.equal(store.profiles.length, before + 1, "exactly one record was created overall");
});

test("createAsNew opts out and produces a genuinely separate record", () => {
  addSpeakerManual({ name: "Twin Person", email: "twin1@example.test" });
  const dup = addSpeakerManual({ name: "Twin Person", email: "twin2@example.test", createAsNew: true });
  assert.ok(dup.ok);
  assert.equal(store.profiles.filter((p) => normSpeakerName(p.name) === "twin person").length, 2);
  assert.equal((dup as any).linked, false);
});

test("email match still wins and is reported as an email link", () => {
  addSpeakerManual({ name: "Email First", email: "emailfirst@example.test" });
  const again = addSpeakerManual({ name: "Totally Different Name", email: "emailfirst@example.test" });
  assert.equal((again as any).linkedBy, "email");
});

test("CSV import links duplicate names rather than creating rows", () => {
  addSpeakerManual({ name: "Csv Person", email: "csv1@example.test", title: "Principal" });
  const before = store.profiles.length;
  const result = importSpeakersCsv("name,email,company\nCsv Person,csv-other@example.test,Globex\n");
  assert.equal(store.profiles.length, before, "no new profile row");
  assert.equal(result.results[0].ok, true);
  const profile = store.profiles.find((p) => normSpeakerName(p.name) === "csv person")! as any;
  assert.equal(profile.title, "Principal");
  assert.equal(profile.company, "Globex");
});

test("CRM add-to-event lands on the existing roster record for the same name", () => {
  const created = addSpeakerManual({ name: "Crm Person", email: "crm-roster@example.test" });
  const speakerId = (created as any).speakerId;
  const crm = (store as any).crm || ((store as any).crm = { contacts: [], segments: [], campaigns: [] });
  const contact = {
    id: "contact-dupe-1", name: "Crm Person", email: "crm-different@example.test", stage: "prospect",
    tags: [], customFields: {}, eventHistory: [], notes: [], createdAt: new Date().toISOString(),
  };
  crm.contacts.push(contact);
  const out = addContactToEvent("contact-dupe-1", {}, store, store) as any;
  assert.equal(out.ok, true);
  assert.equal(out.speakerId, speakerId, "handoff reuses the roster record");
});

test("resolveExistingSpeaker prefers the record that carries the work", () => {
  const empty = addSpeakerManual({ name: "Busy Person", email: "busy-empty@example.test", createAsNew: true }) as any;
  const busy = addSpeakerManual({ name: "Busy Person", email: "busy-full@example.test", createAsNew: true }) as any;
  store.deliverableTasks.push({
    id: `task-busy-${Date.now()}`, speakerId: busy.speakerId, sessionId: "", title: "Slides",
    type: "slides", status: "pending", dueAt: new Date().toISOString(),
  } as any);
  const hit = resolveExistingSpeaker(store, { name: "Busy Person", email: "brand-new@example.test" });
  assert.equal(hit?.profile.speakerId, busy.speakerId, "the record with tasks wins");
  assert.notEqual(hit?.profile.speakerId, empty.speakerId);
});

// —— 2. persona catalog collapse ——

test("the persona catalog shows one entry per speaker name", () => {
  const list = [
    { id: "org-swyx", role: "organizer", name: "Jordan Alvarez", email: "j@x.test" },
    { id: "spk-a", role: "speaker", name: "Priya Raman", email: "a@x.test", speakerId: "spk-a" },
    { id: "spk-b", role: "speaker", name: "priya  raman", email: "b@x.test", speakerId: "spk-b" },
    { id: "spk-c", role: "speaker", name: "Marcus Okafor", email: "c@x.test", speakerId: "spk-c" },
    { id: "rev-1", role: "reviewer", name: "Ada Reviewer", email: "r@x.test" },
  ] as any[];
  const out = collapseSpeakerPersonas(list);
  assert.equal(out.filter((p) => p.role === "speaker" && /priya/i.test(p.name)).length, 1);
  assert.equal(out.length, 4, "non-speaker personas are untouched");
  assert.ok(out.some((p) => p.id === "rev-1") && out.some((p) => p.id === "org-swyx"));
});

// —— 3. read-your-writes under one id ——

test("organizer task assignment, profile edit and file upload are all visible under one id", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });

  // Organizer adds Priya manually...
  const added = await json(await post(app, `/api/events/${EVENT_ID}/speakers`, {
    name: "Priya Duplicate", email: "priya-manual@example.test", title: "Principal Engineer",
  }));
  const speakerId = added.data.speakerId;

  // ...and the same person arrives again with a different address (CFP-style).
  const again = await json(await post(app, `/api/events/${EVENT_ID}/speakers`, {
    name: "Priya Duplicate", email: "priya-cfp@example.test", company: "Latticework Systems",
  }));
  assert.equal(again.data.speakerId, speakerId, "second arrival links to the same record");
  assert.equal(again.data.linked, true);

  // Organizer assigns a task to that id; the portal must see it.
  const task = await post(app, `/api/events/${EVENT_ID}/speakers/tasks`, {
    speakerIds: [speakerId], title: "Confirm participation", dueAt: "2027-04-01T00:00:00.000Z", type: "action",
  });
  assert.equal(task.status, 201);

  const roster = (await json(await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: ORG }))).data;
  const row = roster.find((r: any) => r.speakerId === speakerId);
  assert.ok(row, "one roster row for the person");
  assert.equal(roster.filter((r: any) => normSpeakerName(r.name) === "priya duplicate").length, 1, "no duplicate roster row");
  assert.ok((row.tasks || []).some((t: any) => t.title === "Confirm participation"), "organizer sees the assigned task");

  // A profile edit under that id is readable by the organizer (read-your-writes).
  const patched = await app.request(`/api/events/${EVENT_ID}/speakers/${speakerId}`, {
    method: "PATCH", headers: ORG, body: JSON.stringify({ bio: "SBEK-PORTAL-BIO-01", headshotUrl: UPLOAD }),
  });
  assert.equal(patched.status, 200);
  const after = (await json(await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: ORG }))).data
    .find((r: any) => r.speakerId === speakerId);
  assert.match(String(after.bio || after.profile?.bio || ""), /SBEK-PORTAL-BIO-01/, "organizer read reflects the write");
  resetEventRegistry();
});

// —— 4. uploaded headshot beats the generated avatar ——

test("an uploaded headshot always wins over the generated initials avatar", () => {
  const generated = initialsAvatarDataUrl("Priya Raman");
  assert.equal(isGeneratedAvatar(generated), true);
  assert.equal(isGeneratedAvatar(UPLOAD), false);
  // Whichever side the upload is on, it is the one rendered.
  assert.equal(preferUploadedHeadshot(generated, UPLOAD), UPLOAD);
  assert.equal(preferUploadedHeadshot(UPLOAD, generated), UPLOAD);
  // With nothing real available the placeholder is still returned (never blank).
  assert.equal(preferUploadedHeadshot(generated, undefined), generated);
  assert.equal(preferUploadedHeadshot(undefined, undefined), undefined);
});

test("roster and schedule sync never replace a real upload with a placeholder", () => {
  const src = readFileSync("src/speakerMgmt.ts", "utf8");
  assert.match(src, /headshotUrl: preferUploadedHeadshot\(profile\.headshotUrl, target\.headshotUrl\)/);
  assert.match(src, /headshotUrl: preferUploadedHeadshot\(profile\?\.headshotUrl\)/);
});

test("the add-speaker form explains linking and offers the opt-out", () => {
  const src = readFileSync("src/web/pages/SpeakersCommsPages.tsx", "utf8");
  assert.match(src, /data-testid="create-as-new"/);
  assert.match(src, /This is a different person with the same name/);
  assert.match(src, /data-testid="speaker-link-notice"/);
  assert.match(src, /Linked to existing speaker/);
  assert.match(src, /createAsNew/);
});
