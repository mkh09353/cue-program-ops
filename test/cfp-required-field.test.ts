import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { createCustomCfpField } from "../src/web/pages/PublishFormsSettings.js";

const headers = (persona: string) => ({ "content-type": "application/json", "x-demo-persona": persona });
const parse = async (res: Response) => ({ res, body: (await res.json()) as any });

test("builder creates a collision-resistant clean custom field without seeded metadata", () => {
  const duration = store.form.fields.find((field) => field.key === "duration")!;
  const first = createCustomCfpField(store.form.fields);
  const second = createCustomCfpField([...store.form.fields, first]);
  assert.notEqual(first.key, duration.key);
  assert.notEqual(first.key, second.key);
  assert.match(first.key, /^custom_[0-9a-f-]{36}$/);
  assert.deepEqual(first, { key: first.key, label: "New field", type: "text", required: false, section: "Proposal" });
  assert.equal("visibleWhen" in first, false);
  assert.equal("helpText" in first, false);
  assert.equal("options" in first, false);
  assert.equal(duration.key, "duration");
  assert.deepEqual(duration.visibleWhen, { key: "format", equals: "Workshop (120 min)" });
});

test("form save visibly rejects duplicate keys and malformed conditions", async () => {
  const app = createApp();
  const original = structuredClone(store.form);
  const save = (fields: any[]) => app.request(`/api/events/${EVENT_ID}/forms/form-cfp`, {
    method: "PUT", headers: headers("org-swyx"), body: JSON.stringify({ ...original, fields }),
  });
  try {
    const duplicate = await parse(await save([...original.fields, { ...original.fields[0] }]));
    assert.equal(duplicate.res.status, 400);
    assert.match(duplicate.body.error.message, /duplicate form field key: title/);

    const missingTrigger = await parse(await save([...original.fields, {
      key: "bad_missing", label: "Bad missing", type: "text", required: false,
      visibleWhen: { key: "does_not_exist", equals: "Anything" },
    }]));
    assert.equal(missingTrigger.res.status, 400);
    assert.match(missingTrigger.body.error.message, /conditional trigger field not found/);

    const self = await parse(await save([...original.fields, {
      key: "bad_self", label: "Bad self", type: "text", required: false,
      visibleWhen: { key: "bad_self", equals: "Yes" },
    }]));
    assert.equal(self.res.status, 400);
    assert.match(self.body.error.message, /cannot conditionally depend on itself/);

    const badOption = await parse(await save([...original.fields, {
      key: "bad_option", label: "Bad option", type: "text", required: false,
      visibleWhen: { key: "format", equals: "Webinar (999 min)" },
    }]));
    assert.equal(badOption.res.status, 400);
    assert.match(badOption.body.error.message, /conditional value is not an option for format/);
    assert.deepEqual(store.form.fields, original.fields, "rejected schemas must not partially replace fields");
  } finally {
    store.form = original;
  }
});

/**
 * Item 4 regression: a NEW custom field added in the builder with required=true must
 * round-trip (builder → saved form → public CFP payload) and be enforced server-side.
 */
test("new required custom field round-trips to the public CFP and is enforced", async () => {
  const app = createApp();
  const current = await parse(await app.request(`/api/events/${EVENT_ID}/forms/form-cfp`, { headers: headers("org-swyx") }));
  const fields = [
    ...current.body.data.fields,
    { key: "key_takeaway", label: "Key takeaway", type: "text", required: true, section: "Proposal" },
  ];
  const saved = await parse(
    await app.request(`/api/events/${EVENT_ID}/forms/form-cfp`, {
      method: "PUT",
      headers: headers("org-swyx"),
      body: JSON.stringify({ ...current.body.data, fields }),
    }),
  );
  assert.equal(saved.res.status, 200);
  const savedField = saved.body.data.fields.find((f: any) => f.key === "key_takeaway");
  assert.ok(savedField, "new field must persist");
  assert.equal(savedField.required, true, "required flag must persist for new fields");

  // Public CFP payload carries the required flag so the form renders the asterisk.
  const publicCfp = await parse(await app.request(`/api/public/events/ai-engineer-summit/cfp`));
  const publicField = publicCfp.body.data.form.fields.find((f: any) => f.key === "key_takeaway");
  assert.equal(publicField.required, true);
  assert.equal(publicField.label, "Key takeaway");

  const category = publicCfp.body.data.categories[0];
  const format = (publicCfp.body.data.form.fields.find((f: any) => f.key === "format")?.options || ["Talk"])[0];
  const answers: Record<string, string> = { title: "Required field enforcement", abstract: "A".repeat(60), category, format };
  // Fill every OTHER visible required field so the assertion isolates the new one.
  for (const f of publicCfp.body.data.form.fields) {
    if (f.key === "key_takeaway" || answers[f.key] != null) continue;
    const visible = !f.visibleWhen || answers[f.visibleWhen.key] === f.visibleWhen.equals;
    if (visible && f.required) answers[f.key] = f.options?.length ? f.options[0] : "Filled in";
  }
  const base = { name: "Test Speaker", email: `required-${Date.now()}@example.test`, answers };

  // Server rejects a submission missing the required custom field.
  const missing = await parse(
    await app.request(`/api/public/events/ai-engineer-summit/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(base),
    }),
  );
  assert.equal(missing.res.status, 400);
  assert.match(missing.body.error.message, /Key takeaway is required/);

  // Same payload with the field filled in is accepted and stores the answer.
  const ok = await parse(
    await app.request(`/api/public/events/ai-engineer-summit/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...base, answers: { ...answers, key_takeaway: "Ship smaller CI jobs" } }),
    }),
  );
  assert.equal(ok.res.status, 201);
  const stored = store.submissions.find((s) => s.id === ok.body.data.id)!;
  assert.equal(stored.answers.key_takeaway, "Ship smaller CI jobs");

  // Drafts are exempt, but promoting a draft to submitted is enforced too.
  const draft = await parse(
    await app.request(`/api/public/events/ai-engineer-summit/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...base, email: `draft-${Date.now()}@example.test`, status: "draft" }),
    }),
  );
  assert.equal(draft.res.status, 201);
  const promote = await parse(
    await app.request(`/api/public/events/ai-engineer-summit/submissions/${draft.body.data.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ editToken: draft.body.data.editToken, status: "submitted", answers: base.answers }),
    }),
  );
  assert.equal(promote.res.status, 400);
  assert.match(promote.body.error.message, /Key takeaway is required/);
});

/** A required field that is conditionally hidden must not block submission. */
test("required conditional field is only enforced while visible", async () => {
  const app = createApp();
  const current = await parse(await app.request(`/api/events/${EVENT_ID}/forms/form-cfp`, { headers: headers("org-swyx") }));
  const fields = [
    ...current.body.data.fields.filter((f: any) => f.key !== "workshop_only"),
    {
      key: "workshop_only",
      label: "Workshop prerequisites",
      type: "textarea",
      required: true,
      section: "Proposal",
      visibleWhen: { key: "format", equals: "Workshop (90 min)" },
    },
  ];
  await app.request(`/api/events/${EVENT_ID}/forms/form-cfp`, {
    method: "PUT",
    headers: headers("org-swyx"),
    body: JSON.stringify({ ...current.body.data, fields }),
  });
  const cfp = (await parse(await app.request(`/api/public/events/ai-engineer-summit/cfp`))).body.data;
  const category = cfp.categories[0];
  const format = (cfp.form.fields.find((f: any) => f.key === "format")?.options || ["Talk"]).find(
    (o: string) => !o.startsWith("Workshop"),
  );
  const answers: Record<string, string> = { title: "Hidden conditional", abstract: "A".repeat(60), category, format };
  for (const f of cfp.form.fields) {
    if (f.key === "workshop_only" || answers[f.key] != null) continue;
    const visible = !f.visibleWhen || answers[f.visibleWhen.key] === f.visibleWhen.equals;
    if (visible && f.required) answers[f.key] = f.options?.length ? f.options[0] : "Filled in";
  }
  const res = await parse(
    await app.request(`/api/public/events/ai-engineer-summit/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Cond Speaker", email: `cond-${Date.now()}@example.test`, answers }),
    }),
  );
  assert.equal(res.res.status, 201);
});
