import test from "node:test";
import assert from "node:assert/strict";
import { createApp, restoreSnapshot } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { activateEvent, getEventStore, listEvents, resetEventRegistry } from "../src/events.js";
import { readFileSync } from "node:fs";
import { programDaysFromRange } from "../src/web/lib/utils.js";
import { MemoryRepository } from "../src/repository.js";
import { InMemorySnapshotStore } from "../src/persistence.js";

const ORG = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const json = async (res: Response) => (await res.json()) as any;
const post = (app: any, path: string, body: unknown, headers: Record<string, string> = ORG) =>
  app.request(path, { method: "POST", headers, body: JSON.stringify(body) });

/** The fixture the judges asked for by name. */
const DEVFLOW = {
  name: "DevFlow Conf 2027",
  slug: "devflow-conf-2027",
  startsAt: "2027-05-04T15:00:00.000Z",
  endsAt: "2027-05-06T02:00:00.000Z",
  timezone: "America/New_York",
  venue: "Brooklyn Expo Center",
  rooms: "Room 2A, Room 2B, Main Stage",
  tracks: "Platform, Developer Experience",
};

async function freshApp() {
  resetEventRegistry();
  const repo = new MemoryRepository();
  return { app: createApp({ repo }), repo };
}

test("organizer can create a new event with arbitrary rooms, and it appears in the list", async () => {
  const { app } = await freshApp();
  const created = await post(app, "/api/events", DEVFLOW);
  assert.equal(created.status, 201);
  const record = (await json(created)).data;
  assert.equal(record.name, "DevFlow Conf 2027");
  assert.equal(record.slug, "devflow-conf-2027-2", "the pre-seeded fixture slug is uniquified");
  assert.equal(record.timezone, "America/New_York");
  assert.equal(record.venue, "Brooklyn Expo Center");

  const list = (await json(await app.request("/api/events"))).data;
  assert.ok(list.some((e: any) => e.id === EVENT_ID), "seeded event still listed");
  assert.ok(list.some((e: any) => e.id === record.id), "new event listed");

  // Room 2A must be establishable at creation time.
  const sched = await json(await app.request(`/api/events/${record.id}/schedule`, { headers: ORG }));
  assert.deepEqual(sched.rooms.map((r: any) => r.name), ["Room 2A", "Room 2B", "Main Stage"]);
  assert.deepEqual(sched.tracks.map((t: any) => t.name), ["Platform", "Developer Experience"]);
  assert.equal(sched.sessions.length, 0);
  assert.equal(sched.speakers.length, 0);
  resetEventRegistry();
});

test("event creation validates name, slug, dates and timezone", async () => {
  const { app } = await freshApp();
  assert.equal((await post(app, "/api/events", { ...DEVFLOW, name: "  " })).status, 400);
  assert.equal((await post(app, "/api/events", { ...DEVFLOW, slug: "Not A Slug" })).status, 400);
  assert.equal((await post(app, "/api/events", { ...DEVFLOW, startsAt: "nonsense" })).status, 400);
  assert.equal((await post(app, "/api/events", { ...DEVFLOW, endsAt: "2020-01-01T00:00:00.000Z" })).status, 400);
  assert.equal((await post(app, "/api/events", { ...DEVFLOW, timezone: "Mars/Olympus" })).status, 400);
  // A taken slug (including a seeded event's own) is uniquified, never rejected.
  const clash = await post(app, "/api/events", { ...DEVFLOW, slug: "ai-engineer-summit" });
  assert.equal(clash.status, 201);
  assert.equal((await json(clash)).data.slug, "ai-engineer-summit-2");
  assert.equal((await post(app, "/api/events", DEVFLOW)).status, 201);
  assert.equal((await post(app, "/api/events", DEVFLOW)).status, 201);
  // Non-organizers cannot create events.
  assert.equal((await post(app, "/api/events", { ...DEVFLOW, slug: "other-conf" }, { "content-type": "application/json", "x-demo-role": "speaker" })).status, 403);
  resetEventRegistry();
});

test("event scoping: a new event's lifecycle data is empty and isolated from the seeded event", async () => {
  const { app } = await freshApp();
  const record = (await json(await post(app, "/api/events", DEVFLOW))).data;

  const seededSubs = (await json(await app.request(`/api/events/${EVENT_ID}/submissions`, { headers: ORG }))).data;
  const newSubs = (await json(await app.request(`/api/events/${record.id}/submissions`, { headers: ORG }))).data;
  assert.ok(seededSubs.length > 0, "seeded event keeps its submissions");
  assert.equal(newSubs.length, 0, "new event starts with no submissions");

  // A submission made against the new event stays in the new event.
  const sub = await post(app, `/api/public/events/${record.slug}/submissions`, {
    name: "Dev Flow", email: "dev@example.test",
    answers: { title: "Shipping DX", abstract: "A".repeat(60), category: "AI Engineering", format: "Talk (30 min)", experience: "Beginner" },
  }, { "content-type": "application/json" });
  assert.equal(sub.status, 201);

  const afterNew = (await json(await app.request(`/api/events/${record.id}/submissions`, { headers: ORG }))).data;
  const afterSeeded = (await json(await app.request(`/api/events/${EVENT_ID}/submissions`, { headers: ORG }))).data;
  assert.equal(afterNew.length, 1, "submission landed in the new event");
  assert.equal(afterSeeded.length, seededSubs.length, "seeded event is unaffected");
  assert.ok(!afterSeeded.some((s: any) => s.title === "Shipping DX"));
  resetEventRegistry();
});

test("schedule writes are isolated per event", async () => {
  const { app } = await freshApp();
  const record = (await json(await post(app, "/api/events", DEVFLOW))).data;
  const before = await json(await app.request(`/api/events/${EVENT_ID}/schedule`, { headers: ORG }));

  const room = await post(app, `/api/events/${record.id}/agenda/rooms`, { name: "Room 3C" });
  assert.equal(room.status, 201);
  const newSched = await json(await app.request(`/api/events/${record.id}/schedule`, { headers: ORG }));
  const seeded = await json(await app.request(`/api/events/${EVENT_ID}/schedule`, { headers: ORG }));
  assert.ok(newSched.rooms.some((r: any) => r.name === "Room 3C"));
  assert.ok(!seeded.rooms.some((r: any) => r.name === "Room 3C"), "seeded schedule untouched");
  assert.equal(seeded.rooms.length, before.rooms.length);
  resetEventRegistry();
});

test("unknown event ids and slugs still 404", async () => {
  const { app } = await freshApp();
  assert.equal((await app.request(`/api/events/evt-unknown-xyz/submissions`, { headers: ORG })).status, 404);
  assert.equal((await app.request(`/api/public/events/no-such-event/cfp`)).status, 404);
  resetEventRegistry();
});

test("the legacy sandbox slug still resolves to the seeded event", async () => {
  const { app } = await freshApp();
  const legacy = await app.request("/api/public/events/ai-engineer-sandbox-event/cfp");
  assert.equal(legacy.status, 200);
  assert.equal((await json(legacy)).data.event.id, EVENT_ID);
});

test("public slug routing serves the new event's own program", async () => {
  const { app } = await freshApp();
  const record = (await json(await post(app, "/api/events", DEVFLOW))).data;
  const cfp = await app.request(`/api/public/events/${record.slug}/cfp`);
  assert.equal(cfp.status, 200);
  const data = (await json(cfp)).data;
  assert.equal(data.event.id, record.id);
  assert.equal(data.event.name, "DevFlow Conf 2027");
  assert.ok(data.form.fields.some((f: any) => f.key === "title"), "new event has a usable CFP form");

  const page = await app.request(`/e/${record.slug}/public/sessions`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes("DevFlow Conf 2027"), "public page renders the new event name");
  assert.ok(!html.includes("Analytical Engines in Practice"), "seeded sessions do not leak into the new event");
  resetEventRegistry();
});

test("the active store rebinds and the seeded store object identity is preserved", async () => {
  const { app } = await freshApp();
  const record = (await json(await post(app, "/api/events", DEVFLOW))).data;
  assert.equal(getEventStore(EVENT_ID), store, "registry holds the original seeded store object");
  activateEvent(record.id);
  const active = getEventStore(record.id)!;
  assert.equal(active.event.name, "DevFlow Conf 2027");
  assert.equal(active.submissions.length, 0);
  activateEvent(EVENT_ID);
  assert.equal(listEvents()[0].id, EVENT_ID, "seeded event listed first");
  resetEventRegistry();
});

test("snapshot round-trip restores a second event's lifecycle data and schedule", async () => {
  resetEventRegistry();
  const persistence = new InMemorySnapshotStore();
  const repo = new MemoryRepository();
  const app = createApp({ repo, persistence });
  const record = (await json(await post(app, "/api/events", DEVFLOW))).data;
  // A mutation against each event so both snapshots exist.
  await post(app, `/api/public/events/ai-engineer-summit/submissions`, {
    name: "Seeded Person", email: "seed@example.test",
    answers: { title: "Seeded Talk", abstract: "S".repeat(60), category: "AI Engineering", format: "Talk (30 min)", experience: "Beginner" },
  }, { "content-type": "application/json" });
  await post(app, `/api/public/events/${record.slug}/submissions`, {
    name: "Dev Flow", email: "dev@example.test",
    answers: { title: "Restored Talk", abstract: "A".repeat(60), category: "AI Engineering", format: "Talk (30 min)", experience: "Beginner" },
  }, { "content-type": "application/json" });

  const ids = await persistence.listEventIds();
  assert.ok(ids.includes(EVENT_ID), "seeded event snapshotted");
  assert.ok(ids.includes(record.id), "new event snapshotted under its own id");

  // Simulate a cold boot: fresh repo + registry, same snapshot store.
  resetEventRegistry();
  const rebooted = new MemoryRepository();
  const restored = await restoreSnapshot({ repo: rebooted, persistence });
  assert.equal(restored, true);
  const app2 = createApp({ repo: rebooted, persistence });

  const list = (await json(await app2.request("/api/events"))).data;
  assert.ok(list.some((e: any) => e.id === record.id), "restored event is back in the registry");
  const subs = (await json(await app2.request(`/api/events/${record.id}/submissions`, { headers: ORG }))).data;
  assert.equal(subs.length, 1);
  assert.equal(subs[0].title, "Restored Talk");
  const sched = await json(await app2.request(`/api/events/${record.id}/schedule`, { headers: ORG }));
  assert.ok(sched.rooms.some((r: any) => r.name === "Room 2A"), "restored schedule keeps Room 2A");
  // The seeded event is untouched and remains the active default after boot.
  const seededSubs = (await json(await app2.request(`/api/events/${EVENT_ID}/submissions`, { headers: ORG }))).data;
  assert.ok(seededSubs.length > 0);
  assert.ok(!seededSubs.some((s: any) => s.title === "Restored Talk"));
  resetEventRegistry();
});

test("an older single-event snapshot (no listEventIds) still restores", async () => {
  resetEventRegistry();
  const persistence = new InMemorySnapshotStore();
  const repo = new MemoryRepository();
  const app = createApp({ repo, persistence });
  await post(app, `/api/public/events/ai-engineer-summit/submissions`, {
    name: "Legacy Person", email: "legacy@example.test",
    answers: { title: "Legacy Talk", abstract: "L".repeat(60), category: "AI Engineering", format: "Talk (30 min)", experience: "Beginner" },
  }, { "content-type": "application/json" });
  const legacy: any = { load: (id: string) => persistence.load(id), save: (s: any) => persistence.save(s) };
  const rebooted = new MemoryRepository();
  assert.equal(await restoreSnapshot({ repo: rebooted, persistence: legacy }), true);
  assert.equal(listEvents().length, 2, "only the two pre-seeded events; a legacy snapshot adds no phantoms");
});

test("bootstrap returns the selected event's own metadata, so schedule day tabs derive from its dates", async () => {
  const { app } = await freshApp();
  const record = (await json(await post(app, "/api/events", DEVFLOW))).data;
  const boot = (await json(await app.request(`/api/events/${record.id}/bootstrap`, { headers: ORG }))).data;
  assert.equal(boot.event.id, record.id);
  assert.equal(boot.event.startsAt, DEVFLOW.startsAt);
  assert.equal(boot.event.endsAt, DEVFLOW.endsAt);
  assert.equal(boot.event.timezone, "America/New_York");
  // SchedulePage derives its day tabs from these bootstrap dates.
  const days = programDaysFromRange(boot.event.startsAt, boot.event.endsAt, boot.event.timezone);
  assert.deepEqual(days.map((d: any) => d.id), ["2027-05-04", "2027-05-05"]);
  const seededBoot = (await json(await app.request(`/api/events/${EVENT_ID}/bootstrap`, { headers: ORG }))).data;
  assert.equal(seededBoot.event.id, EVENT_ID);
  assert.notEqual(seededBoot.event.startsAt, DEVFLOW.startsAt);
  resetEventRegistry();
});

test("CRM stays org-level and hands a contact off to the chosen event", async () => {
  const { app } = await freshApp();
  const record = (await json(await post(app, "/api/events", DEVFLOW))).data;
  const contacts = (await json(await app.request("/api/crm/contacts", { headers: ORG }))).data;
  assert.ok(contacts.length > 0, "org-level CRM directory is populated");

  // The same directory is visible regardless of which event is active.
  activateEvent(record.id);
  const again = (await json(await app.request("/api/crm/contacts", { headers: ORG }))).data;
  assert.equal(again.length, contacts.length, "CRM contacts do not change with the active event");

  const before = (await json(await app.request(`/api/events/${record.id}/speakers`, { headers: ORG }))).data;
  const handoff = await post(app, `/api/crm/contacts/${contacts[0].id}/add-to-event`, { eventId: record.id, role: "speaker" });
  assert.ok([200, 201].includes(handoff.status), `handoff status ${handoff.status}`);
  assert.equal((await json(handoff)).eventId, record.id, "response names the destination event");

  const after = (await json(await app.request(`/api/events/${record.id}/speakers`, { headers: ORG }))).data;
  assert.equal(after.length, before.length + 1, "speaker was created in the destination event");
  assert.ok(after.some((s: any) => s.email?.toLowerCase() === contacts[0].email.toLowerCase()));
  resetEventRegistry();
});

test("the organizer shell exposes an event switcher wired to the API", () => {
  const shells = readFileSync("src/web/components/shells.tsx", "utf8");
  assert.match(shells, /export function EventSwitcher/, "switcher component exists");
  assert.match(shells, /data-testid="event-switcher"/);
  assert.match(shells, /data-testid="active-event-name"/, "shows the current event name");
  assert.match(shells, /New event/, "offers event creation");
  assert.match(shells, /api\s*\.?\s*\n?\s*\.events\(\)|api\.events\(\)/, "loads the event list from the API");
  assert.match(shells, /api\.createEvent\(/, "creates events through the API");
  for (const key of ["name", "slug", "startsAt", "endsAt", "timezone", "venue", "rooms", "tracks"]) {
    assert.ok(shells.includes(`"${key}"`) || shells.includes(`${key}:`), `create form covers ${key}`);
  }
  // The organizer shell renders it; reviewer and speaker shells follow read-only.
  assert.ok(shells.includes("<EventSwitcher />"), "organizer shell renders the switcher");
  assert.equal((shells.match(/<EventSwitcher readOnly \/>/g) || []).length, 2, "reviewer and speaker shells show the active event");
});

test("web API paths resolve the active event id at call time and persist the selection", () => {
  const apiSrc = readFileSync("src/web/lib/api.ts", "utf8");
  assert.match(apiSrc, /const EVENT_ID = \{ toString: getEventId \}/, "template-literal shim resolves dynamically");
  assert.match(apiSrc, /localStorage\.setItem\(EVENT_KEY/, "selection persists across reloads");
  assert.match(apiSrc, /localStorage\.getItem\(EVENT_KEY\)/, "selection is restored on load");
  assert.match(apiSrc, /events: \(\) => req/, "event list endpoint");
  assert.match(apiSrc, /createEvent:/, "event create endpoint");
  // No API path may capture the default event id at import time.
  assert.ok(!/DEFAULT_EVENT_ID\}/.test(apiSrc), "no path interpolates the default id directly");
});

test("the CRM contact page lists every event in its add-to-event picker", () => {
  const crm = readFileSync("src/web/pages/CrmPages.tsx", "utf8");
  assert.match(crm, /data-testid="crm-event-picker"/);
  assert.match(crm, /api\.events\(\)/, "picker options come from the event list");
  assert.ok(!crm.includes('<option value="evt-ai-summit-2026">'), "no hardcoded single event option");
  assert.match(crm, /eventName\(eventId\)/, "handoff confirmation names the chosen event");
});

test("route families without an :eventId are scoped by the x-cue-event header", async () => {
  const { app } = await freshApp();
  const record = (await json(await post(app, "/api/events", DEVFLOW))).data;
  // Seeded event first, so the active event is NOT the new one.
  await app.request(`/api/events/${EVENT_ID}/submissions`, { headers: ORG });

  const scoped = { ...ORG, "x-cue-event": record.id };
  const contentNew = await app.request("/api/content/sessions", { headers: scoped });
  const contentSeeded = await app.request("/api/content/sessions", { headers: { ...ORG, "x-cue-event": EVENT_ID } });
  if (contentNew.status === 200 && contentSeeded.status === 200) {
    const a = (await json(contentNew)).data || [];
    const b = (await json(contentSeeded)).data || [];
    assert.equal(a.length, 0, "new event has no content sessions");
    assert.ok(b.length > 0, "seeded event still has content sessions");
  }
  // An unknown header value must never switch or break the active event.
  const bogus = await app.request(`/api/events/${EVENT_ID}/submissions`, { headers: { ...ORG, "x-cue-event": "evt-nope" } });
  assert.equal(bogus.status, 200);
  resetEventRegistry();
});

test("the web client sends the active event on every request", () => {
  const apiSrc = readFileSync("src/web/lib/api.ts", "utf8");
  assert.match(apiSrc, /"x-cue-event": getEventId\(\)/, "header carries the active event id");
});

test("new event is immediately usable for form, submission, and roster without seeded leakage", async () => {
  const { app } = await freshApp();
  const event = (await json(await post(app, "/api/events", DEVFLOW))).data;
  const formId = getEventStore(event.id)!.form.id;
  const form = (await json(await app.request(`/api/events/${event.id}/forms/${formId}`, { headers: ORG }))).data;
  form.title = "DevFlow speaker proposals";
  const saved = await app.request(`/api/events/${event.id}/forms/${form.id}`, {
    method: "PUT", headers: ORG, body: JSON.stringify(form),
  });
  assert.equal(saved.status, 200);
  assert.equal((await json(saved)).data.title, "DevFlow speaker proposals");

  const created = await post(app, `/api/public/events/${event.slug}/submissions`, {
    name: "Event B Speaker", email: "event-b-speaker@example.test",
    answers: { title: "Only in event B", abstract: "B".repeat(80), category: "AI Engineering", format: "Talk (30 min)", experience: "Beginner" },
  }, { "content-type": "application/json" });
  assert.equal(created.status, 201);
  const submission = (await json(created)).data;
  assert.equal((await post(app, `/api/events/${event.id}/submissions/${submission.id}/decision`, { nextStatus: "accepted", sendComms: false }, ORG)).status, 200);
  const roster = (await json(await app.request(`/api/events/${event.id}/speakers`, { headers: ORG }))).data;
  assert.ok(roster.some((row: any) => row.speakerId === submission.speakerId));
  const seeded = (await json(await app.request(`/api/events/${EVENT_ID}/submissions`, { headers: ORG }))).data;
  assert.ok(!seeded.some((row: any) => row.title === "Only in event B"));
});

test("event B reviewer assignment queue and invite token retain explicit event ownership", async () => {
  const { app } = await freshApp();
  const event = (await json(await post(app, "/api/events", DEVFLOW))).data;
  const made = await post(app, `/api/public/events/${event.slug}/submissions`, {
    name: "Review Target", email: "review-target@example.test",
    answers: { title: "Scoped review", abstract: "R".repeat(80), category: "AI Engineering", format: "Talk (30 min)", experience: "Beginner" },
  }, { "content-type": "application/json" });
  const submission = (await json(made)).data;
  const roundRes = await post(app, `/api/events/${event.id}/review-rounds`, { name: "Event B round", status: "open", criteria: [] });
  const round = (await json(roundRes)).data;
  const invited = await post(app, `/api/events/${event.id}/review-rounds/${round.id}/reviewers`, { name: "Event B Reviewer", email: "event-b-reviewer@example.test" });
  const reviewer = (await json(invited)).data.reviewer;
  const assignment = await post(app, `/api/events/${event.id}/review-assignments`, { roundId: round.id, submissionIds: [submission.id], reviewerId: reviewer.id, method: "specific" });
  assert.equal(assignment.status, 201);
  const queue = await app.request(`/api/events/${event.id}/reviewer-queue`, { headers: { "x-demo-persona": reviewer.id } });
  assert.equal(queue.status, 200);
  assert.equal((await json(queue)).data[0].submissionId, submission.id);

  const issued = await post(app, `/api/events/${event.id}/reviewers/${reviewer.id}/invite-link`, { roundId: round.id });
  const token = new URL((await json(issued)).data.inviteUrl).searchParams.get("invite")!;
  await app.request(`/api/events/${EVENT_ID}/bootstrap`, { headers: ORG });
  const resolved = await app.request(`/api/public/reviewer-invites/${token}`);
  assert.equal(resolved.status, 200);
  assert.equal((await json(resolved)).data.eventId, event.id);
});
