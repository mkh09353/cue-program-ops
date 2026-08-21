import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp, restoreSnapshot } from "../src/app.js";
import { EVENT_ID, EVENT_SLUG, store, type LifecycleStore } from "../src/lifecycle.js";
import { resetEventRegistry } from "../src/events.js";
import { MemoryRepository } from "../src/repository.js";
import type { CompetitionSnapshot, SnapshotPersistence } from "../src/persistence.js";

const jsonHeaders = { "content-type": "application/json" };
const org = { ...jsonHeaders, "x-demo-persona": "org-swyx" };
const speaker = { ...jsonHeaders, "x-demo-persona": "spk-sam", "x-demo-role": "speaker" };
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as any });

const cfpBody = (email: string, title: string) => ({
  name: "Priya Raman",
  email,
  answers: {
    title,
    abstract: "Detailed abstract for the organizer delete harness.",
    category: "Platform & Infra",
    format: "Talk (30 min)",
    experience: "advanced",
    key_takeaway: "A practical framework",
    audience_level: "Intermediate",
  },
});

async function withStore<T>(fn: () => Promise<T>): Promise<T> {
  const original = structuredClone(store);
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(original) as (keyof LifecycleStore)[]) {
      (store as any)[key] = structuredClone(original[key]);
    }
    resetEventRegistry();
  }
}

test("unauthenticated DELETE submissions returns 401", async () => {
  const app = createApp({ repo: new MemoryRepository(), demoPersonaHeaders: false });
  const res = await json(await app.request(`/api/events/${EVENT_ID}/submissions/sub-lin`, { method: "DELETE" }));
  assert.equal(res.status, 401);
  assert.equal(res.body.error?.code, "UNAUTHORIZED");
  assert.match(String(res.body.error?.message || ""), /authentication required/i);
});

test("speaker DELETE submissions returns 403", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const res = await json(
    await app.request(`/api/events/${EVENT_ID}/submissions/sub-lin`, { method: "DELETE", headers: speaker }),
  );
  assert.equal(res.status, 403);
  assert.equal(res.body.error?.code, "FORBIDDEN");
  assert.match(String(res.body.error?.message || ""), /organizer role required/i);
});

test("plain delete removes the row and its reviews/assignments without touching siblings", async () => {
  await withStore(async () => {
    const repo = new MemoryRepository();
    const app = createApp({ repo });
    const email = `delete-${crypto.randomUUID()}@example.test`;
    const created = await json(
      await app.request(`/api/public/events/${EVENT_SLUG}/submissions`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(cfpBody(email, "Delete Me Talk")),
      }),
    );
    assert.equal(created.status, 201);
    const id = created.body.data.id;
    assert.ok(store.reviews.some((r) => r.submissionId === id), "CFP submit seeds an empty scorecard");

    const assigned = await json(
      await app.request(`/api/events/${EVENT_ID}/review-assignments`, {
        method: "POST",
        headers: org,
        body: JSON.stringify({
          roundId: "round-initial",
          reviewerId: "rev-ada",
          submissionIds: [id],
          method: "specific",
        }),
      }),
    );
    assert.equal(assigned.status, 201);
    assert.equal(assigned.body.data.length, 1);

    const beforeSubs = store.submissions.filter((s) => s.id !== id).map((s) => s.id).sort();
    const beforeSpeakers = store.personas.filter((p) => p.role === "speaker").map((p) => p.id).sort();
    const beforeSchedule = structuredClone((await repo.getSchedule(EVENT_ID))!);
    const siblingReviews = store.reviews.filter((r) => r.submissionId !== id).map((r) => r.id).sort();
    const siblingAssignments = store.reviewAssignments.filter((a) => a.submissionId !== id).map((a) => a.id).sort();

    const deleted = await json(
      await app.request(`/api/events/${EVENT_ID}/submissions/${id}`, {
        method: "DELETE",
        headers: org,
        body: JSON.stringify({}),
      }),
    );
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
    assert.equal(deleted.body.data.id, id);
    assert.ok(deleted.body.data.removed.reviews.length >= 1);
    assert.ok(deleted.body.data.removed.assignments.length >= 1);
    assert.equal(deleted.body.data.removed.sessionId, undefined);

    assert.equal(store.submissions.find((s) => s.id === id), undefined);
    assert.equal(store.reviews.filter((r) => r.submissionId === id).length, 0);
    assert.equal(store.reviewAssignments.filter((a) => a.submissionId === id).length, 0);
    assert.deepEqual(store.submissions.map((s) => s.id).sort(), beforeSubs);
    assert.deepEqual(
      store.reviews.filter((r) => r.submissionId !== id).map((r) => r.id).sort(),
      siblingReviews,
    );
    assert.deepEqual(
      store.reviewAssignments.filter((a) => a.submissionId !== id).map((a) => a.id).sort(),
      siblingAssignments,
    );
    assert.deepEqual(store.personas.filter((p) => p.role === "speaker").map((p) => p.id).sort(), beforeSpeakers);
    const afterSchedule = (await repo.getSchedule(EVENT_ID))!;
    assert.deepEqual(afterSchedule.sessions.map((s) => s.id).sort(), beforeSchedule.sessions.map((s) => s.id).sort());
    assert.deepEqual(afterSchedule.speakers.map((s) => s.id).sort(), beforeSchedule.speakers.map((s) => s.id).sort());

    const missing = await json(await app.request(`/api/events/${EVENT_ID}/submissions/${id}`, { headers: org }));
    assert.equal(missing.status, 404);
  });
});

test("accepted submission with a mirrored session requires force; force detaches the unpublished session only", async () => {
  await withStore(async () => {
    const repo = new MemoryRepository();
    const app = createApp({ repo });
    const email = `accept-delete-${crypto.randomUUID()}@example.test`;
    const created = await json(
      await app.request(`/api/public/events/${EVENT_SLUG}/submissions`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(cfpBody(email, "Accept Then Delete")),
      }),
    );
    assert.equal(created.status, 201);
    const id = created.body.data.id;
    const speakerId = created.body.data.speakerId;

    const accepted = await json(
      await app.request(`/api/events/${EVENT_ID}/submissions/${id}/decision`, {
        method: "POST",
        headers: org,
        body: JSON.stringify({ nextStatus: "accepted", sendComms: false }),
      }),
    );
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    const schedule = (await repo.getSchedule(EVENT_ID))!;
    const mirrored = schedule.sessions.find((s) => s.acceptedSubmissionId === id);
    assert.ok(mirrored, "accept mirrors an unpublished schedule session");
    assert.equal(mirrored.publishStatus, "draft");
    const speakerStillThere = schedule.speakers.some((s) => s.id === speakerId);
    assert.equal(speakerStillThere, true);
    const otherSessionIds = schedule.sessions.filter((s) => s.id !== mirrored.id).map((s) => s.id).sort();
    const otherSpeakerIds = schedule.speakers.map((s) => s.id).sort();

    const refused = await json(
      await app.request(`/api/events/${EVENT_ID}/submissions/${id}`, {
        method: "DELETE",
        headers: org,
        body: JSON.stringify({}),
      }),
    );
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error?.code, "CONFLICT");
    assert.match(String(refused.body.error?.message || ""), /force:true/i);
    assert.ok(store.submissions.find((s) => s.id === id), "row remains without force");

    const forced = await json(
      await app.request(`/api/events/${EVENT_ID}/submissions/${id}`, {
        method: "DELETE",
        headers: org,
        body: JSON.stringify({ force: true }),
      }),
    );
    assert.equal(forced.status, 200, JSON.stringify(forced.body));
    assert.equal(forced.body.data.removed.sessionId, mirrored.id);
    assert.equal(store.submissions.find((s) => s.id === id), undefined);

    const after = (await repo.getSchedule(EVENT_ID))!;
    assert.equal(after.sessions.find((s) => s.id === mirrored.id), undefined);
    assert.deepEqual(after.sessions.map((s) => s.id).sort(), otherSessionIds);
    assert.deepEqual(after.speakers.map((s) => s.id).sort(), otherSpeakerIds);
    assert.ok(store.personas.some((p) => p.id === speakerId), "speaker persona is not cascaded");
    assert.ok(store.profiles.some((p) => p.speakerId === speakerId), "speaker profile is not cascaded");
  });
});

test("published mirrored session refuses delete even with force", async () => {
  await withStore(async () => {
    const app = createApp({ repo: new MemoryRepository() });
    const refused = await json(
      await app.request(`/api/events/${EVENT_ID}/submissions/sub-ada`, {
        method: "DELETE",
        headers: org,
        body: JSON.stringify({ force: true }),
      }),
    );
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error?.code, "CONFLICT");
    assert.match(String(refused.body.error?.message || ""), /published/i);
    assert.ok(store.submissions.find((s) => s.id === "sub-ada"));
    assert.ok(store.personas.some((p) => p.id === "spk-ada"));
  });
});

test("snapshot restore does not resurrect a deleted submission", async () => {
  await withStore(async () => {
    let saved: CompetitionSnapshot | undefined;
    const persistence: SnapshotPersistence = {
      load: async () => saved,
      save: async (s) => {
        saved = structuredClone(s);
      },
    };
    const repo = new MemoryRepository();
    const app = createApp({ repo, persistence });
    const email = `persist-delete-${crypto.randomUUID()}@example.test`;
    const created = await json(
      await app.request(`/api/public/events/${EVENT_SLUG}/submissions`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(cfpBody(email, "Persist Delete Talk")),
      }),
    );
    assert.equal(created.status, 201);
    const id = created.body.data.id;
    const deleted = await json(
      await app.request(`/api/events/${EVENT_ID}/submissions/${id}`, {
        method: "DELETE",
        headers: org,
        body: JSON.stringify({}),
      }),
    );
    assert.equal(deleted.status, 200);
    assert.equal(store.submissions.find((s) => s.id === id), undefined);
    assert.ok(saved, "delete flushed a snapshot");
    assert.equal(saved!.lifecycle.submissions.find((s) => s.id === id), undefined);

    store.submissions.push({
      id,
      eventId: EVENT_ID,
      speakerId: "spk-ghost",
      name: "Ghost",
      email,
      title: "Persist Delete Talk",
      abstract: "should not survive restore",
      category: "Engineering",
      format: "Talk (30 min)",
      answers: {},
      status: "submitted",
      reviewBoard: "engineering",
      round: "r1",
      createdAt: new Date().toISOString(),
    });
    assert.ok(store.submissions.find((s) => s.id === id), "in-memory resurrection before restore");

    assert.equal(await restoreSnapshot({ repo: new MemoryRepository(), persistence }), true);
    assert.equal(store.submissions.find((s) => s.id === id), undefined, "restore does not resurrect the deleted row");
  });
});

test("Review Studio exposes a confirm-step delete action", () => {
  const src = readFileSync("src/web/pages/SubmissionsPages.tsx", "utf8");
  assert.match(src, /Delete submission/);
  assert.match(src, /data-testid="delete-submission"/);
  assert.match(src, /data-testid="confirm-delete-submission"/);
  assert.match(src, /data-testid="delete-submission-confirm"/);
  assert.match(src, /api\.deleteSubmission/);
  assert.match(src, /nav\("\/app\/submissions"\)/);
});
