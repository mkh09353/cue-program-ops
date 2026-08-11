import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { EVENT_ID } from "../src/lifecycle.js";
import { resetEventRegistry } from "../src/events.js";
import { MemoryRepository } from "../src/repository.js";
import { eventCreateDefaults, slugifyEventName } from "../src/web/components/shells.js";

const ORG = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const json = async (r: Response) => (await r.json()) as any;
const post = (app: any, path: string, body: unknown, headers: Record<string, string> = ORG) =>
  app.request(path, { method: "POST", headers, body: JSON.stringify(body) });

const BLANK = { name: "", slug: "", startsAt: "", endsAt: "", timezone: "America/Los_Angeles", venue: "", rooms: "", tracks: "" };

// —— CFP-17/18: fast, bulletproof creation ——

test("CFP-17: a name alone yields a valid, server-accepted event payload", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  const payload = eventCreateDefaults({ ...BLANK, name: "  Forward Summit 2028  " }, new Date("2027-03-14T12:00:00.000Z"));
  assert.equal(payload.name, "Forward Summit 2028");
  assert.equal(payload.slug, "forward-summit-2028", "slug is derived from the name");
  assert.ok(Date.parse(payload.startsAt) > 0 && Date.parse(payload.endsAt) > Date.parse(payload.startsAt));
  assert.equal(payload.timezone, "America/Los_Angeles");

  const created = await post(app, "/api/events", payload);
  assert.equal(created.status, 201, "the defaults satisfy server validation");
  const record = (await json(created)).data;
  assert.equal(record.slug, "forward-summit-2028");

  // Isolation is preserved: the new event is genuinely empty.
  const subs = (await json(await app.request(`/api/events/${record.id}/submissions`, { headers: ORG }))).data;
  const speakers = (await json(await app.request(`/api/events/${record.id}/speakers`, { headers: ORG }))).data;
  assert.equal(subs.length, 0);
  assert.equal(speakers.length, 0);
  const seeded = (await json(await app.request(`/api/events/${EVENT_ID}/submissions`, { headers: ORG }))).data;
  assert.ok(seeded.length > 0, "the seeded event is untouched");
  resetEventRegistry();
});

test("CFP-17: explicit values always win over the defaults", () => {
  const payload = eventCreateDefaults({
    ...BLANK, name: "Custom", slug: "my-slug", startsAt: "2028-01-02T09:00", endsAt: "2028-01-03T17:00",
    timezone: "Europe/Berlin", venue: "Hall A", rooms: "Room 2A", tracks: "Platform",
  });
  assert.equal(payload.slug, "my-slug");
  assert.equal(payload.timezone, "Europe/Berlin");
  assert.equal(payload.venue, "Hall A");
  assert.equal(payload.rooms, "Room 2A");
  assert.equal(new Date(payload.startsAt).getFullYear(), 2028);
});

test("CFP-17: slugify handles punctuation, spacing and length", () => {
  assert.equal(slugifyEventName("DevFlow Conf 2027"), "devflow-conf-2027");
  assert.equal(slugifyEventName("  AI & Data — Summit!  "), "ai-data-summit");
  assert.equal(slugifyEventName(""), "");
  assert.ok(slugifyEventName("x".repeat(80)).length <= 40);
});

test("CFP-17: creation retains validation for a genuinely bad payload", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  assert.equal((await post(app, "/api/events", eventCreateDefaults({ ...BLANK, name: "Dup" }))).status, 201);
  assert.equal((await post(app, "/api/events", eventCreateDefaults({ ...BLANK, name: "Dup" }))).status, 409, "duplicate slug still rejected");
  assert.equal((await post(app, "/api/events", { ...eventCreateDefaults({ ...BLANK, name: "TZ" }), timezone: "Mars/Olympus" })).status, 400);
  assert.equal((await post(app, "/api/events", { ...eventCreateDefaults({ ...BLANK, name: "Order" }), endsAt: "2000-01-01T00:00:00.000Z" })).status, 400);
  resetEventRegistry();
});

test("CFP-17: the switcher auto-selects the new event and confirms it visibly", () => {
  const src = readFileSync("src/web/components/shells.tsx", "utf8");
  assert.match(src, /const created = await api\.createEvent\(eventCreateDefaults\(form\)\)/);
  // Selection happens BEFORE the catalog refresh so scoped pages refetch at once.
  assert.match(src, /setActiveEventId\(created\.data\.id\);\s*\n\s*await load\(\)/);
  assert.match(src, /data-testid="event-created-banner"/);
  assert.match(src, /Now working in \{created\.name\}/);
  assert.match(src, /empty by design/, "the empty state is explained, not fabricated");
  assert.match(src, /data-testid="create-event-form"/);
  assert.match(src, /Only a name is required/);
  // The confirmation lives outside the dropdown, which closes on submit.
  const bannerAt = src.indexOf('data-testid="event-created-banner"');
  const menuAt = src.indexOf('{open ? (');
  assert.ok(bannerAt > 0 && bannerAt < menuAt, "banner renders outside the open menu block");
});

test("CFP-18: shared loaders refetch when the active event changes", () => {
  const hook = readFileSync("src/web/lib/useAsyncData.ts", "utf8");
  assert.match(hook, /import \{ subscribeEvent \} from "\.\/api"/);
  assert.match(hook, /useEffect\(\(\) => subscribeEvent\(\(\) => run\(\)\), \[run\]\)/);

  const review = readFileSync("src/web/pages/ReviewManagementPages.tsx", "utf8");
  assert.match(review, /subscribeEvent\(\(\) => void reload\(\)\)/, "review pages refetch on switch");

  const content = readFileSync("src/web/pages/ContentPages.tsx", "utf8");
  assert.match(content, /subscribeEvent\(\(\)=>\{setEditing\(null\);setData\(null\);load\(\)\}\)/, "content clears stale rows then refetches");
});

test("CFP-18: an unknown event id is still adopted and the catalog refreshed", () => {
  const src = readFileSync("src/web/lib/api.ts", "utf8");
  assert.match(src, /activeEvent = match \|\| \{ \.\.\.activeEvent, id, name: id, slug: "" \}/);
  assert.match(src, /if \(!match\) \{\s*\n\s*void api\.events\(\)/);
  assert.match(src, /export function subscribeEvent\(fn: \(\) => void\): \(\) => void/);
});

test("reviewer invite selects the invite's event before the queue loads", async () => {
  const src = readFileSync("src/web/components/shells.tsx", "utf8");
  const setAt = src.indexOf("if(r.data.eventId)setActiveEventId(r.data.eventId)");
  const navAt = src.indexOf('navigate("/r",{replace:true})');
  assert.ok(setAt > 0, "invite resolution selects the event");
  assert.ok(setAt < navAt, "selection happens before navigation");

  // The server supplies the eventId this depends on.
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  const rounds = (await json(await app.request(`/api/events/${EVENT_ID}/review-rounds`, { headers: ORG }))).data;
  const round = rounds[0];
  const reviewerId = round.reviewerIds[0];
  const link = await post(app, `/api/events/${EVENT_ID}/reviewers/${reviewerId}/invite-link`, { roundId: round.id });
  assert.equal(link.status, 201);
  const token = new URL((await json(link)).data.inviteUrl, "http://x.test").searchParams.get("invite")!;
  const resolved = await json(await app.request(`/api/public/reviewer-invites/${token}`));
  assert.equal(resolved.data.eventId, EVENT_ID, "resolution returns the owning event id");
});

// —— CFP-14: Comms resilience ——

test("CFP-14: the comms loader settles each request independently", () => {
  const src = readFileSync("src/web/pages/SpeakersCommsPages.tsx", "utf8");
  assert.match(src, /Promise\.allSettled\(\[api\.templates\(\), api\.commsLog\(\), api\.speakers\(\)\]\)/);
  assert.ok(!/Promise\.all\(\[api\.templates\(\)/.test(src), "no all-or-nothing load remains");
  // A failed log or speaker list degrades to empty arrays, never a blank page.
  assert.match(src, /log: l\.status === "fulfilled" \? l\.value\.data : \[\]/);
  assert.match(src, /speakers: s\.status === "fulfilled" \? s\.value\.data : \[\]/);
  // Only templates are load-bearing for the composer.
  assert.match(src, /if \(t\.status === "rejected"\) throw/);
  assert.match(src, /data-testid="comms-partial-warning"/);
  assert.match(src, /Retry loading/);
});

test("CFP-14: the decision composer is discoverable and anchored", () => {
  const src = readFileSync("src/web/pages/SpeakersCommsPages.tsx", "utf8");
  assert.match(src, /id="decisions"/, "linkable anchor");
  assert.match(src, /data-testid="send-decisions-composer"/);
  assert.match(src, /Send decisions — accept \/ reject notifications/, "heading uses the words an operator searches for");
  assert.match(src, /data-testid="send-decisions"/);
});

test("CFP-14: comms endpoints the page depends on are healthy", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  for (const path of ["comms/templates", "comms/log", "speakers"]) {
    const r = await app.request(`/api/events/${EVENT_ID}/${path}`, { headers: ORG });
    assert.equal(r.status, 200, `${path} responds`);
    assert.ok(Array.isArray((await json(r)).data), `${path} returns a list`);
  }
});

// —— CFP-07: draft confirmation ——

test("CFP-07: the draft confirmation renders beside its button, not only as a toast", () => {
  const src = readFileSync("src/web/pages/PublicReviewerPages.tsx", "utf8");
  const buttonAt = src.indexOf('data-testid="save-draft"');
  const inlineAt = src.indexOf('data-testid="draft-saved-inline"');
  assert.ok(buttonAt > 0 && inlineAt > buttonAt, "the confirmation follows the button in the same block");
  assert.ok(inlineAt - buttonAt < 1800, "confirmation is adjacent to the action, not pages away");
  assert.match(src, /Draft saved at \{draftState\.at\} · reference \{draftState\.id\}/);
  assert.match(src, /data-testid="draft-resume-link"/, "resume affordance is present");
  assert.match(src, /Not submitted yet/, "draft vs submitted is unambiguous");
  assert.match(src, /data-testid="draft-save-error"/, "failures are shown at the button too");
  assert.match(src, /\{draftBusy\?"Saving draft…":"Save as draft"\}/, "immediate busy feedback");
  assert.match(src, /role="status"/);
});

test("CFP-07: a draft round-trips through the public API and can be resumed", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  const draft = await post(app, `/api/public/events/ai-engineer-summit/submissions`, {
    name: "Dana Draft", email: "dana@example.test", status: "draft",
    answers: { title: "Draft talk", abstract: "D".repeat(60), category: "AI Engineering", format: "Talk (30 min)", experience: "Beginner" },
  }, { "content-type": "application/json" });
  assert.equal(draft.status, 201);
  const row = (await json(draft)).data;
  assert.ok(row.id, "a reference id is returned for the confirmation");
  assert.ok(row.editToken, "a resume token is returned");
  assert.equal(row.status, "draft", "the draft is not submitted");

  const resumed = await json(await app.request(`/api/public/events/ai-engineer-summit/submissions/${row.id}?token=${row.editToken}`));
  assert.equal(resumed.data.answers.title, "Draft talk", "the resume link restores the draft");
  resetEventRegistry();
});
