import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { EVENT_ID, FEEDBACK_LABEL, appendFeedback, store } from "../src/lifecycle.js";
import { resetEventRegistry } from "../src/events.js";
import { MemoryRepository } from "../src/repository.js";
import { MockMailer } from "../src/mailer.js";
import { TASK_TEMPLATES, taskTemplateId } from "../src/web/pages/SpeakersCommsPages.js";

const ORG = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const json = async (r: Response) => (await r.json()) as any;
const speaker = (speakerId: string) => ({ "content-type": "application/json", "x-demo-persona": speakerId, "x-demo-role": "speaker" });
const boot = () => {
  resetEventRegistry();
  const mailer = new MockMailer();
  return { app: createApp({ repo: new MemoryRepository(), mailer }), mailer };
};
const FEEDBACK = "Strong practical content; tighten the intro and name the tooling.";

// —— 1. Decision emails with committee feedback ——

test("accepting with feedback stores it, emails it, logs it and shows it on the portal", async () => {
  const { app, mailer } = boot();
  const submitted = (await json(await app.request(`/api/public/events/ai-engineer-summit/submissions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Feedback Speaker", email: "feedback.accept@example.test",
      answers: { title: "Accepted with notes", abstract: "A".repeat(60), category: "AI Engineering", format: "Talk (30 min)", experience: "Beginner" },
    }),
  }))).data;

  const decided = await app.request(`/api/events/${EVENT_ID}/submissions/${submitted.id}/decision`, {
    method: "POST", headers: ORG,
    body: JSON.stringify({ nextStatus: "accepted", sendComms: true, createTasks: true, feedback: FEEDBACK }),
  });
  assert.equal(decided.status, 200);
  const result = (await json(decided)).data;

  // stored on the submission
  assert.equal(result.submission.decisionFeedback, FEEDBACK);
  const reread = (await json(await app.request(`/api/events/${EVENT_ID}/submissions/${submitted.id}`, { headers: ORG }))).data;
  assert.equal(reread.decisionFeedback, FEEDBACK, "feedback survives a re-read");

  // in the delivered email body, under a clear label
  const mail = mailer.messages.filter((m) => m.to === "feedback.accept@example.test").at(-1);
  assert.ok(mail, "an acceptance email was delivered");
  assert.equal(mailer.messages.filter((m) => m.to === "feedback.accept@example.test").length, 2, "CFP confirmation then the decision email");
  assert.ok(mail!.text.includes(FEEDBACK), "email body carries the feedback");
  assert.ok(mail!.text.includes(FEEDBACK_LABEL), "and labels who it came from");

  // on the comms log entry
  assert.equal(result.communication.feedback, FEEDBACK);
  const log = (await json(await app.request(`/api/events/${EVENT_ID}/comms/log`, { headers: ORG }))).data;
  const entry = log.find((c: any) => c.id === result.communication.id);
  assert.equal(entry.feedback, FEEDBACK, "comms log records the feedback that was sent");
  assert.ok(entry.body.includes(FEEDBACK));

  // and on the speaker's own portal
  const home = (await json(await app.request(`/api/speaker/events/${EVENT_ID}/home`, { headers: speaker(submitted.speakerId) }))).data;
  const mine = home.submissions.find((s: any) => s.id === submitted.id);
  assert.equal(mine.decisionFeedback, FEEDBACK, "speaker portal exposes the committee feedback");
  assert.equal(mine.status, "accepted");
});

test("rejecting with feedback delivers the same roundtrip", async () => {
  const { app, mailer } = boot();
  const submitted = (await json(await app.request(`/api/public/events/ai-engineer-summit/submissions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Declined Speaker", email: "feedback.reject@example.test",
      answers: { title: "Declined with notes", abstract: "R".repeat(60), category: "AI Engineering", format: "Talk (30 min)", experience: "Beginner" },
    }),
  }))).data;

  const decided = (await json(await app.request(`/api/events/${EVENT_ID}/submissions/${submitted.id}/decision`, {
    method: "POST", headers: ORG,
    body: JSON.stringify({ nextStatus: "rejected", sendComms: true, feedback: "Not a fit this year; the case study would land well next cycle." }),
  }))).data;

  assert.equal(decided.submission.status, "rejected");
  assert.match(decided.submission.decisionFeedback, /Not a fit this year/);
  const mail = mailer.messages.filter((m) => m.to === "feedback.reject@example.test").at(-1);
  assert.ok(mail!.text.includes("Not a fit this year"), "rejection email carries the feedback");
  assert.ok(mail!.text.includes(FEEDBACK_LABEL));

  const home = (await json(await app.request(`/api/speaker/events/${EVENT_ID}/home`, { headers: speaker(submitted.speakerId) }))).data;
  assert.match(home.submissions.find((s: any) => s.id === submitted.id).decisionFeedback, /Not a fit this year/);
});

test("feedback is optional and never alters a decision made without it", async () => {
  const { app, mailer } = boot();
  const submitted = (await json(await app.request(`/api/public/events/ai-engineer-summit/submissions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Plain Speaker", email: "feedback.none@example.test",
      answers: { title: "No feedback talk", abstract: "N".repeat(60), category: "AI Engineering", format: "Talk (30 min)", experience: "Beginner" },
    }),
  }))).data;

  const decided = (await json(await app.request(`/api/events/${EVENT_ID}/submissions/${submitted.id}/decision`, {
    method: "POST", headers: ORG, body: JSON.stringify({ nextStatus: "accepted", sendComms: true, createTasks: true }),
  }))).data;
  assert.equal(decided.submission.decisionFeedback, undefined);
  assert.equal(decided.communication.feedback, undefined);
  const mail = mailer.messages.filter((m) => m.to === "feedback.none@example.test").at(-1);
  assert.ok(!mail!.text.includes(FEEDBACK_LABEL), "no empty feedback block is appended");
  // Whitespace-only feedback is treated as none.
  const sub2 = store.submissions.find((s) => s.id === submitted.id)!;
  sub2.decisionFeedback = undefined;
  assert.equal(appendFeedback("Body text", "   "), "Body text");
});

test("appendFeedback honours an explicit merge placeholder", () => {
  assert.equal(
    appendFeedback("Hi there.\n\n{{feedback}}\n\nThanks.", "Great talk"),
    `Hi there.\n\n${FEEDBACK_LABEL} Great talk\n\nThanks.`,
  );
  // With no feedback the placeholder disappears rather than printing literally.
  const empty = appendFeedback("Hi there.\n\n{{feedback}}\n\nThanks.", "");
  assert.ok(!empty.includes("{{feedback}}"));
  assert.ok(!empty.includes(FEEDBACK_LABEL));
  assert.match(empty, /Hi there\./);
  assert.match(empty, /Thanks\./);
});

test("the bulk decision composer merges each submission's stored feedback", async () => {
  const { app } = boot();
  const submitted = (await json(await app.request(`/api/public/events/ai-engineer-summit/submissions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Bulk Speaker", email: "feedback.bulk@example.test",
      answers: { title: "Bulk feedback talk", abstract: "B".repeat(60), category: "AI Engineering", format: "Talk (30 min)", experience: "Beginner" },
    }),
  }))).data;
  await app.request(`/api/events/${EVENT_ID}/submissions/${submitted.id}/decision`, {
    method: "POST", headers: ORG,
    body: JSON.stringify({ nextStatus: "accepted", sendComms: false, createTasks: false, feedback: FEEDBACK }),
  });

  const preview = (await json(await app.request(`/api/events/${EVENT_ID}/comms/decisions/preview`, {
    method: "POST", headers: ORG,
    body: JSON.stringify({ submissionId: submitted.id, subject: "Decision for {{talk_title}}", body: "Hi {{name}}, your proposal was {{decision}}." }),
  }))).data;
  assert.ok(preview.body.includes(FEEDBACK), "preview merges the stored feedback");
  assert.ok(preview.body.includes(FEEDBACK_LABEL));
});

test("the organizer and speaker surfaces render the feedback", () => {
  const studio = readFileSync("src/web/pages/SubmissionsPages.tsx", "utf8");
  assert.match(studio, /data-testid="decision-feedback-field"/, "Review Studio has the textarea");
  assert.match(studio, /Feedback to the speaker \(optional\)/);
  assert.match(studio, /feedback: decisionFeedback/, "accept sends it");
  assert.match(studio, /nextStatus: "rejected", sendComms: true, feedback: decisionFeedback/, "reject sends it");

  const portal = readFileSync("src/web/pages/PortalPages.tsx", "utf8");
  assert.match(portal, /data-testid=\{`decision-feedback-\$\{s\.id\}`\}/);
  assert.match(portal, /Committee feedback:/);

  const comms = readFileSync("src/web/pages/SpeakersCommsPages.tsx", "utf8");
  assert.match(comms, /data-testid=\{`comm-feedback-\$\{c\.id\}`\}/, "comms log shows the feedback");
  assert.match(comms, /\{\{feedback\}\}/, "the composer documents the merge field");
});

// —— 2. Fixture task templates ——

test("hotel and flight fixture templates are one-click form tasks", () => {
  const byTitle = Object.fromEntries(TASK_TEMPLATES.map((t) => [t.title, t]));

  const hotel: any = byTitle["Hotel stay requirement form"];
  assert.ok(hotel, "hotel template exists");
  assert.equal(hotel.type, "form");
  assert.deepEqual(hotel.formSchema.map((f: any) => f.key), ["check_in", "check_out", "room_preference", "special_requests"]);
  assert.ok(hotel.formSchema.find((f: any) => f.key === "room_preference").options.length >= 3, "room preferences offered");
  assert.equal(hotel.formSchema.find((f: any) => f.key === "special_requests").required, false);

  const flight: any = byTitle["Flight reimbursement form"];
  assert.ok(flight, "flight template exists");
  assert.equal(flight.type, "form");
  assert.deepEqual(flight.formSchema.map((f: any) => f.key), ["airline", "amount", "receipt_reference", "notes"]);
  for (const key of ["airline", "amount", "receipt_reference"]) {
    assert.equal(flight.formSchema.find((f: any) => f.key === key).required, true, `${key} is required`);
  }

  // Every template still carries what the modal prefills.
  for (const t of TASK_TEMPLATES) {
    assert.ok(t.title && t.type && t.description, `template ${t.title} is complete`);
  }
  // Test ids must be unique now that several templates share the form type.
  const ids = TASK_TEMPLATES.map((t) => taskTemplateId(t.title));
  assert.equal(new Set(ids).size, ids.length, "template test ids are unique");
  assert.ok(ids.includes("hotel-stay-requirement-form"));
  assert.ok(ids.includes("flight-reimbursement-form"));
});

test("a fixture template assigns as a real form task the speaker can complete", async () => {
  const { app } = boot();
  const roster = (await json(await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: ORG }))).data;
  const speakerId = roster[0].speakerId;
  const hotel: any = TASK_TEMPLATES.find((t) => t.title === "Hotel stay requirement form");

  const created = await app.request(`/api/events/${EVENT_ID}/speakers/tasks`, {
    method: "POST", headers: ORG,
    body: JSON.stringify({
      speakerIds: [speakerId], title: hotel.title, type: hotel.type,
      description: hotel.description, formSchema: hotel.formSchema, dueAt: "2027-04-01T00:00:00.000Z",
    }),
  });
  assert.equal(created.status, 201);
  const task = (await json(created)).data[0];
  assert.equal(task.title, "Hotel stay requirement form");
  assert.equal(task.type, "form");

  const home = (await json(await app.request(`/api/speaker/events/${EVENT_ID}/home`, { headers: speaker(speakerId) }))).data;
  const mine = home.tasks.find((t: any) => t.id === task.id);
  assert.ok(mine, "the assigned form task reaches the speaker portal");
  assert.equal(mine.status, "not_started");
});
