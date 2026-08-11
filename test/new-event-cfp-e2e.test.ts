import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { EVENT_ID } from "../src/lifecycle.js";
import { resetEventRegistry } from "../src/events.js";
import { MemoryRepository } from "../src/repository.js";

const ORG = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const json = async (r: Response) => (await r.json()) as any;
const post = (app: any, path: string, body: unknown, headers: Record<string, string> = ORG) =>
  app.request(path, { method: "POST", headers, body: JSON.stringify(body) });

const NEW_EVENT = {
  name: "Forward Summit 2028", slug: "forward-summit-2028",
  startsAt: "2028-05-04T15:00:00.000Z", endsAt: "2028-05-06T02:00:00.000Z",
  timezone: "America/New_York", venue: "Pier 27", rooms: "Room 2A, Main Stage", tracks: "Platform",
};

test("create event → Forms builder → add field → publish → public CFP renders and accepts", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  const record = (await json(await post(app, "/api/events", NEW_EVENT))).data;

  // 1. The builder loads at the id the UI actually requests.
  const list = await app.request(`/api/events/${record.id}/forms`, { headers: ORG });
  assert.equal(list.status, 200);
  const formId = (await json(list)).data[0].id;
  assert.equal(formId, "form-cfp", "created events expose the canonical form id");

  const detail = await app.request(`/api/events/${record.id}/forms/form-cfp`, { headers: ORG });
  assert.equal(detail.status, 200, "the builder request no longer 404s");
  const form = (await json(detail)).data;
  assert.ok(form.fields.some((f: any) => f.key === "title"), "a usable standard form is seeded");
  assert.ok(form.fields.some((f: any) => f.key === "category"));

  // 2. Add a field through the builder and publish the window open.
  const fields = [...form.fields, { key: "key_takeaway", label: "Key takeaway", type: "text", required: true, section: "Proposal" }];
  const saved = await app.request(`/api/events/${record.id}/forms/form-cfp`, {
    method: "PUT", headers: ORG,
    body: JSON.stringify({ ...form, status: "open", closeAt: "2028-04-30T23:59:00.000Z", fields }),
  });
  assert.equal(saved.status, 200);

  // 3. The public CFP for the new slug renders the edited form.
  const cfp = await app.request(`/api/public/events/${record.slug}/cfp`);
  assert.equal(cfp.status, 200);
  const published = (await json(cfp)).data;
  assert.equal(published.event.id, record.id);
  assert.ok(published.form.fields.some((f: any) => f.key === "key_takeaway"), "builder edit reaches the public form");
  assert.ok(published.window.open, "the CFP is accepting submissions");

  // 4. A real submission lands in the NEW event only.
  const submitted = await post(app, `/api/public/events/${record.slug}/submissions`, {
    name: "Fresh Speaker", email: "fresh@example.test",
    answers: {
      title: "Fresh talk", abstract: "F".repeat(60), category: published.categories[0],
      format: "Talk (30 min)", experience: "Beginner", key_takeaway: "Ship faster",
    },
  }, { "content-type": "application/json" });
  assert.equal(submitted.status, 201, "the public form accepts a submission");

  const mine = (await json(await app.request(`/api/events/${record.id}/submissions`, { headers: ORG }))).data;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].title, "Fresh talk");
  const seeded = (await json(await app.request(`/api/events/${EVENT_ID}/submissions`, { headers: ORG }))).data;
  assert.ok(!seeded.some((s: any) => s.title === "Fresh talk"), "isolation preserved");
  resetEventRegistry();
});

test("the seeded event keeps its own form and is unaffected", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  await post(app, "/api/events", NEW_EVENT);
  const seeded = await app.request(`/api/events/${EVENT_ID}/forms/form-cfp`, { headers: ORG });
  assert.equal(seeded.status, 200);
  const form = (await json(seeded)).data;
  assert.ok(!form.fields.some((f: any) => f.key === "key_takeaway"), "no cross-event field bleed");
  assert.equal((await app.request(`/api/events/${EVENT_ID}/forms/form-nope`, { headers: ORG })).status, 404);
  resetEventRegistry();
});

test("event creation no longer silently switches the active event", () => {
  const src = readFileSync("src/web/components/shells.tsx", "utf8");
  const createAt = src.indexOf("const created = await api.createEvent(eventCreateDefaults(form))");
  const banner = src.indexOf('data-testid="switch-to-created"');
  assert.ok(createAt > 0 && banner > 0);
  // No auto-adopt in the create path; the organizer switches deliberately.
  assert.ok(!/createEvent\(eventCreateDefaults\(form\)\);[\s\S]{0,220}setActiveEventId\(created\.data\.id\)/.test(src),
    "creation must not call setActiveEventId implicitly");
  assert.match(src, /Do NOT silently switch/);
  assert.match(src, /You are still working in/);
  assert.match(src, /Stay in \{active\.name\}/);
});

test("a submission from another event explains itself and offers the switch", () => {
  const src = readFileSync("src/web/pages/SubmissionsPages.tsx", "utf8");
  assert.match(src, /export async function findOwningEvent/);
  assert.match(src, /data-testid="cross-event-notice"/);
  assert.match(src, /belongs to \{owner\.name\} — switch event to view it/);
  assert.match(src, /data-testid="switch-to-owner"/);
  assert.match(src, /Switch to \{owner\.name\}/);
  // The plain error path still exists for genuine failures.
  assert.match(src, /data-testid="submission-error"/);
});

test("a submission id from another event 404s in the active event (the trap the UI now explains)", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  const record = (await json(await post(app, "/api/events", NEW_EVENT))).data;
  const seeded = (await json(await app.request(`/api/events/${EVENT_ID}/submissions`, { headers: ORG }))).data;
  const foreign = seeded[0].id;
  assert.equal((await app.request(`/api/events/${record.id}/submissions/${foreign}`, { headers: ORG })).status, 404);
  // ...and it still resolves in its own event, which is what the switch button restores.
  assert.equal((await app.request(`/api/events/${EVENT_ID}/submissions/${foreign}`, { headers: ORG })).status, 200);
  resetEventRegistry();
});

test("the speaker portal resolves personas in an effect and has an explicit empty state", () => {
  const shells = readFileSync("src/web/components/shells.tsx", "utf8");
  // Bounded: resolution happens inside useEffect, never during render.
  assert.ok(!/^\s*resolvePortalPersona\(role\);$/m.test(shells), "no render-time persona write remains");
  assert.match(shells, /Resolution runs in an EFFECT, never during render/);
  assert.match(shells, /data-testid="portal-no-speakers"/);
  assert.match(shells, /No speaker personas in this event/);
  assert.match(shells, /\}, \[role, activeEvent\.id\]\)/, "resolution is re-run per event, and bounded");

  const api = readFileSync("src/web/lib/api.ts", "utf8");
  // The fallback may only pick a persona that exists in the active event.
  assert.match(api, /export const hasPersonaForRole/);
  assert.ok(!/DEFAULT_PERSONAS\.find\(\(p\) => p\.role === role\)/.test(api.split("resolvePortalPersona")[1] || ""),
    "no built-in persona fallback that the event does not contain");
});

test("portal reads are scoped to a speaker that exists in the active event", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  const boot = (await json(await app.request(`/api/events/${EVENT_ID}/bootstrap`, { headers: ORG }))).data;
  const speaker = boot.personas.find((p: any) => p.role === "speaker");
  assert.ok(speaker, "the seeded event has speaker personas");
  const home = await app.request(`/api/speaker/events/${EVENT_ID}/home`, {
    headers: { "x-demo-persona": speaker.id, "x-demo-role": "speaker" },
  });
  assert.equal(home.status, 200, "a real persona reads its portal");
  const data = (await json(home)).data;
  assert.ok(Array.isArray(data.submissions) || Array.isArray(data.talks) || data.readiness, "portal payload present");

  // A fresh event genuinely has no speaker personas — the shell must show the empty state.
  const record = (await json(await post(app, "/api/events", NEW_EVENT))).data;
  const fresh = (await json(await app.request(`/api/events/${record.id}/bootstrap`, { headers: ORG }))).data;
  assert.equal(fresh.personas.filter((p: any) => p.role === "speaker").length, 0);
  resetEventRegistry();
});
