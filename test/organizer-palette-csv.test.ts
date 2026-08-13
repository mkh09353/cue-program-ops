import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { csvCell, csvFilename, toCsv } from "../src/web/lib/csv.js";
import { ORGANIZER_PAGES, filterPaletteItems } from "../src/web/components/CommandPalette.js";
import { submissionsCsv } from "../src/web/pages/SubmissionsPages.js";
import { speakersCsv } from "../src/web/pages/SpeakersCommsPages.js";

// —— Command palette ——

test("palette lists every organizer page and routes to real /app routes", () => {
  const labels = ORGANIZER_PAGES.map((p) => p.label);
  for (const expected of [
    "Dashboard",
    "Submissions",
    "Evaluation Plan",
    "Assignments",
    "Review Progress",
    "Results",
    "Schedule",
    "Speakers",
    "Speaker CRM",
    "Content",
    "Comms",
    "Publish",
    "Forms",
    "Settings",
  ]) {
    assert.ok(labels.includes(expected), `palette is missing ${expected}`);
  }
  const routes = readFileSync("src/web/main.tsx", "utf8");
  for (const page of ORGANIZER_PAGES) {
    const path = page.to.split("#")[0]!;
    const sub = path.replace(/^\/app\/?/, "");
    assert.ok(
      path === "/app" || routes.includes(`path="${sub}"`),
      `palette route ${page.to} has no matching organizer route`,
    );
  }
});

test("palette search matches pages and records by any token", () => {
  const items = [
    ...ORGANIZER_PAGES,
    { id: "submission-sub-1", label: "Agents in production", sublabel: "sub-1 · Sam Rivera · agents", group: "Submissions", to: "/app/submissions/sub-1", keywords: "sub-1 Sam Rivera agents" },
  ];
  assert.deepEqual(filterPaletteItems(items, "sched").map((i) => i.label), ["Schedule"]);
  assert.ok(filterPaletteItems(items, "sam rivera").some((i) => i.to === "/app/submissions/sub-1"));
  assert.ok(filterPaletteItems(items, "sub-1").some((i) => i.to === "/app/submissions/sub-1"));
  assert.equal(filterPaletteItems(items, "zzzz nothing").length, 0);
  assert.equal(filterPaletteItems(items, "  ").length, items.length);
});

test("the shell mounts the palette behind ⌘K and a visible search affordance", () => {
  const shell = readFileSync("src/web/components/shells.tsx", "utf8");
  assert.ok(shell.includes("<CommandPalette"), "palette is mounted in the organizer shell");
  assert.ok(shell.includes("<CommandPaletteButton"), "a visible search button exists in the header");
  assert.ok(/metaKey \|\| e\.ctrlKey/.test(shell), "the shortcut requires a modifier so inputs keep their keystrokes");
  const palette = readFileSync("src/web/components/CommandPalette.tsx", "utf8");
  assert.ok(palette.includes('role="dialog"') && palette.includes('aria-modal="true"'), "palette is an accessible dialog");
  assert.ok(palette.includes('role="listbox"') && palette.includes('role="option"'), "results are an accessible listbox");
});

// —— CSV export ——

test("csv quoting escapes delimiters, quotes and newlines", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell('has "quotes"'), '"has ""quotes"""');
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell("=cmd()"), "'=cmd()", "formula injection is neutralized");
  assert.equal(toCsv(["a", "b"], [[1, "x,y"]]), 'a,b\r\n1,"x,y"');
});

test("csv filenames include the event slug and the date", () => {
  assert.equal(
    csvFilename("submissions", "ai-engineer-summit", new Date("2026-10-12T09:00:00.000Z")),
    "cue-submissions-ai-engineer-summit-2026-10-12.csv",
  );
  assert.equal(
    csvFilename("speakers", "AI Engineer Summit", new Date("2026-10-12T09:00:00.000Z")),
    "cue-speakers-ai-engineer-summit-2026-10-12.csv",
  );
});

test("submission export carries code, status, track, submitter, score and decision-email state", () => {
  const csv = submissionsCsv([
    {
      id: "sub-1",
      code: "SUB-1",
      title: 'Agents, "at scale"',
      status: "accepted",
      category: "Agents",
      reviewBoard: "agents",
      round: "r1",
      name: "Sam Rivera",
      email: "sam@example.test",
      avgScore: 4.2,
      reviews: [{ status: "submitted" }, { status: "draft" }],
      decisionEmailAt: "2026-09-01T10:00:00.000Z",
    },
  ]);
  const [header, row] = csv.split("\r\n");
  assert.ok(header!.startsWith("id,code,title,status,track"));
  assert.ok(row!.includes('"Agents, ""at scale"""'), "titles with commas and quotes are escaped");
  assert.ok(row!.includes("Accepted") && row!.includes("Agents") && row!.includes("Sam Rivera"));
  assert.ok(row!.includes("4.2") && row!.includes(",1,") && row!.includes("sent"));
});

test("speaker export carries email, company, status, readiness and task progress", () => {
  const csv = speakersCsv([
    {
      speakerId: "spk-ada",
      name: "Ada Lovelace",
      email: "ada@example.test",
      title: "Staff Engineer",
      company: "Northwind, Inc",
      workflowStatus: "confirmed",
      readiness: { state: "not_ready", pct: 60, missing: ["task:slides"] },
      tasks: [{ status: "completed" }, { status: "not_started" }],
      files: [{}],
      sessions: [{}],
    },
  ]);
  const [header, row] = csv.split("\r\n");
  assert.ok(header!.includes("readiness %") && header!.includes("tasks completed"));
  assert.ok(row!.includes('"Northwind, Inc"'), "company with a comma is quoted");
  assert.ok(row!.includes("Confirmed") && row!.includes("Not ready") && row!.includes("60"));
  assert.ok(row!.includes("Upload slides"), "missing items are humanized");
});

test("both roster pages expose a discoverable Export CSV button", () => {
  const submissions = readFileSync("src/web/pages/SubmissionsPages.tsx", "utf8");
  const speakers = readFileSync("src/web/pages/SpeakersCommsPages.tsx", "utf8");
  assert.ok(submissions.includes('data-testid="export-submissions-csv"') && submissions.includes("Export CSV"));
  assert.ok(speakers.includes('data-testid="export-speakers-csv"') && speakers.includes("Export CSV"));
});
