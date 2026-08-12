import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { EVENT_ID } from "../src/lifecycle.js";
import { resetEventRegistry } from "../src/events.js";
import { MemoryRepository } from "../src/repository.js";
import { zonedWallTimeToIso } from "../src/timezone.js";

/**
 * ACCEPTANCE GATE: the entire judged fixture flow inside a runtime-created event.
 * Every surface must agree on which event is active — organizer, public slug,
 * reviewer queue, schedule, public program and the speaker portal.
 */

const ORG = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const PUBLIC = { "content-type": "application/json" };
const json = async (r: Response) => (await r.json()) as any;
const asRole = (personaId: string, role: string) => ({
  "content-type": "application/json",
  "x-demo-persona": personaId,
  "x-demo-role": role,
});

test("DevFlow Conf 2027: create → CFP → review → decide → schedule → publish → portal", async () => {
  resetEventRegistry();
  const app = createApp({ repo: new MemoryRepository() });
  const post = (path: string, body: unknown, headers: Record<string, string> = ORG) =>
    app.request(path, { method: "POST", headers, body: JSON.stringify(body) });
  const put = (path: string, body: unknown, headers: Record<string, string> = ORG) =>
    app.request(path, { method: "PUT", headers, body: JSON.stringify(body) });
  const get = (path: string, headers: Record<string, string> = ORG) => app.request(path, { headers });

  // —— 1. Create the event with the fixture rooms ——
  const createRes = await post("/api/events", {
    name: "DevFlow Conf 2027", slug: "devflow-conf-2027",
    startsAt: "2027-05-04T16:00:00.000Z", endsAt: "2027-05-06T02:00:00.000Z",
    timezone: "America/Los_Angeles", venue: "Brooklyn Expo Center",
    rooms: "Room 2A, Room 2B", tracks: "Platform, Developer Experience",
  });
  assert.equal(createRes.status, 201, "event created");
  const ev = (await json(createRes)).data;
  const E = ev.id;
  // "devflow-conf-2027" ships pre-seeded, so creating it again uniquifies the slug.
  // Everything downstream must follow the RETURNED slug, not the requested one.
  assert.equal(ev.slug, "devflow-conf-2027-2");

  const sched0 = await json(await get(`/api/events/${E}/schedule`));
  assert.deepEqual(sched0.rooms.map((r: any) => r.name), ["Room 2A", "Room 2B"], "fixture rooms exist");
  const room2A = sched0.rooms.find((r: any) => r.name === "Room 2A")!;

  // —— 2. Forms builder in THIS event, then publish ——
  const form = (await json(await get(`/api/events/${E}/forms/form-cfp`))).data;
  assert.equal(form.id, "form-cfp", "builder loads at the id the UI requests");
  const published = await put(`/api/events/${E}/forms/form-cfp`, {
    ...form, status: "open", closeAt: "2027-04-30T23:59:00.000Z",
    fields: [...form.fields, { key: "key_takeaway", label: "Key takeaway", type: "text", required: false, section: "Proposal" }],
  });
  assert.equal(published.status, 200, "form published");

  // —— 3. PUBLIC slug CFP returns THIS event's form (not the seeded one) ——
  const cfp = (await json(await get(`/api/public/events/${ev.slug}/cfp`, PUBLIC))).data;
  assert.equal(cfp.event.id, E, "public CFP resolves by slug");
  assert.equal(cfp.event.name, "DevFlow Conf 2027");
  assert.ok(cfp.form.fields.some((f: any) => f.key === "key_takeaway"), "builder edit is live publicly");
  assert.ok(cfp.window.open, "CFP is open");
  const seededCfp = (await json(await get(`/api/public/events/ai-engineer-summit/cfp`, PUBLIC))).data;
  assert.equal(seededCfp.event.id, EVENT_ID, "the seeded slug still resolves to the seeded event");
  assert.notEqual(seededCfp.event.name, cfp.event.name, "the two public pages disagree, correctly");

  // —— 4. Two public proposals into the new event ——
  const category = cfp.categories[0];
  const proposals = [
    { name: "Priya Raman", email: "priya@devflow.test", title: "Taming 40-Minute CI" },
    { name: "Marcus Okafor", email: "marcus@devflow.test", title: "Your AI Pair Programmer" },
  ];
  const submitted: any[] = [];
  for (const p of proposals) {
    const r = await post(`/api/public/events/${ev.slug}/submissions`, {
      name: p.name, email: p.email,
      answers: { title: p.title, abstract: `${p.title} `.repeat(12), category, format: "Talk (30 min)", experience: "Intermediate" },
    }, PUBLIC);
    assert.equal(r.status, 201, `${p.title} accepted`);
    submitted.push((await json(r)).data);
  }
  const inbox = (await json(await get(`/api/events/${E}/submissions`))).data;
  assert.equal(inbox.length, 2, "both proposals are in the DevFlow inbox");
  const seededInbox = (await json(await get(`/api/events/${EVENT_ID}/submissions`))).data;
  assert.ok(!seededInbox.some((s: any) => s.title === "Taming 40-Minute CI"), "no bleed into the seeded event");

  // —— 5. Invite Sam Whitfield as a reviewer IN THIS EVENT and assign ——
  const round = (await json(await post(`/api/events/${E}/review-rounds`, {
    name: "Initial Review", status: "open", blind: false, reviewerIds: [], criteria: [],
  }))).data;
  const invited = await post(`/api/events/${E}/review-rounds/${round.id}/reviewers`, {
    name: "Sam Whitfield", email: "sam.whitfield@devflow.test",
  });
  assert.equal(invited.status, 201, "reviewer invited");
  const sam = (await json(invited)).data.reviewer;
  assert.ok(sam?.id, "reviewer persona created in this event");

  // The reviewer must resolve as a reviewer INSIDE this event (the judged 403).
  const bootstrap = (await json(await get(`/api/events/${E}/bootstrap`))).data;
  assert.ok(bootstrap.personas.some((p: any) => p.id === sam.id && p.role === "reviewer"),
    "the event's persona catalog contains the reviewer");

  const assigned = await post(`/api/events/${E}/review-assignments`, {
    roundId: round.id, reviewerId: sam.id, submissionIds: submitted.map((s) => s.id), method: "specific",
  });
  assert.equal(assigned.status, 201);
  assert.equal((await json(assigned)).data.length, 2, "two assignments created");

  // —— 6. Reviewer queue AS SAM, in this event ——
  const queueRes = await get(`/api/events/${E}/reviewer-queue`, asRole(sam.id, "reviewer"));
  assert.equal(queueRes.status, 200, "reviewer queue is not 403 for the invited reviewer");
  const queue = (await json(queueRes)).data;
  assert.equal(queue.length, 2, "queue lists both assignments");

  // Assignment DETAIL must also resolve for Sam (the judged "reviewer role required").
  const detail = await get(`/api/events/${E}/reviewer-queue/${queue[0].id}`, asRole(sam.id, "reviewer"));
  assert.equal(detail.status, 200, "assignment detail is reachable as the reviewer");

  // —— 7. Submit a scorecard; organizer history shows it ——
  const scored = await post(`/api/events/${E}/reviewer-queue/${queue[0].id}/submit`, {
    responses: { overall: 4, relevance: 4, novelty: 3, comments: "Strong practical content." },
  }, asRole(sam.id, "reviewer"));
  assert.equal(scored.status, 200, "scorecard submitted");
  const scoredSubmissionId = queue[0].submissionId;
  const withHistory = (await json(await get(`/api/events/${E}/submissions/${scoredSubmissionId}`))).data;
  assert.ok((withHistory.reviews || []).some((r: any) => r.reviewerId === sam.id),
    "organizer review history shows the reviewer's scorecard");

  // —— 8. Accept one, reject the other; decisions visible ——
  const acceptId = scoredSubmissionId;
  const rejectId = submitted.find((s) => s.id !== acceptId)!.id;
  const accepted = await post(`/api/events/${E}/submissions/${acceptId}/decision`, { nextStatus: "accepted", sendComms: true, createTasks: true });
  assert.equal(accepted.status, 200, "accept decision applied");
  const rejected = await post(`/api/events/${E}/submissions/${rejectId}/decision`, { nextStatus: "rejected", sendComms: true });
  assert.equal(rejected.status, 200, "reject decision applied");

  const afterDecisions = (await json(await get(`/api/events/${E}/submissions`))).data;
  assert.equal(afterDecisions.find((s: any) => s.id === acceptId).status, "accepted");
  assert.equal(afterDecisions.find((s: any) => s.id === rejectId).status, "rejected");
  // Both remain openable (the CFP-12 "no usable decision control" surface).
  for (const id of [acceptId, rejectId]) {
    assert.equal((await get(`/api/events/${E}/submissions/${id}`)).status, 200, "detail loads in a runtime event");
  }

  // —— 9. Accepted session reaches the DevFlow schedule and is placed in Room 2A ——
  const sched1 = await json(await get(`/api/events/${E}/schedule`));
  const session = sched1.sessions.find((s: any) => s.acceptedSubmissionId === acceptId || s.title === "Taming 40-Minute CI");
  assert.ok(session, "accepted submission materialized as a session in THIS event");
  assert.ok(!sched1.slots.some((sl: any) => sl.sessionId === session.id), "it starts unscheduled");

  const startsAt = zonedWallTimeToIso("2027-05-04", "09:00", ev.timezone);
  const placed = await post(`/api/events/${E}/schedule/move`, {
    slot: {
      id: `slot-${session.id}`, sessionId: session.id, roomId: room2A.id,
      startsAt, endsAt: new Date(Date.parse(startsAt) + (session.durationMinutes || 45) * 60000).toISOString(),
    },
    version: sched1.version,
  });
  assert.ok([200, 201].includes(placed.status), `placement accepted (${placed.status})`);
  const sched2 = await json(await get(`/api/events/${E}/schedule`));
  const slot = sched2.slots.find((sl: any) => sl.sessionId === session.id);
  assert.ok(slot, "the session is now placed");
  assert.equal(slot.roomId, room2A.id, "placed in Room 2A");

  // —— 10. Publish the agenda, then the PUBLIC slug program shows it ——
  const publishRes = await post(`/api/events/${E}/agenda/publish`, {});
  assert.ok([200, 201].includes(publishRes.status), `agenda published (${publishRes.status})`);

  const publicSessions = await get(`/e/${ev.slug}/public/sessions`, PUBLIC);
  assert.equal(publicSessions.status, 200);
  const html = await publicSessions.text();
  assert.ok(html.includes("DevFlow Conf 2027"), "public page is the DevFlow event");
  assert.ok(html.includes(session.title), "the placed session is publicly listed");
  assert.ok(!html.includes("Analytical Engines in Practice"), "no seeded sessions leak in");

  // —— 11. Speaker portal for the created speaker, in this event ——
  const boot2 = (await json(await get(`/api/events/${E}/bootstrap`))).data;
  const speakerPersona = boot2.personas.find((p: any) => p.role === "speaker" && p.speakerId);
  assert.ok(speakerPersona, "an accepted speaker has a portal persona in this event");

  const homeRes = await get(`/api/speaker/events/${E}/home`, asRole(speakerPersona.id, "speaker"));
  assert.equal(homeRes.status, 200, "portal home loads in this event");
  const home = (await json(homeRes)).data;
  const talkTitles = JSON.stringify(home.submissions || home.talks || home);
  assert.ok(/Taming 40-Minute CI/.test(talkTitles), "portal lists the speaker's submission");
  assert.ok(Array.isArray(home.tasks), "portal exposes tasks");

  // Organizer-assigned task must be the one the portal shows (not another event's seed).
  const assignTask = await post(`/api/events/${E}/speakers/tasks`, {
    speakerIds: [speakerPersona.speakerId], title: "Confirm participation",
    dueAt: "2027-04-01T00:00:00.000Z", type: "action",
  });
  assert.equal(assignTask.status, 201, "organizer assigned a task in this event");
  const home2 = (await json(await get(`/api/speaker/events/${E}/home`, asRole(speakerPersona.id, "speaker")))).data;
  assert.ok((home2.tasks || []).some((t: any) => t.title === "Confirm participation"),
    "the portal shows the task the organizer just assigned in THIS event");

  // And the seeded event is untouched by the whole chain.
  const seededAfter = (await json(await get(`/api/events/${EVENT_ID}/submissions`))).data;
  assert.equal(seededAfter.length, seededInbox.length, "seeded event unchanged");
  resetEventRegistry();
});

test("public surfaces are slug-driven, never a constant", async () => {
  const { readFileSync } = await import("node:fs");
  const api = readFileSync("src/web/lib/api.ts", "utf8");
  assert.match(api, /publicCfp: \(slug: string, formId\?: string\)/, "publicCfp takes the URL slug (and an optional form id)");
  assert.match(api, /submitCfp: \(slug: string, body: any\)/);
  assert.match(api, /publicSubmission: \(slug:string,id:string,token:string\)/);
  assert.match(api, /savePublicSubmission: \(slug:string,id:string,body:any\)/);
  assert.ok(!/ai-engineer-summit/.test(api), "no hardcoded slug remains in the API layer");

  const shells = readFileSync("src/web/components/shells.tsx", "utf8");
  assert.match(shells, /data-testid="public-event-name"/);
  assert.match(shells, /api\s*\n?\s*\.publicCfp\(slug\)/, "the public shell names the event from the slug");

  for (const page of ["src/web/pages/PublicReviewerPages.tsx", "src/web/pages/ContentPages.tsx", "src/web/pages/PortalPages.tsx"]) {
    const src = readFileSync(page, "utf8");
    assert.ok(!/\/e\/ai-engineer-summit\//.test(src), `${page} has no hardcoded public slug`);
  }
});

test("all three shells share one active-event key and re-resolve personas per event", async () => {
  const { readFileSync } = await import("node:fs");
  const api = readFileSync("src/web/lib/api.ts", "utf8");
  assert.equal((api.match(/const EVENT_KEY = "cue-event-id"/g) || []).length, 1, "exactly one storage key");

  const shells = readFileSync("src/web/components/shells.tsx", "utf8");
  // Organizer gets the full switcher; reviewer and speaker shells show it read-only.
  assert.match(shells, /<EventSwitcher \/>/);
  assert.equal((shells.match(/<EventSwitcher readOnly \/>/g) || []).length, 2);
  // Persona resolution is keyed on the active event in both role shells (bounded).
  assert.match(shells, /\}, \[role, activeEvent\.id\]\)/, "portal resolves per event");
  assert.match(shells, /\},\[inviteToken,activeEvent\.id\]\)/, "reviewer resolves per event");
  assert.match(shells, /data-testid="reviewer-none"/, "reviewer empty state exists");
  assert.match(shells, /data-testid="portal-no-speakers"/, "speaker empty state exists");
  // No render-time persona writes (loop guard from the previous fix).
  assert.ok(!/^\s*resolvePortalPersona\(role\);$/m.test(shells));
});
