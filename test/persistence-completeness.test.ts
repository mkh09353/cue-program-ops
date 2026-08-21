import test from "node:test";
import assert from "node:assert/strict";
import { createApp, restoreSnapshot } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";
import type { CompetitionSnapshot, SnapshotPersistence } from "../src/persistence.js";

const org = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const headers = (persona: string) => ({ "content-type": "application/json", "x-demo-persona": persona });
const json = async (responseOrPromise: Response | Promise<Response>) => { const response=await responseOrPromise; return { response, body: await response.json() as any }; };
const request = (app: ReturnType<typeof createApp>, method: string, path: string, body: unknown, persona = "org-swyx") =>
  json(app.request(path, { method, headers: headers(persona), body: JSON.stringify(body) }));

/** One end-to-end restart proof: every assertion after restore is API/repository observable. */
test("all route-mutated lifecycle, content, review, CRM, and canonical schedule state survives a fresh restart", async () => {
  let captured: CompetitionSnapshot | undefined;
  let saves = 0;
  const persistence: SnapshotPersistence = {
    load: async () => captured && structuredClone(captured),
    save: async (snapshot) => { saves++; captured = structuredClone(snapshot); },
  };
  const repoA = new MemoryRepository();
  const appA = createApp({ repo: repoA, persistence });
  const marker = crypto.randomUUID().slice(0, 8);

  const room = await request(appA, "POST", `/api/events/${EVENT_ID}/agenda/rooms`, { name: `Restart Room ${marker}`, capacity: 300 });
  assert.equal(room.response.status, 201);
  const track = await request(appA, "POST", `/api/events/${EVENT_ID}/agenda/tracks`, { name: `Restart Track ${marker}` });
  assert.equal(track.response.status, 201);

  const made = await request(appA, "POST", `/api/events/${EVENT_ID}/schedule/sessions`, {
    title: `Restart Session ${marker}`, abstract: "Original restart abstract", speakerIds: ["spk-ada"],
    trackId: track.body.data.id, durationMinutes: 45,
  });
  assert.equal(made.response.status, 201);
  const sessionId = made.body.data.id;
  const proposalTarget = await request(appA, "POST", `/api/events/${EVENT_ID}/schedule/sessions`, {
    title: `Proposal Target ${marker}`, abstract: "Agenda proposal restart proof", speakerIds: ["spk-sam"],
    trackId: track.body.data.id, durationMinutes: 45,
  });
  assert.equal(proposalTarget.response.status, 201);

  let schedule = await repoA.getSchedule(EVENT_ID);
  assert.ok(schedule);
  const firstSlot = { id: `slot-restart-${marker}`, sessionId, roomId: room.body.data.id, startsAt: "2026-10-14T17:00:00.000Z", endsAt: "2026-10-14T17:45:00.000Z" };
  const placed = await request(appA, "POST", `/api/events/${EVENT_ID}/schedule/move`, { slot: firstSlot, version: schedule!.version, acknowledge: [] });
  assert.equal(placed.response.status, 200);
  const finalSlot = { ...firstSlot, startsAt: "2026-10-14T19:00:00.000Z", endsAt: "2026-10-14T19:45:00.000Z" };
  const moved = await request(appA, "POST", `/api/events/${EVENT_ID}/schedule/move`, { slot: finalSlot, version: placed.body.version, acknowledge: [] });
  assert.equal(moved.response.status, 200);

  const published = await request(appA, "POST", `/api/events/${EVENT_ID}/agenda/publish`, { acknowledge: true });
  assert.equal(published.response.status, 200);
  const generated = await request(appA, "POST", `/api/events/${EVENT_ID}/agenda/proposals/generate`, { dayStartHour: 9, dayEndHour: 17, slotMinutes: 30 });
  assert.equal(generated.response.status, 201);
  const placement = generated.body.data.placements.find((p: any) => p.sessionId === proposalTarget.body.data.id);
  assert.ok(placement, "generated proposal must include the dedicated unscheduled session");
  const acceptedPlacement = await request(appA, "POST", `/api/events/${EVENT_ID}/agenda/proposals/${generated.body.data.id}/placements/${placement.id}/accept`, {});
  assert.equal(acceptedPlacement.response.status, 200);

  const editedTitle = `Restart Edited ${marker}`;
  const editedAbstract = `Restart public abstract ${marker}`;
  const contentEdit = await request(appA, "PATCH", `/api/events/${EVENT_ID}/content/sessions/${sessionId}`, {
    title: editedTitle, abstract: editedAbstract, contentStatus: "approved",
  });
  assert.equal(contentEdit.response.status, 200);
  const bio = `Restart profile biography ${marker} with enough detail`;
  const profileEdit = await request(appA, "PUT", `/api/speaker/events/${EVENT_ID}/profile`, {
    bio, linkedin: `https://linkedin.example/${marker}`, x: `@restart_${marker}`,
  }, "spk-ada");
  assert.equal(profileEdit.response.status, 200);

  const content = await json(appA.request(`/api/events/${EVENT_ID}/content`, { headers: org }));
  const deliverable = content.body.data.tasks.find((t: any) => t.speakerId === "spk-ada" && t.acceptedTypes?.includes("application/pdf"));
  assert.ok(deliverable);
  const bytes = Buffer.from(`restart-pdf-${marker}`);
  const upload = await request(appA, "POST", `/api/speaker/events/${EVENT_ID}/deliverables/${deliverable.id}/upload`, {
    name: `restart-${marker}.pdf`, mime: "application/pdf", size: bytes.length,
    dataBase64: bytes.toString("base64"), kind: "slides",
  }, "spk-ada");
  assert.equal(upload.response.status, 201);
  const fileId = upload.body.data.file.id;
  const versionId = upload.body.data.version.id;

  const round = await request(appA, "POST", `/api/events/${EVENT_ID}/review-rounds`, {
    name: `Restart Round ${marker}`, status: "open", blind: true, reviewerIds: ["rev-ada"],
    opensAt: "2026-01-01T00:00:00Z", closesAt: "2027-01-01T00:00:00Z",
    criteria: [{ id: `criterion-${marker}`, label: "Restart score", type: "rating", weight: 1, min: 1, max: 5 }],
  });
  assert.equal(round.response.status, 201);
  const assignment = await request(appA, "POST", `/api/events/${EVENT_ID}/review-assignments`, {
    roundId: round.body.data.id, method: "specific", reviewerId: "rev-ada", submissionIds: ["sub-ada"], cap: 10,
  });
  assert.equal(assignment.response.status, 201);
  assert.equal(assignment.body.data.length, 1);
  const ai = await request(appA, "POST", `/api/events/${EVENT_ID}/reviews/${assignment.body.data[0].id}/ai-assist`, {}, "rev-ada");
  assert.equal(ai.response.status, 200);
  const submitted = await request(appA, "POST", `/api/events/${EVENT_ID}/reviewer-queue/${assignment.body.data[0].id}/submit`, {
    responses: { [`criterion-${marker}`]: 5, comments: `Restart review ${marker}` },
  }, "rev-ada");
  assert.equal(submitted.response.status, 200);
  const reviewId = submitted.body.data.id;

  const contact = await request(appA, "POST", "/api/crm/contacts", {
    name: `Restart Contact ${marker}`, email: `restart-${marker}@example.test`, company: "Restart Co",
  });
  assert.equal(contact.response.status, 201);
  const contactId = contact.body.data.id;

  // Also prove sync retry captures a new snapshot, closing the audited retry gap.
  const sync = await request(appA, "POST", "/sync/preview", { eventId: EVENT_ID });
  assert.equal(sync.response.status, 200);
  const beforeRetrySaves = saves;
  const retry = await request(appA, "POST", `/sync/runs/${sync.body.run.id}/retry`, {});
  assert.equal(retry.response.status, 201);
  assert.ok(saves > beforeRetrySaves, "sync retry must trigger a new snapshot save");

  assert.ok(captured);
  const savedScheduleVersion = captured!.schedule!.version;
  const savedProposalSlot = captured!.schedule!.slots.find((s) => s.sessionId === proposalTarget.body.data.id);
  assert.ok(savedProposalSlot);
  assert.ok(saves >= 18, "each successful mutation category should produce observable snapshot saves");

  // Destroy every touched singleton branch before restore; leaked app-A memory cannot satisfy assertions.
  store.reviewRounds = []; store.reviewAssignments = []; store.reviewConflicts = []; store.reviews = [];
  store.profiles = []; store.tasks = []; store.files = []; store.deliverableTasks = []; store.contentFiles = [];
  store.contentHistory = []; store.sessionContent = []; store.sessions = []; store.agendaProposals = [];
  store.personas = []; store.communications = []; (store as any).crm = { contacts: [], segments: [], campaigns: [], fieldDefinitions: [] };

  const repoB = new MemoryRepository();
  assert.equal(await restoreSnapshot({ repo: repoB, persistence }), true);

  // Inspect repository directly BEFORE schedule GET, which must not be able to repair a failed restore.
  const restoredSchedule = await repoB.getSchedule(EVENT_ID);
  assert.ok(restoredSchedule?.rooms.some((r) => r.id === room.body.data.id));
  assert.ok(restoredSchedule?.tracks.some((t) => t.id === track.body.data.id));
  assert.equal(restoredSchedule?.version, savedScheduleVersion);
  assert.deepEqual(restoredSchedule?.slots.find((s) => s.sessionId === sessionId), finalSlot);
  assert.deepEqual(restoredSchedule?.slots.find((s) => s.sessionId === proposalTarget.body.data.id), savedProposalSlot);
  const restoredSession = restoredSchedule?.sessions.find((s) => s.id === sessionId);
  assert.equal(restoredSession?.title, editedTitle);
  assert.equal(restoredSession?.abstract, editedAbstract);
  assert.equal(restoredSession?.publishStatus, "published");
  assert.equal((restoredSchedule as any)?.lastAgendaPublish?.status, "published");

  const appB = createApp({ repo: repoB, persistence });
  const scheduleRead = await json(appB.request(`/api/events/${EVENT_ID}/schedule`, { headers: org }));
  assert.equal(scheduleRead.body.version, savedScheduleVersion);
  const proposalsRead = await json(appB.request(`/api/events/${EVENT_ID}/agenda/proposals`, { headers: org }));
  assert.ok(proposalsRead.body.data.some((p: any) => p.id === generated.body.data.id && p.placements.some((x: any) => x.id === placement.id && x.status === "accepted")));

  const contentRead = await json(appB.request(`/api/events/${EVENT_ID}/content`, { headers: org }));
  assert.ok(contentRead.body.data.sessions.some((s: any) => s.canonicalId === sessionId && s.contentStatus === "approved"));
  assert.ok(store.contentHistory.some((h) => h.entityId === sessionId));
  const home = await json(appB.request(`/api/speaker/events/${EVENT_ID}/home`, { headers: headers("spk-ada") }));
  assert.equal(home.body.data.profile.bio, bio);
  const deliverables = await json(appB.request(`/api/speaker/events/${EVENT_ID}/deliverables/${deliverable.id}`, { headers: headers("spk-ada") }));
  const restoredVersion = deliverables.body.data.file.versions.find((v: any) => v.id === versionId);
  assert.equal(restoredVersion.name, `restart-${marker}.pdf`);
  assert.equal(restoredVersion.current, true);
  const download = await appB.request(`/api/content/files/${fileId}/versions/${versionId}`, { headers: headers("spk-ada") });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/pdf");
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);

  const rounds = await json(appB.request(`/api/events/${EVENT_ID}/review-rounds`, { headers: org }));
  assert.ok(rounds.body.data.some((r: any) => r.id === round.body.data.id));
  const reviews = await json(appB.request(`/api/events/${EVENT_ID}/reviews`, { headers: org }));
  assert.ok(reviews.body.data.some((r: any) => r.id === reviewId && r.status === "submitted"));
  const submissions = await json(appB.request(`/api/events/${EVENT_ID}/submissions/sub-ada`, { headers: org }));
  assert.equal(submissions.response.status, 200);
  assert.ok(submissions.body.data.reviews.some((r: any) => r.id === reviewId));
  const contacts = await json(appB.request("/api/crm/contacts", { headers: org }));
  assert.ok(contacts.body.data.some((c: any) => c.id === contactId));

  const publicCatalog = await appB.request("/e/ai-engineer-summit/public/sessions");
  assert.equal(publicCatalog.status, 200);
  const html = await publicCatalog.text();
  assert.match(html, new RegExp(editedTitle));
  assert.match(html, new RegExp(editedAbstract));
  const publicCatalogJson = await json(appB.request("/e/ai-engineer-summit/public/sessions.json"));
  assert.equal(publicCatalogJson.response.status, 200);
  assert.ok(publicCatalogJson.body.sessions.some((s: any) => s.id === sessionId && s.title === editedTitle && s.abstract === editedAbstract));
});
