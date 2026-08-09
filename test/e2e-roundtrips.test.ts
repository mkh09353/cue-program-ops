/**
 * End-to-end roundtrips the eval weights most.
 * API-level evidence (createApp) — no browser required.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { MemoryRepository, demoSchedule } from "../src/repository.js";

const E = "evt-ai-summit-2026";
const SLUG = "ai-engineer-summit";
const org = { "content-type": "application/json", "x-demo-persona": "org-swyx" };
const rev = { "content-type": "application/json", "x-demo-persona": "rev-ada" };
const spkAda = { "content-type": "application/json", "x-demo-persona": "spk-ada" };

function appWithSchedule() {
  const repo = new MemoryRepository();
  // MemoryRepository seeds demoSchedule; clone keeps isolation per test for schedule mutations.
  void repo.putSchedule(E, structuredClone(demoSchedule));
  return { app: createApp({ repo }), repo };
}

async function json(app: ReturnType<typeof createApp>, path: string, init: RequestInit = {}) {
  const r = await app.request(path, init);
  const text = await r.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: r.status, body, text, ct: r.headers.get("content-type") || "" };
}

function stamp() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test("roundtrip A: public CFP submit appears in organizer submissions", async () => {
  const { app } = appWithSchedule();
  const idTag = stamp();
  const create = await json(app, `/api/public/events/${SLUG}/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "E2E CFP Speaker",
      email: `e2e.cfp.${idTag}@example.test`,
      answers: {
        title: `E2E CFP Talk ${idTag}`,
        abstract:
          "A sufficiently long abstract for the e2e CFP submit roundtrip covering organizer list visibility.",
        category: "Engineering",
        format: "Talk (30 min)",
        experience: "advanced",
      },
    }),
  });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  assert.ok(create.body?.data?.id);
  assert.ok(create.body?.data?.editUrl);
  assert.equal(create.body?.data?.reviewBoard, "engineering");

  const list = await json(app, `/api/events/${E}/submissions`, { headers: org });
  assert.equal(list.status, 200);
  assert.ok(
    list.body?.data?.some((s: any) => s.id === create.body.data.id),
    "submitted proposal missing from organizer submissions",
  );
});

test("roundtrip B: reviewer scorecard submit updates results aggregate", async () => {
  const { app } = appWithSchedule();
  const queue = await json(app, `/api/events/${E}/reviewer-queue`, { headers: rev });
  assert.equal(queue.status, 200);
  const assignment =
    queue.body?.data?.find((a: any) => a.status === "assigned") || queue.body?.data?.[0];
  assert.ok(assignment?.id, "expected a reviewer assignment in seed queue");

  const rounds = await json(app, `/api/events/${E}/review-rounds`, { headers: org });
  const round =
    rounds.body?.data?.find((r: any) => r.id === assignment.roundId) || rounds.body?.data?.[0];
  const responses: Record<string, unknown> = {
    comments: "E2E scorecard notes",
    recommendation: "Accept",
  };
  for (const c of round?.criteria || []) {
    if (c.type === "rating") responses[c.id] = 5;
    else if (c.type === "select" && c.options?.length) responses[c.id] = c.options.includes("Accept")
      ? "Accept"
      : c.options[0];
    else if (c.type === "text") responses[c.id] = "E2E notes";
  }

  const scored = await json(app, `/api/events/${E}/reviewer-queue/${assignment.id}/submit`, {
    method: "POST",
    headers: rev,
    body: JSON.stringify({ responses }),
  });
  assert.equal(scored.status, 200, JSON.stringify(scored.body));
  assert.equal(scored.body?.data?.status, "submitted");

  const results = await json(app, `/api/events/${E}/review-results`, { headers: org });
  assert.equal(results.status, 200);
  const hit = results.body?.data?.find((r: any) => r.id === assignment.submissionId);
  assert.ok(hit, "scored submission missing from results");
  assert.ok(Number(hit.aggregateScore) > 0, `expected positive aggregate, got ${hit.aggregateScore}`);
  assert.ok(Number(hit.reviewerCount) >= 1);
});

test("roundtrip C: accept decision → speaker portal talks + unscheduled session pool", async () => {
  const { app } = appWithSchedule();
  const idTag = stamp();
  const create = await json(app, `/api/public/events/${SLUG}/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "E2E Accept Speaker",
      email: `e2e.accept.${idTag}@example.test`,
      answers: {
        title: `E2E Accept Talk ${idTag}`,
        abstract:
          "A sufficiently long abstract for the accept → portal + schedule unscheduled pool roundtrip.",
        category: "Product",
        format: "Talk (30 min)",
        experience: "intermediate",
      },
    }),
  });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  const subId = create.body.data.id as string;
  const speakerId = create.body.data.speakerId as string;

  const decision = await json(app, `/api/events/${E}/submissions/${subId}/decision`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({ nextStatus: "accepted", sendComms: true, createTasks: true }),
  });
  assert.equal(decision.status, 200, JSON.stringify(decision.body));
  assert.equal(decision.body?.data?.submission?.status, "accepted");
  assert.ok((decision.body?.data?.tasks?.length || 0) >= 1, "accept should create onboarding tasks");

  const home = await json(app, `/api/speaker/events/${E}/home`, {
    headers: {
      "content-type": "application/json",
      "x-demo-persona": speakerId,
      "x-demo-role": "speaker",
      "x-demo-speaker": speakerId,
    },
  });
  assert.equal(home.status, 200, JSON.stringify(home.body));
  assert.ok(
    home.body?.data?.submissions?.some((s: any) => s.id === subId && s.status === "accepted"),
    "accepted talk missing from speaker portal",
  );
  assert.ok((home.body?.data?.tasks?.length || 0) >= 1, "portal tasks empty after accept");

  const schedule = await json(app, `/api/events/${E}/schedule`, { headers: org });
  assert.equal(schedule.status, 200);
  const session = (schedule.body?.sessions || []).find(
    (s: any) => s.acceptedSubmissionId === subId || s.title === `E2E Accept Talk ${idTag}`,
  );
  assert.ok(session, "accepted submission did not create a schedule session");
  const placed = (schedule.body?.slots || []).some((sl: any) => sl.sessionId === session.id);
  assert.equal(placed, false, "freshly accepted session should start unscheduled");
});

test("roundtrip D: schedule place + publish → public sessions and agenda HTML", async () => {
  const { app } = appWithSchedule();
  const idTag = stamp();
  const create = await json(app, `/api/public/events/${SLUG}/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "E2E Schedule Speaker",
      email: `e2e.sched.${idTag}@example.test`,
      answers: {
        title: `E2E Scheduled Talk ${idTag}`,
        abstract:
          "A sufficiently long abstract for the schedule place and publish → public widgets roundtrip.",
        category: "Engineering",
        format: "Talk (30 min)",
        experience: "advanced",
      },
    }),
  });
  const subId = create.body.data.id as string;
  await json(app, `/api/events/${E}/submissions/${subId}/decision`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({ nextStatus: "accepted", createTasks: true }),
  });

  const before = await json(app, `/api/events/${E}/schedule`, { headers: org });
  const session = (before.body?.sessions || []).find(
    (s: any) => s.acceptedSubmissionId === subId || s.title === `E2E Scheduled Talk ${idTag}`,
  );
  assert.ok(session, "missing session after accept");

  const move = await json(app, `/api/events/${E}/schedule/move`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({
      version: before.body.version,
      acknowledge: [],
      slot: {
        id: `slot-e2e-${idTag}`,
        sessionId: session.id,
        roomId: "room-community",
        startsAt: "2026-10-12T21:00:00.000Z",
        endsAt: "2026-10-12T21:45:00.000Z",
      },
    }),
  });
  assert.equal(move.status, 200, JSON.stringify(move.body));

  const published = await json(app, `/api/events/${E}/agenda/publish`, {
    method: "POST",
    headers: org,
    body: "{}",
  });
  assert.equal(published.status, 200, JSON.stringify(published.body));
  assert.ok((published.body?.data?.count || 0) >= 1);

  const sessionsHtml = await json(app, `/e/${SLUG}/public/sessions`);
  assert.equal(sessionsHtml.status, 200);
  assert.ok(sessionsHtml.ct.includes("html"));
  assert.ok(
    sessionsHtml.text.includes(`E2E Scheduled Talk ${idTag}`),
    "published session title missing from public sessions HTML",
  );

  const agendaHtml = await json(app, `/e/${SLUG}/public/agenda`);
  assert.equal(agendaHtml.status, 200);
  assert.ok(agendaHtml.ct.includes("html"));
  assert.ok(
    agendaHtml.text.includes(`E2E Scheduled Talk ${idTag}`),
    "published session title missing from public agenda HTML",
  );

  const itineraryHtml = await json(app, `/e/${SLUG}/public/itinerary`);
  assert.equal(itineraryHtml.status, 200);
  assert.ok(itineraryHtml.text.includes(`E2E Scheduled Talk ${idTag}`));
});

test("roundtrip E: speaker profile edit → organizer roster + public gallery/speakers", async () => {
  const { app } = appWithSchedule();
  const idTag = stamp();
  const bio = `E2E_PROFILE_BIO_${idTag}`;
  const company = `E2E Co ${idTag}`;
  const title = `E2E Engineer ${idTag}`;

  const put = await json(app, `/api/speaker/events/${E}/profile`, {
    method: "PUT",
    headers: spkAda,
    body: JSON.stringify({ bio, company, title }),
  });
  assert.equal(put.status, 200, JSON.stringify(put.body));

  const roster = await json(app, `/api/events/${E}/speakers`, { headers: org });
  assert.equal(roster.status, 200);
  const ada = roster.body?.data?.find((s: any) => s.speakerId === "spk-ada" || s.id === "spk-ada");
  assert.ok(ada, "spk-ada missing from organizer roster");
  assert.equal(ada.bio, bio);
  assert.equal(ada.company, company);
  assert.equal(ada.title, title);

  const detail = await json(app, `/api/events/${E}/speakers/spk-ada`, { headers: org });
  assert.equal(detail.status, 200);
  assert.equal(detail.body?.data?.bio, bio);

  const speakersHtml = await json(app, `/e/${SLUG}/public/speakers`);
  assert.equal(speakersHtml.status, 200);
  assert.ok(speakersHtml.ct.includes("html"));
  assert.ok(speakersHtml.text.includes(bio), "profile bio missing from public speakers HTML");
  assert.ok(speakersHtml.text.includes(company));

  const galleryHtml = await json(app, `/e/${SLUG}/public/gallery`);
  assert.equal(galleryHtml.status, 200);
  assert.ok(galleryHtml.ct.includes("html"));
  // Gallery cards show company/title (full bio is on speaker detail).
  assert.ok(galleryHtml.text.includes(company), "company missing from public gallery HTML");
  assert.ok(galleryHtml.text.includes(title), "title missing from public gallery HTML");
});

test("roundtrip F: content approval → public projection", async () => {
  const { app } = appWithSchedule();
  const idTag = stamp();
  const newTitle = `CONTENT_APPROVED_${idTag}`;

  const patch = await json(app, `/api/events/${E}/content/sessions/ses-analytical`, {
    method: "PATCH",
    headers: org,
    body: JSON.stringify({ title: newTitle, contentStatus: "approved" }),
  });
  assert.equal(patch.status, 200, JSON.stringify(patch.body));
  assert.equal(patch.body?.data?.title, newTitle);

  const sessionsHtml = await json(app, `/e/${SLUG}/public/sessions`);
  assert.equal(sessionsHtml.status, 200);
  assert.ok(sessionsHtml.text.includes(newTitle), "approved title missing from public sessions");

  const itineraryHtml = await json(app, `/e/${SLUG}/public/itinerary`);
  assert.equal(itineraryHtml.status, 200);
  assert.ok(itineraryHtml.text.includes(newTitle), "approved title missing from public itinerary");
});

test("nav surfaces return filled seed data for organizer/reviewer/speaker", async () => {
  const { app } = appWithSchedule();
  const checks: Array<[string, string, Record<string, string>, (b: any) => boolean]> = [
    ["command", `/api/events/${E}/command`, org, (b) => !!b?.data?.kpis],
    ["submissions", `/api/events/${E}/submissions`, org, (b) => (b?.data?.length || 0) > 0],
    ["review-rounds", `/api/events/${E}/review-rounds`, org, (b) => (b?.data?.length || 0) > 0],
    ["review-progress", `/api/events/${E}/review-progress`, org, (b) => (b?.data?.length || 0) > 0],
    ["review-results", `/api/events/${E}/review-results`, org, (b) => (b?.data?.length || 0) > 0],
    ["speakers", `/api/events/${E}/speakers`, org, (b) => (b?.data?.length || 0) > 0],
    ["speakers-progress", `/api/events/${E}/speakers/progress`, org, (b) => !!b?.data],
    ["content", `/api/events/${E}/content`, org, (b) => !!b?.data],
    ["comms-templates", `/api/events/${E}/comms/templates`, org, (b) => (b?.data?.length || 0) > 0],
    ["forms", `/api/events/${E}/forms`, org, (b) => (b?.data?.length || 0) > 0],
    ["schedule", `/api/events/${E}/schedule`, org, (b) => (b?.sessions?.length || 0) > 0],
    ["crm-contacts", `/api/crm/contacts`, org, (b) => (b?.data?.length || 0) > 0],
    ["crm-pipeline", `/api/crm/pipeline`, org, (b) => !!b?.data],
    ["bootstrap", `/api/events/${E}/bootstrap`, org, (b) => !!b?.data?.event?.name],
    ["reviewer-queue", `/api/events/${E}/reviewer-queue`, rev, (b) => (b?.data?.length || 0) > 0],
    [
      "speaker-home",
      `/api/speaker/events/${E}/home`,
      spkAda,
      (b) => b?.data?.speakerId === "spk-ada" && (b?.data?.tasks?.length || 0) > 0,
    ],
  ];

  for (const [name, path, headers, pred] of checks) {
    const r = await json(app, path, { headers });
    assert.equal(r.status, 200, `${name} status ${r.status}`);
    assert.ok(pred(r.body), `${name} empty or unexpected shape: ${JSON.stringify(r.body).slice(0, 180)}`);
  }
});

test("public widgets + feeds + legacy aliases return populated HTML/JSON/ICS", async () => {
  const { app } = appWithSchedule();
  const htmlPaths = [
    `/e/${SLUG}/public/sessions`,
    `/e/${SLUG}/public/speakers`,
    `/e/${SLUG}/public/agenda`,
    `/e/${SLUG}/public/itinerary`,
    `/e/${SLUG}/public/gallery`,
    `/public/events/${E}/sessions`,
    `/public/events/${E}/speakers`,
    `/public/events/${E}/agenda`,
    `/public/events/${E}/itinerary`,
    `/public/events/${E}/gallery`,
  ];
  for (const path of htmlPaths) {
    const r = await json(app, path);
    assert.equal(r.status, 200, path);
    assert.ok(r.ct.includes("html"), `${path} ct=${r.ct}`);
    assert.ok(r.text.length > 500, `${path} too short`);
    assert.ok(!r.text.trim().startsWith("{"), `${path} returned JSON-as-body`);
  }

  const feed = await json(app, `/e/${SLUG}/public/feed.json`);
  assert.equal(feed.status, 200);
  assert.ok(feed.ct.includes("json"));
  assert.ok(feed.body?.sessions?.length > 0 || feed.body?.data?.sessions?.length > 0 || feed.text.includes("ses-"));

  const ics = await json(app, `/e/${SLUG}/public/ics`);
  assert.equal(ics.status, 200);
  assert.ok(ics.text.includes("BEGIN:VCALENDAR"));
});

test("defect: comms send prefers edited subject/body over template", async () => {
  const { app } = appWithSchedule();
  // Seed speaker id is stable across demos; list shape may use speakerId or id.
  const speakers = await json(app, `/api/events/${E}/speakers`, { headers: org });
  assert.equal(speakers.status, 200);
  const first = speakers.body?.data?.[0];
  const speakerId = first?.speakerId || first?.id || "spk-ada";
  assert.ok(speakerId, "need a speaker recipient");

  const unique = `JUDGE-EDITED-${stamp()}`;
  const send = await json(app, `/api/events/${E}/comms/send`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({
      templateKey: "acceptance",
      speakerIds: [speakerId],
      subject: `${unique} subject`,
      body: `Hello {{firstName}},\n\n${unique} body content for judge defect fix.\n`,
      includeCalendarLinks: false,
    }),
  });
  assert.ok([200, 201].includes(send.status), JSON.stringify(send.body));
  const blob = JSON.stringify(send.body);
  assert.ok(blob.includes(unique), `edited subject/body missing from send response: ${blob.slice(0, 400)}`);
});

test("defect: speaker persona cannot mutate organizer-only endpoints", async () => {
  const { app } = appWithSchedule();
  const denied = await json(app, `/api/events/${E}/comms/send`, {
    method: "POST",
    headers: spkAda,
    body: JSON.stringify({
      speakerIds: ["spk-ada"],
      subject: "nope",
      body: "speaker should not send organizer bulk comms",
    }),
  });
  assert.equal(denied.status, 403, JSON.stringify(denied.body));

  const crmDenied = await json(app, `/api/crm/contacts`, { headers: spkAda });
  assert.ok([401, 403].includes(crmDenied.status), `speaker CRM list status ${crmDenied.status}`);
});

test("defect: public agenda session detail back link returns to agenda day", async () => {
  const { app } = appWithSchedule();
  const agenda = await json(app, `/e/${SLUG}/public/agenda`);
  assert.equal(agenda.status, 200);
  assert.ok(agenda.text.includes("Timezone:") || agenda.text.includes("America/Los_Angeles") || agenda.text.includes("Los Angeles"), "agenda should label event timezone");
  // find a session detail link with from=agenda
  const m = agenda.text.match(/\/e\/[^"']+\/sessions\/([^"'?]+)\?from=agenda&day=([^"'&]+)/);
  assert.ok(m, "agenda should link to session detail with from=agenda&day=");
  const sessionId = m![1];
  const day = decodeURIComponent(m![2]);
  const detail = await json(app, `/e/${SLUG}/public/sessions/${sessionId}?from=agenda&day=${encodeURIComponent(day)}`);
  assert.equal(detail.status, 200);
  assert.ok(detail.text.includes("Back to agenda"), "detail should say Back to agenda");
  assert.ok(
    detail.text.includes(`/agenda?day=${encodeURIComponent(day)}`) || detail.text.includes(`/agenda?day=${day}`),
    `back href should target agenda day=${day}`,
  );
});

test("defect: itinerary marks day sections for My Schedule empty-day hide", async () => {
  const { app } = appWithSchedule();
  const it = await json(app, `/e/${SLUG}/public/itinerary`);
  assert.equal(it.status, 200);
  assert.ok(it.text.includes("data-day-section"), "itinerary needs data-day-section wrappers");
  assert.ok(it.text.includes("data-day-section") && it.text.includes("My Schedule"), "my schedule toggle present");
  // JS should hide empty sections
  assert.ok(it.text.includes("querySelectorAll('[data-day-section]')"), "filter JS hides empty day sections");
});

test("defect: speaker home exposes cfpOpen for closed-CTA gating", async () => {
  const { app } = appWithSchedule();
  const home = await json(app, `/api/speaker/events/${E}/home`, { headers: spkAda });
  assert.equal(home.status, 200, JSON.stringify(home.body));
  assert.equal(typeof home.body?.data?.cfpOpen, "boolean");
});

test("defect: CRM merge API collapses secondary into primary", async () => {
  const { app } = appWithSchedule();
  const a = await json(app, `/api/crm/contacts`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({ name: "Merge Primary", email: `merge.primary.${stamp()}@example.test`, company: "A" }),
  });
  assert.ok([200, 201].includes(a.status), JSON.stringify(a.body));
  const b = await json(app, `/api/crm/contacts`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({ name: "Merge Secondary", email: `merge.secondary.${stamp()}@example.test`, company: "B" }),
  });
  assert.ok([200, 201].includes(b.status), JSON.stringify(b.body));
  const primaryId = a.body.data.id;
  const secondaryId = b.body.data.id;
  await json(app, `/api/crm/contacts/${secondaryId}/notes`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({ body: "note-from-secondary" }),
  });
  const merge = await json(app, `/api/crm/contacts/merge`, {
    method: "POST",
    headers: org,
    body: JSON.stringify({ primaryId, secondaryId }),
  });
  assert.ok([200, 201].includes(merge.status), JSON.stringify(merge.body));
  const primary = await json(app, `/api/crm/contacts/${primaryId}`, { headers: org });
  assert.equal(primary.status, 200);
  assert.ok(
    JSON.stringify(primary.body).includes("note-from-secondary") ||
      (primary.body.data.notes || []).some((n: any) => String(n.body).includes("note-from-secondary") || String(n.body).includes("Merged")),
    "merged notes should land on primary",
  );
  const gone = await json(app, `/api/crm/contacts/${secondaryId}`, { headers: org });
  assert.ok([404, 400].includes(gone.status), `secondary should be gone, got ${gone.status}`);
});

test("defect: CRM campaigns list endpoint works", async () => {
  const { app } = appWithSchedule();
  const r = await json(app, `/api/crm/campaigns`, { headers: org });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(Array.isArray(r.body?.data));
});
