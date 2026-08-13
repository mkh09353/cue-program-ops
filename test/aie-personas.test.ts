import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp, restoreSnapshot } from "../src/app.js";
import { EVENT_ID, resolveDemoPersona, store } from "../src/lifecycle.js";
import { resetEventRegistry } from "../src/events.js";
import { MemoryRepository } from "../src/repository.js";
import { InMemorySnapshotStore } from "../src/persistence.js";
import { DEFAULT_PERSONAS } from "../src/web/lib/utils.js";

const ORG = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const json = async (r: Response) => (await r.json()) as any;
const boot = () => {
  resetEventRegistry();
  return createApp({ repo: new MemoryRepository() });
};
const AIE = [
  ["org-swyx", "swyx", "swyx@ai.engineer"],
  ["org-sydney", "Sydney", "sydney@ai.engineer"],
  ["org-phlo", "Phlo", "phlo@ai.engineer"],
  ["org-kelsey", "Kelsey", "kelsey@ai.engineer"],
] as const;

test("swyx is the default organizer and the AIE team are organizer personas", async () => {
  const app = boot();
  assert.equal(resolveDemoPersona().id, "org-swyx", "unknown/absent persona resolves to swyx");
  assert.equal(resolveDemoPersona().name, "swyx");
  assert.equal(resolveDemoPersona().email, "swyx@ai.engineer");

  const personas = (await json(await app.request(`/api/events/${EVENT_ID}/bootstrap`, { headers: ORG }))).data.personas;
  const organizers = personas.filter((p: any) => p.role === "organizer");
  assert.equal(organizers[0].id, "org-swyx", "swyx is first in the organizer catalog");
  for (const [id, name, email] of AIE) {
    const found = organizers.find((p: any) => p.id === id);
    assert.ok(found, `${name} is an organizer persona`);
    assert.equal(found.name, name);
    assert.equal(found.email, email);
  }
  // Jordan Alvarez is retained for the content change-history fixtures.
  const jordan = organizers.find((p: any) => p.id === "org-jordan");
  assert.ok(jordan, "Jordan Alvarez remains an organizer persona");
  assert.equal(jordan.name, "Jordan Alvarez");
  assert.equal(organizers.length, 5);

  // The web fallback catalog mirrors the seed, so the shells agree before bootstrap.
  assert.equal(DEFAULT_PERSONAS[0].id, "org-swyx");
  assert.equal(DEFAULT_PERSONAS[0].name, "swyx");
  for (const [id] of AIE) assert.ok(DEFAULT_PERSONAS.some((p) => p.id === id), `${id} in the web catalog`);
  assert.ok(DEFAULT_PERSONAS.some((p) => p.name === "Jordan Alvarez"));
});

test("content change history can still be attributed to Jordan Alvarez", async () => {
  const app = boot();
  const content = (await json(await app.request(`/api/events/${EVENT_ID}/content`, { headers: ORG }))).data;
  const session = content.sessions[0];
  assert.ok(session, "a session is editable");
  const edited = await app.request(`/api/events/${EVENT_ID}/content/sessions/${session.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-demo-persona": "org-jordan" },
    body: JSON.stringify({ title: `${session.title} (attributed)` }),
  });
  assert.equal(edited.status, 200);
  assert.equal((await json(edited)).data.history[0].editorName, "Jordan Alvarez", "history names Jordan");
});

test("one person may hold both an organizer and a reviewer persona", async () => {
  const app = boot();
  const round = store.reviewRounds[0]!;
  // The AIE organizers were also invited as reviewers on the live site.
  for (const [, name, email] of AIE) {
    const invited = await app.request(`/api/events/${EVENT_ID}/review-rounds/${round.id}/reviewers`, {
      method: "POST", headers: ORG, body: JSON.stringify({ name, email }),
    });
    assert.equal(invited.status, 201, `${name} can be invited as a reviewer despite being an organizer`);
    const reviewer = (await json(invited)).data.reviewer;
    assert.equal(reviewer.role, "reviewer");
    assert.notEqual(reviewer.id, "org-swyx", "the reviewer persona is a distinct record");
  }
  // Both roles coexist for the same email.
  const both = store.personas.filter((p) => p.email.toLowerCase() === "swyx@ai.engineer");
  assert.deepEqual(both.map((p) => p.role).sort(), ["organizer", "reviewer"]);

  // A speaker identity is still protected from reuse.
  const speaker = store.personas.find((p) => p.role === "speaker");
  if (speaker) {
    const clash = await app.request(`/api/events/${EVENT_ID}/review-rounds/${round.id}/reviewers`, {
      method: "POST", headers: ORG, body: JSON.stringify({ name: speaker.name, email: speaker.email }),
    });
    assert.equal(clash.status, 409, "a speaker email is still rejected");
  }
});

test("reviewer invite tokens keep resolving, before and after a snapshot restore", async () => {
  resetEventRegistry();
  const persistence = new InMemorySnapshotStore();
  const app = createApp({ repo: new MemoryRepository(), persistence });
  const round = store.reviewRounds[0]!;

  const invited = (await json(await app.request(`/api/events/${EVENT_ID}/review-rounds/${round.id}/reviewers`, {
    method: "POST", headers: ORG, body: JSON.stringify({ name: "swyx", email: "swyx@ai.engineer" }),
  }))).data.reviewer;
  const link = (await json(await app.request(`/api/events/${EVENT_ID}/reviewers/${invited.id}/invite-link`, {
    method: "POST", headers: ORG, body: JSON.stringify({ roundId: round.id }),
  }))).data;
  const token = String(link.invitePath).split("invite=")[1]!;

  const before = await app.request(`/api/public/reviewer-invites/${token}`);
  assert.equal(before.status, 200);
  assert.equal((await json(before)).data.reviewer.id, invited.id);

  // Cold restart from the snapshot: runtime personas survive, seeded organizers are
  // added back even though the snapshot predates them.
  resetEventRegistry();
  const repo = new MemoryRepository();
  assert.equal(await restoreSnapshot({ repo, persistence }), true);
  const rebooted = createApp({ repo, persistence });

  const after = await rebooted.request(`/api/public/reviewer-invites/${token}`);
  assert.equal(after.status, 200, "the live judge invite still resolves after a restart");
  assert.equal((await json(after)).data.reviewer.id, invited.id, "and resolves to the same runtime persona");

  const personas = (await json(await rebooted.request(`/api/events/${EVENT_ID}/bootstrap`, { headers: ORG }))).data.personas;
  assert.ok(personas.some((p: any) => p.id === invited.id && p.role === "reviewer"), "runtime reviewer preserved");
  for (const [id] of AIE) assert.ok(personas.some((p: any) => p.id === id), `${id} present after restore`);
  assert.ok(personas.some((p: any) => p.id === "org-jordan"), "Jordan present after restore");
  resetEventRegistry();
});

test("the persona switcher label is not clipped", () => {
  const src = readFileSync("src/web/components/shells.tsx", "utf8");
  assert.ok(!/max-w-\[200px\]/.test(src), "the fixed 200px cap that clipped names is gone");
  assert.match(src, /className="h-9 w-auto max-w-\[62vw\][^"]*sm:max-w-none"/, "width follows content, capped only on tiny screens");
  assert.match(src, /title=\{selectedLabel\}/, "constrained renders still expose the full label");
  assert.match(src, /const selectedLabel = selected/);
  // One switcher component serves the organizer, reviewer and speaker shells.
  assert.equal((src.match(/function PersonaSwitcher/g) || []).length, 1);
  for (const shell of ["<PersonaSwitcher />", 'lockRole="reviewer"', 'lockRole="speaker"']) {
    assert.ok(src.includes(shell), `shell wiring intact: ${shell}`);
  }
});
