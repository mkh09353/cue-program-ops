# Ruckus deployment and runtime configuration

**Live competition deployment:** https://cue-program-ops.headley-max.workers.dev

## Local

```sh
npm install
npm run dev
npm test && npm run typecheck && npm run build
```

| Process | Entry | Default | Purpose |
|---|---|---|---|
| API | `src/dev.ts` | `http://localhost:8787` | Hono REST/HTML, snapshots, providers and sync |
| UI | Vite | `http://localhost:5173` | React SPA; proxies API prefixes |

Vite proxies `/api`, `/public`, `/embed`, `/health` and `/sync` to the API. With no environment configuration Ruckus uses process memory, `MockMailer` and `MockAcceleventsClient`; no provider credentials or external network are required.

## Cloudflare Worker

| Setting | Value |
|---|---|
| Config | `wrangler.toml` |
| Worker | `cue-program-ops` |
| Entry | `src/index.ts` → single named `CueState` Durable Object for API traffic |
| Static binding | `ASSETS` → `dist/` |
| SPA fallback | `dist/index.html` |

```sh
npm run build
npx wrangler login
npx wrangler deploy
```

The Worker sends API/public/sync paths to the Durable Object named `primary`; other paths go directly to the Vite SPA asset binding. That one object owns the in-memory Hono runtime, choosing one consistent live state over horizontal API scale for the competition demo. Requests no longer land on independent stateless Worker isolates with divergent repositories.

`CueState` deliberately makes **zero Durable Object storage calls**. The named object provides one live state owner, while the `DB` D1 binding durably stores a whole-event snapshot so eviction, restart, and redeploy can restore it. D1 writes are trailing-edge coalesced and mutation responses await the final flush. If Airtable is configured it is an optional secondary snapshot. Local `npm run dev` and Node tests still use configured Airtable or memory persistence and require no D1 binding.

## Environment variables

No new provider variables were introduced by review management, content, CRM, CFP depth, public widgets or AI Agenda. Those features use lifecycle/schedule state and the existing persistence boundary.

| Variable | Required | Default / selection rule | Accurate use |
|---|---:|---|---|
| `PORT` | No, local only | `8787` | Node API listen port; update proxy setup if changed independently |
| `AIRTABLE_TOKEN` | No | Off unless token **and** base ID are present | Airtable API bearer credential for event snapshot |
| `AIRTABLE_BASE_ID` | No | Off unless base ID **and** token are present | Airtable base containing `CUE Snapshots` |
| `MAILER_API_KEY` | No | Off unless key **and** sender are present | Resend-compatible HTTP mail credential |
| `MAILER_FROM` | No | Off unless sender **and** key are present | Verified sender string/address |
| `ACCELEVENTS_LIVE` | No | `false` | Must equal `true`, with all three values below, to select HTTP client |
| `ACCELEVENTS_BASE_URL` | No | Mock unless full gate is satisfied | Placeholder API origin |
| `ACCELEVENTS_EVENT_ID` | No | Mock unless full gate is satisfied | Placeholder remote event identifier |
| `ACCELEVENTS_TOKEN` | No | Mock unless full gate is satisfied | Placeholder bearer credential |
| `ASSETS` | Worker binding | Set by Wrangler | Fetcher binding for built SPA files; not a user secret |
| `CUE_STATE` | Worker Durable Object binding | Set by Wrangler | Routes all API traffic to the single in-memory `CueState` instance named `primary`; no DO storage used |
| `DB` | Worker D1 binding | Set by Wrangler | Primary durable whole-event snapshot used to restore the named DO after eviction/redeploy |

Reference template: [`.env.example`](../.env.example). Do not commit populated credentials.

### Wrangler examples

```sh
# Optional demo-continuity snapshot
npx wrangler secret put AIRTABLE_TOKEN
# Set AIRTABLE_BASE_ID in Worker vars/dashboard or as a secret.

# Optional Resend-compatible mail
npx wrangler secret put MAILER_API_KEY
# Set MAILER_FROM in vars/dashboard after sender verification.

# Accelevents—only after validating its real contract
npx wrangler secret put ACCELEVENTS_TOKEN
# Set ACCELEVENTS_LIVE=true, ACCELEVENTS_BASE_URL and ACCELEVENTS_EVENT_ID in vars.
```

There is no external LLM environment variable: review assist and AI Agenda are deterministic local demo heuristics.

## Airtable snapshot option

Selected only when `AIRTABLE_TOKEN` and `AIRTABLE_BASE_ID` are both set.

| | |
|---|---|
| Implementation | `AirtableSnapshotPersistence` over `AirtableTransport` |
| Table | `CUE Snapshots` |
| Fields | `External ID`, `Event ID`, `Snapshot`, `Updated At` |
| Unit | One versioned `CompetitionSnapshot` JSON record per event; optional durability for the in-memory Durable Object |
| Includes | Lifecycle state (CFP, review, speakers, content, CRM, AI Agenda, comms), canonical schedule and sync history |
| Startup | `restoreSnapshot()` imports the latest matching snapshot |
| Mutation behavior | Best-effort save; error is logged and does not roll back valid in-memory mutation |

`CUE Snapshots` remains the only Airtable restore source. After that blob upsert succeeds, Ruckus also writes normalized `Speakers` and `Sessions` tables as automation-friendly mirrors. `Speakers` contains `Name`, `Email`, `Title`, `Company`, `Bio`, `Workflow Status`, `Event`, and the speaker ID in `External ID`. `Sessions` contains `Title`, `Abstract`, `Status`, `Track`, `Room`, `Starts At`, `Ends At`, comma-separated `Speakers`, `Event`, and the session ID in `External ID`. A newly accepted/confirmed speaker or new canonical session creates a row, so Airtable automations can trigger; later saves update the same row by its stable `External ID`. The normalized tables auto-create through Airtable's Metadata API when the token has `schema.bases:write`. Existing tables need only normal record access.

Normalized writes are best-effort and independent per table: metadata or row failures are logged and do not invalidate a successful snapshot save, and they are not transactional with the blob or D1. Ruckus does not currently delete or reconcile stale mirror rows when an entity stops qualifying or disappears. D1 remains the Worker's primary snapshot store; Airtable remains a secondary recovery copy and operational mirror, not tenant-isolated production storage.

## D1 snapshot persistence

Database `cue-snapshots` contains one `snapshots` row per event (`event_id`, JSON `payload`, and `updated_at`). Apply `migrations/0001_cue_snapshots.sql` with `npx wrangler d1 migrations apply cue-snapshots --remote`. The single named DO restores this row before serving requests. Saves arriving within the 1.75-second window are coalesced to the latest snapshot, and all waiting mutation calls resolve only after that latest state is committed. This snapshot architecture is appropriate for the demo but is not normalized multi-tenant persistence.

## Mail option

Selected only when `MAILER_API_KEY` and `MAILER_FROM` are both set.

| Mode | Behavior |
|---|---|
| Default `MockMailer` | No external network; communication records become `mock_sent` |
| Configured `HttpMailer` | Resend-compatible `POST https://api.resend.com/emails`; provider-accepted response becomes `sent`; failures remain visible |

ICS may be downloaded or attached as `text/calendar` when schedule data exists. Neither `mock_sent` nor a downloadable ICS means an invitation was delivered into a speaker’s calendar. Reminders are manually triggered API/UI actions; no scheduler/cron is wired.

## Accelevents warning

The integration is intentionally **one-way** and mock-first.

| Mode | Selection | Network |
|---|---|---|
| Mock | Any incomplete configuration or `ACCELEVENTS_LIVE !== "true"` | None |
| HTTP placeholder | `ACCELEVENTS_LIVE=true` plus base URL, remote event ID and token | Yes |

Unverified placeholder assumptions in `src/accelevents.ts` / `src/mapping.ts` include:

- Bearer authentication;
- `Idempotency-Key` header;
- `POST /events/{eventId}/{entityType}s`;
- `PUT /events/{eventId}/{entityType}s/{remoteId}`;
- response shape `{ id }`;
- mapping version `accelevents-v1-placeholder`.

Do not enable this against production until Accelevents confirms authentication, URLs, identifiers, fields, rate limits, reconciliation and idempotency. Dry runs, per-record outcomes, retries and history remain visible in either mode. There is no remote-to-local import or remote delete.

## Canonical state and publishing

- Schedule projection is authoritative for session placement, rooms/tracks, public program output, command schedule KPIs and Accelevents payloads.
- Accepted submissions are mirrored into schedule sessions; manual and AI-accepted placements use the same server conflict boundary.
- Public widgets include only canonical published data.
- Content approval/edit paths update the canonical speaker/session projection.
- AI Agenda generation only stores a proposal; it never publishes or moves a session until an organizer accepts.

## D1 status

`migrations/0001_initial.sql` and a `D1Repository` seam exist, but the repository implementation is intentionally unavailable. No active D1 persistence should be inferred from the migration.

A future deployment can bind D1 after implementing and testing the full repository:

```sh
npx wrangler d1 create cue-program-ops
npx wrangler d1 migrations apply cue-program-ops --local
npx wrangler d1 migrations apply cue-program-ops --remote
```

## API and smoke test

Full endpoint/role documentation is in **[API.md](API.md)**.

```sh
curl -s https://cue-program-ops.headley-max.workers.dev/health
curl -s https://cue-program-ops.headley-max.workers.dev/e/ai-engineer-summit/public/feed.json | head
```

Before submission/deployment:

1. `npm install`
2. `npm test`
3. `npm run typecheck`
4. `npm run build`
5. `/health` reports `product: "Ruckus"` and expected mock/configured mode
6. Complete [WALKTHROUGH.md](WALKTHROUGH.md) without provider credentials
7. Confirm no accidental `ACCELEVENTS_LIVE=true`
8. Confirm the public sessions, speakers, agenda, itinerary and gallery surfaces render

## Security and production limitations

What is enforced in this demo:

- known persona resolution and role checks on sensitive organizer routes;
- speaker ownership and reviewer-assignment scoping;
- CFP deadline, visible-required-field and edit-token checks;
- event ID validation/unknown-event 404 on event-scoped modules;
- canonical room, track, session and speaker conflict checks;
- allowlisted resource embeds and escaped public HTML;
- no destructive/reverse Accelevents synchronization;
- visible provider and persistence failures.

What is not production-ready:

- real authentication, sessions, password recovery, CSRF protection or tenant isolation;
- durable normalized database/object storage and horizontal consistency;
- malware scanning and production file lifecycle;
- scheduled reminder automation;
- guaranteed email/calendar delivery;
- a real LLM integration (both AI surfaces are labeled heuristics);
- validated Accelevents production compatibility;
- broad rate limiting, audit/compliance and PII governance.

The live URL is a testable competition demo, not a claim that these missing controls exist.
