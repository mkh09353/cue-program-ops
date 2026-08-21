import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";
import { agendaByDay, agendaDayCounts, buildPublicProgram } from "../src/publicProjection.js";
import { crmDashboard } from "../src/crm.js";

// Jordan Alvarez is the organizer the content fixtures attribute history to;
// swyx is now the DEFAULT organizer (org-swyx), so name this persona explicitly.
const H = { "content-type": "application/json", "x-demo-persona": "org-jordan" };
const json = async (res: Response) => (await res.json()) as any;
const patch = (app: any, path: string, body: unknown) =>
  app.request(path, { method: "PATCH", headers: H, body: JSON.stringify(body) });
const post = (app: any, path: string, body: unknown) =>
  app.request(path, { method: "POST", headers: H, body: JSON.stringify(body) });
const html = async (app: any, path: string) => await (await app.request(path)).text();

/** Item 1: an approved title edit must reach the public AGENDA grid, not just the catalog. */
test("approved title edit appears in the public agenda HTML as well as the sessions catalog", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const title = "CNT12 Renamed Analytical Engines";
  assert.equal((await patch(app, `/api/events/${EVENT_ID}/content/sessions/ses-analytical`, { title, contentStatus: "approved" })).status, 200);

  assert.ok((await html(app, `/e/ai-engineer-summit/public/sessions`)).includes(title), "sessions catalog");
  assert.ok((await html(app, `/e/ai-engineer-summit/public/agenda`)).includes(title), "agenda grid (default day)");
  assert.ok((await html(app, `/e/ai-engineer-summit/public/agenda?day=2026-10-12`)).includes(title), "agenda grid (explicit day)");
  assert.ok((await html(app, `/public/events/${EVENT_ID}/agenda`)).includes(title), "legacy agenda path");
  const feed = await json(await app.request(`/e/ai-engineer-summit/public/agenda.json`));
  assert.ok(JSON.stringify(feed).includes(title), "agenda JSON");
});

/**
 * The real divergence: the catalog is day-agnostic while the agenda renders ONE day.
 * An edit on a later day must still be discoverable — the day tabs advertise counts and
 * the default day is the first day that actually has sessions.
 */
test("agenda day tabs advertise per-day counts and default to a populated day", async () => {
  const repo = new MemoryRepository();
  const app = createApp({ repo });
  const sched = await json(await app.request(`/api/events/${EVENT_ID}/schedule`, { headers: H }));
  // Place + rename a session on Wednesday, which is not the default agenda day.
  await post(app, `/api/events/${EVENT_ID}/schedule/move`, {
    slot: { id: "slot-ses-sam", sessionId: "ses-sam", roomId: "room-main", startsAt: "2026-10-14T18:00:00.000Z", endsAt: "2026-10-14T19:00:00.000Z" },
    version: sched.version,
    acknowledge: [],
  });
  const title = "CNT12 Wednesday Session";
  await patch(app, `/api/events/${EVENT_ID}/content/sessions/ses-sam`, { title, contentStatus: "approved" });

  const wednesday = await html(app, `/e/ai-engineer-summit/public/agenda?day=2026-10-14`);
  assert.ok(wednesday.includes(title), "the edited session renders on its own day");

  // Every agenda view tells the visitor where the sessions are.
  const defaultView = await html(app, `/e/ai-engineer-summit/public/agenda`);
  assert.match(defaultView, /data-day-count="1"/, "the Wednesday tab advertises its session count");
  assert.match(defaultView, /data-agenda-total/, "total sessions across days is stated");

  // Projection-level contract.
  const program = buildPublicProgram(await (repo as any).getSchedule(EVENT_ID), { id: EVENT_ID, slug: "ai-engineer-summit" });
  const counts = agendaDayCounts(program);
  assert.equal(counts.find((c) => c.day === "2026-10-14")!.count, 1);
  assert.ok(counts.reduce((sum, c) => sum + c.count, 0) === program.sessions.length);
  // Default day is the first POPULATED day, never a blank one.
  const emptyFirst = { ...program, days: ["2026-10-11", ...program.days] };
  assert.equal(agendaByDay(emptyFirst).day, program.days[0], "a leading empty day is skipped");
});

/** The Content saved banner deep-links to the agenda tab holding the edited session. */
test("content editor exposes the session day so the saved banner can deep-link the agenda", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const sched = await json(await app.request(`/api/events/${EVENT_ID}/schedule`, { headers: H }));
  await post(app, `/api/events/${EVENT_ID}/schedule/move`, {
    slot: { id: "slot-ses-sam", sessionId: "ses-sam", roomId: "room-lab", startsAt: "2026-10-13T18:00:00.000Z", endsAt: "2026-10-13T19:00:00.000Z" },
    version: sched.version,
    acknowledge: [],
  });
  const content = await json(await app.request(`/api/events/${EVENT_ID}/content`, { headers: H }));
  const row = content.data.sessions.find((s: any) => s.canonicalId === "ses-sam");
  assert.equal(row.dayKey, "2026-10-13", "rows carry the event-timezone day of their slot");
  const saved = await json(await patch(app, `/api/events/${EVENT_ID}/content/sessions/ses-sam`, { title: "Day linked" }));
  assert.equal(saved.data.dayKey, "2026-10-13", "the save response carries it for the banner link");

  const page = readFileSync(new URL("../src/web/pages/ContentPages.tsx", import.meta.url), "utf8");
  assert.match(page, /data-testid="saved-agenda-link"/);
  assert.match(page, /public\/agenda\?day=\$\{encodeURIComponent\(savedSession\.dayKey\)\}/);
});

/** Item 2: EVERY stage transition appends a timestamped history entry. */
test("every stage transition path appends to the contact stage timeline", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const created = await json(
    await post(app, `/api/crm/contacts`, { name: "Timeline Probe", email: `timeline-${Date.now()}@example.test` }),
  );
  const id = created.data.id;
  const historyOf = async () => (await json(await app.request(`/api/crm/contacts/${id}`, { headers: H }))).data.stageHistory;

  const afterCreate = await historyOf();
  assert.equal(afterCreate.length, 1, "creation records the initial stage");
  assert.equal(afterCreate[0].to, "prospect");

  // Pipeline board path (the kanban "→ stage" button).
  assert.equal((await post(app, `/api/crm/contacts/${id}/stage`, { stage: "contacted" })).status, 200);
  const afterBoard = await historyOf();
  assert.equal(afterBoard.length, 2, "the board move appends an entry");
  assert.equal(afterBoard[1].from, "prospect");
  assert.equal(afterBoard[1].to, "contacted");
  assert.ok(afterBoard[1].at, "entry is timestamped");
  assert.equal(afterBoard[1].byName, "Jordan Alvarez", "and attributed");

  // Profile control path — a stage on the generic update used to be silently dropped.
  assert.equal((await patch(app, `/api/crm/contacts/${id}`, { stage: "invited" })).status, 200);
  const afterProfile = await historyOf();
  assert.equal(afterProfile.length, 3, "the profile path appends too");
  assert.equal(afterProfile[2].to, "invited");
  assert.equal((await json(await app.request(`/api/crm/contacts/${id}`, { headers: H }))).data.stage, "invited", "and actually moves the stage");

  // Rapid successive moves stay individually ordered.
  await post(app, `/api/crm/contacts/${id}/stage`, { stage: "confirmed" });
  const final = await historyOf();
  assert.equal(final.length, 4);
  const times = final.map((h: any) => new Date(h.at).getTime());
  assert.deepEqual([...times].sort((a, b) => a - b), times, "timeline is strictly ordered");
  assert.equal(new Set(final.map((h: any) => h.id)).size, 4, "entry ids are distinct");

  // Invalid transitions are still refused and record nothing.
  const invalid = await post(app, `/api/crm/contacts/${id}/stage`, { stage: "nonsense" });
  assert.equal(invalid.status, 400);
  assert.equal((await historyOf()).length, 4);
});

/** Item 5: dashboard exposes stage bars and a recent-activity feed. */
test("crm dashboard exposes stage bars and a recent activity feed", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const created = await json(
    await post(app, `/api/crm/contacts`, { name: "Dash Probe", email: `dash-${Date.now()}@example.test` }),
  );
  await post(app, `/api/crm/contacts/${created.data.id}/notes`, { body: "Great fit for the agents track" });
  await post(app, `/api/crm/contacts/${created.data.id}/stage`, { stage: "contacted" });

  const dash = crmDashboard(store);
  assert.ok(Array.isArray(dash.stageBars) && dash.stageBars.length >= 6, "one bar per stage");
  assert.ok(dash.stageBars.every((b: any) => typeof b.count === "number" && b.label));
  assert.equal(
    dash.stageBars.reduce((sum: number, b: any) => sum + b.count, 0),
    dash.totalContacts,
    "bars account for every contact",
  );

  assert.ok(dash.recentActivity.length > 0 && dash.recentActivity.length <= 5, "feed is capped at 5 rows");
  assert.ok(dash.recentActivity.every((row: any) => row.at && row.summary && row.kind));
  const times = dash.recentActivity.map((row: any) => new Date(row.at).getTime());
  assert.deepEqual([...times].sort((a, b) => b - a), times, "newest first");
  // Both event kinds feed the stream. The 5-row cap is shared with the seeded demo
  // contacts, so the contact's own records are the deterministic assertion.
  const probe = store.crm!.contacts.find((x: any) => x.id === created.data.id)!;
  assert.ok(probe.notes.some((n: any) => /agents track/.test(n.body)), "note recorded");
  assert.ok(probe.stageHistory.some((h: any) => h.from === "prospect" && h.to === "contacted"), "stage move recorded");
  assert.ok(dash.recentActivity.some((row: any) => row.kind === "stage"), "stage moves feed the activity list");
  const everything = crmDashboard(store).recentActivity;
  assert.ok(everything.every((row: any) => ["note", "stage", "campaign"].includes(row.kind)), "only known activity kinds");

  const api = await json(await app.request(`/api/crm/dashboard`, { headers: H }));
  assert.ok(api.data.stageBars && api.data.recentActivity, "served through the API the page reads");
});

/** Items 3 + 4 UI wiring. */
test("crm directory filters are populated selects with a count and clear, and notes confirm", () => {
  const page = readFileSync(new URL("../src/web/pages/CrmPages.tsx", import.meta.url), "utf8");
  // Item 4: no free-text tag/company inputs; options derived from real data.
  assert.match(page, /aria-label="Filter by tag"/);
  assert.match(page, /aria-label="Filter by company"/);
  assert.match(page, /const facetTags = \[\.\.\.new Set\(allRows\.flatMap/);
  assert.match(page, /const facetCompanies = \[\.\.\.new Set\(allRows\.map/);
  assert.match(page, /data-testid="crm-result-count"/);
  assert.match(page, /data-testid="crm-clear-filters"/);
  assert.ok(!/placeholder="Exact company"/.test(page), "the free-text company box is gone");
  // Item 3: optimistic note + saved confirmation with author and time.
  assert.match(page, /data-testid="note-saved"/);
  assert.match(page, /Note saved · \{noteSaved\.author\} · \{noteSaved\.at\}/);
  assert.match(page, /setContact\(\(current: any\) => \(current \? \{ \.\.\.current, notes: \[\.\.\.\(current\.notes \|\| \[\]\), row\] \} : current\)\)/);
  // Item 5: clickable KPI cards.
  for (const id of ["kpi-contacts", "kpi-segments", "kpi-top-tag", "crm-stage-bars", "crm-activity-feed"]) {
    assert.ok(page.includes(`data-testid="${id}"`), `${id} present`);
  }
});
