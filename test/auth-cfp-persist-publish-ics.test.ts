import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { EVENT_ID, EVENT_SLUG, store } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";
import { D1SnapshotPersistence, MemorySnapshotPersistence, type SnapshotPersistence } from "../src/persistence.js";
import { collectScheduleIssues } from "../src/schedule.js";
import { toIcsLocal } from "../src/ics.js";
import { EVENT_TIME_ZONE } from "../src/timezone.js";

const jsonHeaders = { "content-type": "application/json" };
const org = { ...jsonHeaders, "x-demo-persona": "org-swyx" };
const reviewer = { ...jsonHeaders, "x-demo-persona": "rev-ada" };
const speaker = { ...jsonHeaders, "x-demo-persona": "spk-sam" };
const json = async (res: Response) => ({ status: res.status, body: await res.json() as any });
const cfpBody = (email: string, title: string) => ({
  name: "Priya Raman",
  email,
  answers: {
    title,
    abstract: "Detailed abstract for the CFP duplicate harness.",
    category: "Platform & Infra",
    format: "Talk (30 min)",
    experience: "advanced",
    key_takeaway: "A practical framework",
    audience_level: "Intermediate",
  },
});

test("A: unauthenticated organizer APIs return 401 and never default to org-swyx", async () => {
  const app = createApp({ repo: new MemoryRepository(), demoPersonaHeaders: false });
  for (const path of [
    `/api/events/${EVENT_ID}/bootstrap`,
    `/api/events/${EVENT_ID}/command`,
    `/api/events/${EVENT_ID}/dashboard`,
    `/api/events/${EVENT_ID}/schedule`,
    `/api/events/${EVENT_ID}/forms`,
    `/api/events/${EVENT_ID}/speakers`,
    `/api/events/${EVENT_ID}/resources`,
    `/api/events/${EVENT_ID}/comms/log`,
    `/api/events/${EVENT_ID}/review-rounds`,
  ]) {
    const res = await app.request(path);
    assert.equal(res.status, 401, path);
    const body = await res.json() as any;
    assert.match(String(body.error?.message || body.error || ""), /authentication required/i);
  }
  const health = await json(await app.request("/health"));
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  const cfp = await app.request(`/api/public/events/${EVENT_SLUG}/cfp`);
  assert.equal(cfp.status, 200);
  const widget = await app.request(`/e/${EVENT_SLUG}/public/sessions`);
  assert.equal(widget.status, 200);
});

test("A: demo headers are ignored when DEMO_PERSONA_HEADERS is off and a session cookie wins", async () => {
  const app = createApp({ repo: new MemoryRepository(), demoPersonaHeaders: false });
  const spoof = await app.request(`/api/events/${EVENT_ID}/bootstrap`, { headers: { "x-demo-persona": "org-swyx" } });
  assert.equal(spoof.status, 401);
  const gated = createApp({ repo: new MemoryRepository() });
  const speakerDenied = await gated.request(`/api/events/${EVENT_ID}/bootstrap`, { headers: speaker });
  assert.equal(speakerDenied.status, 403);
  const reviewerDenied = await gated.request(`/api/events/${EVENT_ID}/bootstrap`, { headers: reviewer });
  assert.equal(reviewerDenied.status, 403);
  const allowed = await gated.request(`/api/events/${EVENT_ID}/bootstrap`, { headers: org });
  assert.equal(allowed.status, 200);
});

test("A: speaker submissions LIST is scoped to the current speaker", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const all = await json(await app.request(`/api/events/${EVENT_ID}/submissions`, { headers: org }));
  assert.equal(all.status, 200);
  assert.ok(all.body.data.length > 1);
  const mine = await json(await app.request(`/api/events/${EVENT_ID}/submissions`, { headers: speaker }));
  assert.equal(mine.status, 200);
  assert.ok(mine.body.data.length >= 1);
  assert.ok(mine.body.data.every((row: any) => row.speakerId === "spk-sam"));
  assert.ok(mine.body.data.length < all.body.data.length);
  const anon = createApp({ repo: new MemoryRepository(), demoPersonaHeaders: false });
  assert.equal((await anon.request(`/api/events/${EVENT_ID}/submissions`)).status, 401);
});

test("B: repeating the same public CFP email+title returns 200 with the existing id", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const email = `dup-${Date.now()}@example.test`;
  const title = "Idempotent CFP Talk";
  const first = await json(await app.request(`/api/public/events/${EVENT_SLUG}/submissions`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(cfpBody(email, title)) }));
  assert.equal(first.status, 201);
  const id = first.body.data.id;
  const before = store.submissions.filter((s) => s.email === email).length;
  const second = await json(await app.request(`/api/public/events/${EVENT_SLUG}/submissions`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(cfpBody(email, title)) }));
  assert.equal(second.status, 200);
  assert.equal(second.body.data.id, id);
  assert.equal(second.body.data.duplicate, true);
  assert.equal(store.submissions.filter((s) => s.email === email).length, before);
  const other = await json(await app.request(`/api/public/events/${EVENT_SLUG}/submissions`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(cfpBody(email, "A different CFP title")) }));
  assert.equal(other.status, 201);
  assert.notEqual(other.body.data.id, id);
});

test("C: persist failures fail the mutation with 5xx and health reports persistence kind", async () => {
  const memory = createApp({ repo: new MemoryRepository() });
  const health = await json(await memory.request("/health"));
  assert.equal(health.status, 200);
  assert.equal(health.body.persistence, "memory");
  assert.ok(!(D1SnapshotPersistence.prototype instanceof MemorySnapshotPersistence));

  const persistence: SnapshotPersistence = {
    save: async () => { throw new Error("D1 write rejected"); },
    load: async () => undefined,
  };
  const app = createApp({ repo: new MemoryRepository(), persistence });
  const created = await json(await app.request(`/api/public/events/${EVENT_SLUG}/submissions`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(cfpBody(`persist-${Date.now()}@example.test`, "Persist failure talk")),
  }));
  assert.equal(created.status, 500);
  assert.equal(created.body.error.code, "PERSISTENCE_FAILED");
  assert.match(created.body.error.message, /snapshot persistence failed/i);
});

test("D: agenda publish refuses hard conflicts, requires acknowledgement for warnings, then records them", async () => {
  const repo = new MemoryRepository();
  const app = createApp({ repo });
  const live = (await repo.getSchedule(EVENT_ID))!;
  const issues = collectScheduleIssues(live);
  assert.ok(issues.some((row) => row.severity === "warning"), "seed schedule has unscheduled-accepted warnings");

  const refused = await json(await app.request(`/api/events/${EVENT_ID}/agenda/publish`, { method: "POST", headers: org, body: "{}" }));
  assert.equal(refused.status, 422);
  assert.ok((refused.body.warnings || []).length >= 1);
  assert.equal((await repo.getSchedule(EVENT_ID))!.sessions.filter((s) => s.publishStatus === "published").length, live.sessions.filter((s) => s.publishStatus === "published").length);

  const published = await json(await app.request(`/api/events/${EVENT_ID}/agenda/publish`, { method: "POST", headers: org, body: JSON.stringify({ acknowledge: true }) }));
  assert.equal(published.status, 200);
  assert.equal(published.body.data.status, "published");
  assert.ok(Array.isArray(published.body.data.warnings));
  const sched = await repo.getSchedule(EVENT_ID) as any;
  assert.ok(sched.lastAgendaPublish);
  assert.equal(sched.lastAgendaPublish.count, published.body.data.count);
  assert.ok(Array.isArray(sched.lastAgendaPublish.warnings));

  const conflicted = new MemoryRepository();
  const conflictApp = createApp({ repo: conflicted });
  const data = (await conflicted.getSchedule(EVENT_ID))!;
  const analytical = data.slots.find((s) => s.sessionId === "ses-analytical")!;
  data.slots.push({ id: "forced-overlap", sessionId: "ses-sam", roomId: analytical.roomId, startsAt: analytical.startsAt, endsAt: analytical.endsAt });
  await conflicted.putSchedule(EVENT_ID, data);
  const blocked = await json(await conflictApp.request(`/api/events/${EVENT_ID}/agenda/publish`, { method: "POST", headers: org, body: JSON.stringify({ acknowledge: true }) }));
  assert.equal(blocked.status, 409);
  assert.ok((blocked.body.conflicts || []).some((row: any) => row.severity === "hard"));
});

test("D: public agenda shows a conflict notice when published sessions overlap", async () => {
  const repo = new MemoryRepository();
  const app = createApp({ repo });
  const data = (await repo.getSchedule(EVENT_ID))!;
  const analytical = data.slots.find((s) => s.sessionId === "ses-analytical")!;
  const sam = data.sessions.find((s) => s.id === "ses-sam")!;
  sam.status = "published";
  sam.publishStatus = "published";
  data.slots.push({ id: "public-overlap", sessionId: "ses-sam", roomId: analytical.roomId, startsAt: analytical.startsAt, endsAt: analytical.endsAt });
  await repo.putSchedule(EVENT_ID, data);
  const html = await (await app.request(`/e/${EVENT_SLUG}/public/agenda`)).text();
  assert.match(html, /data-agenda-conflicts/);
  assert.match(html, /Schedule conflicts on this published agenda/);
});

test("E: ICS builders emit X-WR-TIMEZONE, VTIMEZONE, and TZID wall-clock times", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const calendar = await app.request("/api/calendar/ses-analytical.ics");
  assert.equal(calendar.status, 200);
  const body = await calendar.text();
  assert.match(body, /X-WR-TIMEZONE:America\/Los_Angeles/);
  assert.match(body, /BEGIN:VTIMEZONE/);
  assert.match(body, /TZID:America\/Los_Angeles/);
  const wall = toIcsLocal("2026-10-12T17:00:00.000Z", EVENT_TIME_ZONE);
  assert.equal(wall, "20261012T100000");
  assert.match(body, new RegExp(`DTSTART;TZID=America/Los_Angeles:${wall}`));
  assert.doesNotMatch(body, /DTSTART:20261012T170000Z/);
  const publicIcs = await (await app.request(`/e/${EVENT_SLUG}/public/ics`)).text();
  assert.match(publicIcs, /X-WR-TIMEZONE:America\/Los_Angeles/);
  assert.match(publicIcs, /BEGIN:VTIMEZONE/);
  assert.match(publicIcs, /DTSTART;TZID=America\/Los_Angeles:/);
});
