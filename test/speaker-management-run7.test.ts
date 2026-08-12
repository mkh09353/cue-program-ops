import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { resetEventRegistry } from "../src/events.js";
import { MemoryRepository } from "../src/repository.js";
import { allSpeakerTasks, progressMatrix } from "../src/speakerMgmt.js";

const ORG = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const json = async (r: Response) => (await r.json()) as any;
const speakerHeaders = (speakerId: string) => ({
  "content-type": "application/json",
  "x-demo-persona": speakerId,
  "x-demo-role": "speaker",
});
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNQLLwBRwzEcQBBIhahB1LZpgAAAABJRU5ErkJggg==";
const boot = () => {
  resetEventRegistry();
  return createApp({ repo: new MemoryRepository() });
};

// —— SPK-15: organizer detail edits of logistics fields persist ——

test("SPK-15: travel preference and dietary survive the detail-page PATCH and reload", async () => {
  const app = boot();
  const roster = (await json(await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: ORG }))).data;
  const speakerId = roster[0].speakerId;

  // Exactly the route + payload shape the detail page sends (all edit fields).
  const patched = await app.request(`/api/events/${EVENT_ID}/speakers/${speakerId}`, {
    method: "PATCH", headers: ORG,
    body: JSON.stringify({
      name: roster[0].name, email: roster[0].email, title: roster[0].title || "", company: roster[0].company || "",
      bio: roster[0].bio || "", linkedin: "", website: "",
      travelPreference: "Arrival May 11, aisle seat", dietary: "Vegetarian, no nuts",
    }),
  });
  assert.equal(patched.status, 200);
  assert.equal((await json(patched)).data.travelPreference, "Arrival May 11, aisle seat");

  const detail = (await json(await app.request(`/api/events/${EVENT_ID}/speakers/${speakerId}`, { headers: ORG }))).data;
  assert.equal(detail.travelPreference, "Arrival May 11, aisle seat", "detail read shows the edit, not the create-time value");
  assert.equal(detail.dietary, "Vegetarian, no nuts");

  const rosterAfter = (await json(await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: ORG }))).data
    .find((r: any) => r.speakerId === speakerId);
  assert.equal(rosterAfter.travelPreference, "Arrival May 11, aisle seat", "roster projection agrees");
  assert.equal(rosterAfter.dietary, "Vegetarian, no nuts");

  // A later unrelated patch must not revert them.
  await app.request(`/api/events/${EVENT_ID}/speakers/${speakerId}`, {
    method: "PATCH", headers: ORG, body: JSON.stringify({ company: "Latticework Systems" }),
  });
  const again = (await json(await app.request(`/api/events/${EVENT_ID}/speakers/${speakerId}`, { headers: ORG }))).data;
  assert.equal(again.travelPreference, "Arrival May 11, aisle seat");
  assert.equal(again.dietary, "Vegetarian, no nuts");
});

test("SPK-15: the detail page does not clobber in-progress edits on refetch", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("src/web/pages/SpeakersCommsPages.tsx", "utf8");
  assert.match(src, /const \[dirty, setDirty\] = useState\(false\)/);
  assert.match(src, /else if \(dirty\) \{ setErr\(""\); return; \}/, "a dirty editor is never re-seeded from a refetch");
  assert.match(src, /const patchEdit = \(patch: any\)/);
  assert.match(src, /onChange=\{\(e\) => patchEdit\(\{ \[f\.key\]: e\.target\.value \}\)\}/, "logistics inputs mark the form dirty");
  assert.match(src, /travel and dietary details stored/, "save confirms what was stored");
});

// —— SPK-12: progress matrix reflects every task family ——

test("SPK-12: the matrix includes organizer deliverables, not just onboarding tasks", async () => {
  const app = boot();
  const roster = (await json(await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: ORG }))).data;
  const speakerId = roster[0].speakerId;

  const created = await app.request(`/api/events/${EVENT_ID}/content/tasks`, {
    method: "POST", headers: ORG,
    body: JSON.stringify({ speakerIds: [speakerId], name: "Signed speaker release", dueAt: "2027-04-01T00:00:00.000Z", fileRequired: false }),
  });
  assert.ok([200, 201].includes(created.status), `deliverable created (${created.status})`);

  const progress = (await json(await app.request(`/api/events/${EVENT_ID}/speakers/progress`, { headers: ORG }))).data;
  assert.ok(progress.columns.includes("Signed speaker release"), "the deliverable appears as a matrix column");
  const row = progress.rows.find((r: any) => r.speakerId === speakerId);
  assert.ok(row.cells["Signed speaker release"], "and as a cell for that speaker");
  assert.equal(row.cells["Signed speaker release"].family, "deliverable");
  assert.ok(row.total > 0 && typeof row.percent === "number");
});

test("SPK-12: portal completion moves the cell to done and updates the percentage", async () => {
  const app = boot();
  const roster = (await json(await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: ORG }))).data;
  const target = roster.find((r: any) => (r.tasks || []).some((t: any) => t.status !== "completed" && t.type === "profile"))
    || roster.find((r: any) => (r.tasks || []).some((t: any) => t.status !== "completed"));
  assert.ok(target, "a speaker with an open task exists");
  const speakerId = target.speakerId;

  const before = progressMatrix(store).rows.find((r) => r.speakerId === speakerId)!;
  const openTask = allSpeakerTasks(speakerId, store).find((t) => t.status !== "completed" && t.type === "profile");

  if (openTask) {
    // The portal marks the profile task done by saving a real bio.
    const saved = await app.request(`/api/speaker/events/${EVENT_ID}/profile`, {
      method: "PUT", headers: speakerHeaders(speakerId),
      body: JSON.stringify({ name: target.name, email: target.email, bio: "SBEK-PORTAL-BIO-01 ".repeat(3) }),
    });
    assert.equal(saved.status, 200, "portal profile save succeeded");

    const after = (await json(await app.request(`/api/events/${EVENT_ID}/speakers/progress`, { headers: ORG }))).data
      .rows.find((r: any) => r.speakerId === speakerId);
    assert.equal(after.cells[openTask.title].status, "completed", "the cell flipped to done");
    assert.ok(after.completed > before.completed, "completed count rose");
    assert.ok(after.percent > before.percent, `percentage rose (${before.percent}% → ${after.percent}%)`);
  }
});

test("SPK-12: the matrix exposes complete/incomplete counts and the UI filters on them", async () => {
  const app = boot();
  const progress = (await json(await app.request(`/api/events/${EVENT_ID}/speakers/progress`, { headers: ORG }))).data;
  assert.equal(typeof progress.summary.complete, "number");
  assert.equal(typeof progress.summary.incomplete, "number");
  assert.equal(progress.summary.complete + progress.summary.incomplete, progress.rows.length);
  for (const row of progress.rows) {
    assert.equal(row.complete, row.total > 0 && row.completed === row.total);
  }
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("src/web/pages/SpeakersCommsPages.tsx", "utf8");
  assert.match(src, /data-testid="progress-filter"/);
  assert.match(src, /<option value="complete">Complete only<\/option>/);
  assert.match(src, /<option value="incomplete">Incomplete only<\/option>/);
  assert.match(src, /progressFilter === "complete" \? r\.complete/);
  assert.match(src, /data-testid="progress-summary"/);
});

// —— SPK-08/09: one speaker id from CFP through portal to organizer ——

test("SPK-08/09: a CFP speaker's portal writes are visible to the organizer under one id", async () => {
  const app = boot();

  // 1. New speaker arrives through the public CFP.
  const submitted = (await json(await app.request(`/api/public/events/ai-engineer-summit/submissions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Runtime Speaker", email: "runtime.speaker@example.test",
      answers: { title: "Runtime talk", abstract: "R".repeat(60), category: "AI Engineering", format: "Talk (30 min)", experience: "Beginner" },
    }),
  }))).data;
  const speakerId = submitted.speakerId;
  assert.ok(speakerId, "the CFP created a speaker id");

  // Accept so the speaker joins the roster with onboarding tasks.
  const decided = await app.request(`/api/events/${EVENT_ID}/submissions/${submitted.id}/decision`, {
    method: "POST", headers: ORG, body: JSON.stringify({ nextStatus: "accepted", sendComms: false, createTasks: true }),
  });
  assert.equal(decided.status, 200);

  // 2. The speaker edits their own profile in the portal.
  const SH = speakerHeaders(speakerId);
  const profileSave = await app.request(`/api/speaker/events/${EVENT_ID}/profile`, {
    method: "PUT", headers: SH,
    body: JSON.stringify({ name: "Runtime Speaker", email: "runtime.speaker@example.test", bio: "SBEK-PORTAL-BIO-01 real portal bio text." }),
  });
  assert.equal(profileSave.status, 200, "portal profile save");

  // 3. And uploads a headshot.
  const upload = await app.request(`/api/speaker/events/${EVENT_ID}/files`, {
    method: "POST", headers: SH,
    body: JSON.stringify({ kind: "headshot", name: "headshot.png", mime: "image/png", size: 73, dataUrl: PNG }),
  });
  assert.ok([200, 201].includes(upload.status), `headshot upload (${upload.status})`);

  // 4. Organizer reads: ONE roster row, with the portal bio, a rendered headshot url and the task state.
  const roster = (await json(await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: ORG }))).data;
  const rows = roster.filter((r: any) => r.speakerId === speakerId);
  assert.equal(rows.length, 1, "exactly one roster row for this speaker");
  const duplicates = roster.filter((r: any) => String(r.name).trim().toLowerCase() === "runtime speaker");
  assert.equal(duplicates.length, 1, "no duplicate-name record was created");

  const detail = (await json(await app.request(`/api/events/${EVENT_ID}/speakers/${speakerId}`, { headers: ORG }))).data;
  assert.match(String(detail.bio || ""), /SBEK-PORTAL-BIO-01/, "organizer sees the portal bio");
  assert.ok(detail.headshotUrl, "organizer sees a headshot url");
  assert.ok(
    String(detail.headshotUrl).startsWith("data:image/") || String(detail.headshotUrl).includes("/content/files/"),
    `headshot url is renderable: ${String(detail.headshotUrl).slice(0, 40)}`,
  );

  // 5. Completed tasks are reflected in the progress matrix for that same id.
  const progress = (await json(await app.request(`/api/events/${EVENT_ID}/speakers/progress`, { headers: ORG }))).data;
  const row = progress.rows.find((r: any) => r.speakerId === speakerId);
  assert.ok(row, "the speaker appears in the progress matrix");
  const done = Object.values(row.cells).filter((c: any) => c && c.status === "completed");
  assert.ok(done.length > 0, "portal completions show as done cells");
  assert.ok(row.percent > 0, `percentage reflects the portal work (${row.percent}%)`);
});
