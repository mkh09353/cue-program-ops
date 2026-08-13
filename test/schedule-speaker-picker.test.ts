import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = () => readFileSync("src/web/pages/SchedulePage.tsx", "utf8");
const ui = () => readFileSync("src/web/components/ui.tsx", "utf8");

test("no native multi-select or tall checkbox list remains", () => {
  const src = page();
  const live = src.split("\n").filter((line) => /<select\s+multiple/.test(line) && !line.trim().startsWith("*"));
  assert.deepEqual(live, [], "native multi-select is gone");
  assert.ok(!/selectedOptions/.test(src), "no ctrl-click handling remains");
  assert.ok(!/SpeakerPicker/.test(src), "the tall checkbox-card picker is gone");
  assert.ok(!/max-h-44 space-y-1 overflow-y-auto/.test(src), "and its scrolling card list with it");
});

test("ChipCombobox is one reusable component with combobox ARIA", () => {
  const src = ui();
  assert.match(src, /export function ChipCombobox\(/, "single shared component");
  assert.match(src, /export type ComboOption = \{ id: string; label: string; sublabel\?: string \}/);
  // Combobox / listbox / option roles.
  assert.match(src, /role="combobox"/);
  assert.match(src, /aria-expanded=\{open\}/);
  assert.match(src, /aria-controls=\{listId\}/);
  assert.match(src, /aria-autocomplete="list"/);
  assert.match(src, /role="listbox"/);
  assert.match(src, /role="option"/);
  assert.match(src, /aria-selected=\{selectedIds\.includes\(option\.id\)\}/);
  // Stable testids an agent can drive.
  for (const id of ["-combobox", "-input", "-listbox", "-empty", "-create"]) {
    assert.ok(src.includes(`\${idPrefix}${id}`), `exposes ${id} testid`);
  }
  assert.match(src, /data-testid=\{`\$\{idPrefix\}-option-\$\{option\.id\}`\}/);
  assert.match(src, /data-testid=\{`\$\{idPrefix\}-chip-\$\{id\}`\}/);
  assert.match(src, /data-testid=\{`\$\{idPrefix\}-remove-\$\{id\}`\}/);
});

test("the combobox is compact and keyboard driven", () => {
  const src = ui();
  // One row at rest; the dropdown floats rather than growing the form.
  assert.match(src, /flex min-h-10 flex-wrap items-center gap-1 rounded-\[18px\]/, "input row is one row high");
  assert.match(src, /absolute left-0 right-0 z-40 mt-1 max-h-60 overflow-y-auto/, "dropdown floats and scrolls");
  // Keyboard: arrows, Enter, Escape, Backspace.
  assert.match(src, /e\.key === "ArrowDown"/);
  assert.match(src, /e\.key === "ArrowUp"/);
  assert.match(src, /e\.key === "Enter"/);
  assert.match(src, /e\.key === "Escape"/);
  assert.match(src, /e\.key === "Backspace" && !query && multiple && selectedIds\.length/, "Backspace removes the last chip");
  assert.match(src, /if \(!open\) \{\s*\n\s*setOpen\(true\);\s*\n\s*setActive\(0\);/, "opening with ArrowDown lands on the first row");
  // Selecting keeps a multi list open, and closes a single one.
  assert.match(src, /setOpen\(true\); \/\/ stay open so several can be added in a row/);
  assert.match(src, /No matches/, "empty state label");
  // Click-away closes.
  assert.match(src, /document\.addEventListener\("mousedown", away\)/);
});

test("speakers use the multi combobox in both the new-session form and the card editor", () => {
  const src = page();
  assert.equal((src.match(/<ChipCombobox/g) || []).length, 3, "speakers x2 plus the track field");
  assert.match(src, /multiple idPrefix="new-session-speaker"/);
  assert.match(src, /multiple idPrefix=\{`edit-speakers-\$\{x\.id\}`\}/, "the session-edit control uses it too");
  // Payload shape is unchanged.
  assert.match(src, /onChange=\{\(ids:string\[\]\)=>\{setSpeakersTouched\(true\);setNewSession\(\{\.\.\.newSession,speakerIds:ids\}\)\}\}/);
  assert.match(src, /api\.updateScheduleSession\(x\.id,\{speakerIds:ids\}\)/);
  assert.match(src, /api\.createScheduleSession\(newSession\)/);
  // Options carry name + email so the filter can match either.
  assert.match(src, /\{id:sp\.id,label:sp\.name,sublabel:sp\.email\}/);
});

test("the speaker hint only appears after the field is touched", () => {
  const src = page();
  assert.match(src, /const \[speakersTouched, setSpeakersTouched\] = useState\(false\)/);
  assert.match(src, /speakersTouched&&!newSession\.speakerIds\.length\?<p[^>]*data-testid="new-session-speaker-hint"/);
  assert.match(src, /invalid=\{speakersTouched&&!newSession\.speakerIds\.length\}/, "and the field shows an invalid border");
});

test("track is a single-value combobox that can create a track inline", () => {
  const src = page();
  assert.match(src, /idPrefix="new-session-track"/);
  assert.ok(!/idPrefix="new-session-track"[^>]*multiple/.test(src), "track is single-value");
  assert.match(src, /createLabel=\{\(q:string\)=>`Create track "\$\{q\}"`\}/, "offers to create the typed track");
  assert.match(src, /onCreate=\{async\(name:string\)=>\{const made:any=await api\.createAgendaTrack\(\{name\}\)/, "wired to the existing add-track API");
  assert.match(src, /if\(id\)setNewSession\(\(prev:any\)=>\(\{\.\.\.prev,trackId:id\}\)\)/, "and selects the new track");
  assert.match(src, /onChange=\{\(id:string\)=>setNewSession\(\{\.\.\.newSession,trackId:id\}\)\}/, "payload stays a track id");
});

test("the title field keeps its example placeholder", () => {
  const src = page();
  assert.match(src, /placeholder="e\.g\. Scaling Inference Pipelines"/);
});
