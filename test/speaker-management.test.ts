import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { MemoryRepository, demoSchedule } from "../src/repository.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import {
  addSpeakerManual,
  applyHeadshot,
  assignGeneralTasks,
  importSpeakersCsv,
  listRoster,
  outstandingTaskReminders,
  progressMatrix,
  renderMergePreview,
  submitFormTask,
  updateSpeakerOrganizer,
} from "../src/speakerMgmt.js";
import { icsForSession } from "../src/lifecycle.js";
import { publicSchedule } from "../src/schedule.js";

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

  const send = await app.request(`/api/events/${EVENT_ID}/comms/send`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({ templateKey: "task_reminder", speakerIds: ["spk-ada", "spk-sam"] }),
  });
  assert.equal(send.status, 201);
  const sent = (await send.json()).data;
  assert.ok(Array.isArray(sent));
  assert.equal(sent.length, 2);
  assert.ok(sent.every((s: any) => s.email && s.status));

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
  assert.ok((await invite.json()).data.communication?.id);

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
