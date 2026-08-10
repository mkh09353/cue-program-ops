import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";
import { assignSpecific } from "../src/review.js";

const h = (id: string) => ({ "content-type": "application/json", "x-demo-persona": id });
const parse = async (res: Response) => ({ res, body: (await res.json()) as any });

/** Item 1: N selected submissions must produce N assignments (API contract). */
test("assigning two selected submissions creates two assignments", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const rounds = await parse(await app.request(`/api/events/${EVENT_ID}/review-rounds`, { headers: h("org-swyx") }));
  const round = rounds.body.data[0];
  const reviewerId = round.reviewerIds[0];

  // Pick two submissions this reviewer does not already have in the round.
  const subs = await parse(await app.request(`/api/events/${EVENT_ID}/submissions`, { headers: h("org-swyx") }));
  const taken = new Set(
    store.reviewAssignments
      .filter((a) => a.roundId === round.id && a.reviewerId === reviewerId && a.status !== "recused")
      .map((a) => a.submissionId),
  );
  const ids = subs.body.data.map((s: any) => s.id).filter((id: string) => !taken.has(id)).slice(0, 2);
  assert.equal(ids.length, 2, "fixture needs two unassigned submissions");

  const made = await parse(
    await app.request(`/api/events/${EVENT_ID}/review-assignments`, {
      method: "POST",
      headers: h("org-swyx"),
      body: JSON.stringify({ roundId: round.id, reviewerId, submissionIds: ids, method: "specific", cap: 5 }),
    }),
  );
  assert.equal(made.res.status, 201);
  assert.equal(made.body.data.length, 2, "two selected ids must yield two assignments");
  assert.deepEqual(
    made.body.data.map((a: any) => a.submissionId).sort(),
    [...ids].sort(),
    "the confirmation payload must name exactly the selected submissions",
  );

  // The reviewer's queue reflects both immediately.
  const queue = await parse(await app.request(`/api/events/${EVENT_ID}/reviewer-queue`, { headers: h(reviewerId) }));
  for (const id of ids) assert.ok(queue.body.data.some((a: any) => a.submissionId === id));
});

/** Item 1 (root cause 2): an already-assigned id must not consume a cap slot. */
test("duplicate submission ids do not eat the per-reviewer cap", () => {
  const round: any = { id: "round-x", name: "R", opensAt: "", closesAt: "", status: "open", blind: false, reviewerIds: ["rev-a"], criteria: [] };
  const existing: any[] = [
    { id: "a1", roundId: "round-x", submissionId: "sub-1", reviewerId: "rev-a", status: "assigned", createdAt: "" },
  ];
  // sub-1 is already assigned; sub-2 and sub-3 are new. Cap 3 leaves room for 2.
  const made = assignSpecific(existing, round, ["sub-1", "sub-2", "sub-3"], "rev-a", 3);
  assert.deepEqual(made.map((a) => a.submissionId), ["sub-2", "sub-3"]);
  // Repeated ids in one request are also collapsed.
  assert.equal(assignSpecific(existing, round, ["sub-2", "sub-2"], "rev-a", 3).length, 1);
});

/** Item 5: co-authors survive draft → resume → edit → final submit. */
test("co-authors persist through draft save, edit, and final submit", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const cfp = (await parse(await app.request(`/api/public/events/ai-engineer-summit/cfp`))).body.data;
  const answers: Record<string, any> = {
    title: "Incremental builds at monorepo scale",
    abstract: "A".repeat(60),
    category: cfp.categories[0],
    format: (cfp.form.fields.find((f: any) => f.key === "format")?.options || ["Talk"])[0],
  };
  for (const f of cfp.form.fields) {
    if (answers[f.key] != null) continue;
    const visible = !f.visibleWhen || answers[f.visibleWhen.key] === f.visibleWhen.equals;
    if (visible && f.required) answers[f.key] = f.options?.length ? f.options[0] : "Filled in";
  }
  const coAuthors = [{ name: "Marcus Okafor", email: "marcus@example.test" }];
  const email = `priya-${Date.now()}@example.test`;

  // 1. DRAFT with a co-author.
  const draft = await parse(
    await app.request(`/api/public/events/ai-engineer-summit/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Priya Raman", email, status: "draft", answers: { ...answers, additionalSpeakers: coAuthors } }),
    }),
  );
  assert.equal(draft.res.status, 201);
  const id = draft.body.data.id;
  const token = draft.body.data.editToken;
  assert.equal(store.submissions.find((s) => s.id === id)!.additionalSpeakers?.length, 1, "draft must retain the co-author");

  // 2. RESUME: the edit payload exposes the co-author for the form to re-render.
  const resumed = await parse(await app.request(`/api/public/events/ai-engineer-summit/submissions/${id}?token=${token}`));
  assert.equal(resumed.res.status, 200);
  assert.equal(resumed.body.data.additionalSpeakers[0].name, "Marcus Okafor");
  assert.equal(resumed.body.data.answers.additionalSpeakers[0].name, "Marcus Okafor");

  // 3. EDIT the title while re-sending co-authors (what the fixed client does).
  const edited = await parse(
    await app.request(`/api/public/events/ai-engineer-summit/submissions/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        editToken: token,
        status: "draft",
        answers: { ...resumed.body.data.answers, title: "Taming 40-minute CI" },
      }),
    }),
  );
  assert.equal(edited.res.status, 200);
  assert.equal(edited.body.data.additionalSpeakers.length, 1, "editing must not drop co-authors");

  // 4. FINAL submit from the draft.
  const submitted = await parse(
    await app.request(`/api/public/events/ai-engineer-summit/submissions/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ editToken: token, status: "submitted", answers: edited.body.data.answers }),
    }),
  );
  assert.equal(submitted.res.status, 200);
  assert.equal(submitted.body.data.status, "submitted");

  // 5. Review Studio (organizer submission detail) lists lead + co-presenter.
  const detail = await parse(await app.request(`/api/events/${EVENT_ID}/submissions/${id}`, { headers: h("org-swyx") }));
  assert.equal(detail.res.status, 200);
  assert.equal(detail.body.data.name, "Priya Raman");
  assert.equal(detail.body.data.additionalSpeakers.length, 1);
  assert.equal(detail.body.data.additionalSpeakers[0].name, "Marcus Okafor");
  // The organizer list projection shows the pairing too.
  const list = await parse(await app.request(`/api/events/${EVENT_ID}/submissions`, { headers: h("org-swyx") }));
  const row = list.body.data.find((s: any) => s.id === id);
  assert.equal(row.additionalSpeakers[0].name, "Marcus Okafor");
});

/** Item 5b: a co-author added on a submitted proposal is kept on later edits. */
test("adding a co-author during an edit persists", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const cfp = (await parse(await app.request(`/api/public/events/ai-engineer-summit/cfp`))).body.data;
  const answers: Record<string, any> = {
    title: "Solo talk",
    abstract: "B".repeat(60),
    category: cfp.categories[0],
    format: (cfp.form.fields.find((f: any) => f.key === "format")?.options || ["Talk"])[0],
  };
  for (const f of cfp.form.fields) {
    if (answers[f.key] != null) continue;
    const visible = !f.visibleWhen || answers[f.visibleWhen.key] === f.visibleWhen.equals;
    if (visible && f.required) answers[f.key] = f.options?.length ? f.options[0] : "Filled in";
  }
  const created = await parse(
    await app.request(`/api/public/events/ai-engineer-summit/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Solo Speaker", email: `solo-${Date.now()}@example.test`, answers }),
    }),
  );
  const { id, editToken } = created.body.data;
  assert.equal(store.submissions.find((s) => s.id === id)!.additionalSpeakers?.length || 0, 0);

  const withCoAuthor = await parse(
    await app.request(`/api/public/events/ai-engineer-summit/submissions/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        editToken,
        status: "submitted",
        answers: { ...answers, additionalSpeakers: [{ name: "Marcus Okafor", email: "marcus2@example.test" }] },
      }),
    }),
  );
  assert.equal(withCoAuthor.res.status, 200);
  assert.equal(withCoAuthor.body.data.additionalSpeakers.length, 1);
  const detail = await parse(await app.request(`/api/events/${EVENT_ID}/submissions/${id}`, { headers: h("org-swyx") }));
  assert.equal(detail.body.data.additionalSpeakers[0].name, "Marcus Okafor");
});

/** Item 8: saved embed config persists a card-field selection honored by the widgets. */
test("embed config card-field selection is persisted and honored by public widgets", async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const made = await parse(
    await app.request(`/api/events/${EVENT_ID}/embed-configs`, {
      method: "POST",
      headers: h("org-swyx"),
      body: JSON.stringify({
        name: "Minimal cards",
        widget: "sessions",
        filters: {},
        theme: {},
        fields: { speakers: false, room: false, track: true, description: false },
      }),
    }),
  );
  assert.equal(made.res.status, 201);
  const config = made.body.data;
  assert.deepEqual(config.fields, { speakers: false, room: false, track: true, description: false });

  // The config is listed immediately (first-click visibility in the manager).
  const listed = await parse(await app.request(`/api/events/${EVENT_ID}/embed-configs`, { headers: h("org-swyx") }));
  assert.ok(listed.body.data.some((x: any) => x.id === config.id));

  const page = await (await app.request(`/e/ai-engineer-summit/public/sessions?config=${config.id}`)).text();
  // Inspect the rendered cards only (the shared filter script also mentions these hooks).
  const cards = page.split("<article").slice(1).map((c) => c.split("</article>")[0]!);
  assert.ok(cards.length >= 3);
  for (const card of cards) {
    assert.ok(card.includes("data-track-pill"), "track badge kept");
    assert.ok(!card.includes("data-room-pill"), "room badge hidden by config");
    assert.ok(!card.includes("data-speaker-role"), "speaker chips hidden by config");
    assert.ok(!card.includes("data-desc"), "description hidden by config");
  }
  assert.match(page, /Analytical Engines in Practice/, "titles still render");

  // Defaults (omitted fields) keep every card field.
  const full = await parse(
    await app.request(`/api/events/${EVENT_ID}/embed-configs`, {
      method: "POST",
      headers: h("org-swyx"),
      body: JSON.stringify({ name: "Full cards", widget: "sessions", filters: {}, theme: {} }),
    }),
  );
  assert.deepEqual(full.body.data.fields, { speakers: true, room: true, track: true, description: true });
  const fullPage = await (await app.request(`/e/ai-engineer-summit/public/sessions?config=${full.body.data.id}`)).text();
  const fullCards = fullPage.split("<article").slice(1).map((c) => c.split("</article>")[0]!);
  for (const marker of ["data-track-pill", "data-room-pill", "data-speaker-role", "data-desc"]) {
    assert.ok(fullCards.every((card) => card.includes(marker)), `${marker} must render by default`);
  }
});
