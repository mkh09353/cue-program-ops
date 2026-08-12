import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { EVENT_ID, issueSpeakerInvite, resolveSpeakerInvite, speakerInvitePath, store } from "../src/lifecycle.js";
import { SECOND_EVENT_ID, getEventStore, resetEventRegistry } from "../src/events.js";
import { MemoryRepository } from "../src/repository.js";
import { MockMailer } from "../src/mailer.js";

const ORG = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const json = async (r: Response) => (await r.json()) as any;
const ORIGIN = "http://cue.test";
const boot = () => {
  resetEventRegistry();
  // The seeded store is a module global shared by every test in this file: clear
  // previously issued tokens so each case starts from a known state.
  store.speakerInvites.length = 0;
  const mailer = new MockMailer();
  return { app: createApp({ repo: new MemoryRepository(), mailer }), mailer };
};

test("organizer portal invite issues a real token and emails the absolute link", async () => {
  const { app, mailer } = boot();
  const roster = (await json(await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: ORG }))).data;
  const speaker = roster[0];
  assert.ok(speaker?.speakerId, "a seeded speaker exists");

  const res = await app.request(`${ORIGIN}/api/events/${EVENT_ID}/speakers/${speaker.speakerId}/invite`, {
    method: "POST", headers: ORG, body: "{}",
  });
  assert.equal(res.status, 200);
  const data = (await json(res)).data;
  assert.equal(data.mode, "speaker_access_token");
  assert.match(data.portalPath, /^\/p\?invite=/, "the link is a tokenized portal path");
  assert.equal(data.portalUrl, `${ORIGIN}${data.portalPath}`, "an absolute URL is returned for the email");
  assert.ok(data.expiresAt && Date.parse(data.expiresAt) > Date.now(), "the token expires");

  // The token is persisted on the lifecycle store (snapshot-covered).
  const token = new URL(data.portalUrl).searchParams.get("invite")!;
  const stored = store.speakerInvites.find((x) => x.token === token);
  assert.ok(stored, "token persisted in the lifecycle store");
  assert.equal(stored.speakerId, speaker.speakerId);
  assert.equal(stored.eventId, EVENT_ID);

  // The delivered email body carries the link.
  const mail = mailer.messages.at(-1)!;
  assert.ok(mail, "an email was sent");
  assert.ok(mail.text.includes(data.portalUrl), "email body contains the magic link");
  assert.match(mail.text, /do not forward/i, "and says it is personal");
});

test("resolution endpoint returns the speaker and owning event", async () => {
  const { app } = boot();
  const roster = (await json(await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: ORG }))).data;
  const speaker = roster[0];
  const invite = (await json(await app.request(`${ORIGIN}/api/events/${EVENT_ID}/speakers/${speaker.speakerId}/invite`, {
    method: "POST", headers: ORG, body: "{}",
  }))).data;
  const token = new URL(invite.portalUrl).searchParams.get("invite")!;

  const resolved = await app.request(`/api/public/speaker-invites/${token}`);
  assert.equal(resolved.status, 200);
  const body = (await json(resolved)).data;
  assert.equal(body.eventId, EVENT_ID);
  assert.equal(body.speakerId, speaker.speakerId);
  assert.equal(body.speaker.role, "speaker");
  assert.equal(body.speaker.speakerId, speaker.speakerId);
  assert.equal(body.mode, "speaker_access_token");
});

test("invalid, unknown and expired tokens fail explicitly — never a fallback persona", async () => {
  const { app } = boot();
  for (const token of ["not-a-token", crypto.randomUUID()]) {
    const r = await app.request(`/api/public/speaker-invites/${token}`);
    assert.equal(r.status, 404, `${token} rejected`);
    assert.match((await json(r)).error.message, /invalid or expired/i);
    }

  // An expired token is refused even though it exists.
  const speakerId = store.profiles[0].speakerId;
  const invite = issueSpeakerInvite(speakerId)!;
  invite.expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.equal((await app.request(`/api/public/speaker-invites/${invite.token}`)).status, 404);
  assert.equal(resolveSpeakerInvite(invite.token, store), undefined);

  // A revoked token is refused too.
  const revoked = issueSpeakerInvite(store.profiles[1].speakerId)!;
  revoked.revokedAt = new Date().toISOString();
  assert.equal((await app.request(`/api/public/speaker-invites/${revoked.token}`)).status, 404);
});

test("tokens are per-speaker and scoped to their own event", async () => {
  const { app } = boot();
  const a = issueSpeakerInvite(store.profiles[0].speakerId)!;
  const b = issueSpeakerInvite(store.profiles[1].speakerId)!;
  assert.notEqual(a.token, b.token, "each speaker gets a distinct token");
  assert.equal((await json(await app.request(`/api/public/speaker-invites/${a.token}`))).data.speakerId, store.profiles[0].speakerId);
  assert.equal((await json(await app.request(`/api/public/speaker-invites/${b.token}`))).data.speakerId, store.profiles[1].speakerId);

  // A token never resolves inside another event's store.
  const other = getEventStore(SECOND_EVENT_ID)!;
  assert.equal(resolveSpeakerInvite(a.token, other), undefined, "not valid in the fixture event");
  assert.equal((await json(await app.request(`/api/public/speaker-invites/${a.token}`))).data.eventId, EVENT_ID);
});

test("re-inviting reuses the live token so earlier emails keep working", async () => {
  const { app } = boot();
  const speakerId = store.profiles[0].speakerId;
  const first = (await json(await app.request(`${ORIGIN}/api/events/${EVENT_ID}/speakers/${speakerId}/invite`, { method: "POST", headers: ORG, body: "{}" }))).data;
  const second = (await json(await app.request(`${ORIGIN}/api/events/${EVENT_ID}/speakers/${speakerId}/invite`, { method: "POST", headers: ORG, body: "{}" }))).data;
  assert.equal(first.portalUrl, second.portalUrl, "the same live link is re-sent");
  const live = store.speakerInvites.filter(
    (x) => x.speakerId === speakerId && !x.revokedAt && (!x.expiresAt || Date.parse(x.expiresAt) > Date.now()),
  );
  assert.equal(live.length, 1, "no duplicate live token is minted");
});

test("public CFP submission returns a portal link and emails it to the submitter", async () => {
  const { app, mailer } = boot();
  const res = await app.request(`${ORIGIN}/api/public/events/ai-engineer-summit/submissions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Magic Link Speaker", email: "magic@example.test",
      answers: { title: "Magic link talk", abstract: "M".repeat(60), category: "AI Engineering", format: "Talk (30 min)", experience: "Beginner" },
    }),
  });
  assert.equal(res.status, 201);
  const data = (await json(res)).data;
  assert.match(data.portalPath, /^\/p\?invite=/, "confirmation payload carries the tokenized link");
  assert.equal(data.portalUrl, `${ORIGIN}${data.portalPath}`);
  assert.ok(data.portalToken, "and the raw token");

  // It resolves to the submitter, in this event.
  const resolved = (await json(await app.request(`/api/public/speaker-invites/${data.portalToken}`))).data;
  assert.equal(resolved.speakerId, data.speakerId);
  assert.equal(resolved.eventId, EVENT_ID);

  // The confirmation email contains the same link.
  const mail = mailer.messages.find((m) => m.to === "magic@example.test");
  assert.ok(mail, "a confirmation email was sent to the submitter");
  assert.ok(mail!.text.includes(data.portalUrl), "confirmation email contains the portal link");
});

test("the portal shell honors ?invite= before any persona fallback", () => {
  const shells = readFileSync("src/web/components/shells.tsx", "utf8");
  const portal = shells.slice(shells.indexOf("export function PortalShell"));
  assert.match(portal, /api\s*\n?\s*\.resolveSpeakerInvite\(inviteToken\)/, "the shell resolves the token server-side");
  const resolveAt = portal.indexOf("resolveSpeakerInvite(inviteToken)");
  const roleSyncAt = portal.indexOf('useRoleSync("speaker")');
  assert.ok(resolveAt > 0 && resolveAt < roleSyncAt, "invite resolution is declared before the fallback resolver runs");
  assert.match(portal, /setActiveEventId\(r\.data\.eventId\)/, "it selects the owning event");
  assert.match(portal, /setPersona\(r\.data\.speaker, \{ explicit: true \}\)/, "and the speaker's own persona");
  assert.match(portal, /data-testid="speaker-invite-error"/, "invalid links fail explicitly");
  assert.match(portal, /never\s*\n?\s*sign you in as a different speaker|never sign you in as a different speaker/);
});

test("honest labeling: magic links are tokens, demo picker still available", () => {
  const roster = readFileSync("src/web/pages/SpeakersCommsPages.tsx", "utf8");
  assert.match(roster, /data-testid="speaker-portal-link"/);
  assert.match(roster, /Per-speaker access token, not a password account/);
  assert.match(roster, /credential-free demo persona picker also remains/);

  const cfp = readFileSync("src/web/pages/PublicReviewerPages.tsx", "utf8");
  assert.match(cfp, /data-testid="portal-magic-link"/);
  assert.match(cfp, /per-speaker access token, not a\s*\n?\s*password account/);
});

test("speaker invite paths are stable and url-safe", () => {
  assert.equal(speakerInvitePath("abc-123"), "/p?invite=abc-123");
  assert.equal(speakerInvitePath("a b&c"), "/p?invite=a%20b%26c");
  assert.equal(issueSpeakerInvite("spk-does-not-exist"), undefined, "unknown speakers get no token");
});

test("tokens survive a snapshot save/restore cycle", async () => {
  const { InMemorySnapshotStore } = await import("../src/persistence.js");
  const { restoreSnapshot } = await import("../src/app.js");
  resetEventRegistry();
  store.speakerInvites.length = 0;
  const persistence = new InMemorySnapshotStore();
  const app = createApp({ repo: new MemoryRepository(), persistence, mailer: new MockMailer() });

  const speakerId = store.profiles[0].speakerId;
  const invite = (await json(await app.request(`${ORIGIN}/api/events/${EVENT_ID}/speakers/${speakerId}/invite`, {
    method: "POST", headers: ORG, body: "{}",
  }))).data;
  const token = new URL(invite.portalUrl).searchParams.get("invite")!;

  const snapshot = await persistence.load(EVENT_ID);
  assert.ok(snapshot?.lifecycle.speakerInvites?.some((x: any) => x.token === token), "the token is inside the saved snapshot");

  // Simulate a cold boot: wipe in-memory tokens, restore, and the link still works.
  store.speakerInvites.length = 0;
  const rebooted = new MemoryRepository();
  assert.equal(await restoreSnapshot({ repo: rebooted, persistence }), true);
  assert.ok(store.speakerInvites.some((x) => x.token === token), "restored into the live store");
  const app2 = createApp({ repo: rebooted, persistence });
  const resolved = await app2.request(`/api/public/speaker-invites/${token}`);
  assert.equal(resolved.status, 200, "the magic link still resolves after a restart");
  assert.equal((await json(resolved)).data.speakerId, speakerId);
  resetEventRegistry();
});
