import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";
import { contentReadiness, equivalentDeliverables, isEquivalentDeliverable } from "../src/content.js";

const h = (id: string) => ({ "content-type": "application/json", "x-demo-persona": id });
const parse = async (res: Response) => ({ res, body: (await res.json()) as any });
const pdf = { name: "slides.pdf", mime: "application/pdf", size: 16, dataBase64: "JVBERi0xLjQgZGVtbyB2MQ==" };

const slotsFor = (speakerId: string, sessionId?: string, type = "application/pdf") =>
  store.deliverableTasks.filter(
    (t) => t.speakerId === speakerId && (!sessionId || t.sessionId === sessionId) && t.acceptedTypes.includes(type),
  );

/**
 * Item 1 regression: an organizer file-request task for a speaker/session that already
 * has an equivalent same-kind deliverable must REUSE that slot. Duplicates were the
 * cause of "one Complete with versions, one Incomplete 0 versions" in CNT-S2.
 */
test("organizer file-request task reuses an existing same-kind deliverable slot", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const speakerId = "spk-sam";
  const existing = slotsFor(speakerId);
  assert.equal(existing.length, 1, "fixture: seeded slides deliverable exists");
  const seededId = existing[0]!.id;
  const sessionId = existing[0]!.sessionId;

  const created = await parse(
    await app.request(`/api/events/${EVENT_ID}/content/tasks`, {
      method: "POST",
      headers: h("org-swyx"),
      body: JSON.stringify({
        name: "Upload Session Presentation",
        instructions: "Final slide deck as a PDF, 16:9 aspect ratio.",
        dueAt: "2027-05-01T23:59:59.000Z",
        speakerIds: [speakerId],
        acceptedTypes: ["application/pdf"],
      }),
    }),
  );
  assert.equal(created.res.status, 201);
  assert.equal(created.body.data.length, 1);
  assert.equal(created.body.data[0].id, seededId, "must reuse the canonical slot id");
  assert.equal(created.body.data[0].reused, true);
  assert.equal(slotsFor(speakerId, sessionId).length, 1, "no duplicate slot may be created");

  // The reused slot picks up the organizer's new instructions/deadline.
  assert.equal(store.deliverableTasks.find((t) => t.id === seededId)!.dueAt, "2027-05-01T23:59:59.000Z");
  assert.equal(created.body.data[0].status, "incomplete", "re-request opens a fresh collection cycle");

  // Upload → versions accrue on that single canonical slot.
  const personaId = store.personas.find((p) => p.speakerId === speakerId)!.id;
  const first = await app.request(`/api/speaker/events/${EVENT_ID}/deliverables/${seededId}/upload`, {
    method: "POST",
    headers: h(personaId),
    body: JSON.stringify({ ...pdf, kind: "slides" }),
  });
  assert.equal(first.status, 201);
  const second = await app.request(`/api/speaker/events/${EVENT_ID}/deliverables/${seededId}/upload`, {
    method: "POST",
    headers: h(personaId),
    body: JSON.stringify({ ...pdf, dataBase64: "JVBERi0xLjQgZGVtbyB2Mg==", kind: "slides" }),
  });
  assert.equal(second.status, 201);

  const mine = await parse(
    await app.request(`/api/speaker/events/${EVENT_ID}/deliverables`, { headers: h(personaId) }),
  );
  const rows = mine.body.data.filter((t: any) => t.acceptedTypes.includes("application/pdf"));
  assert.equal(rows.length, 1, "speaker sees exactly one slides deliverable");
  assert.equal(rows[0].uploadCount, 2, "both versions accrued on the canonical slot");
  assert.equal(rows[0].status, "complete");

  // Organizer dashboard reads the same single row.
  const content = await parse(await app.request(`/api/events/${EVENT_ID}/content`, { headers: h("org-swyx") }));
  const orgRows = content.body.data.tasks.filter(
    (t: any) => t.speakerId === speakerId && t.acceptedTypes.includes("application/pdf"),
  );
  assert.equal(orgRows.length, 1);
  assert.equal(orgRows[0].uploadCount, 2);
});

test("re-requesting a populated canonical slot preserves history but requires one newer upload", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const task = store.deliverableTasks.find((t) => t.id === "deliverable-slides-ada")!;
  const file = store.contentFiles.find((f) => f.taskId === task.id)!;
  const versionsBefore = structuredClone(file.versions);
  const commentsBefore = structuredClone(file.comments);
  assert.ok(versionsBefore.length > 0, "fixture: canonical slot is populated");
  assert.equal(task.status, "complete", "fixture: seeded populated slot starts complete");

  const requested = await parse(await app.request(`/api/events/${EVENT_ID}/content/tasks`, {
    method: "POST",
    headers: h("org-swyx"),
    body: JSON.stringify({
      name: "Upload refreshed session presentation",
      instructions: "A newer deck is required for this collection cycle.",
      dueAt: "2027-06-01T23:59:59.000Z",
      speakerIds: [task.speakerId],
      sessionIds: [task.sessionId],
      acceptedTypes: ["application/pdf"],
    }),
  }));
  assert.equal(requested.res.status, 201);
  assert.equal(requested.body.data[0].id, task.id);
  assert.equal(requested.body.data[0].reused, true);
  assert.equal(slotsFor(task.speakerId, task.sessionId).length, 1);
  assert.equal(file.versions.length, versionsBefore.length, "re-request does not remove versions");
  assert.deepEqual(file.comments, commentsBefore, "re-request does not remove comments");

  const outstanding = (await parse(await app.request(`/api/events/${EVENT_ID}/content`, { headers: h("org-swyx") }))).body.data.tasks.find((row: any) => row.id === task.id);
  assert.equal(outstanding.status, "incomplete");
  assert.equal(outstanding.uploadCount, versionsBefore.length);
  assert.equal(outstanding.collectionCycle.baselineVersionCount, versionsBefore.length);
  assert.equal(outstanding.collectionCycle.baselineCurrentVersionId, versionsBefore.find((v) => v.current)?.id || versionsBefore.at(-1)?.id);

  const uploaded = await app.request(`/api/speaker/events/${EVENT_ID}/deliverables/${task.id}/upload`, {
    method: "POST",
    headers: h(store.personas.find((p) => p.speakerId === task.speakerId)!.id),
    body: JSON.stringify({ ...pdf, dataBase64: "JVBERi0xLjQgZGVtbyB2Mg==", kind: "slides" }),
  });
  assert.equal(uploaded.status, 201);
  const complete = (await parse(await app.request(`/api/speaker/events/${EVENT_ID}/deliverables/${task.id}`, { headers: h(store.personas.find((p) => p.speakerId === task.speakerId)!.id) }))).body.data;
  assert.equal(complete.status, "complete");
  assert.equal(complete.uploadCount, versionsBefore.length + 1);
  assert.equal(file.versions.filter((version) => version.current).length, 1);
  assert.equal(file.versions.at(-1)?.current, true);
  assert.deepEqual(file.comments, commentsBefore);
});

test("unrequested seeded complete slot stays complete", () => {
  const task = {
    id: "deliverable-unrequested-seeded", name: "Seeded artifact", instructions: "", dueAt: "2028-01-01T00:00:00Z",
    speakerId: "spk-ada", sessionId: "ses-analytical", fileRequired: true, acceptedTypes: ["text/plain"],
    status: "complete" as const, createdAt: "2027-01-01T00:00:00Z",
  };
  const file = {
    id: "content-unrequested-seeded", speakerId: task.speakerId, sessionId: task.sessionId, taskId: task.id,
    kind: "document" as const, status: "submitted" as const, comments: [], versions: [{
      id: "version-unrequested-seeded", version: 1, name: "seed.txt", mime: "text/plain", size: 1,
      dataBase64: "eA==", uploadedBy: task.speakerId, uploadedAt: "2027-01-01T00:00:00Z", current: true,
    }],
  };
  store.deliverableTasks.push(task); store.contentFiles.push(file);
  try {
    assert.equal((task as any).collectionCycle, undefined);
    const projected = contentReadiness(store).find((row: any) => row.id === task.id);
    assert.equal(projected.status, "complete");
    assert.equal(projected.uploadCount, 1);
  } finally {
    store.deliverableTasks = store.deliverableTasks.filter((row) => row.id !== task.id);
    store.contentFiles = store.contentFiles.filter((row) => row.id !== file.id);
  }
});

test("all-speaker re-request cycles complete independently without multiplying slots", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const speakerIds = ["spk-ada", "spk-sam"];
  const request = async () => parse(await app.request(`/api/events/${EVENT_ID}/content/tasks`, {
    method: "POST", headers: h("org-swyx"), body: JSON.stringify({
      name: "Upload release notes", dueAt: "2027-07-01T23:59:59.000Z", speakerIds, acceptedTypes: ["text/plain"],
    }),
  }));
  const first = await request();
  assert.equal(first.res.status, 201);
  const ids = new Map(first.body.data.map((row: any) => [row.speakerId, row.id]));
  assert.equal(first.body.data.length, 2);

  const uploadFor = async (speakerId: string, taskId: string) => app.request(`/api/speaker/events/${EVENT_ID}/deliverables/${taskId}/upload`, {
    method: "POST", headers: h(store.personas.find((p) => p.speakerId === speakerId)!.id),
    body: JSON.stringify({ name: "notes.txt", mime: "text/plain", size: 1, dataBase64: "eA==", kind: "document" }),
  });
  assert.equal((await uploadFor("spk-ada", ids.get("spk-ada") as string)).status, 201);
  let rows = contentReadiness(store).filter((row) => [...ids.values()].includes(row.id));
  assert.equal(rows.find((row) => row.speakerId === "spk-ada")?.status, "complete");
  assert.equal(rows.find((row) => row.speakerId === "spk-sam")?.status, "incomplete");

  const repeated = await request();
  assert.equal(repeated.body.data.length, 2);
  assert.deepEqual(new Set(repeated.body.data.map((row: any) => row.id)), new Set(ids.values()), "same two canonical slots reused");
  rows = contentReadiness(store).filter((row) => [...ids.values()].includes(row.id));
  assert.ok(rows.every((row) => row.status === "incomplete"), "each speaker gets an independent fresh cycle");

  assert.equal((await uploadFor("spk-ada", ids.get("spk-ada") as string)).status, 201);
  rows = contentReadiness(store).filter((row) => [...ids.values()].includes(row.id));
  assert.equal(rows.find((row) => row.speakerId === "spk-ada")?.status, "complete");
  assert.equal(rows.find((row) => row.speakerId === "spk-sam")?.status, "incomplete");
  assert.equal((await uploadFor("spk-sam", ids.get("spk-sam") as string)).status, 201);
  rows = contentReadiness(store).filter((row) => [...ids.values()].includes(row.id));
  assert.ok(rows.every((row) => row.status === "complete"));
  for (const [speakerId, taskId] of ids) assert.equal(slotsFor(speakerId, undefined, "text/plain").filter((row) => row.id === taskId).length, 1);
  // Keep the shared lifecycle fixture isolated for the remaining focused tests.
  const madeIds = new Set(ids.values());
  store.deliverableTasks = store.deliverableTasks.filter((row) => !madeIds.has(row.id));
  store.contentFiles = store.contentFiles.filter((row) => !madeIds.has(row.taskId));
});

/** Assigning the same task twice (or to all speakers repeatedly) stays idempotent. */
test("repeated all-speaker file requests do not multiply deliverable slots", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const speakerIds = [...new Set(store.deliverableTasks.map((t) => t.speakerId))];
  const before = store.deliverableTasks.length;
  const body = JSON.stringify({
    name: "Upload Final Headshot (print quality)",
    dueAt: "2027-04-14T23:59:59.000Z",
    speakerIds,
    acceptedTypes: ["image/png", "image/jpeg"],
  });
  for (let i = 0; i < 3; i++) {
    const r = await app.request(`/api/events/${EVENT_ID}/content/tasks`, { method: "POST", headers: h("org-swyx"), body });
    assert.equal(r.status, 201);
  }
  assert.equal(store.deliverableTasks.length, before, "no new rows for equivalent requests");
  for (const speakerId of speakerIds) {
    assert.equal(slotsFor(speakerId, undefined, "image/png").length, 1, `${speakerId} keeps one headshot slot`);
  }
});

/** A genuinely different kind still gets its own slot. */
test("a different accepted file type creates a separate deliverable", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const speakerId = "spk-sam";
  const before = slotsFor(speakerId, undefined, "text/plain").length;
  const created = await parse(
    await app.request(`/api/events/${EVENT_ID}/content/tasks`, {
      method: "POST",
      headers: h("org-swyx"),
      body: JSON.stringify({
        name: "Upload speaker release form",
        dueAt: "2027-04-01T23:59:59.000Z",
        speakerIds: [speakerId],
        acceptedTypes: ["text/plain"],
      }),
    }),
  );
  assert.equal(created.res.status, 201);
  assert.equal(created.body.data[0].reused, false);
  assert.equal(slotsFor(speakerId, undefined, "text/plain").length, before + 1);
});

/** Existing duplicates are healed (versions merged) rather than left stranded. */
test("pre-existing duplicate slots merge onto the one holding uploads", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const speakerId = "spk-ada";
  const canonical = slotsFor(speakerId)[0]!;
  // Simulate the legacy bug: a stray duplicate row for the same speaker/session/kind.
  store.deliverableTasks.push({
    id: "deliverable-stray-dup",
    name: "Upload Session Presentation",
    instructions: "",
    dueAt: "2027-05-01T23:59:59.000Z",
    speakerId,
    sessionId: canonical.sessionId,
    fileRequired: true,
    acceptedTypes: ["application/pdf"],
    status: "incomplete",
    createdAt: new Date().toISOString(),
  });
  assert.equal(slotsFor(speakerId, canonical.sessionId).length, 2);

  const versionsBefore = store.contentFiles.find((f) => f.taskId === canonical.id)?.versions.length || 0;
  const created = await parse(
    await app.request(`/api/events/${EVENT_ID}/content/tasks`, {
      method: "POST",
      headers: h("org-swyx"),
      body: JSON.stringify({
        name: "Upload Session Presentation",
        dueAt: "2027-05-02T23:59:59.000Z",
        speakerIds: [speakerId],
        acceptedTypes: ["application/pdf"],
      }),
    }),
  );
  assert.equal(created.res.status, 201);
  assert.equal(slotsFor(speakerId, canonical.sessionId).length, 1, "duplicates collapsed");
  const survivor = slotsFor(speakerId, canonical.sessionId)[0]!;
  assert.equal(survivor.id, canonical.id, "the slot holding uploads wins");
  assert.equal(
    store.contentFiles.find((f) => f.taskId === survivor.id)?.versions.length,
    versionsBefore,
    "existing versions are preserved",
  );
  assert.ok(!store.deliverableTasks.some((t) => t.id === "deliverable-stray-dup"));
});

/** Equivalence rule is explicit and unit-tested. */
test("deliverable equivalence matches speaker + session + overlapping types", () => {
  const base = { speakerId: "spk-a", sessionId: "ses-1", acceptedTypes: ["application/pdf"] };
  assert.equal(isEquivalentDeliverable(base, { ...base }), true);
  assert.equal(isEquivalentDeliverable(base, { ...base, speakerId: "spk-b" }), false);
  assert.equal(isEquivalentDeliverable(base, { ...base, sessionId: "ses-2" }), false);
  assert.equal(isEquivalentDeliverable(base, { ...base, acceptedTypes: ["image/png"] }), false);
  assert.equal(
    isEquivalentDeliverable(base, { ...base, acceptedTypes: ["application/pdf", "text/plain"] }),
    true,
    "overlapping type lists are the same slot",
  );
  assert.equal(equivalentDeliverables(store, { speakerId: "nobody" }).length, 0);
});
