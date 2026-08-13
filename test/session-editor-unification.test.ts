import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";
import { findLinkedDraft, linkSessions, listEditableSessions, resolveSessionTarget } from "../src/sessionContent.js";

// Jordan Alvarez is the organizer the content fixtures attribute history to;
// swyx is now the DEFAULT organizer (org-swyx), so name this persona explicitly.
const H = { "content-type": "application/json", "x-demo-persona": "org-jordan" };
const json = async (res: Response) => (await res.json()) as any;
const patch = (app: any, path: string, body: unknown) =>
  app.request(path, { method: "PATCH", headers: H, body: JSON.stringify(body) });
const post = (app: any, path: string, body: unknown) =>
  app.request(path, { method: "POST", headers: H, body: JSON.stringify(body) });
const content = async (app: any) => (await json(await app.request(`/api/events/${EVENT_ID}/content`, { headers: H }))).data;
const schedule = async (app: any) => await json(await app.request(`/api/events/${EVENT_ID}/schedule`));
const feed = async (app: any) => await json(await app.request(`/e/ai-engineer-summit/public/feed.json`));
const html = async (app: any) => await (await app.request(`/e/ai-engineer-summit/public/sessions`)).text();

/** Every canonical schedule session must be editable, including schedule-only rows. */
test("content editor exposes every canonical schedule session with history", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const sched = await schedule(app);
  const rows = (await content(app)).sessions;
  for (const s of sched.sessions) {
    const row = rows.find((r: any) => r.canonicalId === s.id);
    assert.ok(row, `${s.id} ("${s.title}") must be editable in Content`);
    assert.equal(row.origin, "schedule");
    assert.ok(Array.isArray(row.history), "history ships with the list payload, before any save");
  }
  // Seeded lifecycle drafts are linked, not duplicated: "Shipping AI Products Without
  // Regret" (ses-margaret) resolves onto canonical ses-product.
  const product = rows.find((r: any) => r.canonicalId === "ses-product");
  assert.equal(product.lifecycleId, "ses-margaret");
  assert.ok(!rows.some((r: any) => r.canonicalId === "ses-margaret"), "no orphan duplicate row");
  assert.ok(resolveSessionTarget(store, sched, "ses-margaret")?.canonicalId === "ses-product");
});

/** (1) Content path → canonical schedule + public HTML + public JSON. */
test("title edited through Content updates canonical schedule, public HTML and JSON", async () => {
  const repo = new MemoryRepository();
  const app = createApp({ repo });
  const title = "UPDATED: Analytical Engines in Practice";
  const saved = await json(await patch(app, `/api/events/${EVENT_ID}/content/sessions/ses-analytical`, { title, contentStatus: "approved" }));
  assert.equal(saved.data.title, title);
  assert.equal(saved.data.propagated, true);

  const sched = await (repo as any).getSchedule(EVENT_ID);
  assert.equal(sched.sessions.find((s: any) => s.id === "ses-analytical").title, title);
  assert.ok((await feed(app)).sessions.some((s: any) => s.title === title), "public JSON");
  assert.match(await html(app), new RegExp(title.replace(/[:]/g, ":")), "public HTML");
});

/** The previously silent no-op: a lifecycle-only id now propagates to its canonical twin. */
test("editing a lifecycle-linked session propagates instead of silently no-oping", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const title = "Shipping AI Products, Revisited";
  const saved = await json(await patch(app, `/api/events/${EVENT_ID}/content/sessions/ses-margaret`, { title }));
  assert.equal(saved.data.canonicalId, "ses-product");
  assert.equal(saved.data.propagated, true);
  assert.ok((await feed(app)).sessions.some((s: any) => s.title === title), "public catalog is no longer stale");
  assert.equal(store.sessions.find((s) => s.id === "ses-margaret")!.title, title, "lifecycle draft stays in step");
});

/** (2) Schedule API path → Content/canonical/public + history. */
test("title edited through the schedule session API reaches Content, public and history", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const title = "Advanced Agents Workshop (v2)";
  const res = await patch(app, `/api/events/${EVENT_ID}/schedule/sessions/ses-workshop`, { title });
  assert.equal(res.status, 200);

  const row = (await content(app)).sessions.find((r: any) => r.canonicalId === "ses-workshop");
  assert.equal(row.title, title, "Content editor shows the schedule-side edit");
  assert.equal(row.history.length, 1, "schedule edits are recorded in the shared history");
  assert.equal(row.history[0].before.title, "Advanced Agents Workshop");
  assert.equal(row.history[0].after.title, title);
  assert.ok((await feed(app)).sessions.some((s: any) => s.title === title));
});

/**
 * Every save request that carries editable fields gets its own timestamped entry (the
 * organizer needs one restore point per save); approval-only patches record nothing.
 */
test("each field-bearing save records its own entry; approval-only saves record none", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const before = (await content(app)).sessions.find((r: any) => r.canonicalId === "ses-analytical");

  // Two rapid successive saves → two distinct, individually restorable entries.
  await patch(app, `/api/events/${EVENT_ID}/content/sessions/ses-analytical`, { title: "First save", abstract: before.abstract });
  await patch(app, `/api/events/${EVENT_ID}/content/sessions/ses-analytical`, { title: "Second save", abstract: before.abstract });
  const twoSaves = (await content(app)).sessions.find((r: any) => r.canonicalId === "ses-analytical");
  const added = twoSaves.history.slice(before.history.length);
  assert.equal(added.length, 2, "two saves must produce two history entries");
  assert.deepEqual(added.map((h: any) => h.after.title), ["First save", "Second save"]);
  assert.ok(
    new Date(added[1].createdAt).getTime() > new Date(added[0].createdAt).getTime(),
    "rapid successive saves still get strictly increasing timestamps",
  );
  assert.equal(new Set(added.map((h: any) => h.id)).size, 2, "entry ids are distinct");

  // A re-save with identical values is still a save (own entry), flagged as no-change.
  await patch(app, `/api/events/${EVENT_ID}/content/sessions/ses-analytical`, { title: "Second save" });
  const resaved = (await content(app)).sessions.find((r: any) => r.canonicalId === "ses-analytical");
  assert.equal(resaved.history.length, twoSaves.history.length + 1);
  assert.equal(resaved.history.at(-1).noChange, true);

  // Approval-only changes leave the edit history untouched.
  await patch(app, `/api/events/${EVENT_ID}/content/sessions/ses-analytical`, { contentStatus: "submitted" });
  assert.equal(
    (await content(app)).sessions.find((r: any) => r.canonicalId === "ses-analytical").history.length,
    resaved.history.length,
    "approval-only patches record no edit history",
  );
});

/** (3) Runtime-created schedule session: editable, approvable, publishable, revocable. */
test("runtime-created session is editable in Content and approval gates its publication", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const created = await json(
    await post(app, `/api/events/${EVENT_ID}/schedule/sessions`, {
      title: "Docs that survive contact with users",
      abstract: "Runtime session created in the schedule builder.",
      speakerIds: ["spk-ada"],
      durationMinutes: 45,
    }),
  );
  const id = created.data.id;
  assert.match(id, /^session-/);

  // Visible in the Content editor without any lifecycle submission.
  const row = (await content(app)).sessions.find((r: any) => r.canonicalId === id);
  assert.ok(row, "runtime-created session must appear in Content");
  assert.equal(row.lifecycleId, undefined, "no fake lifecycle submission was invented");
  assert.equal(row.contentStatus, "draft");
  assert.ok(!store.sessions.some((s) => s.id === id), "lifecycle store is untouched");

  // Title + abstract edit through Content.
  await patch(app, `/api/events/${EVENT_ID}/content/sessions/${id}`, {
    title: "Docs that survive contact with users (final)",
    abstract: "Now with a live demo.",
  });

  // Not public until approved, and it needs a slot to reach the agenda.
  const sched = await schedule(app);
  await post(app, `/api/events/${EVENT_ID}/schedule/move`, {
    slot: { id: `slot-${id}`, sessionId: id, roomId: "room-main", startsAt: "2026-10-14T18:00:00.000Z", endsAt: "2026-10-14T18:45:00.000Z" },
    version: sched.version,
    acknowledge: [],
  });
  assert.ok(!(await feed(app)).sessions.some((s: any) => s.id === id), "unapproved stays private");

  await patch(app, `/api/events/${EVENT_ID}/content/sessions/${id}`, { contentStatus: "approved" });
  const published = (await feed(app)).sessions.find((s: any) => s.id === id);
  assert.ok(published, "approved runtime session is public");
  assert.equal(published.title, "Docs that survive contact with users (final)");
  assert.match(await html(app), /Docs that survive contact with users \(final\)/);

  // Moving away from approved hides it again.
  await patch(app, `/api/events/${EVENT_ID}/content/sessions/${id}`, { contentStatus: "changes_requested" });
  assert.ok(!(await feed(app)).sessions.some((s: any) => s.id === id), "changes_requested is not public");
  await patch(app, `/api/events/${EVENT_ID}/content/sessions/${id}`, { contentStatus: "draft" });
  assert.ok(!(await feed(app)).sessions.some((s: any) => s.id === id), "draft is not public");
  // Re-approving restores publication.
  await patch(app, `/api/events/${EVENT_ID}/content/sessions/${id}`, { contentStatus: "approved" });
  assert.ok((await feed(app)).sessions.some((s: any) => s.id === id));
});

/** Seeded accepted+published sessions keep their publication when merely re-saved. */
test("approval changes do not unpublish sessions published through the normal flow", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  await patch(app, `/api/events/${EVENT_ID}/content/sessions/ses-analytical`, { contentStatus: "submitted", title: "Analytical Engines in Practice v2" });
  const row = (await feed(app)).sessions.find((s: any) => s.id === "ses-analytical");
  assert.ok(row, "a seeded published session stays public when content is merely submitted");
  assert.equal(row.title, "Analytical Engines in Practice v2");
});

/** (4) History spans both paths and restore rewrites canonical + public data. */
test("history covers both edit paths and restore updates canonical and public data", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  // The lifecycle store is module-global across tests, so work from a baseline delta.
  const baseline = (await content(app)).sessions.find((r: any) => r.canonicalId === "ses-workshop");
  const original = baseline.title;
  await patch(app, `/api/events/${EVENT_ID}/schedule/sessions/ses-workshop`, { title: "Renamed via schedule" });
  await patch(app, `/api/events/${EVENT_ID}/content/sessions/ses-workshop`, { title: "Renamed via content", abstract: "Second edit." });

  const row = (await content(app)).sessions.find((r: any) => r.canonicalId === "ses-workshop");
  const added = row.history.slice(baseline.history.length);
  assert.equal(added.length, 2, "both surfaces write to one history");
  assert.deepEqual(
    added.map((h: any) => h.after.title),
    ["Renamed via schedule", "Renamed via content"],
  );
  assert.equal(added[0].before.title, original, "schedule edit captured the prior title");
  assert.ok(added.every((h: any) => h.editorName === "Jordan Alvarez"));

  // Restore the schedule-path entry → back to the original title, canonically + publicly.
  const restored = await post(app, `/api/events/${EVENT_ID}/content/history/${added[0].id}/restore`, {});
  assert.equal(restored.status, 200);
  const sched = await schedule(app);
  assert.equal(sched.sessions.find((s: any) => s.id === "ses-workshop").title, original);
  assert.ok((await feed(app)).sessions.some((s: any) => s.title === original));
  assert.ok((await html(app)).includes(original));
  const afterRestore = (await content(app)).sessions.find((r: any) => r.canonicalId === "ses-workshop");
  assert.equal(afterRestore.title, original);
  assert.equal(afterRestore.history.length, row.history.length + 1, "the restore itself is recorded");
});

/** Deep link contract used by the Schedule → Full editor handoff. */
test("schedule page links to the content editor with a URL-encoded canonical id", () => {
  const page = readFileSync(new URL("../src/web/pages/SchedulePage.tsx", import.meta.url), "utf8");
  const links = page.match(/\/app\/content\?session=\$\{encodeURIComponent\([^)]+\)\}/g) || [];
  assert.ok(links.length >= 2, "unscheduled pool and scheduled cards both hand off");
  const contentPage = readFileSync(new URL("../src/web/pages/ContentPages.tsx", import.meta.url), "utf8");
  assert.match(contentPage, /params\.get\("session"\)/, "Content consumes the query parameter");
  assert.match(contentPage, /next\.delete\("session"\)/, "and clears it so navigation cannot loop");
});

/** (5) Settings uses the shared timeout/retry loader rather than a bare spinner. */
test("settings page renders a timed retry state instead of a permanent spinner", () => {
  const page = readFileSync(new URL("../src/web/pages/PublishFormsSettings.tsx", import.meta.url), "utf8");
  const settings = page.slice(page.indexOf("export function SettingsPage"));
  assert.match(settings, /useAsyncData\(/, "settings adopts the shared loader");
  assert.match(settings, /<LoadState/, "and renders the retry state");
  assert.match(settings, /onRetry=\{settings\.reload\}/);
  assert.ok(!/if \(!event\) return <Spinner \/>/.test(settings), "the unrecoverable spinner is gone");
});

/** Editable-session projection is pure and stable outside the HTTP layer. */
test("listEditableSessions is a pure union of canonical sessions and orphan drafts", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const sched = await schedule(app);
  const rows = listEditableSessions(store, sched);
  assert.equal(rows.filter((r) => r.origin === "schedule").length, sched.sessions.length);
  assert.ok(rows.every((r) => typeof r.canonicalId === "string" && Array.isArray(r.history)));
  assert.equal(listEditableSessions(store, undefined).every((r) => r.origin === "lifecycle"), true);
});

/**
 * Follow-up hardening (1): draft↔session matching is global, one-to-one and
 * order-independent. Ambiguous same-speaker candidates must stay unlinked rather than
 * attaching to whichever session happened to be visited first.
 */
test("linking never reuses a draft and leaves ambiguous same-speaker matches unlinked", () => {
  const drafts: any[] = [
    { id: "draft-a", submissionId: "sub-a", speakerId: "spk-ada", title: "Ada Talk One", abstract: "", status: "draft", trackId: "track-eng" },
    { id: "draft-b", submissionId: "sub-b", speakerId: "spk-ada", title: "Ada Talk Two", abstract: "", status: "draft", trackId: "track-eng" },
  ];
  const localStore: any = { sessions: drafts, sessionContent: [], contentHistory: [] };
  // Two canonical sessions by the same speaker, neither carrying an accepted submission
  // and neither title matching a draft: nothing may be linked (ambiguous both ways).
  const ambiguous: any = {
    version: 1,
    rooms: [],
    tracks: [],
    speakers: [{ id: "spk-ada", name: "Ada Lovelace", bio: "" }],
    slots: [],
    sessions: [
      { id: "session-1", title: "Untitled One", abstract: "", speakerIds: ["spk-ada"], trackIds: [], durationMinutes: 45, status: "accepted", publishStatus: "draft", slug: "s1" },
      { id: "session-2", title: "Untitled Two", abstract: "", speakerIds: ["spk-ada"], trackIds: [], durationMinutes: 45, status: "accepted", publishStatus: "draft", slug: "s2" },
    ],
  };
  const ambiguousLinks = linkSessions(localStore, ambiguous);
  assert.equal(ambiguousLinks.links.get("session-1"), undefined, "ambiguous candidates stay unlinked");
  assert.equal(ambiguousLinks.links.get("session-2"), undefined);
  assert.equal(ambiguousLinks.orphanDrafts.length, 2, "both drafts remain orphans");

  // Mutual uniqueness on BOTH sides (one session, one candidate draft) does link.
  const oneDraftStore: any = { sessions: [drafts[0]], sessionContent: [], contentHistory: [] };
  const single = { ...ambiguous, sessions: [ambiguous.sessions[0]] };
  assert.equal(
    linkSessions(oneDraftStore, single).links.get("session-1")?.id,
    "draft-a",
    "a mutually unique same-speaker match links",
  );
  // Two candidate drafts for one session is ambiguous from the draft side → unlinked.
  assert.equal(linkSessions(localStore, single).links.get("session-1"), undefined);

  // Title matching resolves a draft to exactly one session, never to two.
  const titled = {
    ...ambiguous,
    sessions: [
      { ...ambiguous.sessions[0], title: "Ada Talk One" },
      { ...ambiguous.sessions[1], title: "Ada Talk One" },
    ],
  };
  const titledLinks = linkSessions(localStore, titled);
  const claimed = [...titledLinks.links.values()].filter(Boolean);
  assert.equal(claimed.length, 0, "one title matching two sessions is ambiguous, not first-come");

  // A draft is never handed to two sessions.
  const shared = {
    ...ambiguous,
    sessions: [
      { ...ambiguous.sessions[0], id: "session-x", acceptedSubmissionId: "sub-a" },
      { ...ambiguous.sessions[1], id: "session-y", acceptedSubmissionId: "sub-a" },
    ],
  };
  const sharedLinks = linkSessions(localStore, shared);
  const ids = [...sharedLinks.links.values()].filter(Boolean).map((d: any) => d.id);
  assert.equal(new Set(ids).size, ids.length, "no draft is reused across sessions");
});

/** Matching is order-independent and preserves the seeded ses-margaret → ses-product link. */
test("global matching is order-independent and keeps the seeded margaret→product mapping", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const sched = await schedule(app);
  const forward = linkSessions(store, sched);
  const reversed = linkSessions(store, { ...sched, sessions: [...sched.sessions].reverse() });
  const asPairs = (m: Map<string, any>) =>
    [...m.entries()].map(([k, v]) => `${k}:${v?.id ?? "-"}`).sort();
  assert.deepEqual(asPairs(forward.links), asPairs(reversed.links), "visit order must not change the mapping");
  assert.equal(forward.links.get("ses-product")?.id, "ses-margaret", "seeded compatibility preserved");
  assert.equal(reversed.links.get("ses-product")?.id, "ses-margaret");
  // findLinkedDraft agrees with the global mapping when given the schedule.
  const product = sched.sessions.find((s: any) => s.id === "ses-product");
  assert.equal(findLinkedDraft(store, product, sched)?.id, "ses-margaret");
  const drafts = [...forward.links.values()].filter(Boolean).map((d: any) => d.id);
  assert.equal(new Set(drafts).size, drafts.length, "one-to-one across the whole event");
});

/**
 * Follow-up hardening (2): a rejected patch is atomic — no canonical, lifecycle or
 * history side effects survive a 400.
 */
test("an invalid speaker edit rejects atomically without mutating title or history", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const before = (await content(app)).sessions.find((r: any) => r.canonicalId === "ses-analytical");
  const draftBefore = store.sessions.find((s) => s.id === "ses-analytical")!;
  const draftTitleBefore = draftBefore.title;

  const res = await patch(app, `/api/events/${EVENT_ID}/content/sessions/ses-analytical`, {
    title: "Should not be applied",
    abstract: "Neither should this",
    speakerIds: ["spk-does-not-exist"],
  });
  assert.equal(res.status, 400);
  assert.match((await json(res)).error.message, /valid speakers are required/);

  const after = (await content(app)).sessions.find((r: any) => r.canonicalId === "ses-analytical");
  assert.equal(after.title, before.title, "canonical title unchanged");
  assert.equal(after.abstract, before.abstract, "canonical abstract unchanged");
  assert.equal(after.history.length, before.history.length, "no history entry for a rejected patch");
  assert.equal(store.sessions.find((s) => s.id === "ses-analytical")!.title, draftTitleBefore, "lifecycle draft unchanged");

  // Same guarantee through the schedule surface.
  const viaSchedule = await patch(app, `/api/events/${EVENT_ID}/schedule/sessions/ses-analytical`, {
    title: "Also not applied",
    speakerIds: [],
  });
  assert.equal(viaSchedule.status, 400);
  const afterSchedule = (await content(app)).sessions.find((r: any) => r.canonicalId === "ses-analytical");
  assert.equal(afterSchedule.title, before.title);
  assert.equal(afterSchedule.history.length, before.history.length);
});

/** Other rejectable inputs are validated up front too. */
test("invalid approval status, empty title and bad duration reject without side effects", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const before = (await content(app)).sessions.find((r: any) => r.canonicalId === "ses-workshop");

  for (const [patchBody, expected] of [
    [{ title: "Nope", contentStatus: "banana" }, /invalid approval status/],
    [{ title: "" }, /title cannot be empty/],
    [{ title: "Nope", durationMinutes: 0 }, /positive number of minutes/],
  ] as const) {
    const res = await patch(app, `/api/events/${EVENT_ID}/schedule/sessions/ses-workshop`, patchBody);
    assert.equal(res.status, 400, `${JSON.stringify(patchBody)} must be refused`);
    assert.match((await json(res)).error.message, expected);
  }

  const after = (await content(app)).sessions.find((r: any) => r.canonicalId === "ses-workshop");
  assert.equal(after.title, before.title);
  assert.equal(after.contentStatus, before.contentStatus);
  assert.equal(after.history.length, before.history.length);
});
