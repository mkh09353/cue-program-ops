import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { demoSchedule, MemoryRepository } from "../src/repository.js";
import { buildPublicProgram, bySurname } from "../src/publicProjection.js";
import { ensureCrm, listFieldDefinitions, validateCustomFields } from "../src/crm.js";

const h = (id: string) => ({ "content-type": "application/json", "x-demo-persona": id });
const parse = async (res: Response) => ({ res, body: (await res.json()) as any });
const program = () => buildPublicProgram(demoSchedule, { id: EVENT_ID, slug: "ai-engineer-summit" });

/** Item 3: the directory claims surname ordering — prove it actually sorts that way. */
test("public speakers directory is ordered by surname", () => {
  const p = program();
  const surnames = p.speakers.map((s) => s.lastName);
  const sorted = [...p.speakers].sort(bySurname).map((s) => s.lastName);
  assert.deepEqual(surnames, sorted);
  assert.deepEqual(surnames, [...surnames].sort((a, b) => a.localeCompare(b)));
  // Concretely: Hamilton before Lovelace before Clark? No — Clark, Hamilton, Lovelace.
  assert.equal(surnames[0], "Clark");
});

/** Item 3: no public speaker card may show a generic role or a missing image. */
test("every seeded speaker has a job title, company, and a headshot url", () => {
  for (const sp of demoSchedule.speakers) {
    assert.ok((sp as any).title, `${sp.name} needs a job title in the seed`);
    assert.ok(sp.company, `${sp.name} needs a company in the seed`);
  }
  for (const sp of program().speakers) {
    assert.ok(sp.title, `${sp.name} projected without a title`);
    assert.ok(sp.company, `${sp.name} projected without a company`);
    assert.ok(sp.headshotUrl && sp.headshotUrl.length > 20, `${sp.name} projected without a headshot url`);
  }
});

/** Item 3: speakers with no uploaded photo still get a deterministic initials avatar. */
test("speakers without an uploaded headshot fall back to a generated initials avatar", () => {
  const p = program();
  const sp = p.speakers[0];
  assert.match(sp.headshotUrl!, /^data:image\/svg\+xml/);
  assert.equal(sp.hasUploadedHeadshot, false);
  assert.ok(decodeURIComponent(sp.headshotUrl!).includes(sp.initials));
});

/** Items 1 + 2: cards carry track/format/room badges and speaker role lines; facets are labelled. */
test("session cards show track, format, room and speaker role; facets are three labelled groups", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const html = await (await app.request("/e/ai-engineer-summit/public/sessions")).text();

  assert.match(html, /data-track-pill/, "cards must carry a distinct track badge");
  assert.match(html, /Track ·/);
  assert.match(html, /Format ·/);
  assert.match(html, /Room ·/);
  // Every rendered card has exactly the three badge kinds.
  const cards = html.split("<article").slice(1);
  assert.ok(cards.length >= 3);
  for (const card of cards) {
    assert.ok(card.includes("data-track-pill"), "each session card needs a track badge");
    assert.ok(card.includes("data-format-pill"), "each session card needs a format badge");
    assert.ok(card.includes("data-room-pill"), "each session card needs a room badge");
  }
  // Speaker job title + company under the name.
  assert.match(html, /data-speaker-role/);
  assert.match(html, /Principal Engineer · Analytical Engines/);

  // Three labelled facet groups.
  assert.match(html, /data-facet="track"/);
  assert.match(html, /data-facet="format"/);
  assert.match(html, /data-facet="room"/);
  assert.match(html, /Room · Location/);
  assert.match(html, /Filter sessions/);

  // Agenda session detail also shows the speaker role line.
  const detail = await (await app.request("/e/ai-engineer-summit/public/sessions/ses-analytical")).text();
  assert.match(detail, /Principal Engineer · Analytical Engines/);
});

/** Item 4: XML output per widget, well-formed and carrying the canonical program. */
test("XML feeds are valid, published-only, and available per widget", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const res = await app.request("/e/ai-engineer-summit/public/feed.xml");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /application\/xml/);
  const xml = await res.text();

  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  // Well-formedness: balanced tags for the elements we emit.
  for (const tag of ["program", "event", "sessions", "speakers", "session", "speaker", "title"]) {
    const open = (xml.match(new RegExp(`<${tag}[\\s>]`, "g")) || []).length;
    const close = (xml.match(new RegExp(`</${tag}>`, "g")) || []).length;
    assert.equal(open, close, `unbalanced <${tag}> in XML feed`);
  }
  assert.ok(!/<[^>]*<|&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml.replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, "")), "unescaped markup in XML");
  assert.match(xml, /<title>Analytical Engines in Practice<\/title>/);
  assert.ok(!xml.includes("Eval Harnesses Teams Actually Use"), "XML must stay published-only");

  for (const path of ["sessions.xml", "speakers.xml", "agenda.xml", "itinerary.xml", "gallery.xml"]) {
    const r = await app.request(`/e/ai-engineer-summit/public/${path}`);
    assert.equal(r.status, 200, `${path} should serve XML`);
    assert.match(await r.text(), /^<\?xml version="1.0"/);
  }
  const legacy = await app.request(`/public/events/${EVENT_ID}/feed.xml`);
  assert.equal(legacy.status, 200);
});

/** Item 4: saved embed config accent + multi-facet filters are honored by public pages. */
test("embed config accent and multi-facet filters are honored on public pages", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const made = await parse(
    await app.request(`/api/events/${EVENT_ID}/embed-configs`, {
      method: "POST",
      headers: h("org-swyx"),
      body: JSON.stringify({
        name: "Branded product talks",
        widget: "sessions",
        filters: { track: "Product", format: "Talk" },
        theme: { accent: "#4B5563" },
      }),
    }),
  );
  assert.equal(made.res.status, 201);
  const config = made.body.data;
  assert.equal(config.filters.format, "Talk");
  assert.equal(config.theme.accent, "#4B5563");

  const page = await (await app.request(`/e/ai-engineer-summit/public/sessions?config=${config.id}`)).text();
  assert.match(page, /data-embed-accent/, "accent style block must be injected");
  assert.match(page, /--accent:#4B5563/);
  assert.match(page, /Shipping AI Products/);
  assert.doesNotMatch(page, /Analytical Engines in Practice/, "track filter must apply");

  // A format that matches nothing in the Product track empties the widget.
  const workshopOnly = await parse(
    await app.request(`/api/events/${EVENT_ID}/embed-configs`, {
      method: "POST",
      headers: h("org-swyx"),
      body: JSON.stringify({
        name: "Product workshops",
        widget: "sessions",
        filters: { track: "Product", format: "Workshop" },
        theme: {},
      }),
    }),
  );
  const empty = await (await app.request(`/e/ai-engineer-summit/public/sessions?config=${workshopOnly.body.data.id}`)).text();
  assert.doesNotMatch(empty, /Shipping AI Products/);

  // Speaker widgets narrow to speakers on the filtered sessions and honor the accent.
  const speakersCfg = await parse(
    await app.request(`/api/events/${EVENT_ID}/embed-configs`, {
      method: "POST",
      headers: h("org-swyx"),
      body: JSON.stringify({ name: "Product speakers", widget: "speakers", filters: { track: "Product" }, theme: { accent: "#0F766E" } }),
    }),
  );
  const speakerPage = await (await app.request(`/e/ai-engineer-summit/public/speakers?config=${speakersCfg.body.data.id}`)).text();
  assert.match(speakerPage, /--accent:#0F766E/);
  assert.match(speakerPage, /Margaret Hamilton/);
  assert.doesNotMatch(speakerPage, /Ada Lovelace/);

  // XML honors the same saved config.
  const xml = await (await app.request(`/e/ai-engineer-summit/public/sessions.xml?config=${config.id}`)).text();
  assert.match(xml, /Shipping AI Products/);
  assert.ok(!xml.includes("Analytical Engines in Practice"));

  // Unsafe accent values are rejected rather than injected into public CSS.
  const bad = await app.request(`/api/events/${EVENT_ID}/embed-configs`, {
    method: "POST",
    headers: h("org-swyx"),
    body: JSON.stringify({ name: "XSS", widget: "sessions", filters: {}, theme: { accent: "red;}body{display:none" } }),
  });
  assert.equal(bad.status, 400);

  // Unknown config id is a 404, not a silently unfiltered page.
  assert.equal((await app.request(`/e/ai-engineer-summit/public/sessions?config=embed-nope`)).status, 404);
});

/** Item 5: typed dropdown custom field definition + enforced roundtrip on a contact. */
test("CRM dropdown custom field definition roundtrips onto a contact profile", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  ensureCrm();

  const defs = await parse(await app.request(`/api/crm/field-definitions`, { headers: h("org-swyx") }));
  assert.equal(defs.res.status, 200);
  assert.ok(defs.body.data.some((d: any) => d.key === "speakerType"), "seeded Speaker Type definition");

  const created = await parse(
    await app.request(`/api/crm/field-definitions`, {
      method: "POST",
      headers: h("org-swyx"),
      body: JSON.stringify({ label: "Travel Class", type: "select", options: ["Economy", "Business"] }),
    }),
  );
  assert.equal(created.res.status, 201);
  assert.equal(created.body.data.key, "travel_class");
  assert.deepEqual(created.body.data.options, ["Economy", "Business"]);

  // A dropdown needs at least two options.
  const badDef = await app.request(`/api/crm/field-definitions`, {
    method: "POST",
    headers: h("org-swyx"),
    body: JSON.stringify({ label: "Broken", type: "select", options: ["only"] }),
  });
  assert.equal(badDef.status, 400);
  // Non-organizers cannot define fields.
  assert.equal(
    (
      await app.request(`/api/crm/field-definitions`, {
        method: "POST",
        headers: h("spk-sam"),
        body: JSON.stringify({ label: "Nope", type: "text" }),
      })
    ).status,
    403,
  );

  const contact = await parse(
    await app.request(`/api/crm/contacts`, {
      method: "POST",
      headers: h("org-swyx"),
      body: JSON.stringify({ name: "Nia Patel", email: `nia-${Date.now()}@example.test` }),
    }),
  );
  assert.equal(contact.res.status, 201);
  const id = contact.body.data.id;

  // Valid option is accepted and persists on the canonical contact record.
  const ok = await parse(
    await app.request(`/api/crm/contacts/${id}`, {
      method: "PATCH",
      headers: h("org-swyx"),
      body: JSON.stringify({ customFields: { speakerType: "External", travel_class: "Business" } }),
    }),
  );
  assert.equal(ok.res.status, 200);
  assert.equal(ok.body.data.customFields.speakerType, "External");

  const reread = await parse(await app.request(`/api/crm/contacts/${id}`, { headers: h("org-swyx") }));
  assert.equal(reread.body.data.customFields.speakerType, "External");
  assert.equal(reread.body.data.customFields.travel_class, "Business");

  // A value outside the configured options is rejected server-side.
  const rejected = await parse(
    await app.request(`/api/crm/contacts/${id}`, {
      method: "PATCH",
      headers: h("org-swyx"),
      body: JSON.stringify({ customFields: { speakerType: "Martian" } }),
    }),
  );
  assert.equal(rejected.res.status, 400);
  assert.match(rejected.body.error.message, /Speaker Type must be one of: Internal, External/);
  const unchanged = await parse(await app.request(`/api/crm/contacts/${id}`, { headers: h("org-swyx") }));
  assert.equal(unchanged.body.data.customFields.speakerType, "External");

  // Helper-level contract used by the UI.
  assert.equal(validateCustomFields({ speakerType: "Internal" }).ok, true);
  assert.equal(validateCustomFields({ speakerType: "" }).ok, true, "empty clears the field");
  assert.equal(validateCustomFields({ adhoc: "anything" }).ok, true, "undefined keys still work");

  // Deleting a definition leaves stored values intact but stops enforcing.
  assert.equal((await app.request(`/api/crm/field-definitions/travel_class`, { method: "DELETE", headers: h("org-swyx") })).status, 204);
  assert.ok(!listFieldDefinitions().some((d) => d.key === "travel_class"));
  assert.equal(store.crm!.contacts.find((c) => c.id === id)!.customFields.travel_class, "Business");
});
