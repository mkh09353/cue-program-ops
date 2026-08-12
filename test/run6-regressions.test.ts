import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { EVENT_ID } from "../src/lifecycle.js";
import { resetEventRegistry } from "../src/events.js";
import { MemoryRepository } from "../src/repository.js";
import { eventCreateDefaults, parseEventDate } from "../src/web/components/shells.js";

const ORG = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const json = async (r: Response) => (await r.json()) as any;
const BLANK = { name: "", slug: "", startsAt: "", endsAt: "", timezone: "America/Los_Angeles", venue: "", rooms: "", tracks: "" };

test("CFP-17: human-typed dates are accepted, not silently rejected", () => {
  assert.ok(parseEventDate("May 12, 2027"), "natural date parses");
  assert.ok(parseEventDate("2027-05-12"), "ISO date parses");
  assert.ok(parseEventDate("2027-05-12T09:00"), "datetime-local parses");
  assert.equal(parseEventDate("not a date"), null);
  assert.equal(parseEventDate(""), null);
  const payload = eventCreateDefaults({ ...BLANK, name: "DevFlow Conf 2027", startsAt: "May 12, 2027", endsAt: "May 14, 2027" });
  assert.equal(new Date(payload.startsAt).getFullYear(), 2027);
  assert.ok(Date.parse(payload.endsAt) > Date.parse(payload.startsAt));
});

test("CFP-17: the create button explains itself instead of staying mutely disabled", () => {
  const src = readFileSync("src/web/components/shells.tsx", "utf8");
  assert.match(src, /data-testid="create-event-submit" onClick=\{submit\} disabled=\{busy\}/, "only busy disables it");
  assert.match(src, /Event name is required — enter a name/);
  assert.match(src, /is not a date we recognise/);
  assert.match(src, /Event name \(required\)/);
});

test("CFP-11: adding a field never rebinds another field's conditional visibility", () => {
  const src = readFileSync("src/web/pages/PublishFormsSettings.tsx", "utf8");
  assert.match(src, /const updateFieldByKey = \(key: string, patch: any\)/, "patches are key-based");
  assert.match(src, /f\.key === key \? \{ \.\.\.f, \.\.\.patch \} : f/);
  assert.match(src, /updateFieldByKey\(f\.key, \{ visibleWhen: undefined \}\)/);
  assert.match(src, /data-testid=\{`field-always-\$\{f\.key\}`\}/, "always-visible state is explicit");
  // A new field must never default its condition onto the Track/category field.
  assert.match(src, /x\.key === "format" && x\.key !== f\.key/);
  assert.ok(!/const trigger = selectFields\.find\(\(x: any\) => x\.key !== f\.key\) \|\| form\.fields\[0\]/.test(src));
});

test("ABS-11: co-authors survive the public submit and reach organizer detail", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  const r = await app.request(`/api/public/events/ai-engineer-summit/submissions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Priya Raman", email: "priya.co@example.test",
      answers: {
        title: "Co-author roundtrip", abstract: "A".repeat(60), category: "AI Engineering",
        format: "Talk (30 min)", experience: "Beginner",
        additionalSpeakers: [{ name: "Marcus Okafor", email: "marcus.co@example.test", role: "co-author" }],
      },
    }),
  });
  assert.equal(r.status, 201);
  const sub = (await json(r)).data;
  const detail = (await json(await app.request(`/api/events/${EVENT_ID}/submissions/${sub.id}`, { headers: ORG }))).data;
  const co = (detail.additionalSpeakers || []).find((p: any) => p.name === "Marcus Okafor");
  assert.ok(co, "organizer detail carries the co-author");
  assert.equal(co.role, "co-author");
  resetEventRegistry();
});

test("ABS-11: the seeded fixture proposal ships with a co-author so the case is observable", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  const detail = (await json(await app.request(`/api/events/${EVENT_ID}/submissions/sub-ada`, { headers: ORG }))).data;
  assert.ok((detail.additionalSpeakers || []).some((p: any) => p.name === "Marcus Okafor"),
    "a seeded submission demonstrates multi-participant support even with the CFP closed");
  const studio = readFileSync("src/web/pages/SubmissionsPages.tsx", "utf8");
  assert.match(studio, /data\.additionalSpeakers\|\|\[\]/, "Review Studio renders them");
  resetEventRegistry();
});

test("CFP-09: a tokenized edit link round-trips an appended abstract", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  const created = (await json(await app.request(`/api/public/events/ai-engineer-summit/submissions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Edit Cycle", email: "edit@example.test",
      answers: { title: "Edit cycle talk", abstract: "Original abstract text. ".repeat(3), category: "AI Engineering", format: "Talk (30 min)", experience: "Beginner" },
    }),
  }))).data;
  assert.ok(created.editToken && created.editUrl, "confirmation data carries a resume link");

  const loaded = (await json(await app.request(`/api/public/events/ai-engineer-summit/submissions/${created.id}?token=${created.editToken}`))).data;
  assert.match(loaded.answers.abstract, /Original abstract/, "edit link loads prefilled");

  const saved = await app.request(`/api/public/events/ai-engineer-summit/submissions/${created.id}`, {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ editToken: created.editToken, status: "submitted", answers: { ...loaded.answers, abstract: `${loaded.answers.abstract} APPENDED-EDIT-01` } }),
  });
  assert.equal(saved.status, 200);
  const organizerView = (await json(await app.request(`/api/events/${EVENT_ID}/submissions/${created.id}`, { headers: ORG }))).data;
  assert.match(organizerView.abstract, /APPENDED-EDIT-01/, "organizer sees the appended abstract");
  resetEventRegistry();
});

test("form fields are reachable by accessible name", () => {
  const ui = readFileSync("src/web/components/ui.tsx", "utf8");
  assert.match(ui, /Associate the label with its control/);
  assert.match(ui, /React\.cloneElement\(child as React\.ReactElement<any>, \{ id: controlId \}\)/);
  assert.match(ui, /htmlFor=\{child && !existing\?\.\["aria-label"\] \? controlId : undefined\}/);
});

test("the round editor clears the sticky header", () => {
  const src = readFileSync("src/web/pages/ReviewManagementPages.tsx", "utf8");
  assert.match(src, /<Card className="scroll-mt-24 p-5">/);
});
