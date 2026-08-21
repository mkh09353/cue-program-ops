import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp, restoreSnapshot } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { derivedCompletionCopy, derivedTodoCopy } from "../src/web/pages/PortalPages.js";
import { autoCompletionNote } from "../src/web/lib/utils.js";
import { resetEventRegistry } from "../src/events.js";
import { MemoryRepository } from "../src/repository.js";
import type { CompetitionSnapshot, SnapshotPersistence } from "../src/persistence.js";

const ORG = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const json = async (r: Response) => (await r.json()) as any;
const asSpeaker = (id: string) => ({ "content-type": "application/json", "x-demo-persona": id, "x-demo-role": "speaker" });
const portal = () => readFileSync("src/web/pages/PortalPages.tsx", "utf8");

test("an explicit Mark complete finishes a confirm task", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  const roster = (await json(await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: ORG }))).data;
  const speaker = roster.find((r: any) => r.speakerId)!;

  // Organizer assigns an action task; it starts incomplete.
  const created = await app.request(`/api/events/${EVENT_ID}/speakers/tasks`, {
    method: "POST", headers: ORG,
    body: JSON.stringify({ speakerIds: [speaker.speakerId], title: "Confirm participation", dueAt: "2027-04-01T00:00:00.000Z", type: "confirm" }),
  });
  assert.equal(created.status, 201);
  const task = (await json(created)).data[0];
  assert.equal(task.status, "not_started");

  // The speaker completes it explicitly - no profile save involved.
  const done = await app.request(`/api/speaker/events/${EVENT_ID}/tasks/${task.id}`, {
    method: "PATCH", headers: asSpeaker(speaker.speakerId), body: JSON.stringify({ status: "completed" }),
  });
  assert.equal(done.status, 200, "explicit completion is accepted");
  assert.equal((await json(done)).data.task.status, "completed");
  assert.equal((await json(await app.request(`/api/speaker/events/${EVENT_ID}/tasks/${task.id}`, { headers: asSpeaker(speaker.speakerId) }))).data.task.completedVia, "manual");

  const home = (await json(await app.request(`/api/speaker/events/${EVENT_ID}/home`, { headers: asSpeaker(speaker.speakerId) }))).data;
  assert.equal(home.tasks.find((t: any) => t.id === task.id).status, "completed", "and persists on the portal");
  assert.equal(home.tasks.find((t: any) => t.id === task.id).completedVia, "manual");
  resetEventRegistry();
});

test("a file-backed task still requires the upload, and says so", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  const roster = (await json(await app.request(`/api/events/${EVENT_ID}/speakers`, { headers: ORG }))).data;
  const speaker = roster.find((r: any) => (r.tasks || []).some((t: any) => t.type === "slides" && t.status !== "completed"));
  if (speaker) {
    const slides = speaker.tasks.find((t: any) => t.type === "slides" && t.status !== "completed");
    const refused = await app.request(`/api/speaker/events/${EVENT_ID}/tasks/${slides.id}`, {
      method: "PATCH", headers: asSpeaker(speaker.speakerId), body: JSON.stringify({ status: "completed" }),
    });
    assert.equal(refused.status, 403, "a file task cannot be ticked off without the file");
    assert.match((await json(refused)).error.message, /upload/i);
  }
  // The UI copy explains what completes each derived type rather than offering a no-op.
  assert.equal(derivedTodoCopy("slides"), "Upload the file below");
  assert.equal(derivedTodoCopy("profile"), "Complete your profile below");
  assert.equal(derivedTodoCopy("form"), "Fill in the form below");
  resetEventRegistry();
});

test("derived tasks show why they completed", () => {
  assert.equal(derivedCompletionCopy("profile"), "Completed automatically when you saved your profile");
  assert.equal(derivedCompletionCopy("form"), "Completed automatically when you submitted the form");
  assert.equal(derivedCompletionCopy("headshot"), "Completed automatically when you uploaded the file");
  assert.equal(derivedCompletionCopy({ type: "profile", completedVia: "profile_save" }), "Completed automatically when you saved your profile");
  assert.equal(derivedCompletionCopy({ type: "confirm", completedVia: "manual" }), "Completed manually");
  assert.equal(autoCompletionNote({ type: "profile", status: "completed", completedVia: "profile_save" }), "Completed automatically via profile save");
  assert.equal(autoCompletionNote({ type: "profile", status: "completed", completedVia: "manual" }), null);
  assert.equal(autoCompletionNote({ type: "profile", status: "completed" }), "Completed automatically via profile save");
});

test("auto-complete and manual paths set completedVia and the field survives snapshot restore", async () => {
  resetEventRegistry();
  let saved: CompetitionSnapshot | undefined;
  const persistence: SnapshotPersistence = { load: async () => saved, save: async (s) => { saved = structuredClone(s); } };
  const repo = new MemoryRepository();
  const app = createApp({ repo, persistence });
  const speaker = "spk-sam";
  const profile = store.tasks.find((t) => t.speakerId === speaker && t.type === "profile")!;
  assert.equal(profile.status, "not_started");
  const savedProfile = await app.request(`/api/speaker/events/${EVENT_ID}/profile`, {
    method: "PUT",
    headers: asSpeaker(speaker),
    body: JSON.stringify({ bio: "A sufficiently long speaker biography for auto-complete." }),
  });
  assert.equal(savedProfile.status, 200);
  assert.equal(store.tasks.find((t) => t.id === profile.id)?.completedVia, "profile_save");

  const headshot = store.tasks.find((t) => t.speakerId === speaker && t.type === "headshot")!;
  const uploaded = await app.request(`/api/speaker/events/${EVENT_ID}/profile/headshot`, {
    method: "POST",
    headers: asSpeaker(speaker),
    body: JSON.stringify({ name: "sam.png", mime: "image/png", dataBase64: Buffer.from("png").toString("base64") }),
  });
  assert.equal(uploaded.status, 201);
  assert.equal(store.tasks.find((t) => t.id === headshot.id)?.completedVia, "headshot_upload");

  const slides = store.tasks.find((t) => t.speakerId === speaker && t.type === "slides")!;
  const file = await app.request(`/api/speaker/events/${EVENT_ID}/files`, {
    method: "POST",
    headers: asSpeaker(speaker),
    body: JSON.stringify({ kind: "slides", name: "deck.pdf" }),
  });
  assert.equal(file.status, 201);
  assert.equal(store.tasks.find((t) => t.id === slides.id)?.completedVia, "file_upload");

  const home = (await json(await app.request(`/api/speaker/events/${EVENT_ID}/home`, { headers: asSpeaker(speaker) }))).data;
  assert.equal(home.tasks.find((t: any) => t.id === profile.id).completedVia, "profile_save");
  assert.equal(home.tasks.find((t: any) => t.id === headshot.id).completedVia, "headshot_upload");
  assert.equal(home.tasks.find((t: any) => t.id === slides.id).completedVia, "file_upload");

  store.tasks.find((t) => t.id === profile.id)!.completedVia = undefined;
  store.tasks.find((t) => t.id === headshot.id)!.completedVia = undefined;
  store.tasks.find((t) => t.id === slides.id)!.completedVia = undefined;
  assert.equal(await restoreSnapshot({ repo: new MemoryRepository(), persistence }), true);
  assert.equal(store.tasks.find((t) => t.id === profile.id)?.completedVia, "profile_save");
  assert.equal(store.tasks.find((t) => t.id === headshot.id)?.completedVia, "headshot_upload");
  assert.equal(store.tasks.find((t) => t.id === slides.id)?.completedVia, "file_upload");
  resetEventRegistry();
});

test("the task list exposes completion state and an action on every row", () => {
  const src = portal();
  assert.match(src, /const DERIVED_TASK_TYPES = new Set\(\["profile", "headshot", "slides", "supporting_doc", "form"\]\)/);
  // Completed rows: a checked, disabled control plus the derived explanation.
  assert.match(src, /data-testid=\{`task-complete-check-\$\{t\.id\}`\}/);
  assert.match(src, /checked\n\s*disabled/, "completed state is a checked disabled box");
  assert.match(src, /data-testid=\{`task-derived-note-\$\{t\.id\}`\}/);
  // Incomplete rows: a real Mark complete button.
  assert.match(src, /data-testid=\{`task-mark-complete-\$\{t\.id\}`\}/);
  assert.match(src, /aria-label=\{`Mark \$\{t\.title\} complete`\}/);
  assert.match(src, /Mark complete/);
  // A derived task routes to the thing that completes it instead of failing.
  assert.match(src, /if \(DERIVED_TASK_TYPES\.has\(t\.type\)\) \{[\s\S]{0,160}nav\(`\/p\/tasks\/\$\{t\.id\}`\)/);
});

test("the task detail shows completion state for every task type", () => {
  const src = portal();
  assert.match(src, /data-testid="task-complete-state"/, "completed detail state");
  assert.match(src, /data-testid="task-derived-completion-copy"/, "and why it completed");
  assert.match(src, /data-testid="task-derived-todo"/, "pending derived tasks say what to do");
  assert.match(src, /data-testid="task-mark-complete"/, "action tasks keep an explicit button");
  assert.match(src, /aria-label=\{`Mark \$\{task\.title\} complete`\}/);
  // The old narrow condition that hid the control for most types is gone.
  assert.ok(
    !/!isFile && task\.type !== "profile" && task\.type !== "form" && task\.status !== "completed"/.test(src),
    "completion affordance is no longer conditional on a narrow type list",
  );
  assert.match(src, /toast\(e\?\.message \|\| "Could not complete the task", "danger"\)/, "failures surface the server message");
});

test("the workflow status badge shows a saved timestamp", () => {
  const src = readFileSync("src/web/pages/SpeakersCommsPages.tsx", "utf8");
  assert.match(src, /const \[statusSavedAt, setStatusSavedAt\] = useState\(""\)/);
  assert.match(src, /setStatusSavedAt\(at\)/, "the stamp is set on a successful save");
  assert.match(src, /data-testid="workflow-status-badge"/, "the current status is shown as a badge");
  assert.match(src, /data-testid="workflow-status-saved-at"/);
  assert.match(src, /saved \{statusSavedAt\}/, "and reads 'saved <time>'");
});
