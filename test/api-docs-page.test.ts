import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { MemoryRepository } from "../src/repository.js";
import { OPENAPI_YAML } from "../src/openapi.js";
import { parseOpenapiOperations } from "../src/publicSite.js";

const page = async () => {
  const app = createApp({ repo: new MemoryRepository() });
  const res = await app.request("/docs/api");
  return { res, html: await res.text() };
};

test("GET /docs/api returns an HTML page with the spec link and a known endpoint", async () => {
  const { res, html } = await page();
  assert.equal(res.status, 200);
  assert.match(String(res.headers.get("content-type")), /text\/html/);
  assert.match(html, /^<!doctype html>/);
  assert.ok(html.includes("CUE API"), "renders the title");
  assert.ok(html.includes("/api/openapi.yaml"), "links the machine-readable spec");
  assert.ok(html.includes("Download OpenAPI 3.1 spec"), "offers the download");
  assert.ok(html.includes("/api/events/{eventId}/submissions"), "lists a known endpoint path");
});

test("the intro explains the API shape and demo identity", async () => {
  const { html } = await page();
  assert.ok(html.includes("x-demo-role"), "names the demo role header");
  assert.ok(html.includes("x-demo-persona"), "names the demo persona header");
  assert.ok(html.includes("persona simulation, not authentication"), "is honest about identity");
  assert.ok(/JSON API under <code>\/api<\/code>/.test(html), "describes the JSON API");
});

test("quick-start curl examples cover events, submissions and the public feed", async () => {
  const { html } = await page();
  assert.ok(html.includes("curl -s"), "shows curl examples");
  assert.ok(html.includes("/api/events</pre>") || html.includes("/api/events\n") || html.includes("/api/events"), "list events");
  assert.ok(html.includes("evt-ai-summit-2026/submissions"), "list submissions");
  assert.ok(html.includes("/public/feed.json"), "public program feed");
  // The organizer example must show the identity headers it needs.
  assert.ok(html.includes("x-demo-role: organizer"), "submissions example carries the role header");
});

test("the endpoint summary is derived from the embedded OpenAPI document", async () => {
  const { html } = await page();
  const ops = parseOpenapiOperations(OPENAPI_YAML);
  assert.ok(ops.length >= 185, `expected the full operation list, parsed ${ops.length}`);
  assert.ok(html.includes(`${ops.length} operations`), "reports the derived operation count");

  // Every tag in the spec becomes a group heading on the page.
  const tags = [...new Set(ops.map((o) => o.tag))];
  assert.ok(tags.length >= 10, `expected the documented groups, found ${tags.join(", ")}`);
  for (const tag of tags) {
    assert.ok(html.includes(`<h2>${tag} <small>`), `missing group heading for ${tag}`);
  }
  // Spot-check one operation per requested group renders method + path.
  for (const [method, path] of [
    ["GET", "/api/events"],
    ["POST", "/api/public/events/{slug}/submissions"],
    ["GET", "/api/events/{eventId}/review-rounds"],
    ["GET", "/api/events/{eventId}/speakers"],
    ["GET", "/api/events/{eventId}/schedule"],
    ["GET", "/api/crm/contacts"],
    ["GET", "/e/{slug}/public/sessions"],
    ["GET", "/sync/runs"],
    ["GET", "/health"],
  ] as const) {
    assert.ok(ops.some((o) => o.method === method && o.path === path), `spec is missing ${method} ${path}`);
    assert.ok(html.includes(`<code>${path}</code>`), `page is missing ${path}`);
  }
});

test("the parser is robust on odd input", () => {
  assert.deepEqual(parseOpenapiOperations(""), []);
  assert.deepEqual(parseOpenapiOperations("not: yaml\n  at: all"), []);
  const sample = [
    "paths:",
    "  /thing:",
    "    get:",
    "      tags: [meta]",
    '      summary: "Reads a thing."',
    "    post:",
    "      tags: [meta]",
    "      summary: Creates a thing.",
    '  "/thing/{id}":',
    "    delete:",
    "      tags: [other]",
  ].join("\n");
  const ops = parseOpenapiOperations(sample);
  assert.deepEqual(ops, [
    { method: "GET", path: "/thing", summary: "Reads a thing.", tag: "meta" },
    { method: "POST", path: "/thing", summary: "Creates a thing.", tag: "meta" },
    { method: "DELETE", path: "/thing/{id}", summary: "", tag: "other" },
  ]);
});

test("the page is reachable in production and linked from the landing page", () => {
  // The worker routes /docs/* to the app rather than the static SPA assets.
  const index = readFileSync("src/index.ts", "utf8");
  assert.match(index, /"\/docs\/"/, "apiPath must route /docs/* to the worker");

  const landing = readFileSync("src/web/pages/PublicReviewerPages.tsx", "utf8");
  assert.match(landing, /\{ to: "\/docs\/api", label: "API docs"/, "landing page links the docs");
});
