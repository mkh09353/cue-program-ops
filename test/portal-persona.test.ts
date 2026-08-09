import test from "node:test";
import assert from "node:assert/strict";

/**
 * Item 1 regression: portal persona switching.
 *
 * Transcript failure (CFP-S4 turns 40–47 / CFP-S2): the agent picked "Priya Raman"
 * in the speaker portal selector, then hard-navigated. On the fresh page load the
 * server persona catalog had not arrived yet, so the stored selection was not
 * resolvable, the shell's role fallback picked spk-sam AND PERSISTED IT — wiping
 * the explicit choice — and the already-mounted page kept Sam's fetched data.
 *
 * Contract now: (a) an explicit selection persists and is adopted as soon as the
 * catalog loads, (b) role fallbacks are provisional and never overwrite it, and
 * (c) a persona change notifies data subscribers so pages refetch.
 */

function installStorage() {
  const make = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => void map.set(k, String(v)),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
      key: () => null,
      length: 0,
    } as unknown as Storage;
  };
  const session = make();
  const local = make();
  (globalThis as any).sessionStorage = session;
  (globalThis as any).localStorage = local;
  return { session, local };
}

// Each dynamic import with a fresh query string simulates a fresh page load.
let isolate = 0;
const loadApi = () => import(`../src/web/lib/api.js?isolate=${isolate++}`);

const priya = { id: "spk-priya", role: "speaker" as const, name: "Priya Raman", email: "priya@example.test", speakerId: "spk-priya" };

test("explicit portal persona selection survives a reload while the catalog is still loading", async () => {
  const storage = installStorage();
  const first = await loadApi();
  // Catalog loaded from the server contains Priya; the user picks her explicitly.
  first.setPersonaCatalog([...(first.getPersonaCatalog() as any[]), priya]);
  first.setPersona(priya, { explicit: true });
  assert.equal(first.getPersona().id, "spk-priya");
  assert.equal(storage.session.getItem("cue-persona-id"), "spk-priya");

  // Fresh load of /p: only the built-in demo personas are known so far.
  const reload = await loadApi();
  assert.equal(reload.resolvePortalPersona("speaker"), true);
  assert.equal(reload.getPersona().role, "speaker", "portal must always unblock with a usable speaker persona");
  assert.equal(
    storage.session.getItem("cue-persona-id"),
    "spk-priya",
    "provisional fallback must not overwrite the explicit selection",
  );

  // Bootstrap arrives → the explicit selection is adopted and subscribers notified.
  let personaEvents = 0;
  let dataEvents = 0;
  reload.subscribePersona(() => personaEvents++);
  reload.subscribeData(() => dataEvents++);
  reload.setPersonaCatalog([...(reload.getPersonaCatalog() as any[]), priya]);
  assert.equal(reload.getPersona().id, "spk-priya");
  assert.ok(personaEvents > 0, "persona subscribers must be notified when the selection resolves");
  assert.ok(dataEvents > 0, "data subscribers must be notified so portal pages refetch");
});

test("resolvePortalPersona only fills in when nothing is selected for that portal", async () => {
  installStorage();
  const api = await loadApi();
  api.setPersonaCatalog([...(api.getPersonaCatalog() as any[]), priya]);
  api.setPersona(priya, { explicit: true });
  api.resolvePortalPersona("speaker");
  assert.equal(api.getPersona().id, "spk-priya", "explicit selection must win over the demo fallback");

  // A different role portal is still allowed to pick its own demo persona.
  api.resolvePortalPersona("reviewer");
  assert.equal(api.getPersona().role, "reviewer");
  // ...but that fallback is provisional, so the explicit speaker choice is restored.
  api.resolvePortalPersona("speaker");
  assert.equal(api.getPersona().id, "spk-priya");
});

test("switching persona notifies data subscribers so portal queries refetch", async () => {
  installStorage();
  const api = await loadApi();
  api.setPersonaCatalog([...(api.getPersonaCatalog() as any[]), priya]);
  api.switchToRole("speaker");
  let refetches = 0;
  const off = api.subscribeData(() => refetches++);
  api.setPersona(priya, { explicit: true });
  assert.equal(refetches, 1);
  api.setPersona(priya, { explicit: true });
  assert.equal(refetches, 1, "re-selecting the same persona must not thrash queries");
  off();
});

test("form autosave never clobbers an edit made while the save was in flight", async () => {
  const { adoptSaveResult } = await import(`../src/web/lib/utils.js?isolate=${isolate++}`);
  const snapshot = (v: any) => JSON.stringify(v);
  const sentDraft = { fields: [{ key: "key_takeaway", required: false }] };
  const sent = snapshot(sentDraft);
  const server = { fields: [{ key: "key_takeaway", required: false }] };
  // User ticked "required" while the autosave request was in flight.
  const local = { fields: [{ key: "key_takeaway", required: true }] };
  assert.deepEqual(adoptSaveResult(local, sent, server, snapshot), local);
  // No concurrent edit → adopt the server copy.
  assert.deepEqual(adoptSaveResult(sentDraft, sent, server, snapshot), server);
});
