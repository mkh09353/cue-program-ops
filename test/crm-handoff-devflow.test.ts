import test from "node:test";
import assert from "node:assert/strict";
import { createApp, restoreSnapshot } from "../src/app.js";
import { EVENT_ID } from "../src/lifecycle.js";
import { SECOND_EVENT_ID, resetEventRegistry } from "../src/events.js";
import { MemoryRepository } from "../src/repository.js";
import { InMemorySnapshotStore } from "../src/persistence.js";

const ORG = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const json = async (r: Response) => (await r.json()) as any;
/** The web client sends x-cue-event; mirror it so scoping matches the browser. */
const inEvent = (eventId: string) => ({ ...ORG, "x-cue-event": eventId });
const boot = () => {
  resetEventRegistry();
  return createApp({ repo: new MemoryRepository() });
};
const pickContact = async (app: any) => {
  const contacts = (await json(await app.request("/api/crm/contacts", { headers: ORG }))).data;
  return contacts.find((c: any) => /marcus/i.test(c.name)) || contacts[0];
};

test("CRM-10: pushing a contact to the pre-seeded DevFlow event lands in DevFlow", async () => {
  const app = boot();
  const contact = await pickContact(app);
  assert.ok(contact, "the seeded CRM has contacts");

  const added = await app.request(`/api/crm/contacts/${contact.id}/add-to-event`, {
    method: "POST", headers: ORG, body: JSON.stringify({ eventId: SECOND_EVENT_ID, role: "speaker" }),
  });
  assert.ok([200, 201].includes(added.status), `handoff succeeded (${added.status})`);
  const response = await json(added);
  const speakerId = response.data.speakerId;
  assert.ok(speakerId, "a speaker id was returned");
  assert.equal(response.eventId, SECOND_EVENT_ID, "the response names the requested event");

  // (a) contact event history records DevFlow, with DevFlow's own name.
  const after = (await json(await app.request(`/api/crm/contacts/${contact.id}`, { headers: ORG }))).data;
  const entry = after.eventHistory.find((e: any) => e.eventId === SECOND_EVENT_ID && e.speakerId === speakerId);
  assert.ok(entry, "the handoff is recorded in the contact history");
  assert.equal(entry.eventId, SECOND_EVENT_ID);
  assert.equal(entry.eventName, "DevFlow Conf 2027", "history names the target event, not the active one");
  assert.ok(
    !after.eventHistory.some((e: any) => e.speakerId === speakerId && e.eventId === EVENT_ID),
    "no duplicate entry against the seeded event",
  );

  // (b) the DevFlow roster loads and lists the new speaker.
  const roster = await app.request(`/api/events/${SECOND_EVENT_ID}/speakers`, { headers: inEvent(SECOND_EVENT_ID) });
  assert.equal(roster.status, 200, "the DevFlow roster resolves (no 'event not found')");
  const rows = (await json(roster)).data;
  assert.ok(rows.some((r: any) => r.speakerId === speakerId), "the speaker is on the DevFlow roster");

  // (c) the detail page loads under the DevFlow context, and only there.
  const detail = await app.request(`/api/events/${SECOND_EVENT_ID}/speakers/${speakerId}`, { headers: inEvent(SECOND_EVENT_ID) });
  assert.equal(detail.status, 200, "speaker detail loads in the DevFlow context");
  assert.equal((await json(detail)).data.name, contact.name);
  assert.equal(
    (await app.request(`/api/events/${EVENT_ID}/speakers/${speakerId}`, { headers: inEvent(EVENT_ID) })).status,
    404,
    "and is correctly absent from the seeded event",
  );

  // The seeded event's roster is untouched by the handoff.
  const seeded = (await json(await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: inEvent(EVENT_ID) }))).data;
  assert.ok(!seeded.some((r: any) => r.speakerId === speakerId), "no speaker leaked into AI Engineer Summit");
  resetEventRegistry();
});

test("CRM-10: the same handoff works for a runtime-created event", async () => {
  const app = boot();
  const created = (await json(await app.request("/api/events", {
    method: "POST", headers: ORG,
    body: JSON.stringify({ name: "Runtime Handoff Conf", startsAt: "2027-09-01T16:00:00.000Z", endsAt: "2027-09-02T02:00:00.000Z" }),
  }))).data;
  const contact = await pickContact(app);

  const response = await json(await app.request(`/api/crm/contacts/${contact.id}/add-to-event`, {
    method: "POST", headers: ORG, body: JSON.stringify({ eventId: created.id, role: "speaker" }),
  }));
  const speakerId = response.data.speakerId;
  assert.equal(response.eventId, created.id);

  const history = (await json(await app.request(`/api/crm/contacts/${contact.id}`, { headers: ORG }))).data.eventHistory;
  const entry = history.find((e: any) => e.eventId === created.id && e.speakerId === speakerId);
  assert.equal(entry.eventId, created.id);
  assert.equal(entry.eventName, "Runtime Handoff Conf");

  const rows = (await json(await app.request(`/api/events/${created.id}/speakers`, { headers: inEvent(created.id) }))).data;
  assert.ok(rows.some((r: any) => r.speakerId === speakerId), "roster lists the speaker");
  assert.equal(
    (await app.request(`/api/events/${created.id}/speakers/${speakerId}`, { headers: inEvent(created.id) })).status,
    200,
    "detail loads in the runtime event",
  );
  resetEventRegistry();
});

test("CRM-10 root cause: an unresolvable target event fails instead of retargeting", async () => {
  const app = boot();
  const contact = await pickContact(app);
  const before = (await json(await app.request(`/api/crm/contacts/${contact.id}`, { headers: ORG }))).data.eventHistory.length;

  const ghost = await app.request(`/api/crm/contacts/${contact.id}/add-to-event`, {
    method: "POST", headers: ORG, body: JSON.stringify({ eventId: "evt-does-not-exist", role: "speaker" }),
  });
  assert.equal(ghost.status, 404, "an unknown target event is rejected");
  assert.match((await json(ghost)).error.message, /event not found/i);

  const after = (await json(await app.request(`/api/crm/contacts/${contact.id}`, { headers: ORG }))).data;
  assert.equal(after.eventHistory.length, before, "nothing was written for the failed handoff");
  assert.ok(
    !after.eventHistory.some((e: any) => e.eventId === "evt-does-not-exist"),
    "and no phantom history entry names the unresolvable event",
  );

  // The reviewer branch is guarded too.
  assert.equal(
    (await app.request(`/api/crm/contacts/${contact.id}/add-to-event`, {
      method: "POST", headers: ORG, body: JSON.stringify({ eventId: "evt-does-not-exist", role: "reviewer" }),
    })).status,
    404,
  );
  resetEventRegistry();
});

test("CRM-10: the handoff still works after a cold restart from snapshots", async () => {
  resetEventRegistry();
  const persistence = new InMemorySnapshotStore();
  const first = createApp({ repo: new MemoryRepository(), persistence });
  await first.request(`/api/events/${EVENT_ID}/speakers`, {
    method: "POST", headers: ORG, body: JSON.stringify({ name: "Snapshot Warmup", email: "warmup@example.test" }),
  });

  // Cold boot: fresh repo and registry, restored from the snapshot store.
  resetEventRegistry();
  const repo = new MemoryRepository();
  assert.equal(await restoreSnapshot({ repo, persistence }), true);
  const app = createApp({ repo, persistence });

  const contact = await pickContact(app);
  const response = await json(await app.request(`/api/crm/contacts/${contact.id}/add-to-event`, {
    method: "POST", headers: ORG, body: JSON.stringify({ eventId: SECOND_EVENT_ID, role: "speaker" }),
  }));
  const speakerId = response.data.speakerId;
  assert.equal(response.eventId, SECOND_EVENT_ID);

  const rows = (await json(await app.request(`/api/events/${SECOND_EVENT_ID}/speakers`, { headers: inEvent(SECOND_EVENT_ID) }))).data;
  assert.ok(rows.some((r: any) => r.speakerId === speakerId), "roster lists the speaker after a restart");
  const history = (await json(await app.request(`/api/crm/contacts/${contact.id}`, { headers: ORG }))).data.eventHistory;
  assert.equal(history.find((e: any) => e.eventId === SECOND_EVENT_ID && e.speakerId === speakerId).eventName, "DevFlow Conf 2027");
  resetEventRegistry();
});
