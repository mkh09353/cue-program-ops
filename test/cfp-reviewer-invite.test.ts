import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";

const H = (persona: string) => ({ "content-type": "application/json", "x-demo-persona": persona });
const json = async (response: Response) => ({ response, body: await response.json() as any });

test("organizer issues a demo link that resolves the exact invited reviewer and retains scoped queue", async () => {
  const app = createApp();
  const round = store.reviewRounds[0]!;
  const email = `cfp-invite-${crypto.randomUUID()}@example.test`;
  const invited = await json(await app.request(`/api/events/${EVENT_ID}/review-rounds/${round.id}/reviewers`, {
    method: "POST", headers: H("org-swyx"), body: JSON.stringify({ name: "CFP Invite Reviewer", email }),
  }));
  assert.equal(invited.response.status, 201);
  const reviewer = invited.body.data.reviewer;

  const forbidden = await app.request(`/api/events/${EVENT_ID}/reviewers/${reviewer.id}/invite-link`, {
    method: "POST", headers: H("rev-ada"), body: JSON.stringify({ roundId: round.id }),
  });
  assert.equal(forbidden.status, 403);

  const issued = await json(await app.request(`/api/events/${EVENT_ID}/reviewers/${reviewer.id}/invite-link`, {
    method: "POST", headers: H("org-swyx"), body: JSON.stringify({ roundId: round.id }),
  }));
  assert.equal(issued.response.status, 201);
  assert.equal(issued.body.data.mode, "demo_persona_link");
  assert.match(issued.body.data.invitePath, /^\/r\?invite=/);
  const token = new URL(issued.body.data.inviteUrl).searchParams.get("invite")!;
  assert.match(token, /^[0-9a-f-]{36}$/);

  const resolved = await json(await app.request(`/api/public/reviewer-invites/${token}`));
  assert.equal(resolved.response.status, 200);
  assert.equal(resolved.body.data.reviewer.id, reviewer.id);
  assert.equal(resolved.body.data.reviewer.email, email);
  assert.equal(resolved.body.data.roundId, round.id);

  const first = store.submissions.find((submission) => submission.status !== "draft")!;
  const second = store.submissions.find((submission) => submission.status !== "draft" && submission.id !== first.id)!;
  await app.request(`/api/events/${EVENT_ID}/review-assignments`, {
    method: "POST", headers: H("org-swyx"),
    body: JSON.stringify({ roundId: round.id, submissionIds: [first.id], reviewerId: reviewer.id, method: "specific" }),
  });
  const queue = await json(await app.request(`/api/events/${EVENT_ID}/reviewer-queue`, { headers: H(resolved.body.data.reviewer.id) }));
  assert.equal(queue.response.status, 200);
  assert.ok(queue.body.data.some((row: any) => row.submissionId === first.id));
  assert.ok(!queue.body.data.some((row: any) => row.submissionId === second.id), "invite must not broaden assignment scope");
});

test("invalid demo invite fails explicitly and reviewer shell does not run fallback first", async () => {
  const app = createApp();
  const invalid = await json(await app.request(`/api/public/reviewer-invites/${crypto.randomUUID()}`));
  assert.equal(invalid.response.status, 404);
  assert.match(invalid.body.error.message, /invalid or expired/);

  const shell = readFileSync(new URL("../src/web/components/shells.tsx", import.meta.url), "utf8");
  const reviewer = shell.slice(shell.indexOf("export function ReviewerShell"), shell.indexOf("export function PortalShell"));
  assert.match(reviewer, /resolveReviewerInvite\(inviteToken\)/);
  assert.match(reviewer, /No reviewer persona was selected/);
  assert.ok(reviewer.indexOf("resolveReviewerInvite(inviteToken)") < reviewer.indexOf('resolvePortalPersona("reviewer")') || reviewer.includes('if(!inviteToken){resolvePortalPersona("reviewer")'), "fallback is restricted to requests without an invite token");

  const settings = readFileSync(new URL("../src/web/pages/PublishFormsSettings.tsx", import.meta.url), "utf8");
  assert.match(settings, /Copy reviewer access link/);
  assert.match(settings, /not password authentication or a production login/);
});

test("every review-management invite surface issues and persistently shows the demo access link", () => {
  const page = readFileSync(new URL("../src/web/pages/ReviewManagementPages.tsx", import.meta.url), "utf8");
  const inviteCalls = page.match(/api\.inviteReviewer\(/g) || [];
  const linkCalls = page.match(/api\.issueReviewerInviteLink\(/g) || [];
  assert.equal(inviteCalls.length, 2, "fixture: Evaluation Plan and Assignments each have an invite control");
  assert.equal(linkCalls.length, inviteCalls.length, "every reviewer invite call must issue a demo access link");
  assert.match(page, /data-testid="review-management-reviewer-demo-access-link"/);
  assert.match(page, /Reviewer invited: \{invite\.name\}/);
  assert.match(page, /\{invite\.email\}/);
  assert.match(page, /aria-label="Reviewer demo access link"/);
  assert.match(page, /Copy reviewer access link/);
  assert.match(page, /It is credential-free demo persona access, not password authentication or a production login\./);
  assert.match(page, /saved\(\)/, "Evaluation Plan refreshes rounds and persona bootstrap after invite");
  assert.match(page, /reloadRounds\(\);reloadBoot\(\)/, "Assignments refreshes rounds and personas after invite");
});
