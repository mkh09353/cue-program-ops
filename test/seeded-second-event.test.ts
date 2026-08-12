import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { EVENT_ID } from "../src/lifecycle.js";
import { SECOND_EVENT_ID, SECOND_EVENT_SLUG, listEvents, resetEventRegistry } from "../src/events.js";
import { MemoryRepository } from "../src/repository.js";

const ORG = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const json = async (r: Response) => (await r.json()) as any;

test("DevFlow Conf 2027 ships pre-seeded, empty and usable", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });

  const events = (await json(await app.request("/api/events"))).data;
  const devflow = events.find((e: any) => e.id === SECOND_EVENT_ID);
  assert.ok(devflow, "the fixture event is in the switcher list");
  assert.equal(devflow.name, "DevFlow Conf 2027");
  assert.equal(devflow.slug, SECOND_EVENT_SLUG);
  assert.equal(devflow.timezone, "America/Los_Angeles");
  assert.equal(devflow.venue, "Moscone West, San Francisco, CA");
  assert.equal(new Date(devflow.startsAt).toISOString(), "2027-05-12T16:00:00.000Z");
  assert.equal(new Date(devflow.endsAt).toISOString(), "2027-05-15T01:00:00.000Z");

  // Empty but usable: a standard open CFP form at the canonical id, no content.
  const form = (await json(await app.request(`/api/events/${SECOND_EVENT_ID}/forms/form-cfp`, { headers: ORG }))).data;
  assert.equal(form.id, "form-cfp");
  assert.equal(form.status, "open");
  assert.ok(form.fields.some((f: any) => f.key === "title"));
  assert.ok(form.fields.some((f: any) => f.key === "category"));
  for (const path of ["submissions", "speakers"]) {
    const rows = (await json(await app.request(`/api/events/${SECOND_EVENT_ID}/${path}`, { headers: ORG }))).data;
    assert.equal(rows.length, 0, `${path} starts empty`);
  }

  // Fixture rooms and tracks are reachable on its canonical schedule.
  const schedule = await json(await app.request(`/api/events/${SECOND_EVENT_ID}/schedule`, { headers: ORG }));
  assert.deepEqual(schedule.rooms.map((r: any) => r.name), ["Room 2A", "Room 2B", "Main Stage"]);
  assert.deepEqual(schedule.tracks.map((t: any) => t.name), ["AI Engineering", "Platform & Infra", "Developer Experience"]);
  assert.equal(schedule.sessions.length, 0);
  assert.equal(schedule.slots.length, 0);

  // Its public slug serves its own CFP.
  const cfp = (await json(await app.request(`/api/public/events/${SECOND_EVENT_SLUG}/cfp`))).data;
  assert.equal(cfp.event.id, SECOND_EVENT_ID);
  assert.equal(cfp.event.name, "DevFlow Conf 2027");
  resetEventRegistry();
});

test("the seeded second event does not disturb the default event", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  assert.equal(listEvents()[0].id, EVENT_ID, "the default event is still listed first");

  const seeded = (await json(await app.request(`/api/events/${EVENT_ID}/submissions`, { headers: ORG }))).data;
  assert.ok(seeded.length > 0, "AI Engineer Summit keeps its seeded submissions");
  const seededSchedule = await json(await app.request(`/api/events/${EVENT_ID}/schedule`, { headers: ORG }));
  assert.ok(seededSchedule.sessions.length > 0, "and its sessions");
  assert.ok(!seededSchedule.rooms.some((r: any) => r.name === "Room 2A"), "no fixture rooms bleed in");

  // Writing into DevFlow leaves the default event untouched.
  await app.request(`/api/events/${SECOND_EVENT_ID}/agenda/rooms`, {
    method: "POST", headers: ORG, body: JSON.stringify({ name: "Isolation Room" }),
  });
  const after = await json(await app.request(`/api/events/${EVENT_ID}/schedule`, { headers: ORG }));
  assert.ok(!after.rooms.some((r: any) => r.name === "Isolation Room"));
  resetEventRegistry();
});

test("creating an event whose slug is taken auto-uniquifies instead of failing", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  const body = { name: "DevFlow Conf 2027", startsAt: "2027-05-12T16:00:00.000Z", endsAt: "2027-05-15T01:00:00.000Z" };

  const first = await app.request("/api/events", { method: "POST", headers: ORG, body: JSON.stringify(body) });
  assert.equal(first.status, 201, "never 409");
  const one = await json(first);
  assert.equal(one.data.slug, "devflow-conf-2027-2");
  assert.equal(one.slugAdjusted, true, "the adjustment is reported");
  assert.equal(one.requestedSlug, "devflow-conf-2027");

  const second = await json(await app.request("/api/events", { method: "POST", headers: ORG, body: JSON.stringify(body) }));
  assert.equal(second.data.slug, "devflow-conf-2027-3", "it keeps counting");

  // An explicitly supplied duplicate slug is uniquified too, and the seeded event is intact.
  const explicit = await json(await app.request("/api/events", {
    method: "POST", headers: ORG, body: JSON.stringify({ ...body, slug: "devflow-conf-2027" }),
  }));
  assert.equal(explicit.data.slug, "devflow-conf-2027-4");
  assert.equal((await json(await app.request(`/api/public/events/${SECOND_EVENT_SLUG}/cfp`))).data.id ?? SECOND_EVENT_ID, SECOND_EVENT_ID);

  // Each uniquified event is genuinely separate and reachable by its own slug.
  const own = (await json(await app.request(`/api/public/events/devflow-conf-2027-2/cfp`))).data;
  assert.equal(own.event.slug, "devflow-conf-2027-2");
  assert.notEqual(own.event.id, SECOND_EVENT_ID);

  // A brand-new name still creates cleanly with no adjustment note.
  const fresh = await json(await app.request("/api/events", {
    method: "POST", headers: ORG, body: JSON.stringify({ ...body, name: "Forward Summit 2028" }),
  }));
  assert.equal(fresh.data.slug, "forward-summit-2028");
  assert.equal(fresh.slugAdjusted, undefined, "no note when nothing was adjusted");

  // Validation is unchanged for genuinely bad input.
  assert.equal((await app.request("/api/events", { method: "POST", headers: ORG, body: JSON.stringify({ ...body, name: "  " }) })).status, 400);
  assert.equal((await app.request("/api/events", { method: "POST", headers: ORG, body: JSON.stringify({ ...body, timezone: "Mars/Olympus" }) })).status, 400);
  resetEventRegistry();
});

test("the legacy demo alias still cannot be taken by a new event", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  const made = await json(await app.request("/api/events", {
    method: "POST", headers: ORG,
    body: JSON.stringify({ name: "Sandbox", slug: "ai-engineer-sandbox-event", startsAt: "2027-05-12T16:00:00.000Z", endsAt: "2027-05-15T01:00:00.000Z" }),
  }));
  assert.equal(made.data.slug, "ai-engineer-sandbox-event-2", "the reserved alias is skipped, not rejected");
  assert.equal((await json(await app.request("/api/public/events/ai-engineer-sandbox-event/cfp"))).data.event.id, EVENT_ID);
  resetEventRegistry();
});
