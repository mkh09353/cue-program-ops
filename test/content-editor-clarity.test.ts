import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";
import { historyChanges, historyStamp } from "../src/web/pages/ContentPages.js";

// Jordan Alvarez is the organizer the content fixtures attribute history to;
// swyx is now the DEFAULT organizer (org-swyx), so name this persona explicitly.
const org = { "content-type": "application/json", "x-demo-persona": "org-jordan" };
const json = async (res: Response) => (await res.json()) as any;
const patch = (app: any, path: string, body: unknown) =>
  app.request(path, { method: "PATCH", headers: org, body: JSON.stringify(body) });

/** A real 4×4 PNG (decodable), not a placeholder string. */
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNQLLwBRwzEcQBBIhahB1LZpgAAAABJRU5ErkJggg==";
const PNG_DATA_URL = `data:image/png;base64,${PNG_B64}`;

test("headshot fixture is a genuinely decodable PNG, not a placeholder", () => {
  const bytes = Buffer.from(PNG_B64, "base64");
  assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "PNG signature");
  assert.equal(bytes.subarray(12, 16).toString("latin1"), "IHDR");
  assert.equal(bytes.readUInt32BE(16), 4, "width");
  assert.equal(bytes.readUInt32BE(20), 4, "height");
  assert.equal(bytes.subarray(bytes.length - 8, bytes.length - 4).toString("latin1"), "IEND", "complete stream");
});

test("organizer headshot upload persists and survives a reload of the content payload", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const saved = await json(
    await patch(app, `/api/events/${EVENT_ID}/content/speakers/spk-ada`, { headshotUrl: PNG_DATA_URL, title: "Principal Engineer" }),
  );
  assert.equal(saved.data.headshotUrl, PNG_DATA_URL, "save response echoes the stored image");

  // A fresh read (what a reload does) still carries the image.
  const reloaded = await json(await app.request(`/api/events/${EVENT_ID}/content`, { headers: org }));
  const speaker = reloaded.data.speakers.find((s: any) => s.speakerId === "spk-ada");
  assert.equal(speaker.headshotUrl, PNG_DATA_URL, "preview source survives reload");
  assert.equal(String(speaker.headshotUrl).startsWith("data:image/png;base64,"), true, "data URL behavior preserved");
  assert.equal(store.profiles.find((p) => p.speakerId === "spk-ada")!.headshotUrl, PNG_DATA_URL);

  // The public projection carries the same bytes (server URL behavior unchanged elsewhere).
  const feed = await json(await app.request(`/e/ai-engineer-summit/public/feed.json`));
  assert.equal(feed.speakers.find((s: any) => s.id === "spk-ada").headshotUrl, PNG_DATA_URL);
});

test("speaker editor shows a large preview with decode state and file metadata", () => {
  const page = readFileSync(new URL("../src/web/pages/ContentPages.tsx", import.meta.url), "utf8");
  // Large, non-placeholder preview that shows the whole image.
  assert.match(page, /data-testid="headshot-large-preview"/);
  assert.match(page, /className="h-40 w-40 rounded-\[18px\] border border-line bg-white object-contain"/);
  // Explicit success / error / loading states driven by real decode events.
  assert.match(page, /onLoad=\{e=>\{const img=e\.currentTarget;setHeadshotState\("ready"\)/);
  assert.match(page, /onError=\{\(\)=>setHeadshotState\("error"\)\}/);
  assert.match(page, /Image failed to decode/);
  assert.match(page, /Image decoded/);
  assert.match(page, /Decoding image…/);
  // Filename / type / size and the source of the preview.
  assert.match(page, /data-testid="headshot-file-meta"/);
  assert.match(page, /setHeadshotMeta\(\{name:f\.name,type:f\.type,size:f\.size\}\)/);
  assert.match(page, /inline data URL/);
  // Never claim success when decode failed.
  assert.match(page, /disabled=\{headshotState==="error"\}/);
  assert.match(page, /Fix the headshot before saving/);
});

test("history rows carry precise distinct timestamps and a changed-field summary", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const before = (await json(await app.request(`/api/events/${EVENT_ID}/content`, { headers: org }))).data.sessions.find(
    (s: any) => s.canonicalId === "ses-analytical",
  );

  await patch(app, `/api/events/${EVENT_ID}/content/sessions/ses-analytical`, { title: "First save", abstract: before.abstract });
  await patch(app, `/api/events/${EVENT_ID}/content/sessions/ses-analytical`, { title: "Second save", abstract: before.abstract });
  const row = (await json(await app.request(`/api/events/${EVENT_ID}/content`, { headers: org }))).data.sessions.find(
    (s: any) => s.canonicalId === "ses-analytical",
  );
  const added = row.history.slice(before.history.length);
  assert.equal(added.length, 2, "two saves, two entries");

  // Distinct rendered stamps even when the saves land in the same minute.
  const stamps = added.map((h: any) => historyStamp(h.createdAt));
  assert.equal(new Set(stamps).size, 2, `stamps must differ: ${stamps}`);
  for (const stamp of stamps) assert.match(stamp, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/, "seconds + milliseconds");
  assert.ok(stamps[1]! > stamps[0]!, "stamps sort chronologically as text");
  assert.ok(added.every((h: any) => h.editorName === "Jordan Alvarez"), "editor is named on every row");

  // Concise before→after summary of only the fields that changed.
  const changes = historyChanges(added[1]);
  assert.deepEqual(changes.map((c: any) => c.label), ["Title"], "abstract was unchanged so it is not listed");
  assert.equal(changes[0]!.from, "First save");
  assert.equal(changes[0]!.to, "Second save");

  // A save with no field changes is labelled rather than shown as an empty row.
  await patch(app, `/api/events/${EVENT_ID}/content/sessions/ses-analytical`, { title: "Second save" });
  const resaved = (await json(await app.request(`/api/events/${EVENT_ID}/content`, { headers: org }))).data.sessions.find(
    (s: any) => s.canonicalId === "ses-analytical",
  );
  const last = resaved.history.at(-1);
  assert.equal(last.noChange, true);
  assert.deepEqual(historyChanges(last), [], "no-change saves summarise as no changed fields");
});

test("historyStamp and historyChanges are deterministic helpers", () => {
  assert.equal(historyStamp("2026-08-10T06:43:52.929Z"), historyStamp("2026-08-10T06:43:52.929Z"));
  assert.notEqual(historyStamp("2026-08-10T06:43:52.929Z"), historyStamp("2026-08-10T06:43:52.943Z"), "ms precision");
  assert.equal(historyStamp("not-a-date"), "not-a-date", "unparseable input degrades safely");

  assert.deepEqual(
    historyChanges({ before: { title: "A", speakerIds: ["x"] }, after: { title: "B", speakerIds: ["x"] } }).map((c) => c.label),
    ["Title"],
  );
  assert.deepEqual(
    historyChanges({ before: { speakerIds: ["x"] }, after: { speakerIds: ["x", "y"] } }).map((c) => [c.label, c.from, c.to]),
    [["Speakers", "x", "x, y"]],
  );
  assert.deepEqual(historyChanges({ before: {}, after: {} }), []);
  // Long values are truncated so a row stays scannable.
  const long = "z".repeat(200);
  assert.ok(historyChanges({ before: { abstract: "" }, after: { abstract: long } })[0]!.to.endsWith("…"));
});

test("history panel renders distinct rows newest-first and preserves restore", () => {
  const page = readFileSync(new URL("../src/web/pages/ContentPages.tsx", import.meta.url), "utf8");
  assert.match(page, /data-testid=\{`history-row-\$\{h\.id\}`\}/);
  assert.match(page, /data-testid=\{`history-time-\$\{h\.id\}`\}/);
  assert.match(page, /data-testid=\{`history-changes-\$\{h\.id\}`\}/);
  assert.match(page, /historyStamp\(h\.createdAt\)/, "rows use the precise stamp, not toLocaleString");
  assert.match(page, /sort\(\(a:any,b:any\)=>String\(b\.createdAt\)\.localeCompare\(String\(a\.createdAt\)\)\)/, "deterministic newest-first");
  assert.match(page, /No field changes/);
  // Restore still calls the same endpoint and reloads.
  assert.match(page, /api\.restoreContentHistory\(h\.id\)/);
  assert.match(page, /Restore this version/);
  assert.match(page, /aria-label=\{`Restore version from \$\{historyStamp\(h\.createdAt\)\}`\}/);
  assert.match(page, /data-testid="session-history-always-visible"/, "history is pinned above the form");
  assert.match(page, /\.slice\(0,2\)/, "two newest entries are pinned in view");
  assert.match(page, /setEditing\(\{\.\.\.r\.data\}\)/, "restore keeps the editor open on returned content");
  assert.ok(!/restoreContentHistory\(h\.id\)[\s\S]{0,180}setEditing\(null\)/.test(page), "restore does not close the editor");
});

test("restore from a history row still rewrites the session", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const baseline = (await json(await app.request(`/api/events/${EVENT_ID}/content`, { headers: org }))).data.sessions.find(
    (s: any) => s.canonicalId === "ses-workshop",
  );
  const original = baseline.title;
  await patch(app, `/api/events/${EVENT_ID}/content/sessions/ses-workshop`, { title: "Renamed for restore" });
  const row = (await json(await app.request(`/api/events/${EVENT_ID}/content`, { headers: org }))).data.sessions.find(
    (s: any) => s.canonicalId === "ses-workshop",
  );
  const entry = row.history.at(-1);
  assert.equal(historyChanges(entry)[0]!.to, "Renamed for restore");

  const restored = await app.request(`/api/events/${EVENT_ID}/content/history/${entry.id}/restore`, { method: "POST", headers: org, body: "{}" });
  assert.equal(restored.status, 200);
  const after = (await json(await app.request(`/api/events/${EVENT_ID}/content`, { headers: org }))).data.sessions.find(
    (s: any) => s.canonicalId === "ses-workshop",
  );
  assert.equal(after.title, original, "restore put the prior title back");
});
