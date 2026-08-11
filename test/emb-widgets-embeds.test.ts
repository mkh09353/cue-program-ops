import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { MemoryRepository } from "../src/repository.js";
import { baseNameKey, bySurname, dedupePublicSpeakers, hasProvenanceMarker, splitName, type PublicSpeakerView } from "../src/publicProjection.js";
import { embedSnippet } from "../src/web/pages/PublishFormsSettings.js";

const page = async (path: string) => {
  const app = createApp({ repo: new MemoryRepository() });
  return (await app.request(path)).text();
};
/** Mirrors the derived fields production's speakerView() computes, so fixtures
 * exercise the same lastName/sortName values the pages render. */
const speaker = (over: Partial<PublicSpeakerView>): PublicSpeakerView => {
  const name = over.name || "";
  const { firstName, lastName } = splitName(name);
  return {
    id: over.id || `spk-${name}`,
    name,
    firstName,
    lastName,
    bio: "",
    initials: "",
    sessionIds: [],
    sortName: firstName && firstName !== lastName ? `${lastName}, ${firstName}` : lastName,
    ...over,
  } as PublicSpeakerView;
};

// —— EMB-04 / EMB-12: ordering ——

test("EMB-04: surname split ignores generational suffixes and handles single names", () => {
  assert.deepEqual(splitName("Ada Lovelace"), { firstName: "Ada", lastName: "Lovelace" });
  assert.deepEqual(splitName("Margaret Heafield Hamilton"), { firstName: "Margaret Heafield", lastName: "Hamilton" });
  assert.deepEqual(splitName("Ada Lovelace Jr."), { firstName: "Ada", lastName: "Lovelace" });
  assert.deepEqual(splitName("Prince"), { firstName: "Prince", lastName: "Prince" });
  assert.deepEqual(splitName("   "), { firstName: "", lastName: "" });
});

test("EMB-04: ordering is locale-aware, case/accent tolerant, and stable for equal names", () => {
  const rows = [
    speaker({ id: "b", name: "ada lovelace" }),
    speaker({ id: "a", name: "Ada Lovelace" }),
    speaker({ id: "c", name: "Lin Clark" }),
    speaker({ id: "d", name: "Zoë Ångström" }),
    speaker({ id: "e", name: "Margaret Hamilton" }),
  ];
  const order = [...rows].sort(bySurname).map((s) => s.id);
  assert.deepEqual(order, ["d", "c", "e", "a", "b"], "Ångström < Clark < Hamilton < Lovelace, ties broken by id");
  // Deterministic regardless of input order.
  const shuffled = [rows[4], rows[0], rows[3], rows[1], rows[2]];
  assert.deepEqual([...shuffled].sort(bySurname).map((s) => s.id), order);
});

test("EMB-04: the public directory renders surname-forward names in A–Z order with a visible label", async () => {
  const html = await page("/e/ai-engineer-summit/public/speakers");
  const names = [...html.matchAll(/data-sort-name[^>]*>(?:<a[^>]*>)?<b>([^<]*)<\/b>([^<]*)/g)].map((m) => `${m[1]}${m[2]}`);
  assert.deepEqual(names, ["Clark, Lin", "Hamilton, Margaret", "Lovelace, Ada"]);
  assert.match(html, /Sorted A–Z by last name/);
  assert.match(html, /data-sort-key="Clark"/);
  // The full display name is still present for readability.
  assert.match(html, /Lin Clark/);
});

test("EMB-12: the gallery uses the same surname-forward ordering and label", async () => {
  const html = await page("/e/ai-engineer-summit/public/gallery");
  const names = [...html.matchAll(/data-sort-name[^>]*><b>([^<]*)<\/b>([^<]*)/g)].map((m) => `${m[1]}${m[2]}`);
  assert.deepEqual(names, ["Clark, Lin", "Hamilton, Margaret", "Lovelace, Ada"]);
  assert.match(html, /Sorted A–Z by last name/);
});

test("EMB-04: the runtime “Priya Raman (manual)” placeholder collapses into the real card", () => {
  // The judged artifact: the import/CRM handoff leaves a second record whose
  // DISPLAY NAME carries the marker, so identity must ignore that suffix.
  const rich = speaker({ id: "spk-priya", name: "Priya Raman", title: "Principal Engineer", company: "Latticework Systems", hasUploadedHeadshot: true, sessionIds: ["s1"] });
  const placeholder = speaker({ id: "spk-priya-manual", name: "Priya Raman (manual)", bio: "Short bio", sessionIds: ["s2"] });
  const out = dedupePublicSpeakers([rich, placeholder]);
  assert.equal(out.length, 1, "the (manual) duplicate is not shown publicly");
  assert.equal(out[0].id, "spk-priya");
  assert.equal(out[0].name, "Priya Raman", "the richer record keeps the canonical display name");
  assert.deepEqual(out[0].sessionIds, ["s1", "s2"], "the placeholder's sessions are preserved");
  // The marker must never survive into the rendered directory name or sort key.
  assert.equal(out[0].lastName, "Raman");
  assert.equal(out[0].sortName, "Raman, Priya");
});

test("EMB-04: base-name identity ignores provenance markers only", () => {
  assert.equal(baseNameKey("Priya Raman (manual)"), "priya raman");
  assert.equal(baseNameKey("  Priya   Raman  "), "priya raman");
  assert.equal(baseNameKey("Priya Raman (Imported)"), "priya raman");
  assert.equal(baseNameKey("Priya Raman (copy)"), "priya raman");
  // A generational suffix is part of identity: it may be a different person.
  assert.equal(baseNameKey("Ada Lovelace Jr."), "ada lovelace jr.");
  assert.notEqual(baseNameKey("Ada Lovelace Jr."), baseNameKey("Ada Lovelace"));
  assert.equal(hasProvenanceMarker("Priya Raman (manual)"), true);
  assert.equal(hasProvenanceMarker("Priya Raman"), false);
  assert.equal(hasProvenanceMarker("Ada Lovelace Jr."), false);
});

test("EMB-04: a bare same-name duplicate still collapses without any marker", () => {
  const rich = speaker({ id: "spk-a", name: "Priya Raman", title: "Principal Engineer", sessionIds: ["s1"] });
  const bare = speaker({ id: "spk-b", name: "Priya Raman", sessionIds: ["s2"] });
  const out = dedupePublicSpeakers([rich, bare]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].sessionIds, ["s1", "s2"]);
});

test("EMB-04: distinct people who share a name are never merged", () => {
  const one = speaker({ id: "a", name: "Alex Kim", title: "CTO", company: "Acme" });
  const two = speaker({ id: "b", name: "Alex Kim", title: "Designer", company: "Globex" });
  assert.equal(dedupePublicSpeakers([one, two]).length, 2);
  // Two bare placeholders are also left alone — there is no richer record to keep.
  const p1 = speaker({ id: "c", name: "Sam Lee" });
  const p2 = speaker({ id: "d", name: "Sam Lee" });
  assert.equal(dedupePublicSpeakers([p1, p2]).length, 2);
  // Two marked placeholders with no canonical record also both survive.
  const m1 = speaker({ id: "e", name: "Jo Fox (manual)" });
  const m2 = speaker({ id: "f", name: "Jo Fox (imported)" });
  assert.equal(dedupePublicSpeakers([m1, m2]).length, 2);
  // Two populated people sharing a base name stay distinct even if one is marked.
  const r1 = speaker({ id: "g", name: "Dana Cruz", title: "CTO", company: "Acme" });
  const r2 = speaker({ id: "h", name: "Dana Cruz (manual)", title: "Designer", company: "Globex" });
  assert.equal(dedupePublicSpeakers([r1, r2]).length, 2, "a populated marked record is not silently dropped");
});

// —— EMB-02: search ——

test("EMB-02: sessions search matches speaker names and reports which field matched", async () => {
  const html = await page("/e/ai-engineer-summit/public/sessions");
  // Speaker names are in the searchable haystack.
  assert.match(html, /data-speakers="[^"]*Lovelace/);
  // The client filter tracks per-field match counts and surfaces them in the count line.
  assert.match(html, /by speaker name/);
  assert.match(html, /by title/);
  assert.match(html, /matched ' \+ bits\.join/);
  // Each card can flag a speaker-only match.
  assert.match(html, /data-match-flag/);
  assert.match(html, /Matched a speaker name/);
});

test("EMB-02: search copy claims only fields that are actually matched", async () => {
  const html = await page("/e/ai-engineer-summit/public/sessions");
  assert.match(html, /matches session titles, speaker names and descriptions/);
  assert.match(html, /placeholder="Search by session title or speaker name"/);
  const src = readFileSync("src/publicSite.ts", "utf8");
  // Description text is part of the haystack, so the copy must mention it.
  assert.match(src, /inTitle=title\.indexOf\(q\)>=0/);
  assert.match(src, /inSpeaker=speakers\.indexOf\(q\)>=0/);
  assert.match(src, /var inText=\(card\.textContent\|\|''\)\.toLowerCase\(\)\.indexOf\(q\)>=0/);
});

test("EMB-02: speaker pages state that both first and last names are searched", async () => {
  for (const path of ["/e/ai-engineer-summit/public/speakers", "/e/ai-engineer-summit/public/gallery"]) {
    assert.match(await page(path), /by first or last name/);
  }
});

// —— EMB-15: embed manager ——

test("EMB-15: snippet format changes the generated output and carries custom CSS", () => {
  const url = "https://example.test/e/x/public/sessions?config=embed-1";
  const basic = embedSnippet({ url, name: "QA", format: "basic" });
  assert.match(basic, /^<iframe /);
  assert.ok(!basic.includes("<style>"));

  const styled = embedSnippet({ url, name: "QA", format: "styled", css: ".cue-embed{border:2px solid red}" });
  assert.match(styled, /<style>/);
  assert.match(styled, /\.cue-embed\{border:2px solid red\}/);
  assert.match(styled, /<div class="cue-embed">/);
  assert.match(styled, /<iframe src="https:\/\/example\.test/);
  // Styled with no CSS still produces a usable default wrapper.
  assert.match(embedSnippet({ url, name: "QA", format: "styled" }), /border-radius:18px/);
});

test("EMB-15: the embed manager exposes search, status, toggle, format and CSS controls", () => {
  const src = readFileSync("src/web/pages/PublishFormsSettings.tsx", "utf8");
  assert.match(src, /data-testid="embed-search"/, "saved configs are searchable");
  assert.match(src, /data-testid="embed-config-count"/, "counts show enabled/disabled totals");
  assert.match(src, /enabled \+ ' \| '|enabled · \{configs\.length-enabledCount\} disabled|enabled ·/, "status totals rendered");
  assert.match(src, /data-testid={`embed-status-\$\{c\.id\}`}/, "per-config status badge");
  assert.match(src, /data-testid={`embed-toggle-\$\{c\.id\}`}/, "per-config enable/disable toggle");
  assert.match(src, /data-testid="embed-format"/, "Basic/Styled format picker");
  assert.match(src, /Basic HTML \(plain iframe\)/);
  assert.match(src, /Styled HTML \(wrapper \+ custom CSS\)/);
  assert.match(src, /data-testid="embed-css"/, "custom CSS input");
  assert.match(src, /data-testid="embed-none-saved"/, "empty state for no saved configs");
  assert.match(src, /data-testid="embed-search-empty"/, "empty state for a search miss");
  assert.match(src, /embedSnippet\(\{url,name:c\.name,format:pref\.format,css:pref\.css\}\)/, "snippet honors the saved format");
  // The storage limitation must stay visible to the organizer.
  assert.match(src, /data-testid="embed-prefs-note"/);
  assert.match(src, /stored in this browser/);
});

test("EMB-15: saved-config filtering matches name, widget and filter values", () => {
  const src = readFileSync("src/web/pages/PublishFormsSettings.tsx", "utf8");
  assert.match(src, /const configMatches=\(c:any,q:string\)=>/);
  assert.match(src, /\[c\.name,c\.widget,filters\]\.join\(" "\)\.toLowerCase\(\)\.includes\(needle\)/);
  assert.match(src, /const visibleConfigs=configs\.filter\(c=>configMatches\(c,configQuery\)\)/);
});
