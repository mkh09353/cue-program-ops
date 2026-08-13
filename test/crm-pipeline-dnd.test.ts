import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { CRM_STAGE_TRANSITIONS as SERVER_TRANSITIONS, canTransition } from "../src/crm.js";
import { CRM_STAGE_TRANSITIONS as CLIENT_TRANSITIONS } from "../src/web/pages/CrmPages.js";
import { resetEventRegistry } from "../src/events.js";
import { MemoryRepository } from "../src/repository.js";

const ORG = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const json = async (r: Response) => (await r.json()) as any;
const src = () => readFileSync("src/web/pages/CrmPages.tsx", "utf8");

test("the board's transition rules match the server's, exactly", () => {
  // The client copy exists only to avoid bundling the server module; it must not drift.
  assert.deepEqual(CLIENT_TRANSITIONS, SERVER_TRANSITIONS as unknown as Record<string, string[]>);
  for (const [from, targets] of Object.entries(SERVER_TRANSITIONS)) {
    for (const to of targets) assert.ok(canTransition(from as any, to as any), `${from} → ${to} allowed`);
    const disallowed = Object.keys(SERVER_TRANSITIONS).filter((s) => s !== from && !targets.includes(s as any));
    for (const to of disallowed) assert.ok(!canTransition(from as any, to as any), `${from} → ${to} rejected`);
  }
});

test("cards are draggable and columns are drop targets", () => {
  const page = src();
  assert.match(page, /draggable\n/, "cards declare draggable");
  assert.match(page, /data-testid=\{`pipeline-card-\$\{c\.id\}`\}/);
  assert.match(page, /onDragStart=/, "cards start a drag");
  assert.match(page, /e\.dataTransfer\.setData\("text\/cue-contact", c\.id\)/, "carrying the contact id");
  assert.match(page, /e\.dataTransfer\.setData\("text\/cue-stage", col\.id\)/, "and the origin stage");
  assert.match(page, /onDragEnd=/, "and clear the drag state");

  assert.match(page, /data-testid=\{`pipeline-column-\$\{col\.id\}`\}/);
  assert.match(page, /onDragOver=/, "columns accept dragover");
  assert.match(page, /onDrop=/, "columns handle drop");
  assert.match(page, /onDragLeave=/, "and clear the hover state");
});

test("an invalid drop target is muted and refuses the drop", () => {
  const page = src();
  assert.match(page, /const canDrop = \(to: string\)/, "validity is computed from the shared rules");
  assert.match(page, /CRM_STAGE_TRANSITIONS as any\)\[dragging\.from\]\?\.includes\(to\)/);
  // dragover only preventDefaults for a legal target, so the browser refuses the rest.
  assert.match(page, /if \(!canDrop\(col\.id\)\) return;\n\s*e\.preventDefault\(\);/);
  assert.match(page, /dragging && !canDrop\(col\.id\) && "opacity-40"/, "invalid columns look muted");
  assert.match(page, /Not allowed from \{dragging\.from\}/, "and say why");
  assert.match(page, /if \(id && from && canDrop\(col\.id\)\) void moveCard/, "drop re-checks validity");
});

test("dropping is optimistic with revert and the server message on failure", () => {
  const page = src();
  assert.match(page, /const snapshot = columns;/, "the pre-move board is captured");
  assert.match(page, /await api\.crmMoveStage\(contactId, to\)/, "the existing stage-move API is used");
  assert.match(page, /setColumns\(snapshot\); \/\/ snap back/, "failure reverts the optimistic move");
  assert.match(page, /toast\(e\?\.message \|\| "Could not move the contact", "danger"\)/, "and shows the server message");
  assert.match(page, /setJustMoved\(contactId\)/, "success briefly highlights the moved card");
  assert.match(page, /justMoved === c\.id && "ring-2 ring-brand-500"/);
  assert.match(page, /dropTarget === col\.id && canDrop\(col\.id\) && "border-brand-400 bg-brand-50 ring-2 ring-brand-500"/, "hovered column highlights");
});

test("the stage buttons are retained as the accessible fallback", () => {
  const page = src();
  assert.match(page, /data-testid=\{`stage-button-\$\{c\.id\}-\$\{s\}`\}/, "per-stage buttons still render");
  assert.match(page, /aria-label=\{`Move \$\{c\.name\} to \$\{s\}`\}/, "with an accessible name");
  assert.match(page, /Retained as the accessible \/ agent path/, "and are documented as intentional");
  // They only offer legal transitions now, and still call the same API.
  assert.match(page, /\.filter\(\(s\) => s !== c\.stage && \(CRM_STAGE_TRANSITIONS as any\)\[c\.stage\]\?\.includes\(s\)\)/);
  assert.ok((page.match(/api\.crmMoveStage\(/g) || []).length >= 3, "buttons and drag both use the API");
  assert.match(page, /data-testid="pipeline-hint"/, "the board explains both interactions");
  assert.match(page, /Drag cards between stages, or use the stage buttons\./);
});

test("the stage-move API still enforces transitions behind the board", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  const contacts = (await json(await app.request("/api/crm/contacts", { headers: ORG }))).data;
  const contact = contacts.find((c: any) => c.stage === "prospect") || contacts[0];

  // A legal move succeeds and is recorded in the stage history.
  const legal = (SERVER_TRANSITIONS as any)[contact.stage][0];
  const moved = await app.request(`/api/crm/contacts/${contact.id}/stage`, {
    method: "POST", headers: ORG, body: JSON.stringify({ stage: legal }),
  });
  assert.equal(moved.status, 200, "a valid transition is accepted");
  const updated = (await json(moved)).data;
  assert.equal(updated.stage, legal);
  assert.ok((updated.stageHistory || []).some((h: any) => h.to === legal), "history records the move");

  // An illegal move is rejected with a message the board surfaces on snap-back.
  const illegal = Object.keys(SERVER_TRANSITIONS).find(
    (s) => s !== updated.stage && !(SERVER_TRANSITIONS as any)[updated.stage].includes(s),
  )!;
  const rejected = await app.request(`/api/crm/contacts/${contact.id}/stage`, {
    method: "POST", headers: ORG, body: JSON.stringify({ stage: illegal }),
  });
  assert.ok(rejected.status >= 400 && rejected.status < 500, `illegal transition rejected (${rejected.status})`);
  assert.match((await json(rejected)).error.message, /cannot move from/i, "with an explanatory message");
  resetEventRegistry();
});
