import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";

const h = (id: string) => ({ "content-type": "application/json", "x-demo-persona": id });
const parse = async (res: Response) => ({ res, body: (await res.json()) as any });

/**
 * Item 4 regression. Editing session copy in Content used to reset the canonical
 * schedule session's publishStatus to "draft" (syncSession), silently unpublishing
 * a live session — so the edited title never reached the public catalog.
 */
test("approved session content edit reaches the public catalog immediately", async () => {
  const repo = new MemoryRepository();
  const app = createApp({ repo });

  // ses-analytical is seeded published + scheduled, and content-approved.
  const before = await parse(await app.request(`/e/ai-engineer-summit/public/feed.json`));
  const seeded = before.body.sessions.find((s: any) => s.id === "ses-analytical");
  assert.ok(seeded, "seeded published session must be publicly visible before the edit");

  const title = "UPDATED: Analytical Engines in Practice";
  const edited = await parse(
    await app.request(`/api/events/${EVENT_ID}/content/sessions/ses-analytical`, {
      method: "PATCH",
      headers: h("org-swyx"),
      body: JSON.stringify({ title, contentStatus: "approved" }),
    }),
  );
  assert.equal(edited.res.status, 200);
  assert.equal(edited.body.data.title, title);

  // Canonical schedule mirror keeps the session published.
  const schedule = await (repo as any).getSchedule(EVENT_ID);
  const mirrored = schedule.sessions.find((s: any) => s.id === "ses-analytical");
  assert.equal(mirrored.title, title);
  assert.equal(mirrored.publishStatus, "published", "an edit must never unpublish a published session");

  // Public JSON feed + HTML catalog both show the new title.
  const feed = await parse(await app.request(`/e/ai-engineer-summit/public/feed.json`));
  assert.ok(feed.body.sessions.some((s: any) => s.title === title), "public feed must show the edited title");

  const html = await app.request(`/e/ai-engineer-summit/public/sessions`);
  assert.equal(html.status, 200);
  const markup = await html.text();
  assert.ok(markup.includes(title), "public sessions HTML must show the edited title");
});

/** An edit to a published session while content is only "submitted" must not unpublish it. */
test("editing a published session without approving keeps it published", async () => {
  const repo = new MemoryRepository();
  const app = createApp({ repo });
  const title = "Analytical Engines in Practice (revised copy)";
  const res = await app.request(`/api/events/${EVENT_ID}/content/sessions/ses-analytical`, {
    method: "PATCH",
    headers: h("org-swyx"),
    body: JSON.stringify({ title, contentStatus: "submitted" }),
  });
  assert.equal(res.status, 200);
  const schedule = await (repo as any).getSchedule(EVENT_ID);
  const mirrored = schedule.sessions.find((s: any) => s.id === "ses-analytical");
  assert.equal(mirrored.publishStatus, "published");
  const feed = await parse(await app.request(`/e/ai-engineer-summit/public/feed.json`));
  assert.ok(feed.body.sessions.some((s: any) => s.title === title));
});

/** Requesting changes is the explicit way to pull a session back off the public site. */
test("changes_requested unpublishes the session from public surfaces", async () => {
  const repo = new MemoryRepository();
  const app = createApp({ repo });
  await app.request(`/api/events/${EVENT_ID}/content/sessions/ses-analytical`, {
    method: "PATCH",
    headers: h("org-swyx"),
    body: JSON.stringify({ contentStatus: "changes_requested" }),
  });
  const feed = await parse(await app.request(`/e/ai-engineer-summit/public/feed.json`));
  assert.ok(!feed.body.sessions.some((s: any) => s.id === "ses-analytical"));
});

/** Published sessions without a slot belong in the catalog (as "time TBA"), not the agenda. */
test("approved but unscheduled sessions appear in the catalog and never in the agenda/ICS", async () => {
  const repo = new MemoryRepository();
  const app = createApp({ repo });
  const schedule = await (repo as any).getSchedule(EVENT_ID);
  const unscheduled = schedule.sessions.find((s: any) => !schedule.slots.some((x: any) => x.sessionId === s.id));
  assert.ok(unscheduled, "fixture needs an unscheduled session");
  unscheduled.publishStatus = "published";
  unscheduled.status = "accepted";
  await (repo as any).putSchedule(EVENT_ID, schedule);

  const feed = await parse(await app.request(`/e/ai-engineer-summit/public/feed.json`));
  assert.ok(
    feed.body.unscheduledSessions.some((s: any) => s.id === unscheduled.id),
    "catalog feed must include published-but-unscheduled sessions",
  );
  assert.ok(!feed.body.sessions.some((s: any) => s.id === unscheduled.id), "agenda list stays slot-driven");

  const html = await (await app.request(`/e/ai-engineer-summit/public/sessions`)).text();
  assert.ok(html.includes(unscheduled.title));
  assert.ok(html.includes("Time to be announced"));

  const ics = await (await app.request(`/e/ai-engineer-summit/public/ics`)).text();
  assert.ok(!ics.includes(unscheduled.title), "unscheduled sessions must not enter the calendar feed");
});

/**
 * Item 1 regression: the speaker Deliverables page is persona scoped and populated.
 * Accepting a submission must create deliverables, and another speaker's deliverable
 * URL must be refused (404) rather than leaking data.
 */
test("accepted speakers get deliverables and the portal list is persona scoped", async () => {
  const app = createApp({ repo: new MemoryRepository() });

  // Seeded speakers already have deliverables and the API scopes them per persona.
  const ada = await parse(await app.request(`/api/speaker/events/${EVENT_ID}/deliverables`, { headers: h("spk-ada") }));
  assert.equal(ada.res.status, 200);
  assert.ok(ada.body.data.length >= 1);
  assert.ok(ada.body.data.every((t: any) => t.speakerId === "spk-ada"));
  // Rows carry everything the portal renders: session, due date, versions, constraints.
  assert.ok(ada.body.data.every((t: any) => t.dueAt && Array.isArray(t.acceptedTypes)));

  const sam = await parse(await app.request(`/api/speaker/events/${EVENT_ID}/deliverables`, { headers: h("spk-sam") }));
  assert.ok(sam.body.data.every((t: any) => t.speakerId === "spk-sam"));
  assert.ok(!sam.body.data.some((t: any) => ada.body.data.some((a: any) => a.id === t.id)));

  // Cross-persona deliverable URL is refused, never rendered with another speaker's data.
  const leak = await app.request(`/api/speaker/events/${EVENT_ID}/deliverables/${ada.body.data[0].id}`, {
    headers: h("spk-sam"),
  });
  assert.equal(leak.status, 404);

  // A newly accepted speaker gets deliverables, so /p/deliverables is never empty for them.
  const cfp = (await parse(await app.request(`/api/public/events/ai-engineer-summit/cfp`))).body.data;
  const answers: Record<string, string> = {
    title: "Incremental builds at monorepo scale",
    abstract: "A".repeat(60),
    category: cfp.categories[0],
    format: (cfp.form.fields.find((f: any) => f.key === "format")?.options || ["Talk"])[0],
  };
  for (const f of cfp.form.fields) {
    if (answers[f.key] != null) continue;
    const visible = !f.visibleWhen || answers[f.visibleWhen.key] === f.visibleWhen.equals;
    if (visible && f.required) answers[f.key] = f.options?.length ? f.options[0] : "Filled in";
  }
  const created = await parse(
    await app.request(`/api/public/events/ai-engineer-summit/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Priya Raman", email: `priya-${Date.now()}@example.test`, answers }),
    }),
  );
  assert.equal(created.res.status, 201);
  const submission = store.submissions.find((s) => s.id === created.body.data.id)!;
  const decided = await app.request(`/api/events/${EVENT_ID}/submissions/${submission.id}/decision`, {
    method: "POST",
    headers: h("org-swyx"),
    body: JSON.stringify({ nextStatus: "accepted", createTasks: true, sendComms: false }),
  });
  assert.equal(decided.status, 200);
  const speakerPersona = store.personas.find((p) => p.speakerId === submission.speakerId)!;
  assert.ok(speakerPersona, "accepted speaker must have a portal persona");
  const mine = await parse(
    await app.request(`/api/speaker/events/${EVENT_ID}/deliverables`, { headers: h(speakerPersona.id) }),
  );
  assert.equal(mine.res.status, 200);
  assert.ok(mine.body.data.length >= 2, "accepted speakers receive slide + headshot deliverables");
  assert.ok(mine.body.data.every((t: any) => t.speakerId === submission.speakerId));
  const detail = await parse(
    await app.request(`/api/speaker/events/${EVENT_ID}/deliverables/${mine.body.data[0].id}`, {
      headers: h(speakerPersona.id),
    }),
  );
  assert.equal(detail.res.status, 200);
  assert.equal(detail.body.data.speakerId, submission.speakerId);
});
