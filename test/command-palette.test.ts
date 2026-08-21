import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ORGANIZER_PAGES,
  PALETTE_ACTION_IDS,
  filterPaletteItems,
  matchPositions,
  paletteActions,
  type PaletteItem,
} from "../src/web/components/CommandPalette.js";

const palette = () => readFileSync("src/web/components/CommandPalette.tsx", "utf8");
const shells = () => readFileSync("src/web/components/shells.tsx", "utf8");

test("the hotkey is bound globally and the header exposes a trigger", () => {
  const src = shells();
  assert.match(src, /e\.key\.toLowerCase\(\) === "k" && \(e\.metaKey \|\| e\.ctrlKey\)/, "Cmd+K and Ctrl+K both open it");
  assert.match(src, /<CommandPaletteButton onClick=\{\(\) => setPaletteOpen\(true\)\}/, "header search button");
  assert.match(src, /<CommandPalette open=\{paletteOpen\} onClose=/, "mounted in the organizer shell");

  const src2 = palette();
  assert.match(src2, /aria-keyshortcuts="Meta\+K Control\+K"/, "the trigger advertises the shortcut");
  assert.match(src2, /⌘K/, "and shows it");
});

test("combobox, listbox and option roles are present with stable testids", () => {
  const src = palette();
  assert.match(src, /role="combobox"/);
  assert.match(src, /aria-expanded="true"/);
  assert.match(src, /aria-controls="command-palette-list"/);
  assert.match(src, /aria-autocomplete="list"/);
  assert.match(src, /role="listbox"/);
  assert.match(src, /role="option"/);
  assert.match(src, /aria-selected=\{index === active\}/);
  assert.match(src, /role="dialog"/);
  assert.match(src, /aria-modal="true"/);
  for (const id of ['data-testid="command-palette"', 'data-testid="command-palette-input"', 'data-testid="command-palette-button"']) {
    assert.ok(src.includes(id), `missing ${id}`);
  }
  assert.match(src, /data-testid=\{`command-item-\$\{item\.id\}`\}/, "every row is addressable");
  assert.match(src, /data-testid=\{`command-group-\$\{header\.toLowerCase\(\)/, "group headers are addressable");
});

test("keyboard navigation covers arrows, Enter and Escape", () => {
  const src = palette();
  assert.match(src, /e\.key === "ArrowDown"/);
  assert.match(src, /e\.key === "ArrowUp"/);
  assert.match(src, /e\.key === "Enter"/);
  assert.match(src, /e\.key === "Escape"/);
  assert.match(src, /↑↓ to navigate · Enter to open · Esc to close/, "the footer teaches the keys");
});

test("the action registry is complete and every action routes somewhere real", () => {
  const actions = paletteActions();
  assert.deepEqual(actions.map((a) => a.id).sort(), [...PALETTE_ACTION_IDS].sort(), "registry matches the exported ids");
  const labels = actions.map((a) => a.label);
  for (const expected of [
    "New event",
    "New session",
    "Add speaker",
    "Invite reviewer",
    "Print run-of-show",
    "Publish agenda",
    "Export results CSV",
  ]) {
    assert.ok(labels.includes(expected), `missing action: ${expected}`);
  }
  for (const action of actions) {
    assert.equal(action.group, "Actions");
    assert.match(action.to, /^\/app(\/|\?|#|$)/, `${action.label} must target an /app route`);
    assert.ok(action.sublabel, `${action.label} needs a sublabel`);
  }
  // Only the side-effecting command carries run().
  const withRun = actions.filter((a) => a.run);
  assert.deepEqual(withRun.map((a) => a.id), ["action-publish-agenda"]);
  // Run-of-show links at the agreed route owned by another agent.
  assert.equal(actions.find((a) => a.id === "action-run-of-show")!.to, "/app/schedule/run-of-show");
});

test("every organizer nav destination is reachable from the palette", () => {
  const navRoutes = [...shells().matchAll(/\{ to: "(\/app[^"]*)", label: "([^"]+)"/g)].map((m) => ({ to: m[1]!, label: m[2]! }));
  assert.ok(navRoutes.length >= 15, `expected the organizer nav, found ${navRoutes.length}`);
  const pageRoutes = new Set(ORGANIZER_PAGES.map((p) => p.to));
  for (const entry of navRoutes) {
    assert.ok(pageRoutes.has(entry.to), `palette is missing nav destination ${entry.label} (${entry.to})`);
  }
});

test("all three content classes are loaded and grouped", () => {
  const src = palette();
  for (const call of ["api.submissions()", "api.speakers()", "api.schedule()", "api.crmContacts()", "api.events()"]) {
    assert.ok(src.includes(call), `palette does not load ${call}`);
  }
  for (const group of ['group: "Submissions"', 'group: "Speakers"', 'group: "Sessions"', 'group: "CRM contacts"', 'group: "Events"']) {
    assert.ok(src.includes(group), `missing group ${group}`);
  }
  // Entity rows deep-link to the right detail surfaces.
  assert.match(src, /to: `\/app\/submissions\/\$\{s\.id\}`/);
  assert.match(src, /to: `\/app\/speakers\/\$\{s\.speakerId \|\| s\.id\}`/);
  assert.match(src, /to: `\/app\/schedule\?session=\$\{encodeURIComponent\(x\.id\)\}`/, "sessions focus on the schedule");
  assert.match(src, /to: `\/app\/crm\/contacts\/\$\{c\.id\}`/);
  assert.match(src, /setActiveEventId\(e\.id\)/, "events switch the active event");
  // One fetch per open, cached behind a ref.
  assert.match(src, /if \(!open \|\| loadedRef\.current\) return;/, "data is fetched once, not per keystroke");
});

test("search matches labels, sublabels and keywords across groups", () => {
  const items: PaletteItem[] = [
    ...ORGANIZER_PAGES,
    ...paletteActions(),
    { id: "speaker-1", label: "Ada Lovelace", sublabel: "Analytical Engines · ada@example.test", group: "Speakers", to: "/app/speakers/spk-ada", keywords: "ada@example.test" },
    { id: "session-1", label: "Reliable Agent Systems", sublabel: "Panel", group: "Sessions", to: "/app/schedule?session=ses-1" },
    { id: "event-1", label: "DevFlow Conf 2027", sublabel: "Switch to this event", group: "Events", to: "/app", keywords: "devflow-conf-2027 switch event" },
  ];
  // Actions legitimately mention "schedule" in their sublabels, so assert the page
  // is found rather than that nothing else is.
  const sched = filterPaletteItems(items, "sched").map((i) => i.label);
  assert.ok(sched.includes("Schedule"), "the Schedule page matches");
  assert.ok(filterPaletteItems(items, "schedule builder").map((i) => i.label).includes("Schedule"), "multi-token narrows");
  assert.ok(filterPaletteItems(items, "ada").some((i) => i.to === "/app/speakers/spk-ada"), "finds a speaker by name");
  assert.ok(filterPaletteItems(items, "reliable agent").some((i) => i.group === "Sessions"), "finds a session by title");
  assert.ok(filterPaletteItems(items, "devflow").some((i) => i.group === "Events"), "finds an event");
  assert.ok(filterPaletteItems(items, "publish").some((i) => i.id === "action-publish-agenda"), "finds an action");
  assert.deepEqual(filterPaletteItems(items, "zzzz"), [], "unmatched query yields the empty state");
});

test("match highlighting marks the characters that matched", () => {
  assert.deepEqual(matchPositions("Schedule", "sched"), [0, 1, 2, 3, 4]);
  assert.deepEqual(matchPositions("Publish agenda", "agenda"), [8, 9, 10, 11, 12, 13]);
  assert.deepEqual(matchPositions("Schedule", ""), []);
  assert.deepEqual(matchPositions("Schedule", "zzz"), []);
  const src = palette();
  assert.match(src, /<Highlight text=\{item\.label\} query=\{query\} \/>/, "labels are highlighted");
});

test("recent commands are remembered and lead the default view", () => {
  const src = palette();
  assert.match(src, /const RECENTS_KEY = "ruckus-palette-recents"/);
  assert.match(src, /export function readPaletteRecents/);
  assert.match(src, /export function rememberPaletteRecent/);
  assert.match(src, /rememberPaletteRecent\(item\.id\)/, "running a command records it");
  assert.match(src, /group: "Recent"/, "recents get their own group");
  assert.match(src, /\.slice\(0, 5\)/, "capped at five");
  // The no-query view samples every group instead of truncating at a flat limit.
  assert.match(src, /if \(seen >= 5\) return false;/);
});

test("the palette renders its shell before data arrives", () => {
  const src = palette();
  // Actions and pages are static, so they are searchable immediately; records stream in.
  assert.match(src, /const all = \[\.\.\.ORGANIZER_PAGES, \.\.\.paletteActions\(\), \.\.\.records\]/);
  assert.match(src, /\{loading \? "Loading records…"/, "an async load is announced, not blocking");
  assert.match(src, /setLoading\(true\)/);
  assert.match(src, /\.finally\(\(\) => setLoading\(false\)\)/);
});
