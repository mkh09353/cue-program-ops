import test from "node:test";
import assert from "node:assert/strict";
import {
  EMAIL_FOOTER_HREF,
  brandedHtml,
  brandedHtmlFor,
  extractFirstHttpUrl,
  renderCtaEmail,
  renderDecisionEmail,
  renderGenericEmail,
  renderReminderEmail,
} from "../src/emailTemplate.js";
import { createApp } from "../src/app.js";
import { EVENT_ID, FEEDBACK_LABEL, store } from "../src/lifecycle.js";
import { getEventStore, resetEventRegistry } from "../src/events.js";
import { MemoryRepository } from "../src/repository.js";
import { MockMailer } from "../src/mailer.js";

const ORG = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const ORIGIN = "http://cue.test";
const json = async (r: Response) => (await r.json()) as any;
const boot = () => {
  resetEventRegistry();
  const mailer = new MockMailer();
  return { app: createApp({ repo: new MemoryRepository(), mailer, demoMcpToken: "test-mcp-secret" }), mailer };
};

function assertEmailSafe(html: string) {
  assert.match(html, /<!doctype html>/i);
  assert.match(html, />Ruckus</);
  assert.match(html, /Sent by Ruckus — open-source conference ops/);
  assert.match(html, new RegExp(`href="${EMAIL_FOOTER_HREF}"`));
  assert.doesNotMatch(html, /<link\b/i);
  assert.doesNotMatch(html, /<style\b/i);
  assert.doesNotMatch(html, /<img\b/i);
  assert.doesNotMatch(html, /@import/i);
  assert.doesNotMatch(html, /class=/);
  assert.doesNotMatch(html, /url\(/i);
  for (const tag of ["html", "body", "table", "tr", "td", "p", "a"]) {
    const open = (html.match(new RegExp(`<${tag}\\b`, "gi")) || []).length;
    const close = (html.match(new RegExp(`</${tag}>`, "gi")) || []).length;
    assert.equal(open, close, `${tag} tags should be balanced`);
  }
}

test("template variants render email-client-safe branded HTML", () => {
  const generic = renderGenericEmail({ text: "Hello Ada.\n\nYour proposal is in.", eventName: "AI Engineer Summit", subject: "Received" });
  assertEmailSafe(generic);
  assert.match(generic, /Hello Ada/);
  assert.match(generic, /AI Engineer Summit/);

  const href = "https://demo.ruckus.to/p?invite=abc";
  const cta = renderCtaEmail({
    text: `Open your portal:\n${href}`,
    cta: { href, label: "Open your speaker portal" },
    eventName: "AI Engineer Summit",
    subject: "Portal",
  });
  assertEmailSafe(cta);
  assert.ok(cta.includes(`href="${href}"`));
  assert.match(cta, /Open your speaker portal/);

  const decision = renderDecisionEmail({
    text: "Hi Ada, your proposal was accepted.",
    decision: { status: "accepted", feedback: "Strong practical content." },
    cta: { href, label: "Open your speaker portal" },
    eventName: "AI Engineer Summit",
    subject: "Accepted",
  });
  assertEmailSafe(decision);
  assert.match(decision, />ACCEPTED</);
  assert.match(decision, /Feedback from the committee/);
  assert.match(decision, /Strong practical content\./);

  const reminder = renderReminderEmail({
    text: "Outstanding onboarding tasks:",
    tasks: [{ title: "Upload headshot", dueAt: "2026-10-01T00:00:00.000Z", overdue: true }],
    eventName: "AI Engineer Summit",
    subject: "Reminder",
  });
  assertEmailSafe(reminder);
  assert.match(reminder, /Outstanding tasks/);
  assert.match(reminder, /Upload headshot/);
  assert.match(reminder, /2026-10-01/);
  assert.match(reminder, /overdue/);
});

test("brandedHtml infers CTA, decision feedback, and task rows from plain text", () => {
  const url = "https://cue.test/p?invite=token";
  const html = brandedHtml("We received your talk proposal", `Thanks for submitting.\n\nAccess your speaker portal:\n${url}`);
  assertEmailSafe(html);
  assert.ok(html.includes(`href="${url}"`));
  assert.match(html, /Open your speaker portal/);
  assert.equal(extractFirstHttpUrl(`see ${url} now`), url);

  const decision = brandedHtml(
    "You're speaking at AI Engineer Summit",
    `Hi Ada,\n\nCongratulations.\n\n${FEEDBACK_LABEL} Tighten the intro.`,
  );
  assert.match(decision, />ACCEPTED</);
  assert.match(decision, /Tighten the intro\./);

  const reminder = brandedHtml("Reminder: finish your speaker tasks", "Hi Ada,\n\nOutstanding:\n- Upload headshot (due 2026-10-01, overdue)\n- Confirm profile (due 2026-10-08)");
  assert.match(reminder, /Upload headshot/);
  assert.match(reminder, /Confirm profile/);
  assert.match(reminder, /2026-10-01/);
});

test("CFP confirmation emails branded HTML with the portal magic link as CTA", async () => {
  const { app, mailer } = boot();
  const res = await app.request(`${ORIGIN}/api/public/events/ai-engineer-summit/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "HTML CFP Speaker",
      email: "html.cfp@example.test",
      answers: { title: "HTML CFP talk", abstract: "C".repeat(60), category: "AI Engineering", format: "Talk (30 min)", experience: "Beginner" },
    }),
  });
  assert.equal(res.status, 201);
  const data = (await json(res)).data;
  const mail = mailer.messages.find((m) => m.to === "html.cfp@example.test");
  assert.ok(mail);
  assert.ok(mail.text.includes(data.portalUrl), "plain-text still carries the portal URL");
  assert.ok(mail.html);
  assertEmailSafe(mail.html);
  assert.match(mail.html, new RegExp(`href="${data.portalUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(mail.html, /Open your speaker portal/);
  assert.match(mail.html, /AI Engineer Summit/);
});

test("speaker portal invite emails branded HTML with the magic-link CTA", async () => {
  const { app, mailer } = boot();
  const roster = (await json(await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: ORG }))).data;
  const speaker = roster[0];
  const res = await app.request(`${ORIGIN}/api/events/${EVENT_ID}/speakers/${speaker.speakerId}/invite`, {
    method: "POST",
    headers: ORG,
    body: "{}",
  });
  assert.equal(res.status, 200);
  const data = (await json(res)).data;
  const mail = mailer.messages.at(-1)!;
  assert.ok(mail.text.includes(data.portalUrl));
  assert.ok(mail.html);
  assertEmailSafe(mail.html);
  assert.match(mail.html, new RegExp(`href="${data.portalUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(mail.html, /Open your speaker portal/);
});

test("decision emails include ACCEPTED/DECLINED, committee feedback, and unchanged text", async () => {
  const { app, mailer } = boot();
  const submitted = (await json(await app.request(`${ORIGIN}/api/public/events/ai-engineer-summit/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "HTML Decision Speaker",
      email: "html.decision@example.test",
      answers: { title: "HTML decision talk", abstract: "D".repeat(60), category: "AI Engineering", format: "Talk (30 min)", experience: "Beginner" },
    }),
  }))).data;
  const feedback = "Name the tooling and tighten the intro.";
  const decided = await app.request(`/api/events/${EVENT_ID}/submissions/${submitted.id}/decision`, {
    method: "POST",
    headers: ORG,
    body: JSON.stringify({ nextStatus: "accepted", sendComms: true, createTasks: true, feedback }),
  });
  assert.equal(decided.status, 200);
  const mail = mailer.messages.filter((m) => m.to === "html.decision@example.test").at(-1)!;
  assert.ok(mail.text.includes(feedback));
  assert.ok(mail.text.includes(FEEDBACK_LABEL));
  assert.ok(mail.html);
  assertEmailSafe(mail.html);
  assert.match(mail.html, />ACCEPTED</);
  assert.match(mail.html, /Feedback from the committee/);
  assert.match(mail.html, /Name the tooling and tighten the intro\./);
});

test("bulk decision composer sends branded HTML with the stored feedback", async () => {
  const { app, mailer } = boot();
  const submitted = (await json(await app.request(`${ORIGIN}/api/public/events/ai-engineer-summit/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "HTML Bulk Speaker",
      email: "html.bulk@example.test",
      answers: { title: "HTML bulk talk", abstract: "B".repeat(60), category: "AI Engineering", format: "Talk (30 min)", experience: "Beginner" },
    }),
  }))).data;
  await app.request(`/api/events/${EVENT_ID}/submissions/${submitted.id}/decision`, {
    method: "POST",
    headers: ORG,
    body: JSON.stringify({ nextStatus: "rejected", sendComms: false, feedback: "Not a fit this year." }),
  });
  const sent = await app.request(`/api/events/${EVENT_ID}/comms/decisions/send`, {
    method: "POST",
    headers: ORG,
    body: JSON.stringify({
      cohorts: ["rejected"],
      subject: "Decision for {{talk_title}}",
      body: "Hi {{name}}, your proposal {{talk_title}} was {{decision}}.",
    }),
  });
  assert.equal(sent.status, 201);
  const mail = mailer.messages.filter((m) => m.to === "html.bulk@example.test").at(-1)!;
  assert.ok(mail.text.includes("Not a fit this year."));
  assert.ok(mail.html);
  assertEmailSafe(mail.html);
  assert.match(mail.html, />DECLINED</);
  assert.match(mail.html, /Not a fit this year\./);
});

test("manual speaker-task reminders render task rows in HTML", async () => {
  const { app, mailer } = boot();
  const dueAt = new Date(Date.now() + 2 * 86400000).toISOString();
  const assigned = await app.request(`/api/events/${EVENT_ID}/speakers/tasks`, {
    method: "POST",
    headers: ORG,
    body: JSON.stringify({
      speakerIds: ["spk-ada"],
      title: "Confirm travel window",
      type: "confirm",
      required: true,
      dueAt,
    }),
  });
  assert.equal(assigned.status, 201);
  const res = await app.request(`/api/events/${EVENT_ID}/comms/reminders/run`, { method: "POST", headers: ORG });
  assert.equal(res.status, 200);
  const body = (await json(res)).data;
  assert.ok(body.count >= 1);
  const mail = mailer.messages.find((m) => m.html?.includes("Confirm travel window"));
  assert.ok(mail);
  assert.match(mail.text, /Outstanding onboarding tasks/);
  assert.match(mail.text, /Confirm travel window/);
  assert.ok(mail.html);
  assertEmailSafe(mail.html);
  assert.match(mail.html, /Outstanding tasks/);
  assert.match(mail.html, /Confirm travel window/);
});

test("content deliverable reminders include task titles and due dates", async () => {
  const { app, mailer } = boot();
  const res = await app.request(`/api/events/${EVENT_ID}/content/reminders`, {
    method: "POST",
    headers: ORG,
    body: "{}",
  });
  assert.equal(res.status, 200);
  const mail = mailer.messages.find((m) => m.subject === "Speaker deliverables outstanding");
  assert.ok(mail);
  assert.match(mail.text, /Please complete:/);
  assert.ok(mail.html);
  assertEmailSafe(mail.html);
  assert.match(mail.html, /Outstanding tasks/);
  assert.match(mail.html, /Upload Final Headshot/);
});

test("reviewer invite emails branded HTML with the queue CTA", async () => {
  const { app, mailer } = boot();
  const round = store.reviewRounds[0]!;
  const email = `html.reviewer.${crypto.randomUUID()}@example.test`;
  const invited = await json(await app.request(`/api/events/${EVENT_ID}/review-rounds/${round.id}/reviewers`, {
    method: "POST",
    headers: ORG,
    body: JSON.stringify({ name: "HTML Reviewer", email }),
  }));
  const reviewer = invited.data.reviewer;
  const inviteRes = await app.request(`${ORIGIN}/api/events/${EVENT_ID}/review-rounds/${round.id}/invite-emails`, {
    method: "POST",
    headers: ORG,
    body: JSON.stringify({ reviewerIds: [reviewer.id] }),
  });
  assert.equal(inviteRes.status, 200);
  await json(inviteRes);
  const mail = mailer.messages.find((m) => m.to === email)!;
  assert.match(mail.text, /http:\/\/cue\.test\/r\?invite=/);
  assert.ok(mail.html);
  assertEmailSafe(mail.html);
  const href = extractFirstHttpUrl(mail.text)!;
  assert.match(mail.html, new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(mail.html, /Open your review queue/);
});

test("review reminders, bulk comms, CRM, auth magic-link, and MCP reminder all emit branded HTML", async () => {
  const { app, mailer } = boot();
  const reviewerId = store.reviewAssignments.find((a) => a.status === "assigned")!.reviewerId;

  const reviewReminder = await app.request(`/api/events/${EVENT_ID}/review-reminders`, {
    method: "POST",
    headers: ORG,
    body: JSON.stringify({ reviewerIds: [reviewerId] }),
  });
  assert.equal(reviewReminder.status, 200);

  const bulk = await app.request(`/api/events/${EVENT_ID}/comms/send`, {
    method: "POST",
    headers: ORG,
    body: JSON.stringify({ templateKey: "task_reminder", speakerId: "spk-ada" }),
  });
  assert.equal(bulk.status, 201);

  const contacts = (await json(await app.request("/api/crm/contacts", { headers: ORG }))).data as { id: string; email: string }[];
  const contact = contacts[0]!;
  const crm = await app.request("/api/crm/communicate", {
    method: "POST",
    headers: ORG,
    body: JSON.stringify({ contactIds: [contact.id], subject: "Hello from Ruckus", body: "Checking in about the summit." }),
  });
  assert.equal(crm.status, 201);

  const email = `html.magic.${crypto.randomUUID()}@example.test`;
  assert.equal((await app.request("/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "HTML Magic", email, password: "magic-password" }),
  })).status, 201);
  const magic = await app.request("/api/auth/magic-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  assert.equal(magic.status, 200);

  const task = store.tasks.find((t) => t.id === "task-sam-profile")!;
  task.status = "not_started";
  const mcp = await app.request("/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-mcp-secret" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "send_task_reminder", arguments: { speakerId: "spk-sam", taskId: task.id } } }),
  });
  assert.equal(mcp.status, 200);

  const kinds = mailer.messages.filter((m) => m.html);
  assert.ok(kinds.length >= 5, "each sender kind captured HTML");
  for (const message of kinds) {
    assert.equal(typeof message.text, "string");
    assert.ok(message.text.length > 0, "plain-text fallback remains");
    assertEmailSafe(message.html!);
  }
  const magicMail = mailer.messages.find((m) => m.to === email)!;
  assert.match(magicMail.text, /\/login\?token=/);
  const magicHref = extractFirstHttpUrl(magicMail.text)!;
  assert.match(magicMail.html!, new RegExp(`href="${magicHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  const crmMail = mailer.messages.find((m) => m.to === contact.email && m.subject === "Hello from Ruckus")!;
  assert.equal(crmMail.text, "Checking in about the summit.");
  assert.match(crmMail.html!, /Checking in about the summit/);
});

test("scheduled automation reminders emit branded HTML for speakers and reviewers", async () => {
  resetEventRegistry();
  const mailer = new MockMailer();
  const app = createApp({ repo: new MemoryRepository(), mailer, automationProviderDelivery: true });
  const life = getEventStore(EVENT_ID)!;
  const speakerId = `spk-html-auto-${crypto.randomUUID().slice(0, 6)}`;
  life.profiles.push({ speakerId, name: "HTML Auto", email: "html.auto@example.test" } as any);
  life.tasks.push({
    id: `task-html-auto`,
    speakerId,
    title: "Due automation HTML task",
    type: "confirm",
    required: true,
    status: "not_started",
    dueAt: new Date(Date.now() + 86400000).toISOString(),
  } as any);
  const res = await app.fetch(new Request("https://cue.internal/api/internal/automation/run", {
    method: "POST",
    headers: { "x-cue-automation": "scheduled" },
  }));
  assert.equal(res.status, 200);
  const speakerMail = mailer.messages.find((m) => m.to === "html.auto@example.test");
  assert.ok(speakerMail);
  assert.ok(speakerMail.html);
  assertEmailSafe(speakerMail.html);
  assert.match(speakerMail.html, /Outstanding tasks|Due automation HTML task|finish your speaker tasks/i);
  const reviewerMail = mailer.messages.find((m) => m.subject.includes("reviews outstanding"));
  assert.ok(reviewerMail?.html);
  assertEmailSafe(reviewerMail.html!);
  resetEventRegistry();
});

test("manual speaker add invite uses the branded shell", async () => {
  const { app, mailer } = boot();
  const email = `html.add.${crypto.randomUUID()}@example.test`;
  const created = await app.request(`/api/events/${EVENT_ID}/speakers`, {
    method: "POST",
    headers: ORG,
    body: JSON.stringify({ name: "HTML Added Speaker", email, sendInvite: true, createAsNew: true }),
  });
  assert.equal(created.status, 201);
  const mail = mailer.messages.find((m) => m.to === email);
  assert.ok(mail);
  assert.ok(mail.html);
  assertEmailSafe(mail.html);
  assert.ok(mail.text.length > 0);
});

test("brandedHtmlFor structured extras keep merge fields identical to the text body", () => {
  const text = "Hi Ada,\n\nCongratulations — \"Analytical Engines\" was accepted.";
  const html = brandedHtmlFor("You're speaking", text, {
    eventName: "AI Engineer Summit",
    kind: "acceptance",
    feedback: "Loved the systems angle.",
    ctaUrl: "https://cue.test/p?invite=x",
    ctaLabel: "Open your speaker portal",
  });
  assertEmailSafe(html);
  assert.match(html, /Hi Ada/);
  assert.match(html, /Analytical Engines/);
  assert.match(html, />ACCEPTED</);
  assert.match(html, /Loved the systems angle\./);
  assert.match(html, /href="https:\/\/cue\.test\/p\?invite=x"/);
});
