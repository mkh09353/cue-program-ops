import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { createApp } from "../src/app.js";
import { EVENT_ID } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";
import { SessionsTable, filterSessions, placementLabel } from "../src/web/pages/SessionsPage.js";
import { LifecycleChecklistCard, lifecycleHref } from "../src/web/pages/CommandPage.js";
import { embedSnippet, normalizeSnippetFormat } from "../src/web/pages/PublishFormsSettings.js";
import { ORGANIZER_PAGES } from "../src/web/components/CommandPalette.js";

const org = { "content-type": "application/json", "x-demo-persona": "org-swyx" } as const;
const render = (element: any, location = "/app") =>
  renderToStaticMarkup(createElement(StaticRouter, { location } as any, element));

// —— Sessions page ——

test("session filters split approved, draft and cancelled without double counting", () => {
  const rows = [
    { id: "a", publicationState: "approved", cancelled: false },
    { id: "b", publicationState: "draft", cancelled: false },
    { id: "c", publicationState: "approved", cancelled: true },
  ];
  assert.deepEqual(filterSessions(rows, "").map((r) => r.id), ["a", "b", "c"]);
  assert.deepEqual(filterSessions(rows, "approved").map((r) => r.id), ["a"], "a cancelled session is not 'approved'");
  assert.deepEqual(filterSessions(rows, "draft").map((r) => r.id), ["b"]);
  assert.deepEqual(filterSessions(rows, "cancelled").map((r) => r.id), ["c"]);
});

test("placement label reads room + time, or says the session is unscheduled", () => {
  assert.equal(placementLabel(null), "Not scheduled");
  const label = placementLabel({ room: "Main Hall", startsAt: "2026-10-12T17:00:00.000Z", endsAt: "2026-10-12T17:45:00.000Z" });
  assert.match(label, /Main Hall/);
  assert.match(label, /Oct 12, 2026/);
});

test("the sessions route, nav entry and palette destination all exist", () => {
  const main = readFileSync("src/web/main.tsx", "utf8");
  assert.match(main, /path="sessions" element={<SessionsPage \/>}/, "/app/sessions is routed");
  const shells = readFileSync("src/web/components/shells.tsx", "utf8");
  assert.match(shells, /to: "\/app\/sessions", label: "Sessions"/, "organizer nav lists Sessions");
  assert.ok(ORGANIZER_PAGES.some((p) => p.to === "/app/sessions"), "command palette can jump to Sessions");
});

test("session row actions are labelled buttons, not icon-only controls", () => {
  const src = readFileSync("src/web/pages/SessionsPage.tsx", "utf8");
  for (const label of [">Approve<", ">Unapprove<", ">Cancel<", ">Uncancel<"]) {
    assert.ok(src.includes(label) || src.includes(label.replace(/[<>]/g, "")), `missing a labelled ${label} action`);
  }
  assert.match(src, /api\.setSessionState\(row\.id, action, body\)/, "actions call the real endpoint");
  assert.match(src, /session-cancel-reason/, "cancel prompts for an optional reason");
});

test("sessions-list and the operational mutations behave as the page expects", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const list = async () => (await (await app.request(`/api/events/${EVENT_ID}/sessions-list`, { headers: org })).json()) as any;
  const first = await list();
  assert.ok(first.data.length > 0);
  const row = first.data[0];
  for (const key of ["id", "code", "title", "speakers", "schedule", "publicationState", "cancelled", "source"]) {
    assert.ok(key in row, `sessions-list row is missing ${key}`);
  }
  assert.ok(["cfp", "manual"].includes(row.source));
  const post = (action: string, body: any = {}) =>
    app.request(`/api/events/${EVENT_ID}/sessions/${row.id}/${action}`, { method: "POST", headers: org, body: JSON.stringify(body) });
  assert.equal((await post("unapprove")).status, 200);
  assert.equal((await post("cancel", { reason: "speaker travel" })).status, 200);
  const cancelled = await list();
  const after = cancelled.data.find((x: any) => x.id === row.id);
  assert.equal(after.publicationState, "draft");
  assert.equal(after.cancelled, true);
  assert.equal(after.cancellationReason, "speaker travel");
  assert.equal(cancelled.meta.cancelled, 1);
  assert.equal((await post("uncancel")).status, 200);
  assert.equal((await post("approve")).status, 200);
  const restored = (await list()).data.find((x: any) => x.id === row.id);
  assert.equal(restored.publicationState, "approved");
  assert.equal(restored.cancelled, false);
});

test("the roster table renders real sessions-list rows end to end", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  await app.request(`/api/events/${EVENT_ID}/sessions/ses-analytical/cancel`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({ reason: "venue change" }),
  });
  const body = (await (await app.request(`/api/events/${EVENT_ID}/sessions-list`, { headers: org })).json()) as any;
  const html = render(createElement(SessionsTable, { rows: body.data, onAction: () => {} }));
  const row = body.data.find((x: any) => x.id === "ses-analytical");
  assert.ok(html.includes(row.code), "the session code is rendered");
  assert.ok(html.includes(row.title), "the title is rendered");
  assert.ok(html.includes(row.speakers[0].name), "speakers are rendered");
  assert.ok(html.includes(row.schedule.room), "the schedule placement is rendered");
  assert.match(html, /Cancelled/, "the cancelled flag is visible");
  assert.ok(html.includes("venue change"), "the cancellation reason is shown");
  assert.match(html, /CFP/, "the source is shown");
  assert.match(html, />Approve<|>Unapprove</, "labelled approval action");
  assert.match(html, /data-testid="session-row-ses-analytical"/);
});

// —— Dashboard lifecycle checklist ——

test("the lifecycle card renders every step with progress and working links", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const body = (await (await app.request(`/api/events/${EVENT_ID}/lifecycle`, { headers: org })).json()) as any;
  const steps = body.data;
  assert.equal(steps.length, 7, "the checklist is the documented 7 steps");
  const html = render(createElement(LifecycleChecklistCard, { steps }));
  assert.match(html, new RegExp(`${steps.filter((s: any) => s.done).length} of 7 complete`));
  for (const step of steps) {
    assert.ok(html.includes(step.title), `missing step ${step.title}`);
    assert.ok(html.includes(step.detail), `missing detail for ${step.title}`);
  }
  assert.match(html, /✓/, "completed steps show a checkmark");
  const routes = readFileSync("src/web/main.tsx", "utf8");
  for (const step of steps) {
    const path = lifecycleHref(step.href).replace(/^\/app\/?/, "");
    assert.ok(!path || routes.includes(`path="${path}"`), `checklist step ${step.id} links to a dead route: ${lifecycleHref(step.href)}`);
  }
});

test("legacy lifecycle hrefs are mapped onto real SPA routes", () => {
  assert.equal(lifecycleHref("/app/agenda"), "/app/schedule");
  assert.equal(lifecycleHref("/app/cfp"), "/app/forms");
  assert.equal(lifecycleHref("/app/reviews"), "/app/review-progress");
  assert.equal(lifecycleHref("/app/speakers"), "/app/speakers", "known routes pass through");
});

// —— Settings + embeds ——

test("settings expose a labelled speaker-confirmation toggle with auto-confirm copy", async () => {
  const src = readFileSync("src/web/pages/PublishFormsSettings.tsx", "utf8");
  assert.match(src, /data-testid="speaker-confirmation-toggle"/);
  assert.match(src, /Require speaker confirmation/);
  assert.match(src, /auto-confirmed/, "explains what happens when the toggle is off");
  const app = createApp({ repo: new MemoryRepository() });
  const put = (value: boolean) =>
    app.request(`/api/events/${EVENT_ID}/settings`, { method: "PUT", headers: org, body: JSON.stringify({ speakerConfirmation: value }) });
  assert.equal((await (await put(false)).json() as any).data.speakerConfirmation, false);
  const boot = (await (await app.request(`/api/events/${EVENT_ID}/bootstrap`, { headers: org })).json()) as any;
  assert.equal(boot.data.settings.speakerConfirmation, false, "the page reads the toggle back from bootstrap");
});

test("embed presentation is server-persisted, with no browser storage left", () => {
  const src = readFileSync("src/web/pages/PublishFormsSettings.tsx", "utf8");
  assert.ok(!src.includes("localStorage"), "embed prefs no longer touch localStorage");
  assert.ok(!src.includes("EMBED_PREFS_KEY"), "the local storage key is gone");
  assert.match(src, /api\.patchEmbedConfig\(id,patch\)/, "changes go through PATCH /embed-configs/:id");
  assert.match(src, /saved on the shared event record/, "the note tells the truth about where prefs live");
  const client = readFileSync("src/web/lib/api.ts", "utf8");
  assert.match(client, /patchEmbedConfig/);
});

test("snippet formats map onto the server enum and produce different output", () => {
  assert.equal(normalizeSnippetFormat(undefined), "iframe");
  assert.equal(normalizeSnippetFormat("basic"), "iframe");
  assert.equal(normalizeSnippetFormat("styled"), "script");
  assert.equal(normalizeSnippetFormat("link"), "link");
  const url = "https://example.test/e/x/public/sessions?config=embed-1";
  assert.match(embedSnippet({ url, name: "QA", format: "iframe" }), /^<iframe /);
  assert.match(embedSnippet({ url, name: "QA", format: "script", css: ".cue-embed{color:red}" }), /<style>/);
  assert.equal(embedSnippet({ url, name: "QA", format: "link" }), url);
});

test("embed PATCH persists exactly the fields the publish page sends", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const created = (await (await app.request(`/api/events/${EVENT_ID}/embed-configs`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({ name: "Roster", widget: "sessions" }),
  })).json()) as any;
  assert.equal(created.data.enabled, true);
  assert.equal(created.data.snippetFormat, "iframe");
  const patched = (await (await app.request(`/api/events/${EVENT_ID}/embed-configs/${created.data.id}`, {
    method: "PATCH",
    headers: org,
    body: JSON.stringify({ enabled: false, snippetFormat: "script", customCss: ".cue-embed{color:red}" }),
  })).json()) as any;
  assert.equal(patched.data.enabled, false);
  assert.equal(patched.data.snippetFormat, "script");
  assert.equal(patched.data.customCss, ".cue-embed{color:red}");
});

// —— Submission codes ——

test("submission codes surface in the table, the CSV export and Review Studio", async () => {
  const src = readFileSync("src/web/pages/SubmissionsPages.tsx", "utf8");
  assert.match(src, /<Th>Code<\/Th>/, "the inbox has a Code column");
  assert.match(src, /data-testid={`submission-code-\$\{s\.id\}`}/);
  assert.match(src, /data-testid="submission-code"/, "Review Studio shows the code");
  assert.match(src, /title={data\.code \? `Review Studio · \$\{data\.code\}` : "Review Studio"}/);
  const app = createApp({ repo: new MemoryRepository() });
  const subs = (await (await app.request(`/api/events/${EVENT_ID}/submissions`, { headers: org })).json()) as any;
  assert.match(String(subs.data[0].code), /^SESS-\d+$/, "the API supplies the code the UI renders");
  const { submissionsCsv } = await import("../src/web/pages/SubmissionsPages.js");
  const csv = submissionsCsv([subs.data[0]]);
  assert.ok(csv.split("\r\n")[1]!.includes(subs.data[0].code), "the CSV row carries the code");
});
