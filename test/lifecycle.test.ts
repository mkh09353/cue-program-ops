import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";

const app = createApp();
const json = async (path: string, init?: RequestInit) => {
  const res = await app.request(path, init);
  const body = await res.json();
  return { res, body };
};

test("public CFP workshop conditional + board routing", async () => {
  const { res, body } = await json("/api/public/events/ai-engineer-summit/submissions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Test Speaker",
      email: "test@example.test",
      answers: {
        title: "Hands-on Eval Lab",
        abstract: "A long enough abstract about evaluation harnesses for production teams.",
        category: "AI Engineering",
        format: "Workshop (120 min)",
        workshopPlan: "Pair programming on harnesses",
        duration: "60",
        experience: "Advanced",
      },
    }),
  });
  assert.equal(res.status, 201);
  assert.equal(body.data.reviewBoard, "ai-engineering");
});

test("accept creates tasks and comms", async () => {
  const created = await json("/api/public/events/ai-engineer-summit/submissions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Accepted Person",
      email: "acc@example.test",
      answers: {
        title: "Accept Me",
        abstract: "Abstract text for acceptance path testing with enough characters.",
        category: "AI Engineering",
        format: "Talk (30 min)",
        experience: "Beginner",
      },
    }),
  });
  const id = created.body.data.id;
  const { res, body } = await json(`/api/events/evt-ai-summit-2026/submissions/${id}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-demo-role": "organizer" },
    body: JSON.stringify({ nextStatus: "accepted", sendComms: true, createTasks: true }),
  });
  assert.equal(res.status, 200);
  assert.ok(body.data.tasks.length >= 3);
  assert.ok(body.data.communication?.id);
  assert.equal(body.data.submission.status, "accepted");
});

test("HTML gallery embed returns HTML not JSON", async () => {
  const res = await app.request("/public/events/evt-ai-summit-2026/gallery");
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/html/);
  assert.match(text, /Speaker gallery/);
});

test("command snapshot includes kpis", async () => {
  const { res, body } = await json("/api/events/evt-ai-summit-2026/command", { headers: { "x-demo-persona": "org-swyx" } });
  assert.equal(res.status, 200);
  assert.ok(typeof body.data.kpis.submissions === "number");
});
