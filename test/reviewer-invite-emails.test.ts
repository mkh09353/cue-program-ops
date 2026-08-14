import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { MockMailer } from "../src/mailer.js";

const H = (persona: string) => ({ "content-type": "application/json", "x-demo-persona": persona });
const json = async (response: Response) => ({ response, body: await response.json() as any });

test("organizer invite-emails sends once, logs comms, and skips already-sent reviewers", async () => {
  const mailer = new MockMailer();
  const app = createApp({ mailer });
  const round = store.reviewRounds[0]!;
  const email = `invite-mail-${crypto.randomUUID()}@example.test`;
  const invited = await json(await app.request(`/api/events/${EVENT_ID}/review-rounds/${round.id}/reviewers`, {
    method: "POST", headers: H("org-swyx"), body: JSON.stringify({ name: "Invite Mail Reviewer", email }),
  }));
  assert.equal(invited.response.status, 201);
  const reviewer = invited.body.data.reviewer;
  const commsBefore = store.communications.length;
  const mailBefore = mailer.messages.length;

  const first = await json(await app.request(`http://demo.ruckus.to/api/events/${EVENT_ID}/review-rounds/${round.id}/invite-emails`, {
    method: "POST", headers: H("org-swyx"), body: JSON.stringify({ reviewerIds: [reviewer.id] }),
  }));
  assert.equal(first.response.status, 200);
  assert.equal(first.body.data.length, 1);
  assert.equal(first.body.data[0].reviewerId, reviewer.id);
  assert.equal(first.body.data[0].status, "sent");
  assert.equal(mailer.messages.length, mailBefore + 1);
  const message = mailer.messages.at(-1)!;
  assert.equal(message.to, email);
  assert.match(message.subject, /Ruckus/);
  assert.match(message.text, /reviewer queue/i);
  assert.match(message.text, new RegExp(round.name));
  assert.match(message.text, /http:\/\/demo\.ruckus\.to\/r\?invite=/);
  assert.doesNotMatch(message.text, /https?:\/\/(?!demo\.ruckus\.to)/);
  const invites = store.reviewerInvites.filter((x) => x.reviewerId === reviewer.id && x.roundId === round.id);
  assert.equal(invites.length, 1);
  const rows = store.communications.filter((row) => row.kind === "reviewer_invite" && row.recipientEmail === email && row.roundId === round.id);
  assert.equal(rows.length, store.communications.length - commsBefore);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.recipientName, reviewer.name);
  assert.ok(["mock_sent", "sent"].includes(rows[0]!.status));

  const second = await json(await app.request(`http://demo.ruckus.to/api/events/${EVENT_ID}/review-rounds/${round.id}/invite-emails`, {
    method: "POST", headers: H("org-swyx"), body: JSON.stringify({ reviewerIds: [reviewer.id] }),
  }));
  assert.equal(second.response.status, 200);
  assert.equal(second.body.data[0].status, "skipped_already_sent");
  assert.equal(mailer.messages.length, mailBefore + 1);
  assert.equal(store.communications.filter((row) => row.kind === "reviewer_invite" && row.recipientEmail === email && row.roundId === round.id).length, 1);
});

test("invite-emails rejects non-member reviewers and non-organizers", async () => {
  const mailer = new MockMailer();
  const app = createApp({ mailer });
  const round = store.reviewRounds[0]!;
  const mailBefore = mailer.messages.length;

  const forbidden = await json(await app.request(`/api/events/${EVENT_ID}/review-rounds/${round.id}/invite-emails`, {
    method: "POST", headers: H("rev-ada"), body: JSON.stringify({ reviewerIds: [round.reviewerIds[0]] }),
  }));
  assert.equal(forbidden.response.status, 403);

  const outsiderId = `rev-outsider-${crypto.randomUUID().slice(0, 8)}`;
  store.personas.push({ id: outsiderId, role: "reviewer", name: "Outside Reviewer", email: `${outsiderId}@example.test` });
  const rejected = await json(await app.request(`/api/events/${EVENT_ID}/review-rounds/${round.id}/invite-emails`, {
    method: "POST", headers: H("org-swyx"), body: JSON.stringify({ reviewerIds: [outsiderId] }),
  }));
  assert.equal(rejected.response.status, 400);
  assert.match(rejected.body.error.message, /not a member/i);
  assert.equal(mailer.messages.length, mailBefore);
});
