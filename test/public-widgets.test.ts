import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { demoSchedule, MemoryRepository } from "../src/repository.js";
import {
  agendaByDay,
  buildIcs,
  buildPublicProgram,
  filterPublicSessions,
  isPublishedSession,
} from "../src/publicProjection.js";

const app = createApp({ repo: new MemoryRepository() });

test("published-only filtering excludes draft sessions and their exclusive speakers", () => {
  const program = buildPublicProgram(demoSchedule, { id: "evt-ai-summit-2026", slug: "ai-engineer-summit" });
  assert.ok(program.sessions.every((s) => ["ses-analytical", "ses-product", "ses-workshop"].includes(s.id)));
  assert.ok(!program.sessions.some((s) => s.id === "ses-sam" || s.id === "ses-reliable-agents"));
  assert.ok(program.speakers.some((s) => s.id === "spk-ada"));
  assert.ok(program.speakers.some((s) => s.id === "spk-margaret"));
  assert.ok(program.speakers.some((s) => s.id === "spk-lin"));
  // Sam only on unpublished session; Grace is private + unpublished panel
  assert.ok(!program.speakers.some((s) => s.id === "spk-sam"));
  assert.ok(!program.speakers.some((s) => s.id === "spk-grace"));
  assert.equal(isPublishedSession(demoSchedule.sessions.find((s) => s.id === "ses-sam")!), false);
});

test("unknown event slug returns 404 for HTML and JSON", async () => {
  const html = await app.request("/e/unknown-event/public/sessions");
  assert.equal(html.status, 404);
  const json = await app.request("/e/unknown-event/public/feed.json");
  assert.equal(json.status, 404);
  const legacy = await app.request("/public/events/does-not-exist/gallery");
  assert.equal(legacy.status, 404);
});

test("sessions search and facets endpoint narrows results with counts", async () => {
  const all = await (await app.request("/e/ai-engineer-summit/public/sessions.json")).json();
  assert.ok(all.count >= 3);
  assert.equal(all.count, all.total);
  const title = await (await app.request("/e/ai-engineer-summit/public/sessions.json?q=Analytical")).json();
  assert.equal(title.count, 1);
  assert.equal(title.sessions[0].title.includes("Analytical"), true);
  const speaker = await (await app.request("/e/ai-engineer-summit/public/sessions.json?q=Lovelace")).json();
  assert.ok(speaker.count >= 1);
  assert.ok(speaker.sessions.every((s: any) => (s.speakers || []).some((sp: any) => /Lovelace/i.test(sp.name))));
  const track = await (await app.request("/e/ai-engineer-summit/public/sessions.json?track=Product")).json();
  assert.ok(track.count >= 1);
  assert.ok(track.sessions.every((s: any) => (s.trackNames || s.tracks || []).includes?.("Product") || (s.tracks || []).includes("Product")));
  // unit helper parity
  const program = buildPublicProgram(demoSchedule, { slug: "ai-engineer-summit" });
  const filtered = filterPublicSessions(program, { track: "Infrastructure" });
  assert.ok(filtered.count >= 1);
  assert.ok(filtered.sessions.every((s) => s.trackNames.includes("Infrastructure")));
});

test("agenda day grouping returns per-day sessions and multi-day list", async () => {
  const program = buildPublicProgram(demoSchedule, { slug: "ai-engineer-summit" });
  assert.ok(program.days.length >= 2);
  const day1 = agendaByDay(program, program.days[0]);
  const day2 = agendaByDay(program, program.days[1]);
  assert.ok(day1.sessions.length >= 1);
  assert.ok(day2.sessions.length >= 1);
  assert.notEqual(day1.sessions[0]?.id, day2.sessions[0]?.id);
  const res = await app.request(`/e/ai-engineer-summit/public/agenda.json?day=${program.days[1]}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.day, program.days[1]);
  assert.ok(body.sessions.length >= 1);
});

test("ICS feed is valid calendar text with only selected sessions when ids provided", async () => {
  const program = buildPublicProgram(demoSchedule, { slug: "ai-engineer-summit" });
  const one = program.sessions[0]!;
  const two = program.sessions[1]!;
  const icsOne = buildIcs(program, [one.id]);
  assert.match(icsOne, /BEGIN:VCALENDAR/);
  assert.match(icsOne, /BEGIN:VEVENT/);
  assert.match(icsOne, /END:VCALENDAR/);
  assert.match(icsOne, new RegExp(`SUMMARY:.*${one.title.slice(0, 10)}`));
  assert.equal((icsOne.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.ok(icsOne.includes(one.id) || icsOne.includes("DTSTART"));
  const icsTwo = buildIcs(program, [one.id, two.id]);
  assert.equal((icsTwo.match(/BEGIN:VEVENT/g) || []).length, 2);

  const res = await app.request(`/e/ai-engineer-summit/public/ics?ids=${encodeURIComponent(one.id)}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/calendar/);
  const text = await res.text();
  assert.match(text, /BEGIN:VCALENDAR/);
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, 1);
});

test("JSON feed shape exposes event, sessions, speakers, days, facets", async () => {
  const res = await app.request("/e/ai-engineer-summit/public/feed.json");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.event.slug, "ai-engineer-summit");
  assert.ok(Array.isArray(body.sessions));
  assert.ok(Array.isArray(body.speakers));
  assert.ok(Array.isArray(body.days));
  assert.ok(body.facets?.tracks?.length >= 1);
  assert.ok(body.sessions.every((s: any) => s.startsAt && s.title && s.room));
});

test("legacy gallery and itinerary HTML still render from canonical projection", async () => {
  const gallery = await app.request("/public/events/evt-ai-summit-2026/gallery");
  assert.equal(gallery.status, 200);
  assert.match(gallery.headers.get("content-type") || "", /text\/html/);
  const g = await gallery.text();
  assert.match(g, /Speaker gallery|gallery/i);
  assert.match(g, /Ada Lovelace/);
  assert.doesNotMatch(g, /Sam Rivera/); // unpublished-only speaker
  const itinerary = await app.request("/public/events/evt-ai-summit-2026/itinerary");
  assert.equal(itinerary.status, 200);
  const i = await itinerary.text();
  assert.match(i, /Itinerary|itinerary|Sessions/i);
  assert.match(i, /Analytical Engines/);
  const sessionsPage = await app.request("/e/ai-engineer-summit/public/sessions");
  assert.equal(sessionsPage.status, 200);
  const s = await sessionsPage.text();
  assert.match(s, /Sessions/);
  assert.match(s, /data-count|of \d+ sessions/i);
});

test("speakers list is surname-sorted and HTML pages are anonymous", async () => {
  const program = buildPublicProgram(demoSchedule, { slug: "ai-engineer-summit" });
  const names = program.speakers.map((s) => s.lastName);
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(names, sorted);
  for (const path of [
    "/e/ai-engineer-summit/public/sessions",
    "/e/ai-engineer-summit/public/speakers",
    "/e/ai-engineer-summit/public/agenda",
    "/e/ai-engineer-summit/public/itinerary",
    "/e/ai-engineer-summit/public/gallery",
  ]) {
    const res = await app.request(path);
    assert.equal(res.status, 200, path);
    const text = await res.text();
    assert.match(text, /no login/i);
    assert.doesNotMatch(text, /sign in|password/i);
  }
});

test("public program days span full event window including empty day 3", () => {
  const program = buildPublicProgram(demoSchedule, { id: "evt-ai-summit-2026", slug: "ai-engineer-summit" });
  assert.ok(program.days.includes("2026-10-12"), `days=${program.days.join(",")}`);
  assert.ok(program.days.includes("2026-10-13"), `days=${program.days.join(",")}`);
  assert.ok(program.days.includes("2026-10-14"), `expected Oct 14 in days=${program.days.join(",")}`);
});

test("public agenda ?day=2026-10-14 does not fall back to day 1", async () => {
  const res = await app.request("/e/ai-engineer-summit/public/agenda?day=2026-10-14");
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /2026-10-14|Oct 14|October 14/i);
  // Should not claim only Oct 12 as the only day tab
  assert.ok(text.includes("day=2026-10-14") || text.includes("2026-10-14") || /Wed|Oct 14/.test(text));
  // Prev day link should point at Oct 13 when on day 3
  assert.ok(text.includes("2026-10-13") || text.includes("day=2026-10-13"));
});
