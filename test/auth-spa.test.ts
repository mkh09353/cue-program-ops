import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { createApp } from "../src/app.js";
import { MemoryRepository } from "../src/repository.js";
import { LoginPage, SignupPage, DEMO_ROLES, parseDemoRole } from "../src/web/pages/AuthPages.js";
import { sessionHome, resetSessionCache } from "../src/web/lib/auth.js";

const render = (element: any, location: string) =>
  renderToStaticMarkup(createElement(StaticRouter, { location } as any, element));

// —— SPA sign-in screens ——

test("/login renders the three one-click demo buttons, password form and magic link", () => {
  resetSessionCache();
  const html = render(createElement(LoginPage), "/login");
  for (const role of ["organizer", "reviewer", "speaker"]) {
    assert.ok(html.includes(`data-testid="demo-login-${role}"`), `missing demo button for ${role}`);
  }
  assert.ok(/Enter as Organizer/.test(html) && /Enter as Reviewer/.test(html) && /Enter as Speaker/.test(html));
  assert.ok(html.includes('data-testid="login-email"') && html.includes('data-testid="login-password"'));
  assert.ok(html.includes('data-testid="login-submit"'));
  assert.ok(html.includes('data-testid="magic-email"') && html.includes('data-testid="magic-submit"'));
  assert.ok(/Email me a magic link/.test(html), "magic-link CTA is labelled");
  assert.ok(html.includes('href="/signup"'), "links to the signup route");
});

test("/signup renders name, email and password fields", () => {
  resetSessionCache();
  const html = render(createElement(SignupPage), "/signup");
  assert.ok(html.includes('data-testid="signup-name"'));
  assert.ok(html.includes('data-testid="signup-email"'));
  assert.ok(html.includes('data-testid="signup-password"'));
  assert.ok(html.includes('data-testid="signup-submit"'));
  assert.ok(html.includes('href="/login"'), "offers a way back to sign-in");
});

test("demo role parsing accepts only the three server-backed personas", () => {
  assert.equal(parseDemoRole("organizer"), "organizer");
  assert.equal(parseDemoRole("Reviewer"), "reviewer");
  assert.equal(parseDemoRole("speaker"), "speaker");
  assert.equal(parseDemoRole("admin"), null);
  assert.equal(parseDemoRole(null), null);
  assert.deepEqual(DEMO_ROLES.map((d) => d.target), ["/app", "/r", "/p"]);
});

test("session landing prefers organizer, then reviewer, then speaker", () => {
  const info = (roles: string[]) =>
    ({ user: { id: "u", name: "n", email: "e" }, orgMemberships: [], eventRoles: [], roleHints: roles.map((role) => ({ role })) }) as any;
  assert.equal(sessionHome(info(["organizer"])), "/app");
  assert.equal(sessionHome(info(["reviewer"])), "/r");
  assert.equal(sessionHome(info(["speaker"])), "/p");
  assert.equal(sessionHome(info(["speaker", "organizer"])), "/app");
  assert.equal(sessionHome(null), "/app");
});

// —— The SPA's expectations of the real auth API ——

test("demo sign-in returns the shell target the login page navigates to", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  for (const [persona, target] of [["organizer", "/app"], ["reviewer", "/r"], ["speaker", "/p"]] as const) {
    const res = await app.request(`/api/auth/demo/${persona}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.data.target, target);
    assert.match(res.headers.get("set-cookie") || "", /cue_session=/, "a session cookie is set");
  }
  assert.equal((await app.request("/api/auth/demo/superuser")).status, 404);
});

test("the magic-link response carries a demo-only login url the page can surface", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  await app.request("/api/auth/demo/organizer"); // seeds the demo identities
  const res = await app.request("/api/auth/magic-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "dana@demo.cue.dev" }),
  });
  const body = (await res.json()) as any;
  assert.equal(body.data.accepted, true);
  assert.equal(body.data.delivery, "mock_sent");
  assert.ok(String(body.data.demoOnlyLoginUrl).includes("/login?token="), "the demo url targets the SPA /login route");
  const source = readFileSync("src/web/pages/AuthPages.tsx", "utf8");
  assert.ok(source.includes("demoOnlyLoginUrl"), "the page reads the field the API actually returns");
});

test("routes and shells are wired for sessions", () => {
  const main = readFileSync("src/web/main.tsx", "utf8");
  assert.ok(main.includes('path="/login"') && main.includes('path="/signup"'), "auth routes exist");
  assert.ok(main.includes("refreshSession()"), "the session is resolved on load");
  const shells = readFileSync("src/web/components/shells.tsx", "utf8");
  assert.ok(shells.includes("<SessionBadge"), "shell headers show session identity");
  assert.ok(shells.includes("PersonaSwitcher"), "persona simulation is still available");
  const auth = readFileSync("src/web/lib/auth.ts", "utf8");
  assert.ok(auth.includes('credentials: "include"'), "session cookies are sent");
  const demo = readFileSync("src/web/pages/PublicReviewerPages.tsx", "utf8");
  assert.ok(demo.includes("/login?demo="), "the demo launcher deep-links real sign-in");
});
