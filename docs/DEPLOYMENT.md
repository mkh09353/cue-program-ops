# CUE — Deployment, API, security, and persistence

## Local architecture (default)

| Process | Entry | Port | Purpose |
|---|---|---|---|
| API | `src/dev.ts` → `createApp` | `PORT` or **8787** | Hono: REST, HTML embeds, sync, mail, snapshot |
| UI | Vite (`vite.config.ts`) | **5173** (or next free) | React SPA; proxies API paths |

```sh
npm install
npm run dev
npm test && npm run typecheck && npm run build
```

Vite proxy prefixes → API origin:

- `/api`, `/public`, `/embed`, `/health`, `/demo`, `/sync`

Production static files emit to `dist/` via `npm run build` (Vite). API `tsc` emits per `tsconfig.json` (typecheck/build gate; Worker bundles via Wrangler).

Default adapters (no env): `MemoryRepository`, `MemorySnapshotPersistence`, `MockMailer`, `MockAcceleventsClient` — **zero external network**.

---

## Cloudflare Worker

| | |
|---|---|
| Config | `wrangler.toml` |
| Worker name | `cue-program-ops` |
| Main | `src/index.ts` — `restoreSnapshot` then `app.fetch` |
| Compatibility date | see `wrangler.toml` |

```sh
npm install
npx wrangler login          # once per machine
npx wrangler deploy
```

### Secrets / vars

```sh
# Accelevents HTTP (only after contract confirmation)
npx wrangler secret put ACCELEVENTS_TOKEN
# ACCELEVENTS_LIVE=true, ACCELEVENTS_BASE_URL, ACCELEVENTS_EVENT_ID via vars/dashboard

# Optional Airtable snapshot
npx wrangler secret put AIRTABLE_TOKEN
# AIRTABLE_BASE_ID via vars or secret

# Optional Resend-compatible mail
npx wrangler secret put MAILER_API_KEY
# MAILER_FROM via vars (sender string)
```

Worker `Env` (`src/index.ts`): `ACCELEVENTS_*`, `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `MAILER_API_KEY`, `MAILER_FROM`.

**Do not enable Accelevents live HTTP until the placeholder contract in `src/accelevents.ts` / `src/mapping.ts` is replaced with Accelevents-confirmed paths and fields.**

### UI hosting options

1. **Separate static host** (Pages, Netlify, S3+CDN): deploy `dist/` after `vite build`; point API base URL / reverse proxy at the Worker.  
2. **Same origin reverse proxy**: put Worker (or Node) behind a path router that serves SPA + API.  
3. **Local-only demo**: `npm run dev` is enough for judges.

The Worker deployment serves the built Vite SPA and API from one origin. Wrangler's asset configuration falls back to `dist/index.html` for client-side routes while sending `/api/*`, `/public/*`, `/embed/*`, `/health`, `/demo`, and `/sync/*` through the Hono Worker first.

### D1 (optional, sync history seam)

`migrations/0001_initial.sql` defines `sync_links`, `sync_runs`, `sync_run_items`.

```sh
npx wrangler d1 create cue-program-ops
# put database_id into wrangler.toml [[d1_databases]]
npx wrangler d1 migrations apply cue-program-ops --local
npx wrangler d1 migrations apply cue-program-ops --remote
```

**Honest status:** a full `D1Repository` implementing `Repository` is an intentional **unimplemented** seam. Default runtime uses `MemoryRepository`. Optional Airtable snapshot is separate (JSON blob), not D1.

---

## Optional providers (wired, off by default)

Selected by `configuredPersistence` / `configuredMailer` / `configuredClient` in `src/dev.ts` and `src/index.ts`. Empty env → zero external network (`test/providers.test.ts`).

### Airtable event snapshot

| | |
|---|---|
| **Default** | `MemorySnapshotPersistence` — no-op `load`/`save`, no I/O |
| **Configured when** | `AIRTABLE_TOKEN` **and** `AIRTABLE_BASE_ID` are both set |
| **Implementation** | `AirtableSnapshotPersistence` (`src/persistence.ts`) over `AirtableTransport` (`src/airtable.ts`) |
| **Table** | `CUE Snapshots` (`AIRTABLE_SNAPSHOT_SCHEMA`) |
| **Fields** | `External ID` (upsert key), `Event ID`, `Snapshot` (JSON), `Updated At` |
| **Startup** | `restoreSnapshot({ repo, persistence })` reloads lifecycle singleton + schedule + sync audit when a valid `CompetitionSnapshot` exists |
| **Mutations** | `persist()` after state-changing routes — best-effort save; failures log only and do not undo memory |

**What this is:** one versioned JSON blob per event for demo continuity across process restarts.

**What this is not:** multi-writer production durability, row-level entity sync, or a general-purpose Airtable `Repository` for every CUE table.

Transport: lazy credentials (no import-time network), paginated `listAll` with ~210ms pacing, `PATCH` upsert with `performUpsert.fieldsToMergeOn: ["External ID"]`.

### Resend-compatible mail

| | |
|---|---|
| **Default** | `MockMailer` — in-memory messages, `{ status: "mock_sent" }`, zero network |
| **Configured when** | `MAILER_API_KEY` **and** `MAILER_FROM` are both set |
| **Implementation** | `HttpMailer` → `POST https://api.resend.com/emails` with Bearer auth |
| **Delivery path** | `sendTemplate` → `deliver()` → `mailer.send` → communication `status` updated to provider result (`sent` on success) |
| **ICS** | `invite.ics` / `text/calendar` attachment when calendar body exists |
| **Portal links** | Relative `/speaker/:speakerId` in template bodies (no localhost origin) |

Covered by `test/providers.test.ts` (mocked fetch). Confirm Resend (or compatible) domain/sender policy before real sends. No separate SMTP adapter.

### Canonical schedule projection

| | |
|---|---|
| **Module** | `src/projection.ts` |
| **Rule** | Schedule projection is the **canonical event-program source** for outbound sync and public publishing |
| **`MemoryRepository.getData`** | Builds `CanonicalData` via `canonicalFromSchedule` (accepted/published sessions **with slots**) |
| **Command KPI** | `GET .../command` sets `acceptedUnscheduled` from `canonicalScheduleMetrics(repo)` |
| **Public gallery / itinerary / speakers.json** | Eligible public speakers and program sessions from schedule projection |

Lifecycle store still owns CFP, review rounds, onboarding tasks, comms, and resources. Accept flows mirror sessions into the schedule repository so placement stays on the schedule engine. Command unscheduled counts match the schedule board (see `test/lifecycle-correctness.test.ts`).

---

## Accelevents adapter caveat

| Mode | When | Network | Behavior |
|---|---|---|---|
| **Mock** (default) | Anything other than full live config | None | In-process records; create/skip/update/retry for demos and tests |
| **HTTP “live”** | `ACCELEVENTS_LIVE=true` **and** `ACCELEVENTS_BASE_URL` **and** `ACCELEVENTS_EVENT_ID` **and** `ACCELEVENTS_TOKEN` | Yes | `HttpAcceleventsClient` **placeholder** REST shape |

Placeholder assumptions (**must** be re-validated with Accelevents):

- `Authorization: Bearer <token>`  
- `Idempotency-Key` header  
- `POST /events/{eventId}/{entityType}s` create  
- `PUT /events/{eventId}/{entityType}s/{remoteId}` update  
- JSON body/response `{ id }`  

Mapping version string: **`accelevents-v1-placeholder`**.

One-way rules:

1. Local canonical data (`getData` ← schedule projection) is source of truth  
2. Unchanged payload hash → skip  
3. Known remote id + changed hash → update  
4. No link → create  
5. Link saved only after remote success  
6. No remote delete / no remote→local ingest  

`GET /health` reports `"mode":"mock"|"configured"` and `"product":"CUE"`.

**This repo does not claim production Accelevents API compatibility until that contract is confirmed.**

---

## Mock vs configured matrix

| Feature | Default | Configured path |
|---|---|---|
| Lifecycle + schedule runtime | In-process memory | Same; optional Airtable **snapshot** restore/save |
| Snapshot persistence | `MemorySnapshotPersistence` (no-op) | `AirtableSnapshotPersistence` if `AIRTABLE_TOKEN` + `AIRTABLE_BASE_ID` |
| Email | `MockMailer` → log `mock_sent` | `HttpMailer` (Resend-compatible) if `MAILER_API_KEY` + `MAILER_FROM` → log `sent` |
| File uploads | Filename receipt only | No binary object store wired |
| AI assist | Deterministic local draft | Not an external LLM |
| Canonical program / sync payload | `canonicalFromSchedule` via `repo.getData` | Same |
| Command unscheduled KPI | `canonicalScheduleMetrics` | Same |
| Resource embeds | `safeEmbed` allowlist | Same |
| Accelevents | Mock client | HTTP client iff all four env gates pass (**contract unconfirmed**) |
| AuthN/Z | `x-demo-role` / `x-demo-speaker` | Replace before any real deployment |
| D1 | Unused | Migration only; `D1Repository` unimplemented |

Env template: `.env.example`.

---

## API surface

Base URL local: `http://localhost:8787`.

### Meta

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ ok, mode, product }` |
| GET | `/demo` | Current demo/lifecycle snapshot |

### Organizer / shared event API

| Method | Path |
|---|---|
| GET | `/api/events/:eventId/bootstrap` |
| GET | `/api/events/:eventId/command` |
| PUT | `/api/events/:eventId/settings` |
| GET | `/api/events/:eventId/forms` |
| GET | `/api/events/:eventId/forms/:id` |
| PUT | `/api/events/:eventId/forms/:id` |
| GET | `/api/events/:eventId/submissions` |
| GET | `/api/events/:eventId/submissions/:id` |
| POST | `/api/events/:eventId/submissions/:id/decision` |
| GET | `/api/events/:eventId/reviews` |
| POST | `/api/events/:eventId/reviews/:id` |
| POST | `/api/events/:eventId/reviews/:id/ai-assist` |
| GET | `/api/events/:eventId/speakers` |
| GET | `/api/events/:eventId/resources` |
| POST | `/api/events/:eventId/resources` |
| PUT | `/api/events/:eventId/resources/:id` |
| DELETE | `/api/events/:eventId/resources/:id` |
| GET | `/api/events/:eventId/comms/templates` |
| PUT | `/api/events/:eventId/comms/templates/:id` |
| GET | `/api/events/:eventId/comms/log` |
| POST | `/api/events/:eventId/comms/send` |
| POST | `/api/events/:eventId/comms/reminders/plan` |
| GET | `/api/events/:eventId/dashboard` |
| GET | `/api/events/:eventId/schedule` |
| POST | `/api/events/:eventId/schedule/validate` |
| POST | `/api/events/:eventId/schedule/move` |

### Public CFP (slug)

| Method | Path |
|---|---|
| GET | `/api/public/events/:slug/cfp` |
| POST | `/api/public/events/:slug/submissions` |
| GET | `/api/public/events/:slug/speakers` |
| GET | `/api/public/events/:slug/schedule` |

### Speaker

| Method | Path |
|---|---|
| GET | `/api/speaker/events/:eventId/home` |
| GET | `/api/speaker/events/:eventId/tasks` |
| PATCH | `/api/speaker/events/:eventId/tasks/:id` |
| PUT | `/api/speaker/events/:eventId/profile` |
| POST | `/api/speaker/events/:eventId/files` |
| GET | `/api/speaker/events/:eventId/resources` |
| GET | `/api/speaker/events/:eventId/resources/:slug` |

### Calendar

| Method | Path |
|---|---|
| GET | `/api/communications/:id/calendar.ics` |
| GET | `/api/calendar/:sessionId.ics` |

### HTML embeds & JSON feeds

| Method | Path | Type |
|---|---|---|
| GET | `/public/events/:eventId/gallery` | HTML |
| GET | `/public/events/:eventId/itinerary` | HTML |
| GET | `/public/events/:eventId/itinerary.json` | JSON |
| GET | `/public/events/:eventId/speakers.json` | JSON |
| GET | `/embed/:eventId/gallery` | redirect → public gallery |
| GET | `/embed/:eventId/itinerary` | redirect → public itinerary |

### Sync

| Method | Path | Body |
|---|---|---|
| POST | `/sync/preview` | `{ "eventId" }` dry-run |
| POST | `/sync/run` | `{ "eventId" }` live vs configured client |
| GET | `/sync/runs?eventId=` | history |
| GET | `/sync/runs/:id` | detail |
| POST | `/sync/runs/:id/retry` | failed items |

### Demo headers

```http
x-demo-role: organizer | reviewer | speaker
x-demo-speaker: spk-sam
```

Missing speaker header may fall back to a default speaker on speaker routes (demo convenience). Organizer-only mutations return **403** for other roles.

---

## Security model and limitations

**What exists**

- Role checks on sensitive routes via demo headers  
- `safeEmbed` allowlist for resource iframes (YouTube/Vimeo-style hosts)  
- Sync error sanitization (no Bearer tokens in stored errors)  
- No destructive Accelevents deletes in the one-way service  
- AI assist cannot call decision endpoint by itself  
- Optional mail/snapshot credentials stay server-side; default path needs none  
- Portal links in mail are origin-relative (`/speaker/:id`), not hardcoded localhost  

**What does not exist (do not ship to real users as-is)**

- Real authentication / sessions / CSRF  
- Authorization beyond demo headers (trivial to spoof)  
- Multi-tenant isolation  
- Rate limiting / bot protection on public CFP  
- Default durable multi-writer database (memory; Airtable snapshot is a single JSON blob, not production durability)  
- Binary file/object storage (filename receipts only)  
- Virus scanning on uploads or full PII DPA tooling  
- Confirmed Accelevents production API  

**Seed reset**

- Default: restart the API process → built-in seed.  
- With Airtable configured: startup may restore the last snapshot; clear that row or unset env for a pristine seed.  
- No public “wipe” endpoint (avoids accidental cross-judge wipes without auth).

**Known product caveats for operators**

- Lifecycle owns CFP/review/onboarding/comms; **schedule projection is canonical** for program placement, public feeds, sync payloads, and Command unscheduled KPIs  
- Filename-only uploads are intentional for the demo  
- Airtable snapshot is best-effort continuity, not multi-writer production storage  
- In-memory state is per process; horizontal scale without sticky memory, snapshot restore, or a real DB will fork realities  
- Accelevents HTTP remains placeholder until the vendor contract is confirmed  

---

## UI route map (SPA)

| Path | Shell |
|---|---|
| `/`, `/demo` | Landing |
| `/app` | Command |
| `/app/submissions`, `/app/submissions/:id` | Inbox / Review Studio |
| `/app/schedule` | Schedule |
| `/app/speakers`, `/app/speakers/:id` | Speakers |
| `/app/comms` | Comms |
| `/app/publish` | Publish + sync |
| `/app/forms`, `/app/forms/:id` | CFP builder |
| `/app/settings` | Settings |
| `/r`, `/r/done`, `/r/guidelines`, `/r/:submissionId` | Reviewer |
| `/p`, `/p/talks`, `/p/tasks`, `/p/tasks/:id`, `/p/resources`, `/p/resources/:slug`, `/p/profile` | Portal |
| `/e/:slug/cfp` | Public CFP |

---

## Competition deploy smoke checklist

1. Fresh clone, `npm install`  
2. `npm test && npm run typecheck && npm run build`  
3. `npm run dev` → `/health` shows `product:"CUE"`, `mode:"mock"`  
4. Complete [WALKTHROUGH.md](WALKTHROUGH.md) with **no** provider env vars  
5. Optional: configure Airtable/mail only on non-judge or explicitly labeled environments  
6. If deploying Worker: `npx wrangler deploy`, hit `/health` on the worker URL  
7. Confirm no `ACCELEVENTS_LIVE=true` on judge-facing deploys unless contract is real  
