import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createApp, restoreSnapshot } from "../src/app.js";
import { authStore, emptyAuthState, hydrateAuthState } from "../src/auth.js";
import { EVENT_ID } from "../src/lifecycle.js";
import { MockMailer } from "../src/mailer.js";
import { InMemorySnapshotStore } from "../src/persistence.js";
import { MemoryRepository } from "../src/repository.js";

const jsonHeaders = { "content-type": "application/json" };
const uniqueEmail = (label: string) => `${label}-${crypto.randomUUID()}@example.test`;
const cookieFrom = (response: Response) => {
  const header = response.headers.get("set-cookie");
  assert.ok(header, "response must set a session cookie");
  return header.split(";", 1)[0];
};
const post = (app: ReturnType<typeof createApp>, path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) =>
  app.request(path, { method: "POST", headers: { ...jsonHeaders, ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => hydrateAuthState(emptyAuthState()));

test("signup, logout, and login complete a cookie-backed roundtrip", async () => {
  const app = createApp();
  const email = uniqueEmail("roundtrip");
  const signup = await post(app, "/api/auth/signup", { name: "Auth Operator", email, password: "correct horse battery staple" });
  assert.equal(signup.status, 201);
  const firstCookie = cookieFrom(signup);
  assert.equal((await app.request("/api/auth/me", { headers: { cookie: firstCookie } })).status, 200);

  const logout = await post(app, "/api/auth/logout", undefined, firstCookie);
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie") || "", /Max-Age=0/);
  assert.equal((await app.request("/api/auth/me", { headers: { cookie: firstCookie } })).status, 401);

  const login = await post(app, "/api/auth/login", { email, password: "correct horse battery staple" });
  assert.equal(login.status, 200);
  assert.notEqual(cookieFrom(login), firstCookie);
});

test("login rejects a wrong password", async () => {
  const app = createApp();
  const email = uniqueEmail("wrong-password");
  assert.equal((await post(app, "/api/auth/signup", { name: "Password User", email, password: "a-good-password" })).status, 201);
  const rejected = await post(app, "/api/auth/login", { email, password: "not-the-password" });
  assert.equal(rejected.status, 401);
  assert.equal(rejected.headers.get("set-cookie"), null);
});

test("session cookie grants organizer access and a bogus cookie cannot fall through to demo headers", async () => {
  const app = createApp();
  const signup = await post(app, "/api/auth/signup", { name: "Organizer", email: uniqueEmail("organizer"), password: "organizer-password" });
  const cookie = cookieFrom(signup);
  const allowed = await app.request(`/api/events/${EVENT_ID}/settings`, { method: "PUT", headers: { ...jsonHeaders, cookie }, body: JSON.stringify({ website: "https://cookie-auth.example.test" }) });
  assert.equal(allowed.status, 200);

  const denied = await app.request(`/api/events/${EVENT_ID}/settings`, { method: "PUT", headers: { ...jsonHeaders, cookie: "cue_session=bogus", "x-demo-persona": "org-swyx" }, body: JSON.stringify({ website: "https://denied.example.test" }) });
  assert.equal(denied.status, 403);
});

test("MockMailer magic link is captured, exposed as demo-only, and consumed once", async () => {
  const mailer = new MockMailer();
  const app = createApp({ mailer });
  const email = uniqueEmail("magic");
  assert.equal((await post(app, "/api/auth/signup", { name: "Magic User", email, password: "magic-password" })).status, 201);

  const issued = await post(app, "/api/auth/magic-link", { email });
  assert.equal(issued.status, 200);
  const body = await issued.json() as any;
  assert.equal(body.data.demoOnly, true);
  assert.equal(typeof body.data.demoOnlyLoginUrl, "string");
  assert.equal(mailer.messages.length, 1);
  assert.match(mailer.messages[0].text, /\/login\?token=/);
  assert.equal(mailer.messages[0].text.includes(body.data.demoOnlyLoginUrl), true);

  const token = new URL(body.data.demoOnlyLoginUrl).searchParams.get("token");
  assert.ok(token);
  const consumed = await post(app, "/api/auth/magic-link/consume", { token });
  assert.equal(consumed.status, 200);
  cookieFrom(consumed);
  assert.equal((await post(app, "/api/auth/magic-link/consume", { token })).status, 400, "magic links are one-time capabilities");
});

test("invitation acceptance creates membership and a session", async () => {
  const mailer = new MockMailer();
  const app = createApp({ mailer });
  const owner = await post(app, "/api/auth/signup", { name: "Owner", email: uniqueEmail("owner"), password: "owner-password" });
  const ownerCookie = cookieFrom(owner);
  const ownerBody = await owner.json() as any;
  const invitedEmail = uniqueEmail("invitee");
  const issued = await post(app, "/api/auth/invitations", { email: invitedEmail, orgId: ownerBody.data.organization.id, role: "member" }, ownerCookie);
  assert.equal(issued.status, 201);
  const issuedBody = await issued.json() as any;
  assert.equal(issuedBody.data.demoOnly, true);
  assert.equal(mailer.messages.length, 1);
  const token = new URL(issuedBody.data.demoOnlyAcceptUrl).searchParams.get("invitation");
  assert.ok(token);

  const accepted = await post(app, "/api/auth/invitations/accept", { token, name: "Invited Member", password: "invitee-password" });
  assert.equal(accepted.status, 200);
  const inviteeCookie = cookieFrom(accepted);
  const me = await app.request("/api/auth/me", { headers: { cookie: inviteeCookie } });
  assert.equal(me.status, 200);
  const meBody = await me.json() as any;
  assert.deepEqual(meBody.data.orgMemberships, [{ userId: meBody.data.user.id, orgId: ownerBody.data.organization.id, role: "member" }]);
});

test("one-click demo logins create sessions for organizer, reviewer, and speaker", async () => {
  const app = createApp();
  for (const [persona, target] of [["organizer", "/app"], ["reviewer", "/r"], ["speaker", "/p"]] as const) {
    const response = await app.request(`/api/auth/demo/${persona}`);
    assert.equal(response.status, 200);
    cookieFrom(response);
    assert.deepEqual(await response.json(), { data: { target } });
  }
});

test("snapshot persistence and restoration retain auth users and sessions", async () => {
  const persistence = new InMemorySnapshotStore();
  const app = createApp({ repo: new MemoryRepository(), persistence });
  const email = uniqueEmail("snapshot");
  const signup = await post(app, "/api/auth/signup", { name: "Persisted User", email, password: "persisted-password" });
  const cookie = cookieFrom(signup);
  assert.ok(authStore.users.some((user) => user.email === email));

  hydrateAuthState(emptyAuthState());
  assert.equal(authStore.users.some((user) => user.email === email), false);
  assert.equal(await restoreSnapshot({ repo: new MemoryRepository(), persistence }), true);
  const restoredApp = createApp({ repo: new MemoryRepository(), persistence });
  const me = await restoredApp.request("/api/auth/me", { headers: { cookie, "x-cue-event": EVENT_ID } });
  assert.equal(me.status, 200);
  assert.equal(((await me.json()) as any).data.user.email, email);
});
