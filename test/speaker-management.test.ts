import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { MemoryRepository, demoSchedule } from "../src/repository.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import {
  addSpeakerManual,
  applyHeadshot,
  assignGeneralTasks,
  enrichSpeakerMgmtDemo,
  importSpeakersCsv,
  listRoster,
  outstandingTaskReminders,
  progressMatrix,
  renderMergePreview,
  submitFormTask,
  suggestDuplicatePairs,
  updateSpeakerOrganizer,
} from "../src/speakerMgmt.js";
import { icsForSession } from "../src/lifecycle.js";
import { publicSchedule } from "../src/schedule.js";
import { readFile } from "node:fs/promises";

const org = { "x-demo-role": "organizer", "content-type": "application/json" };
const speakerSam = { "x-demo-persona": "spk-sam", "content-type": "application/json" };
const speakerAda = { "x-demo-persona": "spk-ada", "content-type": "application/json" };

test("profile edit propagates to organizer roster and public schedule projection", async () => {
  const repo = new MemoryRepository();
  await repo.putSchedule(EVENT_ID, structuredClone(demoSchedule));
  const app = createApp({ repo });

  const bio = `Sentinel bio for SPK-08 ${crypto.randomUUID().slice(0, 6)} with enough length.`;
  const put = await app.request(`/api/speaker/events/${EVENT_ID}/profile`, {
    method: "PUT",
    headers: speakerAda,
    body: JSON.stringify({
      bio,
      company: "Analytical Engines Intl",
      title: "Principal Engineer",
      linkedin: "https://linkedin.com/in/ada-sentinel",
      travelPreference: "Aisle, no red-eyes",
    }),
  });
  assert.equal(put.status, 200);
  const body = await put.json();
  assert.equal(body.data.profile.bio, bio);
  assert.equal(body.data.profile.travelPreference, "Aisle, no red-eyes");

  const head = await app.request(`/api/speaker/events/${EVENT_ID}/profile/headshot`, {
    method: "POST",
    headers: speakerAda,
    body: JSON.stringify({
      name: "ada-sentinel.png",
      mime: "image/png",
      dataBase64: Buffer.from("fake-png-bytes").toString("base64"),
    }),
  });
  assert.equal(head.status, 201);
  const headBody = await head.json();
  assert.match(headBody.data.profile.headshotUrl || "", /^data:image\/png;base64,/);

  const roster = await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: org });
  assert.equal(roster.status, 200);
  const rows = (await roster.json()).data;
  const ada = rows.find((r: any) => r.speakerId === "spk-ada");
  assert.ok(ada);
  assert.equal(ada.bio, bio);
  assert.equal(ada.company, "Analytical Engines Intl");
  assert.ok(ada.headshotUrl || ada.profile?.headshotUrl);
  assert.equal(ada.travelPreference, "Aisle, no red-eyes");

  // Schedule speaker mirrored for public gallery
  const sched = await repo.getSchedule(EVENT_ID);
  const schedAda = sched!.speakers.find((s) => s.id === "spk-ada");
  assert.ok(schedAda);
  assert.equal(schedAda!.bio, bio);
  assert.ok(schedAda!.headshotUrl);

  // Speaker cannot edit another speaker via persona
  const denied = await app.request(`/api/speaker/events/${EVENT_ID}/profile`, {
    method: "PUT",
    headers: speakerSam,
    body: JSON.stringify({ bio: "Sam should not overwrite Ada" }),
  });
  assert.equal(denied.status, 200);
  assert.notEqual(store.profiles.find((p) => p.speakerId === "spk-ada")!.bio, "Sam should not overwrite Ada");
});

test("single profile save atomically persists bio, socials, logistics, and headshot", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const bio = `SBEK-PORTAL-BIO-01 ${crypto.randomUUID()} full speaker biography`;
  const put = await app.request(`/api/speaker/events/${EVENT_ID}/profile`, {
    method: "PUT",
    headers: speakerAda,
    body: JSON.stringify({
      bio,
      linkedin: "https://linkedin.com/in/ada-atomic",
      x: "@ada_atomic",
      website: "https://ada.example.test",
      travelPreference: "Aisle seat",
      dietary: "Vegetarian",
      headshot: { name: "headshot.png", mime: "image/png", dataUrl: "data:image/png;base64,YXRvbWlj" },
    }),
  });
  assert.equal(put.status, 200);

  const get = await app.request(`/api/speaker/events/${EVENT_ID}/home`, { headers: speakerAda });
  assert.equal(get.status, 200);
  const profile = (await get.json()).data.profile;
  assert.equal(profile.bio, bio);
  assert.equal(profile.linkedin, "https://linkedin.com/in/ada-atomic");
  assert.equal(profile.x, "@ada_atomic");
  assert.equal(profile.website, "https://ada.example.test");
  assert.equal(profile.travelPreference, "Aisle seat");
  assert.equal(profile.dietary, "Vegetarian");
  assert.equal(profile.headshotName, "headshot.png");
  assert.match(profile.headshotUrl, /^\/api\/content\/files\//);
  const image = await app.request(profile.headshotUrl, { headers: speakerAda });
  assert.equal(image.status, 200);
  assert.match(image.headers.get("content-type") || "", /^image\//);
  const browserImage = await app.request(profile.headshotUrl);
  assert.equal(browserImage.status, 200, "a browser img request has no persona headers");

  const roster = await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: org });
  const organizerProfile = (await roster.json()).data.find((row: any) => row.speakerId === "spk-ada");
  assert.equal(organizerProfile.headshotUrl, profile.headshotUrl);
});

test("organizer-created speaker is registered in bootstrap and can open portal home", async () => {
  const app=createApp({repo:new MemoryRepository()}); const email=`portal-${crypto.randomUUID()}@example.test`;
  const made=await app.request(`/api/events/${EVENT_ID}/speakers`,{method:"POST",headers:org,body:JSON.stringify({name:"Dana Kowalski",email,sendInvite:false})});
  assert.equal(made.status,201); const speakerId=(await made.json()).data.speakerId;
  const bootstrap=await app.request(`/api/events/${EVENT_ID}/bootstrap`,{headers:org}); const personas=(await bootstrap.json()).data.personas;
  assert.ok(personas.some((p:any)=>p.id===speakerId&&p.role==="speaker"&&p.email===email));
  const home=await app.request(`/api/speaker/events/${EVENT_ID}/home`,{headers:{"x-demo-persona":speakerId}});
  assert.equal(home.status,200); assert.equal((await home.json()).data.profile.email,email);
});

test("manual confirmed workflow status wins across snapshot restore", async () => {
  let snapshot: any;
  const persistence = { save: async (value: any) => { snapshot = structuredClone(value); }, load: async () => snapshot };
  const app = createApp({ repo: new MemoryRepository(), persistence });
  const confirmed = await app.request(`/api/events/${EVENT_ID}/speakers/spk-ada/status`, {
    method: "POST", headers: org, body: JSON.stringify({ status: "confirmed" }),
  });
  assert.equal(confirmed.status, 200);
  assert.equal((await confirmed.json()).data.workflowStatus, "confirmed");
  store.profiles.find((p) => p.speakerId === "spk-ada")!.workflowStatus = undefined;
  const { restoreSnapshot } = await import("../src/app.js");
  await restoreSnapshot({ repo: new MemoryRepository(), persistence });
  const roster = await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: org });
  assert.equal((await roster.json()).data.find((row: any) => row.speakerId === "spk-ada").workflowStatus, "confirmed");
});

test("form-task fill round-trip and general task assignment", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const assign = await app.request(`/api/events/${EVENT_ID}/speakers/tasks`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({
      title: "Greenroom logistics form",
      description: "Shirt and arrival",
      dueAt: "2026-09-01T00:00:00.000Z",
      type: "form",
      speakerIds: ["spk-sam"],
      formSchema: [
        { key: "shirt_size", label: "T-shirt size", type: "select", required: true, options: ["M", "L"] },
        { key: "arrival_date", label: "Arrival", type: "text", required: true },
      ],
    }),
  });
  assert.equal(assign.status, 201);
  const tasks = (await assign.json()).data;
  assert.equal(tasks.length, 1);
  const taskId = tasks[0].id;

  const bad = await app.request(`/api/speaker/events/${EVENT_ID}/tasks/${taskId}/form`, {
    method: "POST",
    headers: speakerSam,
    body: JSON.stringify({ answers: { shirt_size: "M" } }),
  });
  assert.equal(bad.status, 400);

  const ok = await app.request(`/api/speaker/events/${EVENT_ID}/tasks/${taskId}/form`, {
    method: "POST",
    headers: speakerSam,
    body: JSON.stringify({ answers: { shirt_size: "L", arrival_date: "2026-10-11" } }),
  });
  assert.equal(ok.status, 200);
  const submitted = (await ok.json()).data.task;
  assert.equal(submitted.status, "completed");
  assert.equal(submitted.formAnswers.shirt_size, "L");

  // Other speaker cannot submit Sam's form
  const cross = await app.request(`/api/speaker/events/${EVENT_ID}/tasks/${taskId}/form`, {
    method: "POST",
    headers: speakerAda,
    body: JSON.stringify({ answers: { shirt_size: "M", arrival_date: "x" } }),
  });
  assert.equal(cross.status, 404);

  const detail = await app.request(`/api/events/${EVENT_ID}/speakers/spk-sam`, { headers: org });
  assert.equal(detail.status, 200);
  const row = (await detail.json()).data;
  const t = row.tasks.find((x: any) => x.id === taskId);
  assert.equal(t.status, "completed");
  assert.equal(t.formAnswers.arrival_date, "2026-10-11");
});

test("organizer general task appears in portal list and speaker-scoped detail API", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const title = `Confirm participation ${crypto.randomUUID()}`;
  const assigned = await app.request(`/api/events/${EVENT_ID}/speakers/tasks`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({ title, dueAt: "2026-12-01T00:00:00.000Z", type: "confirm", speakerIds: ["spk-sam"] }),
  });
  assert.equal(assigned.status, 201);
  const task = (await assigned.json()).data[0];

  const list = await app.request(`/api/speaker/events/${EVENT_ID}/tasks`, { headers: speakerSam });
  assert.equal(list.status, 200);
  assert.ok((await list.json()).data.tasks.some((row: any) => row.id === task.id && row.title === title));

  const detail = await app.request(`/api/speaker/events/${EVENT_ID}/tasks/${task.id}`, { headers: speakerSam });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).data.task.id, task.id);
  const denied = await app.request(`/api/speaker/events/${EVENT_ID}/tasks/${task.id}`, { headers: speakerAda });
  assert.equal(denied.status, 404);
});

test("portal router registers talks, task list, and task detail with their distinct components", async () => {
  const source = await readFile(new URL("../src/web/main.tsx", import.meta.url), "utf8");
  assert.match(source, /path="talks" element=\{<PortalTalksPage \/>\}/);
  assert.match(source, /path="tasks" element=\{<PortalTasksPage \/>\}/);
  assert.match(source, /path="tasks\/:id" element=\{<PortalTaskDetailPage \/>\}/);
});

test("outstanding-task derivation and progress matrix", () => {
  const matrix = progressMatrix(store);
  assert.ok(matrix.rows.length >= 1);
  assert.ok(matrix.columns.length >= 1);
  const sam = matrix.rows.find((r) => r.speakerId === "spk-sam");
  if (sam) {
    assert.ok(typeof sam.readiness.pct === "number");
    assert.ok(sam.total >= sam.completed);
  }
  // Force overdue task and ensure reminder plan catches it
  const task = store.tasks.find((t) => t.speakerId === "spk-sam" && t.status !== "completed");
  if (task) {
    const prev = task.dueAt;
    task.dueAt = "2020-01-01T00:00:00.000Z";
    const plans = outstandingTaskReminders(store, new Date("2026-01-01T00:00:00.000Z"));
    assert.ok(plans.some((p) => p.taskId === task.id && p.overdue));
    task.dueAt = prev;
  }
});

test("per-recipient comm log, merge preview, and ICS generation", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const preview = await app.request(`/api/events/${EVENT_ID}/comms/preview`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({
      subject: "Hi {{first_name}} — {{event_name}}",
      body: "Talk: {{talk_title}}. Portal: {{portal_link}}",
      speakerId: "spk-ada",
    }),
  });
  assert.equal(preview.status, 200);
  const prev = (await preview.json()).data;
  assert.match(prev.subject, /Ada/);
  assert.match(prev.body, /portal/i);

  const composedSubject = "Custom after preview {{first_name}}";
  const composedBody = "Custom body after preview for {{talk_title}}";
  const send = await app.request(`/api/events/${EVENT_ID}/comms/send`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({ templateKey: "task_reminder", speakerIds: ["spk-ada", "spk-sam"], subject: composedSubject, body: composedBody }),
  });
  assert.equal(send.status, 201);
  const sent = (await send.json()).data;
  assert.ok(Array.isArray(sent));
  assert.equal(sent.length, 2);
  assert.ok(sent.every((s: any) => s.email && s.status));
  assert.ok(sent.every((s: any) => s.subject.startsWith("Custom after preview")));

  const log = await app.request(`/api/events/${EVENT_ID}/comms/log`, { headers: org });
  assert.equal(log.status, 200);
  const entries = (await log.json()).data;
  assert.ok(entries.length >= 2);
  assert.ok(entries.some((e: any) => e.recipientEmail && e.deliveryNote));

  // ICS for scheduled session
  const scheduled = store.sessions.find((s) => s.slot);
  assert.ok(scheduled);
  const ics = icsForSession(scheduled!);
  assert.ok(ics);
  assert.match(ics!, /BEGIN:VCALENDAR/);
  assert.match(ics!, /DTSTART/);
});

test("manual add, CSV import, workflow status filter, invite", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const made = await app.request(`/api/events/${EVENT_ID}/speakers`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({
      name: "Priya Raman",
      email: "priya.raman.spk@example.test",
      title: "Principal Engineer",
      company: "Latticework Systems",
      bio: "Build systems specialist with monorepo CI focus for conferences.",
      travelPreference: "SFO preferred",
      sendInvite: true,
    }),
  });
  assert.equal(made.status, 201);
  const created = (await made.json()).data;
  assert.ok(created.speakerId);
  assert.ok(created.communication?.id);

  const csv = await app.request(`/api/events/${EVENT_ID}/speakers/import`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({
      csv: [
        "name,email,title,company,bio",
        "Priya Raman,priya.raman.spk@example.test,Principal Engineer,Latticework Systems,dup",
        "Dana Kowalski,dana.kowalski.spk@example.test,Staff Engineer,Northwind,New import row",
      ].join("\n"),
    }),
  });
  assert.equal(csv.status, 200);
  const imp = (await csv.json()).data;
  assert.ok(imp.created >= 1);
  assert.ok(imp.updated >= 1);

  const filtered = await app.request(`/api/events/${EVENT_ID}/speakers?q=Dana`, { headers: org });
  assert.equal(filtered.status, 200);
  const danaRows = (await filtered.json()).data;
  assert.ok(danaRows.some((r: any) => /Dana/i.test(r.name)));

  const status = await app.request(`/api/events/${EVENT_ID}/speakers/${created.speakerId}/status`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({ status: "confirmed" }),
  });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).data.workflowStatus, "confirmed");

  const invite = await app.request(`/api/events/${EVENT_ID}/speakers/${created.speakerId}/invite`, {
    method: "POST",
    headers: org,
    body: "{}",
  });
  assert.equal(invite.status, 200);
  const invitedCommunication = (await invite.json()).data.communication;
  assert.ok(invitedCommunication?.id);
  const history = await app.request(`/api/events/${EVENT_ID}/comms/log`, { headers: org });
  assert.equal(history.status, 200);
  assert.ok((await history.json()).data.some((row: any) => row.id === invitedCommunication.id && row.speakerId === created.speakerId));

  // Organizer-only
  const denied = await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: speakerSam });
  assert.equal(denied.status, 403);
});

test("session assignment visibility on roster and portal home", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const detail = await app.request(`/api/events/${EVENT_ID}/speakers/spk-ada`, { headers: org });
  assert.equal(detail.status, 200);
  const row = (await detail.json()).data;
  assert.ok(Array.isArray(row.sessions));
  assert.ok(row.sessions.some((s: any) => s.title));

  const home = await app.request(`/api/speaker/events/${EVENT_ID}/home`, { headers: speakerAda });
  assert.equal(home.status, 200);
  const data = (await home.json()).data;
  assert.equal(data.speakerId, "spk-ada");
  assert.ok(data.sessions.every((s: any) => s.speakerId === "spk-ada"));
  assert.ok(data.tasks.every((t: any) => t.speakerId === "spk-ada"));
  // No other speakers' content
  assert.ok(!data.submissions.some((s: any) => s.speakerId === "spk-sam"));
});

test("domain helpers: CSV, merge, headshot", () => {
  const before = store.profiles.length;
  const imp = importSpeakersCsv(
    "name,email,title,company,bio\nZed Import,zed.import@example.test,Eng,ZedCo,Bio text here",
    { sendInvite: false },
  );
  assert.ok(imp.created >= 1);
  assert.ok(store.profiles.length >= before);

  const danaEmail = `dana.kowalski.${crypto.randomUUID()}@example.test`;
  const danaCsv = `name,email,title\nDana Kowalski,${danaEmail},Engineer`;
  const firstDana = importSpeakersCsv(danaCsv, { sendInvite: false });
  const secondDana = importSpeakersCsv(danaCsv, { sendInvite: false });
  assert.equal(firstDana.created, 1);
  assert.equal(secondDana.updated, 1);
  assert.equal(store.profiles.filter((p) => p.email === danaEmail).length, 1);

  const existing = store.profiles.find((p) => p.email === danaEmail)!;
  const existingId = existing.speakerId;
  const normalizedUpdate = importSpeakersCsv(
    `name,email,title,company\nDana Updated,  ${danaEmail.toUpperCase()}  ,Principal Engineer,Updated Co`,
    { sendInvite: false },
  );
  assert.equal(normalizedUpdate.created, 0);
  assert.equal(normalizedUpdate.updated, 1);
  assert.equal(normalizedUpdate.results[0].action, "updated");
  const matching = store.profiles.filter((p) => p.email.trim().toLowerCase() === danaEmail);
  assert.equal(matching.length, 1);
  assert.equal(matching[0]!.speakerId, existingId);
  assert.equal(matching[0]!.title, "Principal Engineer");

  const sameNameDifferentEmail = `dana.other.${crypto.randomUUID()}@example.test`;
  const suggestion = importSpeakersCsv(`name,email\nDana Updated,${sameNameDifferentEmail}`, { sendInvite: false });
  assert.equal(suggestion.created, 1);
  assert.ok(suggestion.nearDuplicates.some((pair: any) => pair.duplicate.email === sameNameDifferentEmail));

  const adaProfile = store.profiles.find((p) => p.speakerId === "spk-ada") as any;
  const previousX = adaProfile.x;
  const previousTravel = adaProfile.travelPreference;
  adaProfile.x = undefined;
  adaProfile.travelPreference = "@ada_social";
  enrichSpeakerMgmtDemo(store);
  assert.equal(adaProfile.x, "@ada_social");
  assert.notEqual(adaProfile.travelPreference, "@ada_social");
  adaProfile.x = previousX;
  adaProfile.travelPreference = previousTravel;

  const preview = renderMergePreview(
    { subject: "Hey {{first_name}}", body: "{{company}} / {{talk_title}}" },
    "spk-ada",
  );
  assert.match(preview.subject, /Ada|Hey/);

  const hs = applyHeadshot("spk-ada", { name: "lin.png", dataUrl: "data:image/png;base64,aaa" });
  assert.equal(hs.ok, true);
  if (hs.ok) assert.equal(hs.profile.headshotName, "lin.png");

  const updated = updateSpeakerOrganizer("spk-ada", { workflowStatus: "confirmed", dietary: "None" });
  assert.equal(updated.ok, true);

  const roster = listRoster(store, { status: "confirmed" });
  assert.ok(roster.some((r) => r.speakerId === "spk-ada"));

  const tasks = assignGeneralTasks({
    title: "Confirm AV needs",
    dueAt: "2026-09-10T00:00:00.000Z",
    type: "confirm",
    speakerIds: ["spk-ada"],
  });
  assert.equal(tasks.ok, true);
});

// keep publicSchedule import warm (gallery path uses schedule speakers with headshot)
void publicSchedule;
void addSpeakerManual;
void submitFormTask;

test("bulk merge-suggestions collapses two independent name-match pairs in one call", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const tag = crypto.randomUUID().slice(0, 6);
  const names = [`Rowan Vega ${tag}`, `Casey Lin ${tag}`];
  // Two independent duplicate pairs: same normalized name, different emails.
  const csv = [
    "name,email,title,company,bio",
    `${names[0]},rowan.a.${tag}@example.test,Staff Engineer,Northwind,Distributed systems work`,
    `${names[0]},rowan.b.${tag}@example.test,,,`,
    `${names[1]},casey.a.${tag}@example.test,Principal Engineer,Latticework,Build tooling`,
    `${names[1]},casey.b.${tag}@example.test,,,`,
  ].join("\n");

  const imported = await app.request(`/api/events/${EVENT_ID}/speakers/import`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({ csv }),
  });
  assert.equal(imported.status, 200);
  const importBody = (await imported.json()) as any;
  assert.equal(importBody.data.created, 4, "same-name/different-email rows are created separately");

  // Before merging they are SUGGESTIONS only — all four records still exist.
  const pairs = importBody.data.nearDuplicates.filter((p: any) => names.includes(p.primary.name));
  assert.equal(pairs.length, 2, "one suggestion per name-match pair");
  for (const name of names) {
    assert.equal(store.profiles.filter((p) => p.name === name).length, 2, `${name} stays two records until merged`);
  }
  // The richer record (title/company/bio filled) is proposed as primary.
  for (const pair of pairs) {
    const primary = store.profiles.find((p) => p.speakerId === pair.primary.speakerId)!;
    const duplicate = store.profiles.find((p) => p.speakerId === pair.duplicate.speakerId)!;
    assert.ok(primary.title && primary.company, `${pair.primary.name}: richer record is primary`);
    assert.ok(!duplicate.title, "the sparse record is the duplicate");
  }

  const rosterBefore = ((await (await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: org })).json()) as any).data.length;

  // ONE bulk call merges both pairs.
  const bulk = await app.request(`/api/events/${EVENT_ID}/speakers/merge-suggestions`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({
      pairs: pairs.map((p: any) => ({ primaryId: p.primary.speakerId, secondaryId: p.duplicate.speakerId })),
    }),
  });
  assert.equal(bulk.status, 200);
  const bulkBody = (await bulk.json()) as any;
  assert.equal(bulkBody.data.merged, 2, "both pairs merged in a single request");

  const rosterAfter = ((await (await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: org })).json()) as any).data.length;
  assert.equal(rosterAfter, rosterBefore - 2, "roster count drops by exactly two");
  for (const name of names) {
    assert.equal(store.profiles.filter((p) => p.name === name).length, 1, `${name} is now one record`);
  }
  // Fill-only enrichment kept the primary's values and filled its blanks.
  const survivors = names.map((name) => store.profiles.find((p) => p.name === name)! as any);
  assert.ok(survivors.every((p) => p.title && p.company && p.bio));
  assert.ok(!bulkBody.data.remaining.some((p: any) => names.includes(p.primary.name)), "no suggestions remain");
});

test("bulk merge tolerates overlapping pairs and already-removed records", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const tag = crypto.randomUUID().slice(0, 6);
  const name = `Tam Ito ${tag}`;
  const csv = [
    "name,email,title,company,bio",
    `${name},tam.a.${tag}@example.test,Staff Engineer,Northwind,Systems`,
    `${name},tam.b.${tag}@example.test,,,`,
    `${name},tam.c.${tag}@example.test,,,`,
  ].join("\n");
  const imported = (await (
    await app.request(`/api/events/${EVENT_ID}/speakers/import`, { method: "POST", headers: org, body: JSON.stringify({ csv }) })
  ).json()) as any;
  const pairs = imported.data.nearDuplicates.filter((p: any) => p.primary.name === name);
  assert.equal(pairs.length, 2, "two duplicates share one primary");
  const primaryId = pairs[0].primary.speakerId;

  // Overlapping pairs (same primary twice) + a repeat of an already-merged pair + a
  // reference to a record that will be gone by the time it is processed.
  const bulk = await app.request(`/api/events/${EVENT_ID}/speakers/merge-suggestions`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({
      pairs: [
        { primaryId, secondaryId: pairs[0].duplicate.speakerId },
        { primaryId, secondaryId: pairs[1].duplicate.speakerId },
        { primaryId, secondaryId: pairs[0].duplicate.speakerId },
        { primaryId, secondaryId: "spk-does-not-exist" },
      ],
    }),
  });
  assert.equal(bulk.status, 200, "a stale pair must not fail the whole batch");
  const body = (await bulk.json()) as any;
  assert.equal(body.data.merged, 2);
  assert.equal(body.data.skipped.length, 2);
  assert.ok(body.data.skipped.some((s: any) => /already merged|already removed/.test(s.reason)));
  assert.equal(store.profiles.filter((p) => p.name === name).length, 1, "roster is not corrupted");
  assert.ok(store.profiles.some((p) => p.speakerId === primaryId), "the primary survives");
});

test("merge-suggestions GET lists current pairs and an empty POST merges them all", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const tag = crypto.randomUUID().slice(0, 6);
  const name = `Noor Haddad ${tag}`;
  await app.request(`/api/events/${EVENT_ID}/speakers/import`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({ csv: `name,email,title\n${name},noor.a.${tag}@example.test,Staff Engineer\n${name},noor.b.${tag}@example.test,` }),
  });
  const listed = (await (await app.request(`/api/events/${EVENT_ID}/speakers/merge-suggestions`, { headers: org })).json()) as any;
  assert.ok(listed.data.some((p: any) => p.primary.name === name), "GET exposes the roster panel's pairs");

  const mergedAll = await app.request(`/api/events/${EVENT_ID}/speakers/merge-suggestions`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({}),
  });
  assert.equal(mergedAll.status, 200);
  assert.ok(((await mergedAll.json()) as any).data.merged >= 1);
  assert.equal(store.profiles.filter((p) => p.name === name).length, 1);

  // Non-organizers cannot merge.
  assert.equal(
    (await app.request(`/api/events/${EVENT_ID}/speakers/merge-suggestions`, { method: "POST", headers: speakerSam, body: JSON.stringify({}) })).status,
    403,
  );
});

test("primary selection prefers the richer record and falls back to the older one", () => {
  const tag = crypto.randomUUID().slice(0, 6);
  const name = `Priya Sundaram ${tag}`;
  // Sparse record imported FIRST, richer one second: richness must beat array order.
  importSpeakersCsv(`name,email\n${name},priya.sparse.${tag}@example.test`, { sendInvite: false });
  importSpeakersCsv(
    `name,email,title,company,bio\n${name},priya.rich.${tag}@example.test,Principal Engineer,Latticework,Build systems specialist`,
    { sendInvite: false },
  );
  const pair = suggestDuplicatePairs(store).find((p) => p.primary.name === name)!;
  assert.ok(pair, "a suggestion is produced");
  assert.equal(pair.primary.email, `priya.rich.${tag}@example.test`, "richer record wins");
  assert.equal(pair.duplicate.email, `priya.sparse.${tag}@example.test`);

  // Two equally sparse records: the older (earlier submission) is primary.
  const evenTag = crypto.randomUUID().slice(0, 6);
  const evenName = `Sam Okafor ${evenTag}`;
  importSpeakersCsv(`name,email\n${evenName},older.${evenTag}@example.test`, { sendInvite: false });
  importSpeakersCsv(`name,email\n${evenName},newer.${evenTag}@example.test`, { sendInvite: false });
  const evenPair = suggestDuplicatePairs(store).find((p) => p.primary.name === evenName)!;
  assert.equal(evenPair.primary.email, `older.${evenTag}@example.test`, "older record breaks the tie");

  // Scoring is deterministic regardless of evaluation order.
  const repeat = suggestDuplicatePairs(store).find((p) => p.primary.name === evenName)!;
  assert.deepEqual(repeat, evenPair);
});

test("portal home exposes canonical organizer-linked session titles, not the manual placeholder", async () => {
  const repo = new MemoryRepository();
  const app = createApp({ repo });
  const tag = crypto.randomUUID().slice(0, 6);
  const created = (await (
    await app.request(`/api/events/${EVENT_ID}/speakers`, {
      method: "POST",
      headers: org,
      body: JSON.stringify({ name: `Linked Speaker ${tag}`, email: `linked.${tag}@example.test` }),
    })
  ).json()) as any;
  const speakerId = created.data.speakerId;
  const persona = store.personas.find((p) => p.speakerId === speakerId)!;
  const speakerHeaders = { "x-demo-persona": persona.id, "content-type": "application/json" };
  await app.request(`/api/events/${EVENT_ID}/schedule`); // mirror accepted submissions

  const first = (await (await app.request(`/api/speaker/events/${EVENT_ID}/home`, { headers: speakerHeaders })).json()) as any;
  const draft = first.data.sessions[0];
  assert.ok(draft, "organizer-linked session is visible in the portal");
  assert.ok(draft.canonicalId, "each session carries its canonical id");
  assert.equal(draft.placeholderTitle, true, "an unnamed manual record is flagged, not shown as a real title");
  assert.equal(draft.submissionId, first.data.submissions[0].id, "the portal can dedupe the paired submission card");

  // Organizer names the session through the canonical content editor.
  const renamed = `Taming 40-Minute CI ${tag}`;
  const patched = await app.request(`/api/events/${EVENT_ID}/content/sessions/${draft.id}`, {
    method: "PATCH",
    headers: org,
    body: JSON.stringify({ title: renamed }),
  });
  assert.equal(patched.status, 200);

  const afterRename = (await (await app.request(`/api/speaker/events/${EVENT_ID}/home`, { headers: speakerHeaders })).json()) as any;
  const linked = afterRename.data.sessions[0];
  assert.equal(linked.title, renamed, "the speaker sees the canonical title");
  assert.equal(linked.placeholderTitle, false);
  assert.equal(afterRename.data.sessions.length, 1, "no duplicate session cards");

  // Placing it surfaces the slot and room through the same payload.
  const sched = (await (await app.request(`/api/events/${EVENT_ID}/schedule`)).json()) as any;
  const placed = await app.request(`/api/events/${EVENT_ID}/schedule/move`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({
      slot: { id: `slot-${linked.canonicalId}`, sessionId: linked.canonicalId, roomId: "room-main", startsAt: "2026-10-14T18:00:00.000Z", endsAt: "2026-10-14T18:45:00.000Z" },
      version: sched.version,
      acknowledge: [],
    }),
  });
  assert.equal(placed.status, 200);
  const scheduledHome = (await (await app.request(`/api/speaker/events/${EVENT_ID}/home`, { headers: speakerHeaders })).json()) as any;
  const scheduledSession = scheduledHome.data.sessions[0];
  assert.equal(scheduledSession.slot.startsAt, "2026-10-14T18:00:00.000Z");
  assert.equal(scheduledSession.roomName, "Main Hall");
  assert.equal(scheduledSession.title, renamed);
});

test("portal talks renders canonical titles in the event timezone without duplicate cards", async () => {
  const page = await readFile(new URL("../src/web/pages/PortalPages.tsx", import.meta.url), "utf8");
  // Canonical title + placeholder copy helpers, used by home and talks.
  assert.match(page, /export function sessionDisplayTitle/);
  assert.match(page, /Session title to be confirmed/);
  assert.match(page, /export function sessionPlacementLine/);
  assert.match(page, /Awaiting schedule placement/);
  assert.match(page, /sessionDisplayTitle\(session\)/);
  assert.match(page, /sessionDisplayTitle\(scheduled\)/);
  // Event-timezone label rather than a hard-coded UTC suffix.
  assert.match(page, /fmtTzLabel\(\)/);
  assert.ok(!/\}\s*UTC/.test(page), "no literal UTC suffix remains next to fmtTime output");
  // A submission that already has a linked session renders once.
  assert.match(page, /session\.submissionId === s\.id/);
});

test("roster duplicate banner is driven by the authoritative server suggestions", async () => {
  const page = await readFile(new URL("../src/web/pages/SpeakersCommsPages.tsx", import.meta.url), "utf8");
  assert.match(page, /api\.speakerMergeSuggestions\(\)/, "roster loads pairs from the API");
  assert.match(page, /const duplicatePairs = serverPairs\.length \? serverPairs : duplicateSuggestions\(rows\)/);
  // Banner copy + one-click bulk action stay in place while pairs exist.
  assert.match(page, /possible duplicate\{duplicatePairs\.length === 1 \? "" : "s"\} — Review &amp; merge/);
  assert.equal((page.match(/Merge all suggested duplicates/g) || []).length, 2, "roster and import panel both offer bulk merge");
  assert.match(page, /\{importSummary\.created\} created · \{importSummary\.updated\} updated \(existing email\) · \{importSummary\.duplicates\} possible duplicates \(name match\)/);
});

test("organizer speaker and comms pages use the bounded LoadState loader", async () => {
  const page = await readFile(new URL("../src/web/pages/SpeakersCommsPages.tsx", import.meta.url), "utf8");
  assert.ok(!/return <Spinner \/>/.test(page), "no bare unbounded spinner remains");
  assert.equal((page.match(/useAsyncData\(/g) || []).length, 3, "roster, speaker detail and comms are all bounded");
  assert.equal((page.match(/<LoadState/g) || []).length, 3);
  for (const label of ["the speaker roster", "this speaker", "communications"]) {
    assert.ok(page.includes(`label="${label}"`), `${label} loader has a meaningful label`);
  }
  for (const retry of ["onRetry={roster.reload}", "onRetry={detail.reload}", "onRetry={comms.reload}"]) {
    assert.ok(page.includes(retry), `${retry} wired`);
  }
  // Live refresh is preserved without re-flashing the loading state.
  assert.match(page, /subscribeData\(\(\) => roster\.reload\(\)\)/);
  assert.match(page, /subscribeData\(\(\) => detail\.reload\(\)\)/);
  assert.match(page, /subscribeData\(\(\) => comms\.reload\(\)\)/);
});

test("assign-task modal exposes exactly the three template chips with prefilled fields", async () => {
  const { TASK_TEMPLATES, TASK_TEMPLATE_DUE_DAYS, taskTemplateDueDate } = await import("../src/web/pages/SpeakersCommsPages.js");
  assert.deepEqual(
    TASK_TEMPLATES.map((t: any) => t.title),
    ["Confirm participation", "Sign speaker release form", "Complete bio and profile"],
  );
  assert.deepEqual(TASK_TEMPLATES.map((t: any) => t.type), ["confirm", "form", "profile"]);
  assert.ok(TASK_TEMPLATES.every((t: any) => t.description && t.description.length > 10), "descriptions are prefilled");

  // Deterministic relative due date in the date-input format the modal uses.
  const from = new Date("2026-08-10T12:00:00.000Z");
  const due = taskTemplateDueDate(from);
  assert.match(due, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(due, "2026-08-24");
  assert.equal(TASK_TEMPLATE_DUE_DAYS, 14);

  const page = await readFile(new URL("../src/web/pages/SpeakersCommsPages.tsx", import.meta.url), "utf8");
  assert.match(page, /setTaskForm\(\(prev\) => \(\{ \.\.\.prev, \.\.\.template, dueAt: taskTemplateDueDate\(\) \}\)\)/, "functional update avoids stale taskForm");
  assert.match(page, /data-testid={`task-template-\$\{template\.type\}`}/);
});

test("bulk comms send appends one log entry per recipient and returns the UI payload shape", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const before = ((await (await app.request(`/api/events/${EVENT_ID}/comms/log`, { headers: org })).json()) as any).data.length;
  const speakerIds = ["spk-ada", "spk-sam"];

  const send = await app.request(`/api/events/${EVENT_ID}/comms/send`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({
      templateKey: "task_reminder",
      speakerIds,
      subject: "Bulk send check {{first_name}}",
      body: "Hello {{first_name}}, please finish onboarding.",
    }),
  });
  assert.equal(send.status, 201);
  const body = (await send.json()) as any;

  // Exactly the shape the Comms page renders in its persistent success Notice.
  assert.ok(Array.isArray(body.data), "data is a per-recipient array");
  assert.equal(body.data.length, speakerIds.length);
  assert.equal(body.meta.count, speakerIds.length);
  for (const row of body.data) {
    assert.ok(row.id, "each row has the communication id the log highlights");
    assert.ok(speakerIds.includes(row.speakerId));
    assert.ok(row.name, "recipient name for the Notice");
    assert.ok(row.email, "recipient email for the Notice");
    assert.ok(row.status, "per-recipient delivery status");
    assert.ok(row.subject && row.createdAt);
  }
  assert.match(body.data[0].subject, /Ada/, "merge fields resolve per recipient");

  // N entries were appended to the canonical log, and they are the ones just returned.
  const after = ((await (await app.request(`/api/events/${EVENT_ID}/comms/log`, { headers: org })).json()) as any).data;
  assert.equal(after.length, before + speakerIds.length, "log grew by one entry per recipient");
  for (const row of body.data) {
    const logged = after.find((entry: any) => entry.id === row.id);
    assert.ok(logged, `sent row ${row.id} is in the log the page refreshes`);
    assert.equal(logged.status, row.status);
  }
  // Communications are unshifted, so the newest sends are already at the FRONT of the
  // log payload and therefore at the top of the page's list without any client sorting.
  const newestIds = after.slice(0, speakerIds.length).map((entry: any) => entry.id);
  for (const row of body.data) {
    assert.ok(newestIds.includes(row.id), "the just-sent rows are the newest log entries");
  }
});

test("comms page renders busy, persistent success and error states for every send action", async () => {
  const page = await readFile(new URL("../src/web/pages/SpeakersCommsPages.tsx", import.meta.url), "utf8");
  // One shared pipeline: busy → awaited call → refreshed log → persistent Notice.
  assert.match(page, /const runSend = async \(kind: string, label: string, call: \(\) => Promise<any>\)/);
  assert.match(page, /await load\(\);/, "the log is refreshed in place after a send");
  assert.match(page, /setSendResult\(\{ kind, count: 0, at: new Date\(\)\.toLocaleTimeString\(\), rows: \[\], error: message \}\)/, "errors render");
  assert.match(page, /data-testid="send-result"/);
  assert.match(page, /Sent to \$\{sendResult\.count\} recipient/);
  // Every send-ish button goes through it, with a busy label.
  for (const id of ["send-to-selected", "run-task-reminders", "send-decisions"]) {
    assert.ok(page.includes(`data-testid="${id}"`), `${id} wired`);
  }
  assert.equal((page.match(/Sending…/g) || []).length, 3, "all three actions show a busy state");
  assert.equal((page.match(/void runSend\(/g) || []).length, 3);
  // The API is already newest-first; the page must NOT re-sort it, and it highlights
  // the rows that were just sent so the change is visible without scrolling.
  assert.ok(!/\[\.\.\.log\]\.reverse\(\)/.test(page), "no client-side reversal of an already newest-first log");
  assert.match(page, /Just sent/);
  assert.match(page, /sentIds\.includes\(c\.id\)/);
});
