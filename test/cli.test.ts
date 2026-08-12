import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { serve } from "@hono/node-server";
import { createApp } from "../src/app.js";
import { MemoryRepository } from "../src/repository.js";
import { resetEventRegistry } from "../src/events.js";

/** One dev server for the whole file; the CLI is spawned against it as a subprocess. */
resetEventRegistry();
const server = serve({ fetch: createApp({ repo: new MemoryRepository() }).fetch, port: 0 });
const address = server.address();
const PORT = typeof address === "object" && address ? address.port : 0;
const BASE = `http://127.0.0.1:${PORT}`;
test.after(() => server.close());

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

/** Spawn the real CLI exactly as a user (or agent) would. */
async function cue(args: string[], env: Record<string, string> = {}): Promise<Run> {
  const child = spawn("npx", ["tsx", "cli/cue.ts", ...args], {
    env: { ...process.env, CUE_URL: BASE, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const [code] = (await once(child, "close")) as [number];
  return { code, stdout, stderr };
}

const json = (run: Run) => {
  try {
    return JSON.parse(run.stdout);
  } catch {
    throw new Error(`expected JSON on stdout, got:\n${run.stdout.slice(0, 400)}\n${run.stderr.slice(0, 200)}`);
  }
};

test("help documents every command group well enough to operate from", async () => {
  const run = await cue(["help"]);
  assert.equal(run.code, 0);
  for (const group of ["events", "overview", "submissions", "reviews", "schedule", "speakers", "comms", "content", "crm", "publish", "cfp", "portal", "api"]) {
    assert.ok(run.stdout.includes(group), `help is missing the ${group} command`);
  }
  assert.ok(run.stdout.includes("--json"), "help documents the json flag");
  assert.ok(run.stdout.includes("CUE_EVENT"), "help documents the env vars");
  assert.ok(run.stdout.includes("x-demo-role"), "help explains demo identity");

  const scoped = await cue(["schedule", "--help"]);
  assert.equal(scoped.code, 0);
  assert.ok(scoped.stdout.includes("cue schedule place"), "per-command help shows usage");
  assert.ok(scoped.stdout.includes("--day"), "and its options");
});

test("overview returns the whole program state as stable JSON", async () => {
  const run = await cue(["overview", "--json"]);
  assert.equal(run.code, 0, run.stderr);
  const payload = json(run);
  for (const key of ["event", "cfp", "submissions", "reviewProgress", "unscheduled", "agenda", "speakers", "comms"]) {
    assert.ok(key in payload, `overview is missing ${key}`);
  }
  assert.equal(payload.event.id, "evt-ai-summit-2026");
  assert.ok(payload.submissions.total > 0, "reports submission counts");
  assert.equal(typeof payload.submissions.byStatus, "object");
  assert.ok(Array.isArray(payload.agenda), "agenda is a list");
  assert.deepEqual(payload.warnings, [], "no section failed to load");

  const human = await cue(["overview"]);
  assert.equal(human.code, 0);
  assert.ok(human.stdout.includes("EVENT"), "human output is sectioned");
  assert.ok(human.stdout.includes("AGENDA"));
});

test("submissions decide sends committee feedback end to end", async () => {
  const list = json(await cue(["submissions", "list", "--json"]));
  const target = list.find((s: any) => s.status === "submitted" || s.status === "under_review") || list[0];

  const decided = await cue(["submissions", "decide", target.id, "--accept", "--feedback", "CLI feedback sentinel", "--json"]);
  assert.equal(decided.code, 0, decided.stderr);
  const payload = json(decided);
  assert.equal(payload.submission.status, "accepted");
  assert.equal(payload.submission.decisionFeedback, "CLI feedback sentinel");

  // The feedback reaches the delivered email and the speaker's portal view.
  const log = json(await cue(["comms", "log", "--json"]));
  assert.ok(log.some((c: any) => c.feedback === "CLI feedback sentinel"), "comms log records the feedback");

  const shown = json(await cue(["submissions", "show", target.id, "--json"]));
  assert.equal(shown.decisionFeedback, "CLI feedback sentinel");
});

test("schedule place rejects a conflict with reasons, then succeeds in a free slot", async () => {
  const board = json(await cue(["schedule", "view", "--json"]));
  const occupied = board.placed[0];
  assert.ok(occupied, "the seeded schedule has a placed session");
  const target = board.unscheduled[0];
  assert.ok(target, "and an unscheduled accepted session");

  // Dry run first: conflicts must be explained without writing.
  const dry = await cue(["schedule", "conflicts", target.id, "--day", occupied.day, "--time", occupied.time, "--room", occupied.room, "--json"]);
  assert.equal(dry.code, 0, dry.stderr);
  const conflicts = json(dry).conflicts || [];
  assert.ok(conflicts.length > 0, "the dry run reports the clash");
  assert.ok(conflicts.some((c: any) => /ROOM_OVERLAP/.test(String(c.type || c.code))), "names the room overlap");

  // Writing into the same slot fails with a non-zero exit and the reasons.
  const rejected = await cue(["schedule", "place", target.id, "--day", occupied.day, "--time", occupied.time, "--room", occupied.room]);
  assert.equal(rejected.code, 1, "a conflicting placement exits non-zero");
  assert.match(rejected.stderr, /conflict/i, "and explains why");
  assert.match(rejected.stderr, /ROOM_OVERLAP/, "including the machine readable reason");

  // A free slot succeeds and is visible in the next view.
  const placed = await cue(["schedule", "place", target.id, "--day", occupied.day, "--time", "16:30", "--room", occupied.room]);
  assert.equal(placed.code, 0, placed.stderr);
  assert.match(placed.stdout, /Placed/);
  const after = json(await cue(["schedule", "view", "--json"]));
  assert.ok(after.placed.some((p: any) => p.session === target.id && p.time === "16:30"), "the placement is on the board");
});

test("cfp submit works end to end and returns a portal magic link", async () => {
  const form = json(await cue(["cfp", "form", "--json"]));
  assert.ok(form.form.fields.length > 0, "the public form is readable without identity");

  const submitted = await cue([
    "cfp", "submit",
    "--title", "CLI subprocess talk",
    "--abstract", "A proposal submitted by the CUE CLI during the test run. ".repeat(2),
    "--name", "Subprocess Speaker",
    "--email", "subprocess.speaker@example.test",
    "--field", "category=AI Engineering",
    "--field", "format=Talk (30 min)",
    "--field", "experience=Beginner",
    "--json",
  ]);
  assert.equal(submitted.code, 0, submitted.stderr);
  const payload = json(submitted);
  assert.equal(payload.status, "submitted");
  assert.ok(payload.id.startsWith("sub-"));
  assert.ok(payload.editUrl.includes("token="), "returns a tokenized edit link");
  assert.ok(String(payload.portalUrl).includes("/p?invite="), "returns the portal magic link");

  // The magic link drives the speaker portal without any persona flags.
  const token = String(payload.portalUrl).split("invite=")[1]!;
  const portal = await cue(["portal", "tasks", "--token", token, "--json"]);
  assert.equal(portal.code, 0, portal.stderr);
  const home = json(portal);
  assert.ok((home.submissions || []).some((s: any) => s.title === "CLI subprocess talk"), "the portal shows the new talk");

  // And the organizer sees it in the inbox.
  const inbox = json(await cue(["submissions", "list", "--json"]));
  assert.ok(inbox.some((s: any) => s.id === payload.id), "the submission is in the organizer inbox");
});

test("--json is available on every command group and returns parseable output", async () => {
  const groups: string[][] = [
    ["events", "list"],
    ["submissions", "list"],
    ["reviews", "rounds"],
    ["reviews", "progress"],
    ["schedule", "view"],
    ["speakers", "list"],
    ["comms", "log"],
    ["content", "files"],
    ["crm", "contacts"],
    ["publish", "feeds"],
    ["cfp", "form"],
  ];
  for (const args of groups) {
    const run = await cue([...args, "--json"]);
    assert.equal(run.code, 0, `${args.join(" ")} failed: ${run.stderr}`);
    assert.doesNotThrow(() => JSON.parse(run.stdout), `${args.join(" ")} did not emit JSON`);
  }
});

test("errors exit non-zero with the server message", async () => {
  const missing = await cue(["submissions", "show", "sub-does-not-exist"]);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /not found/i, "surfaces the server message");

  const badEvent = await cue(["overview", "--event", "evt-nope"]);
  assert.equal(badEvent.code, 1);

  const usage = await cue(["submissions", "decide", "sub-x"]);
  assert.equal(usage.code, 1);
  assert.match(usage.stderr, /--accept or --reject/, "explains the usage error");

  const unknown = await cue(["not-a-command"]);
  assert.equal(unknown.code, 1);
  assert.match(unknown.stderr, /unknown command/);

  // --json still produces machine-readable failure detail.
  const jsonError = await cue(["submissions", "show", "sub-does-not-exist", "--json"]);
  assert.equal(jsonError.code, 1);
  const parsed = JSON.parse(jsonError.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.status, 404);
  assert.ok(parsed.error);
});

test("the raw api escape hatch reaches any endpoint", async () => {
  const run = await cue(["api", "GET", "/api/events"]);
  assert.equal(run.code, 0, run.stderr);
  const payload = JSON.parse(run.stdout);
  assert.ok(Array.isArray(payload.data), "returns the raw envelope");

  const raw = await cue(["api", "GET", "/health", "--raw"]);
  assert.equal(raw.code, 0);
  assert.match(raw.stdout, /"ok":\s*true/);
});
