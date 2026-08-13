import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OPENAPI_CONTENT_TYPE, OPENAPI_PATH, OPENAPI_YAML } from "../src/openapi.js";

const DOC_PATH = "docs/openapi.yaml";
const doc = () => readFileSync(DOC_PATH, "utf8");

/** Route registrations, read straight from the source of truth. */
const MODULE_PREFIX: Record<string, string> = {
  "src/app.ts": "",
  "src/reviewRoutes.ts": "/api/events",
  "src/speakerRoutes.ts": "",
  "src/contentRoutes.ts": "",
  "src/crmRoutes.ts": "",
  "src/agendaRoutes.ts": "",
  "src/publicSite.ts": "",
};
/** Routes registered through a shared constant rather than a string literal. */
const CONSTANT_PATHS: Record<string, string> = { OPENAPI_PATH };

function implementedOperations() {
  const found = new Set<string>();
  for (const [file, prefix] of Object.entries(MODULE_PREFIX)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bapp\.(get|post|put|patch|delete)\("([^"]+)"/g)) {
      const openapiPath = (prefix + m[2]).replace(/:([A-Za-z0-9_]+)/g, "{$1}");
      found.add(`${m[1].toLowerCase()} ${openapiPath}`);
    }
    // e.g. app.get(OPENAPI_PATH, ...) - resolve the constant so the coverage and
    // phantom checks still see the route.
    for (const m of src.matchAll(/\bapp\.(get|post|put|patch|delete)\(([A-Z][A-Z0-9_]+)\s*,/g)) {
      const resolved = CONSTANT_PATHS[m[2]];
      if (resolved) found.add(`${m[1].toLowerCase()} ${prefix}${resolved}`);
    }
  }
  return found;
}

/** Operations declared in the document, without pulling in a YAML parser. */
function documentedOperations(yaml: string) {
  const found = new Set<string>();
  let current = "";
  for (const raw of yaml.split("\n")) {
    const pathLine = raw.match(/^ {2}("?)(\/[^"?]*)\1:$/);
    if (pathLine) {
      current = pathLine[2];
      continue;
    }
    const methodLine = raw.match(/^ {4}(get|post|put|patch|delete):$/);
    if (methodLine && current) found.add(`${methodLine[1]} ${current}`);
  }
  return found;
}

test("the exported string and docs/openapi.yaml are byte identical", () => {
  assert.equal(OPENAPI_YAML, doc(), "src/openapi.ts drifted from docs/openapi.yaml");
  assert.equal(OPENAPI_CONTENT_TYPE, "application/yaml; charset=utf-8");
  assert.equal(OPENAPI_PATH, "/api/openapi.yaml");
});

test("the runtime module stays runtime safe", () => {
  const src = readFileSync("src/openapi.ts", "utf8");
  assert.ok(!/from "node:fs"|require\(/.test(src), "must not read from the filesystem");
  assert.ok(!/\?raw/.test(src), "must not use a Vite raw import");
  assert.ok(!/import .*\.yaml/.test(src), "must not import the YAML file");
  assert.match(src, /export const OPENAPI_YAML = `/, "exports a plain template string");
  // A stray backtick or template placeholder inside the YAML would break the module.
  assert.ok(!OPENAPI_YAML.includes("`"), "YAML must not contain a backtick");
  assert.ok(!OPENAPI_YAML.includes("${"), "YAML must not contain a template placeholder");
});

test("the document declares OpenAPI 3.1 with the expected envelope", () => {
  const yaml = doc();
  assert.match(yaml, /^openapi: 3\.1\.\d+$/m, "declares an OpenAPI 3.1 version");
  assert.match(yaml, /^info:$/m);
  assert.match(yaml, /^ {2}title: Ruckus Conference Program Operations API$/m);
  assert.match(yaml, /^ {2}version: \d+\.\d+\.\d+$/m);
  assert.match(yaml, /^servers:$/m);
  assert.match(yaml, /ruckus\.to/);
  assert.match(yaml, /^paths:$/m);
  assert.match(yaml, /^components:$/m);
  for (const schema of ["JsonObject", "DataEnvelope", "ErrorEnvelope"]) {
    assert.match(yaml, new RegExp(`^ {4}${schema}:$`, "m"), `declares the ${schema} schema`);
  }
  assert.ok(yaml.endsWith("\n"), "ends with a trailing newline");
});

test("every requested group is present as a tag", () => {
  const yaml = doc();
  for (const tag of [
    "events", "cfp-public", "submissions", "reviews", "speakers",
    "schedule-agenda", "comms", "crm", "public-widgets", "sync", "meta",
  ]) {
    assert.match(yaml, new RegExp(`^ {2}- name: ${tag}$`, "m"), `missing tag ${tag}`);
    assert.match(yaml, new RegExp(`tags: \\[${tag}\\]`), `no operation is tagged ${tag}`);
  }
});

test("the document contains no phantom paths", () => {
  const implemented = implementedOperations();
  const documented = documentedOperations(doc());
  assert.ok(documented.size >= 186, `expected the full surface, found ${documented.size} operations`);
  const phantom = [...documented].filter((op) => !implemented.has(op)).sort();
  assert.deepEqual(phantom, [], `documented operations that no route registers: ${phantom.join(", ")}`);
});

test("the document covers the registered route surface", () => {
  const implemented = implementedOperations();
  const documented = documentedOperations(doc());
  const missing = [...implemented].filter((op) => !documented.has(op)).sort();
  // Routes added after this document was generated show up here. The document is
  // regenerated from the same registrations, so a non-empty list means real drift.
  assert.deepEqual(missing, [], `registered routes missing from docs/openapi.yaml: ${missing.join(", ")}`);
});

test("representative paths from every group are documented with their methods", () => {
  const documented = documentedOperations(doc());
  for (const op of [
    // events
    "get /api/events",
    "post /api/events",
    "get /api/events/{eventId}/bootstrap",
    "put /api/events/{eventId}/settings",
    // public CFP
    "get /api/public/events/{slug}/cfp",
    "get /api/public/events/{slug}/cfp/{formId}",
    "get /api/public/speaker-invites/{token}",
    "get /api/public/reviewer-invites/{token}",
    // submissions
    "get /api/events/{eventId}/submissions",
    "get /api/events/{eventId}/submissions/{id}",
    "post /api/events/{eventId}/submissions/{id}/decision",
    "post /api/public/events/{slug}/submissions",
    "put /api/public/events/{slug}/submissions/{id}",
    "get /api/events/{eventId}/forms",
    "post /api/events/{eventId}/forms",
    "put /api/events/{eventId}/forms/{id}",
    // reviews
    "get /api/events/{eventId}/review-rounds",
    "post /api/events/{eventId}/review-assignments",
    "get /api/events/{eventId}/reviewer-queue",
    "post /api/events/{eventId}/reviewer-queue/{assignmentId}/submit",
    "get /api/events/{eventId}/review-results.csv",
    "post /api/events/{eventId}/reviews/{id}/ai-assist",
    // speakers, tasks, deliverables
    "get /api/events/{eventId}/speakers",
    "patch /api/events/{eventId}/speakers/{speakerId}",
    "post /api/events/{eventId}/speakers/{speakerId}/invite",
    "get /api/events/{eventId}/speakers/progress",
    "get /api/speaker/events/{eventId}/home",
    "patch /api/speaker/events/{eventId}/tasks/{id}",
    "get /api/speaker/events/{eventId}/deliverables",
    "post /api/speaker/events/{eventId}/deliverables/{taskId}/upload",
    // schedule and agenda
    "get /api/events/{eventId}/schedule",
    "post /api/events/{eventId}/schedule/move",
    "post /api/events/{eventId}/agenda/publish",
    "patch /api/events/{eventId}/agenda/rooms/{roomId}",
    // comms
    "get /api/events/{eventId}/comms/templates",
    "post /api/events/{eventId}/comms/send",
    "post /api/events/{eventId}/comms/decisions/send",
    "get /api/communications/{id}/calendar.ics",
    // crm
    "get /api/crm/contacts",
    "post /api/crm/contacts/{id}/add-to-event",
    "get /api/crm/dashboard",
    // public widgets and feeds
    "get /e/{slug}/public/sessions",
    "get /e/{slug}/public/feed.json",
    "get /e/{slug}/public/sessions.xml",
    "get /e/{slug}/public/ics",
    "get /embed/{eventId}/sessions",
    "get /public/events/{eventId}/speakers.json",
    // sync
    "post /sync/run",
    "get /sync/runs",
    "post /sync/runs/{id}/retry",
    // meta
    "get /health",
    "get /api/demo",
  ]) {
    assert.ok(documented.has(op), `expected ${op} in docs/openapi.yaml`);
  }
});

test("the document describes its own endpoint under meta", () => {
  const yaml = doc();
  const documented = documentedOperations(yaml);
  assert.ok(documented.has(`get ${OPENAPI_PATH}`), "GET /api/openapi.yaml is documented");
  assert.equal(documented.size, 186, "expected 186 documented operations");

  const block = yaml.slice(yaml.indexOf("  /api/openapi.yaml:"), yaml.indexOf('  "/api/public/events/{slug}/cfp"'));
  assert.match(block, /tags: \[meta\]/, "tagged meta");
  assert.match(block, /application\/yaml:/, "declares an application/yaml response");
  assert.ok(!block.includes("requestBody"), "a GET of the document takes no request body");
  assert.ok(!/\bparameters:/.test(block), "no path or query parameters");
  assert.match(block, /'200':/, "documents the success response");

  // The route really is registered, through the shared constant.
  const app = readFileSync("src/app.ts", "utf8");
  assert.match(app, /app\.get\(OPENAPI_PATH,/, "app.ts registers the route");
  assert.match(app, /OPENAPI_YAML/, "and serves the embedded string");
  assert.match(app, /OPENAPI_CONTENT_TYPE/, "with the yaml content type");
});

test("path and query parameters are declared", () => {
  const yaml = doc();
  // Hono :param notation must never leak into the document.
  const colonParams = yaml.match(/^ {2}"?\/[^\n]*:[A-Za-z]/gm) || [];
  assert.deepEqual(colonParams, [], `Hono style parameters left undeclared: ${colonParams.join(", ")}`);
  assert.match(yaml, /^ {6}- name: eventId$/m);
  assert.match(yaml, /^ {8}in: path$/m);
  assert.match(yaml, /^ {8}- name: filter$/m, "query parameters are declared");
  assert.match(yaml, /^ {10}in: query$/m);
  assert.match(yaml, /^ {8}- name: roundId$/m);
  assert.match(yaml, /^ {8}- name: token$/m);
});

test("operations that accept bodies declare a JSON request body", () => {
  const yaml = doc();
  const blocks = yaml.split(/^ {4}(?=(?:get|post|put|patch|delete):$)/m);
  const mutating = blocks.filter((b) => /^(post|put|patch):/.test(b));
  assert.ok(mutating.length > 60, `expected many mutating operations, found ${mutating.length}`);
  for (const block of mutating) {
    assert.ok(block.includes("requestBody:"), `mutating operation without a request body:\n${block.slice(0, 120)}`);
    assert.ok(block.includes("#/components/schemas/JsonObject"), "request body should reference JsonObject");
  }
});
