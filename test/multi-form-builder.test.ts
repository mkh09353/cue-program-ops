import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { resetEventRegistry } from "../src/events.js";
import { MemoryRepository } from "../src/repository.js";

const ORG = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const PUB = { "content-type": "application/json" };
const json = async (r: Response) => (await r.json()) as any;
const boot = () => {
  resetEventRegistry();
  store.extraForms = [];
  return createApp({ repo: new MemoryRepository() });
};

// —— 1. Field reordering ——

test("field order persists and the public form renders in that order", async () => {
  const app = boot();
  const form = (await json(await app.request(`/api/events/${EVENT_ID}/forms/form-cfp`, { headers: ORG }))).data;
  const original = form.fields.map((f: any) => f.key);
  assert.ok(original.length >= 3);

  // Move the third question to the front, exactly as the ↑ control does.
  const fields = [...form.fields];
  const moved = fields.splice(2, 1)[0];
  fields.unshift(moved);
  const saved = await app.request(`/api/events/${EVENT_ID}/forms/form-cfp`, {
    method: "PUT", headers: ORG, body: JSON.stringify({ ...form, fields }),
  });
  assert.equal(saved.status, 200);

  const reread = (await json(await app.request(`/api/events/${EVENT_ID}/forms/form-cfp`, { headers: ORG }))).data;
  assert.equal(reread.fields[0].key, moved.key, "the new order persisted");
  assert.deepEqual(reread.fields.map((f: any) => f.key), [moved.key, ...original.filter((k: string) => k !== moved.key)]);

  const publicForm = (await json(await app.request(`/api/public/events/ai-engineer-summit/cfp`, { headers: PUB }))).data.form;
  assert.deepEqual(publicForm.fields.map((f: any) => f.key), reread.fields.map((f: any) => f.key), "public renders in builder order");

  // Reordering must not disturb key-based conditional bindings.
  const workshop = reread.fields.find((f: any) => f.key === "workshopPlan");
  assert.deepEqual(workshop.visibleWhen, { key: "format", equals: "Workshop (120 min)" });
});

test("the builder exposes per-question up/down controls", () => {
  const src = readFileSync("src/web/pages/PublishFormsSettings.tsx", "utf8");
  assert.match(src, /const moveField = \(index: number, delta: number\)/);
  assert.match(src, /data-testid=\{`field-up-\$\{f\.key\}`\}/);
  assert.match(src, /data-testid=\{`field-down-\$\{f\.key\}`\}/);
  assert.match(src, /disabled=\{idx === 0\}/, "first question cannot move up");
  assert.match(src, /disabled=\{idx === form\.fields\.length - 1\}/, "last cannot move down");
  assert.match(src, /Questions appear on the public form in this order/);
});

// —— 2. Multiple forms per event ——

test("a second form is created from the standard template and listed after the primary", async () => {
  const app = boot();
  const before = (await json(await app.request(`/api/events/${EVENT_ID}/forms`, { headers: ORG }))).data;
  assert.equal(before.length, 1);
  assert.equal(before[0].id, "form-cfp");

  const created = await app.request(`/api/events/${EVENT_ID}/forms`, {
    method: "POST", headers: ORG, body: JSON.stringify({ name: "Workshops 2027" }),
  });
  assert.equal(created.status, 201);
  const made = (await json(created)).data;
  assert.equal(made.id, "form-workshops-2027");
  assert.equal(made.title, "Workshops 2027");
  assert.equal(made.status, "open");
  assert.ok(made.fields.some((f: any) => f.key === "title"), "standard template fields");
  assert.ok(made.welcomeMd.includes("Workshops 2027"), "its own welcome screen");

  const list = (await json(await app.request(`/api/events/${EVENT_ID}/forms`, { headers: ORG }))).data;
  assert.deepEqual(list.map((f: any) => f.id), ["form-cfp", "form-workshops-2027"], "primary stays first");

  // Non-organizers cannot create forms; blank names are rejected.
  assert.equal((await app.request(`/api/events/${EVENT_ID}/forms`, {
    method: "POST", headers: { "content-type": "application/json", "x-demo-role": "speaker" }, body: JSON.stringify({ name: "Nope" }),
  })).status, 403);
  assert.equal((await app.request(`/api/events/${EVENT_ID}/forms`, {
    method: "POST", headers: ORG, body: JSON.stringify({ name: "  " }),
  })).status, 400);
});

test("each form has its own public link, welcome screen and edits", async () => {
  const app = boot();
  const made = (await json(await app.request(`/api/events/${EVENT_ID}/forms`, {
    method: "POST", headers: ORG, body: JSON.stringify({ name: "Workshops 2027" }),
  }))).data;

  // Edit only the second form.
  const edited = await app.request(`/api/events/${EVENT_ID}/forms/${made.id}`, {
    method: "PUT", headers: ORG,
    body: JSON.stringify({ ...made, welcomeMd: "## Workshop track\n\nTell us about your hands-on session.", fields: [...made.fields, { key: "lab_setup", label: "Lab setup", type: "text", required: true, section: "Proposal" }] }),
  });
  assert.equal(edited.status, 200);

  const secondPublic = (await json(await app.request(`/api/public/events/ai-engineer-summit/cfp/${made.id}`, { headers: PUB }))).data;
  assert.equal(secondPublic.form.id, made.id);
  assert.match(secondPublic.form.welcomeMd, /Workshop track/, "its own welcome screen renders");
  assert.ok(secondPublic.form.fields.some((f: any) => f.key === "lab_setup"));

  // The primary form is untouched on its default path — zero regression.
  const primaryPublic = (await json(await app.request(`/api/public/events/ai-engineer-summit/cfp`, { headers: PUB }))).data;
  assert.equal(primaryPublic.form.id, "form-cfp");
  assert.ok(!primaryPublic.form.fields.some((f: any) => f.key === "lab_setup"), "no field bleed into the primary form");
  assert.ok(!/Workshop track/.test(primaryPublic.form.welcomeMd));

  assert.equal((await app.request(`/api/public/events/ai-engineer-summit/cfp/form-nope`, { headers: PUB })).status, 404);
});

test("submissions are tagged with their originating form and are filterable", async () => {
  const app = boot();
  const made = (await json(await app.request(`/api/events/${EVENT_ID}/forms`, {
    method: "POST", headers: ORG, body: JSON.stringify({ name: "Workshops 2027" }),
  }))).data;
  const answers = { abstract: "A".repeat(60), category: "AI Engineering", format: "Talk (30 min)", experience: "Beginner" };

  const viaSecond = await app.request(`/api/public/events/ai-engineer-summit/submissions`, {
    method: "POST", headers: PUB,
    body: JSON.stringify({ formId: made.id, name: "Workshop Person", email: "workshop@example.test", answers: { ...answers, title: "Hands-on lab" } }),
  });
  assert.equal(viaSecond.status, 201);
  const secondId = (await json(viaSecond)).data.id;

  const viaPrimary = await app.request(`/api/public/events/ai-engineer-summit/submissions`, {
    method: "POST", headers: PUB,
    body: JSON.stringify({ name: "Primary Person", email: "primary@example.test", answers: { ...answers, title: "Main stage talk" } }),
  });
  assert.equal(viaPrimary.status, 201);
  const primaryId = (await json(viaPrimary)).data.id;

  const inbox = (await json(await app.request(`/api/events/${EVENT_ID}/submissions`, { headers: ORG }))).data;
  assert.equal(inbox.find((s: any) => s.id === secondId).formId, made.id, "tagged with the second form");
  assert.equal(inbox.find((s: any) => s.id === primaryId).formId, "form-cfp", "omitted formId defaults to the primary");

  // An unknown formId is rejected rather than silently mis-filed.
  assert.equal((await app.request(`/api/public/events/ai-engineer-summit/submissions`, {
    method: "POST", headers: PUB,
    body: JSON.stringify({ formId: "form-nope", name: "X", email: "x@example.test", answers: { ...answers, title: "T" } }),
  })).status, 404);

  const src = readFileSync("src/web/pages/SubmissionsPages.tsx", "utf8");
  assert.match(src, /data-testid="form-filter"/);
  assert.match(src, /\(s\.formId \|\| "form-cfp"\) === formFilter/, "the inbox filters by form");
  assert.match(src, /data-testid=\{`submission-form-\$\{s\.id\}`\}/, "and shows a per-row chip");
});

// —— 3. Zero regression to the primary form ——

test("form-cfp default paths are unchanged", async () => {
  const app = boot();
  await app.request(`/api/events/${EVENT_ID}/forms`, { method: "POST", headers: ORG, body: JSON.stringify({ name: "Workshops 2027" }) });

  // Default builder + public paths still resolve the primary form.
  assert.equal((await json(await app.request(`/api/events/${EVENT_ID}/forms/form-cfp`, { headers: ORG }))).data.id, "form-cfp");
  const pub = (await json(await app.request(`/api/public/events/ai-engineer-summit/cfp`, { headers: PUB }))).data;
  assert.equal(pub.form.id, "form-cfp");
  assert.ok(Array.isArray(pub.categories) && pub.categories.length > 0, "categories still derived");
  assert.ok(pub.window, "window still reported");
  assert.equal(pub.event.id, EVENT_ID);
  // The list of sibling forms is additive information on the same payload.
  assert.deepEqual(pub.forms.map((f: any) => f.id), ["form-cfp", "form-workshops-2027"]);
  assert.equal((await app.request(`/api/events/${EVENT_ID}/forms/form-missing`, { headers: ORG })).status, 404);
});

test("the SPA serves per-form public links and the builder lists forms", () => {
  const main = readFileSync("src/web/main.tsx", "utf8");
  assert.match(main, /<Route path="cfp" element=\{<PublicCfpPage \/>\} \/>/, "default path untouched");
  assert.match(main, /<Route path="cfp\/:formId" element=\{<PublicCfpPage \/>\} \/>/);

  const page = readFileSync("src/web/pages/PublicReviewerPages.tsx", "utf8");
  assert.match(page, /const \{ slug, formId \} = useParams\(\)/);
  assert.match(page, /\.publicCfp\(slug!, formId\)/, "the public page fetches the form in the URL");
  assert.match(page, /formId: data\.form\.id|formId:data\.form\.id/, "submissions carry the form id");

  const builder = readFileSync("src/web/pages/PublishFormsSettings.tsx", "utf8");
  assert.match(builder, /data-testid="submission-forms"/);
  assert.match(builder, /data-testid="create-form"/);
  assert.match(builder, /data-testid=\{`form-tab-\$\{f\.id\}`\}/);
  assert.match(builder, /data-testid="form-public-link"/);
  assert.match(builder, /form\?\.id === "form-cfp"\s*\n?\s*\? `\/e\/\$\{getActiveEvent\(\)\.slug\}\/cfp`/, "primary keeps the bare /cfp link");
});
