import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";

const h = (persona: string) => ({ "content-type": "application/json", "x-demo-persona": persona });
const post = (app: any, path: string, body: unknown, persona = "org-swyx") =>
  app.request(path, { method: "POST", headers: h(persona), body: JSON.stringify(body) });

/** Parse local file headers: returns [{ name, bytes }] so tests can assert real content. */
async function unzip(response: Response) {
  const b = new Uint8Array(await response.arrayBuffer());
  const view = new DataView(b.buffer);
  const out: { name: string; text: string; size: number }[] = [];
  let p = 0;
  while (p + 30 < b.length && view.getUint32(p, true) === 0x04034b50) {
    const size = view.getUint32(p + 18, true);
    const nameLen = view.getUint16(p + 26, true);
    const extra = view.getUint16(p + 28, true);
    const name = new TextDecoder().decode(b.slice(p + 30, p + 30 + nameLen));
    const start = p + 30 + nameLen + extra;
    out.push({ name, text: new TextDecoder().decode(b.slice(start, start + size)), size });
    p = start + size;
  }
  return out;
}

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");

/** Seed a deterministic file set: two speakers, two sessions, one unassigned file. */
function seedArchiveFixture(tag: string) {
  const mk = (id: string, speakerId: string, sessionId: string | undefined, name: string, body: string, older?: string) => {
    const versions: any[] = [];
    if (older) versions.push({ id: `${id}-v1`, version: 1, name, mime: "application/pdf", size: older.length, dataBase64: b64(older), uploadedBy: speakerId, uploadedAt: "2027-01-01T00:00:00.000Z", current: false });
    versions.push({ id: `${id}-v${versions.length + 1}`, version: versions.length + 1, name, mime: "application/pdf", size: body.length, dataBase64: b64(body), uploadedBy: speakerId, uploadedAt: "2027-02-01T00:00:00.000Z", current: true });
    const file: any = { id, speakerId, sessionId, taskId: `${id}-task`, kind: "slides", status: "submitted", versions, comments: [] };
    store.contentFiles.push(file);
    return file;
  };
  const a = mk(`arch-a-${tag}`, "spk-ada", "ses-analytical", "deck.pdf", "ADA CURRENT", "ADA OLD");
  const b = mk(`arch-b-${tag}`, "spk-sam", "ses-sam", "deck.pdf", "SAM CURRENT");
  const orphan = mk(`arch-orphan-${tag}`, "spk-nobody", undefined, "loose.pdf", "ORPHAN CURRENT");
  return { a, b, orphan };
}

test("archive export includes only the selected files, at their current version", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const tag = "sel";
  const { a, b } = seedArchiveFixture(tag);

  const res = await post(app, `/api/events/${EVENT_ID}/content/export`, { fileIds: [a.id], grouping: "session" });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /application\/zip/);
  assert.equal(res.headers.get("x-cue-file-count"), "1", "count header matches entries");
  assert.equal(res.headers.get("x-cue-grouping"), "session");
  assert.deepEqual(JSON.parse(decodeURIComponent(res.headers.get("x-cue-entry-names") || "")), ["Analytical Engines in Practice/deck.pdf"]);

  const entries = await unzip(res);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.name, "Analytical Engines in Practice/deck.pdf");
  assert.equal(entries[0]!.text, "ADA CURRENT", "latest bytes only");
  assert.ok(!entries.some((e) => e.text === "ADA OLD"), "superseded version is excluded");
  assert.ok(!entries.some((e) => e.text === "SAM CURRENT"), "deselected file is absent");
  assert.ok(!entries.some((e) => e.name.includes("slides.pdf")), "seeded files not in the selection are absent");
  void b;
});

test("selecting a session pulls in that session's files without naming them", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const tag = "byses";
  const { a, b } = seedArchiveFixture(tag);

  const res = await post(app, `/api/events/${EVENT_ID}/content/export`, { sessionIds: ["ses-sam"], grouping: "session" });
  assert.equal(res.status, 200);
  const entries = await unzip(res);
  assert.ok(entries.some((e) => e.text === "SAM CURRENT"), "session-selected file included");
  assert.ok(!entries.some((e) => e.text === "ADA CURRENT"), "other session excluded");
  assert.ok(entries.every((e) => e.name.startsWith("Eval Harnesses Teams Actually Use/")), "session folder used");
  void a;
  void b;
});

test("grouping by speaker uses speaker folders and Unassigned for files without one", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const tag = "spk";
  const { a, b, orphan } = seedArchiveFixture(tag);

  const bySpeaker = await post(app, `/api/events/${EVENT_ID}/content/export`, {
    fileIds: [a.id, b.id, orphan.id],
    grouping: "speaker",
  });
  assert.equal(bySpeaker.status, 200);
  assert.equal(bySpeaker.headers.get("x-cue-grouping"), "speaker");
  const speakerEntries = await unzip(bySpeaker);
  const folders = speakerEntries.map((e) => e.name.split("/")[0]);
  assert.ok(folders.includes("Ada Lovelace"), `expected a speaker folder, got ${folders}`);
  assert.ok(folders.includes("Sam Rivera"));
  assert.ok(folders.includes("Unassigned"), "file with an unknown speaker lands in Unassigned");
  assert.equal(speakerEntries.length, 3);

  // Same selection grouped by session: session folders + General for the unassigned file.
  const bySession = await post(app, `/api/events/${EVENT_ID}/content/export`, {
    fileIds: [a.id, b.id, orphan.id],
    grouping: "session",
  });
  const sessionFolders = (await unzip(bySession)).map((e) => e.name.split("/")[0]);
  assert.ok(sessionFolders.includes("Analytical Engines in Practice"));
  assert.ok(sessionFolders.includes("General"), "file with no session lands in General");
});

test("duplicate entry names are disambiguated so no file is lost", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const tag = "dupe";
  const { a, b } = seedArchiveFixture(tag);
  // Both files are named deck.pdf; grouping by speaker keeps them apart, but forcing
  // them into one folder (same speaker) must still yield two distinct entries.
  store.contentFiles.find((f) => f.id === b.id)!.speakerId = "spk-ada";

  const res = await post(app, `/api/events/${EVENT_ID}/content/export`, { fileIds: [a.id, b.id], grouping: "speaker" });
  assert.equal(res.status, 200);
  const entries = await unzip(res);
  assert.equal(entries.length, 2, "no entry was dropped");
  assert.equal(new Set(entries.map((e) => e.name)).size, 2, "entry paths are unique");
  assert.ok(entries.some((e) => e.name === "Ada Lovelace/deck.pdf"));
  assert.ok(entries.some((e) => /deck \(2\)\.pdf$/.test(e.name)), `expected a disambiguated name, got ${entries.map((e) => e.name)}`);
  assert.deepEqual(entries.map((e) => e.text).sort(), ["ADA CURRENT", "SAM CURRENT"], "both payloads preserved");
  assert.equal(res.headers.get("x-cue-file-count"), "2");
});

test("empty or malformed selections are refused and never export everything", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  seedArchiveFixture("bad");

  const cases: [any, RegExp][] = [
    [{ grouping: "session" }, /select at least one/i],
    [{ sessionIds: [], fileIds: [], grouping: "speaker" }, /select at least one/i],
    [{ fileIds: ["arch-a-bad"] }, /grouping must be/i],
    [{ fileIds: ["arch-a-bad"], grouping: "team" }, /grouping must be/i],
    [{ fileIds: "not-an-array", grouping: "session" }, /select at least one/i],
    [{ fileIds: ["does-not-exist"], grouping: "session" }, /no matching files/i],
  ];
  for (const [body, expected] of cases) {
    const res = await post(app, `/api/events/${EVENT_ID}/content/export`, body);
    assert.equal(res.status, 400, `${JSON.stringify(body)} must be refused`);
    const parsed = (await res.json()) as any;
    assert.match(parsed.error.message, expected);
  }

  // A non-JSON body is refused too, not treated as "everything".
  const raw = await app.request(`/api/events/${EVENT_ID}/content/export`, { method: "POST", headers: h("org-swyx"), body: "not json" });
  assert.equal(raw.status, 400);
});

test("archive export requires an organizer persona", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const { a } = seedArchiveFixture("auth");
  const speaker = store.personas.find((p) => p.speakerId === "spk-ada")!;
  const denied = await post(app, `/api/events/${EVENT_ID}/content/export`, { fileIds: [a.id], grouping: "session" }, speaker.id);
  assert.equal(denied.status, 403);
  const allowed = await post(app, `/api/events/${EVENT_ID}/content/export`, { fileIds: [a.id], grouping: "session" });
  assert.equal(allowed.status, 200);
  // Unknown event is a 404 before any work happens.
  const wrongEvent = await app.request(`/api/events/evt-nope/content/export`, { method: "POST", headers: h("org-swyx"), body: JSON.stringify({ fileIds: [a.id], grouping: "session" }) });
  assert.equal(wrongEvent.status, 404);
});

test("legacy GET export stays global for existing consumers", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const res = await app.request(`/api/events/${EVENT_ID}/content/export`, { headers: h("org-swyx") });
  assert.equal(res.status, 200);
  const entries = await unzip(res);
  assert.ok(entries.length >= 1);
  assert.ok(entries.every((e) => e.name.includes("/")), "every entry is foldered");
  assert.equal(res.headers.get("x-cue-file-count"), String(entries.length));
});

/** The dialog contract the organizer drives. */
test("files tab exposes an archive dialog with selection, grouping and a disabled empty state", () => {
  const page = readFileSync(new URL("../src/web/pages/ContentPages.tsx", import.meta.url), "utf8");
  assert.match(page, /data-testid="open-archive-dialog"/);
  assert.match(page, /data-testid="archive-dialog"/);
  assert.match(page, /data-testid="archive-select-all"/);
  assert.match(page, /data-testid="archive-clear-all"/);
  assert.match(page, /data-testid="archive-selection-count"/);
  // Exactly two grouping options.
  assert.match(page, /<option value="session">/);
  assert.match(page, /<option value="speaker">/);
  assert.ok(!/<option value="track">/.test(page), "only session/speaker grouping is offered");
  // Disabled until something is selected, and the payload is explicit.
  assert.match(page, /disabled=\{exportBusy\|\|\(!archiveSessions\.length&&!archiveFiles\.length\)\}/);
  assert.match(page, /api\.contentExportZip\(\{sessionIds:archiveSessions,fileIds:archiveFiles,grouping:archiveGrouping\}\)/);
  // Per-item checkboxes for both sessions and files.
  assert.match(page, /Include session \$\{session\.title\}/);
  assert.match(page, /Include file \$\{f\.currentVersion\?\.name\|\|f\.id\}/);

  const client = readFileSync(new URL("../src/web/lib/api.ts", import.meta.url), "utf8");
  assert.match(client, /contentExportZip: async \(selection: \{/, "client takes an explicit selection");
  assert.match(client, /method: "POST"/);
  assert.match(client, /sessionIds: selection\.sessionIds \|\| \[\]/);
  assert.match(client, /x-cue-entry-names/);
  assert.match(page, /data-testid="archive-entry-names"/);
  assert.match(page, /data-testid="archive-download-again"/);
});
