# CUE — Conference program ops that judges can run in six minutes

**CUE** is an open-source path off Sessionboard-class SaaS for conference program operations:

**CFP → multi-round review (+ advisory AI) → speaker onboarding → conflict-aware schedule → speaker comms/calendar → HTML publish embeds → honest one-way Accelevents sync.**

Credential-free demo. In-memory seed. Real product shells for organizer, reviewer, and speaker — not a chart gallery and not a sync-only starter.

| | |
|---|---|
| **Product** | CUE (program ops) |
| **Demo event** | AI Engineer Summit (`evt-ai-summit-2026` / slug `ai-engineer-summit`) |
| **Stack** | Hono API · Vite/React/RR · Tailwind · shadcn/Radix-style UI · optional Cloudflare Worker |
| **Default data** | In-process memory (restart resets) |
| **License** | MIT |

**Live demo:** https://cue-program-ops.headley-max.workers.dev

```sh
npm install
npm run dev          # API :8787 + Vite UI (proxied)
npm test
npm run typecheck
npm run build
```

Open the UI (Vite prints the URL, usually `http://localhost:5173`). Land on **/** and pick a persona.

> **Accelevents honesty:** remote HTTP paths and field names are **placeholders**. Default mode is a local mock with **no network**. Do not set `ACCELEVENTS_LIVE=true` until Accelevents confirms auth, endpoints, IDs, and idempotency. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Why this exists

Sessionboard-style tools sprawl into multi-product soup: CFP in one tab, review elsewhere, onboarding in email threads, schedule as a spreadsheet, publish as a JSON feed someone has to restyle. CUE keeps the **ops loop** in one product with role shells:

| Shell | Path prefix | Job |
|---|---|---|
| Demo landing | `/` | Pick organizer / reviewer / speaker |
| Organizer | `/app/*` | Command, inbox, schedule, speakers, comms, publish, forms, settings |
| Reviewer | `/r/*` | Queue, score, guidelines (human decisions only) |
| Speaker portal | `/p/*` | Greenroom: tasks, talks, resources, profile, calendar |
| Public CFP | `/e/:slug/cfp` | Conditional form + board routing |
| Public embeds | `/public/events/:id/{gallery,itinerary}` | Mobile-friendly **HTML** (not JSON-in-iframe) |

---

## The nine requirements (map)

| # | Requirement | Primary UI | Evidence |
|---|---|---|---|
| 1 | CFP + conditional logic + board routing | `/app/forms`, `/e/ai-engineer-summit/cfp` | [docs/REQUIREMENTS-AUDIT.md](docs/REQUIREMENTS-AUDIT.md#1-cfp--conditional-logic--routing) |
| 2 | Speaker portal (tasks, profile, files, resources) | `/p/*` | [audit §2](docs/REQUIREMENTS-AUDIT.md#2-speaker-portal) |
| 3 | Comms + calendar (templates, mock send, ICS) | `/app/comms`, portal home | [audit §3](docs/REQUIREMENTS-AUDIT.md#3-comms--calendar) |
| 4 | Multi-round review + advisory AI | `/app/submissions/:id`, `/r` | [audit §4](docs/REQUIREMENTS-AUDIT.md#4-multi-round-review--advisory-ai) |
| 5 | DnD agenda + server conflicts | `/app/schedule` | [audit §5](docs/REQUIREMENTS-AUDIT.md#5-schedule-dnd--conflicts) |
| 6 | Live onboarding Command | `/app` | [audit §6](docs/REQUIREMENTS-AUDIT.md#6-command--onboarding-ops) |
| 7 | Accelevents **one-way** sync (mock default) | `/app/publish` | [audit §7](docs/REQUIREMENTS-AUDIT.md#7-accelevents-one-way-sync) |
| 8 | Resources with safe HTML embed | `/p/resources/:slug` | [audit §8](docs/REQUIREMENTS-AUDIT.md#8-resources-html-embed) |
| 9 | Embeddable gallery + itinerary (HTML) | `/app/publish`, `/public/...` | [audit §9](docs/REQUIREMENTS-AUDIT.md#9-embeddable-gallery--itinerary) |

Timed judge script: **[docs/WALKTHROUGH.md](docs/WALKTHROUGH.md)** (~6 minutes).

---

## Quick start

### Prerequisites

- Node.js 20+ recommended  
- npm 10+

### Run locally

```sh
npm install
npm run dev
```

| Process | Default | Role |
|---|---|---|
| `tsx watch src/dev.ts` | `http://localhost:8787` | Hono API + HTML embeds + sync |
| `vite` | `http://localhost:5173` | React UI; proxies `/api`, `/public`, `/embed`, `/health`, `/demo`, `/sync` → API |

Override API port with `PORT=8790 npm run dev` (update proxy if you split processes).

### Demo personas (no login)

Chrome is simulated with headers `x-demo-role` and optional `x-demo-speaker`. The UI persona switcher sets them automatically.

| Persona | Role | Starts at | Notes |
|---|---|---|---|
| **Swyx** | organizer | `/app` | Accept/decline, schedule, publish, forms |
| **Ada Reviewer** | reviewer | `/r` | Score queue; cannot accept (organizer-only) |
| **Sam Rivera** | speaker | `/p` | Blocked onboarding tasks (profile/headshot/slides) |
| **Ada Lovelace** | speaker | `/p` | Mostly ready; slides task open |

Deep-linking `/r` or `/p` auto-aligns the effective demo persona to that shell.

### Seed reset

**Default path:** state is **in-memory** in the API process. **Restart the API** (`tsx watch` restart or kill/restart `npm run dev`) reloads the built-in AI Engineer Summit seed. There is no “reset” HTTP route.

**Optional Airtable snapshot:** if `AIRTABLE_TOKEN` + `AIRTABLE_BASE_ID` are set, startup runs `restoreSnapshot()` and may reload the last saved `CompetitionSnapshot` instead of a clean seed. Clear or overwrite that Airtable row (or unset the env vars) when you need a pristine demo. Snapshot save/load is **not** multi-writer production durability.

```sh
curl -s http://localhost:8787/health
# {"ok":true,"mode":"mock","product":"CUE",...}
curl -s http://localhost:8787/demo | head   # seed / current demo snapshot
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Vite + React + React Router  (src/web)                     │
│  shells: Organizer / Reviewer / Portal / Public             │
│  shadcn-style primitives (Button, Dialog, Badge, …)         │
└───────────────────────────┬─────────────────────────────────┘
                            │ fetch + x-demo-role headers
┌───────────────────────────▼─────────────────────────────────┐
│  Hono app  (src/app.ts)                                     │
│  lifecycle store (CFP, review, tasks, comms, resources)     │
│  schedule engine (src/schedule.ts) + MemoryRepository       │
│  canonical projection (src/projection.ts) → sync + public   │
│  sync service (src/sync.ts) → Mock | Http Accelevents client│
│  mailer (src/mailer.ts) · snapshot persistence (optional)   │
└─────────────────────────────────────────────────────────────┘
         │ optional                         │ optional
         ▼                                  ▼
   Cloudflare Worker              AirtableSnapshotPersistence
   (src/index.ts + wrangler)      (when AIRTABLE_* env set)
                                  HttpMailer / Resend-compatible
                                  (when MAILER_* env set)
```

| Area | Location | Notes |
|---|---|---|
| Domain types | `src/domain.ts` | Shared entities |
| Lifecycle / CFP / tasks / comms | `src/lifecycle.ts` | Program store + helpers (portal ops) |
| HTTP surface | `src/app.ts` | All REST + HTML embeds + `persist()` / `deliver()` |
| Schedule conflicts | `src/schedule.ts` | Hard room/speaker; soft capacity |
| Schedule seed + repo | `src/repository.ts` | `MemoryRepository`; `getData` derives **canonical** rows from schedule |
| Canonical / public projection | `src/projection.ts` | Sync + public speakers/sessions; `canonicalScheduleMetrics` for Command |
| Sync orchestration | `src/sync.ts` | dry_run vs live on canonical `getData` |
| Mapping / hashes | `src/mapping.ts` | `accelevents-v1-placeholder` |
| Accelevents clients | `src/accelevents.ts` | Mock default; HTTP placeholder |
| Snapshot persistence | `src/persistence.ts` + `src/airtable.ts` | Default no-op memory; Airtable JSON snapshot when configured |
| Mail | `src/mailer.ts` | Default `MockMailer`; Resend-compatible `HttpMailer` when configured |
| Worker entry | `src/index.ts` | `restoreSnapshot` then `fetch` |
| Local Node entry | `src/dev.ts` | `@hono/node-server` + same adapters |
| UI routes | `src/web/main.tsx` | All shells |
| UI API client | `src/web/lib/api.ts` | Persona + mutations |

**Conventions:** TypeScript strict-ish dual config (`tsconfig.json` NodeNext for API, `tsconfig.web.json` bundler for React). UI uses Tailwind utility classes, CVA button variants, Radix `Slot`, and local “shadcn-style” components in `src/web/components/ui.tsx` (not a full shadcn CLI install). Prefer exact `.js` extensions in API imports (NodeNext).

---

## Mock vs configured behavior (be exact)

| Concern | Default (demo) | Configured path |
|---|---|---|
| **Runtime data** | In-memory lifecycle store + `MemoryRepository` schedule; **zero network** | Same memory model; optional Airtable **snapshot** load/save (not a full multi-tenant DB) |
| **Snapshot persistence** | `MemorySnapshotPersistence` (no-op load/save, zero network) | `AirtableSnapshotPersistence` when `AIRTABLE_TOKEN` **and** `AIRTABLE_BASE_ID` are set — one JSON record per event (`CUE Snapshots` table) |
| **Email** | `MockMailer` — in-process, status `mock_sent`, zero network | `HttpMailer` (Resend-compatible `POST https://api.resend.com/emails`) when `MAILER_API_KEY` **and** `MAILER_FROM` are set; log status becomes `sent` (or stays failed on provider error) |
| **Files** | Filename **receipt** on speaker record; no binary blob store | Not wired — no S3/R2; upload still completes tasks via metadata only |
| **AI review assist** | Deterministic advisory draft scores/notes in-process | Not an external LLM; never auto-accepts |
| **Calendar** | ICS from scheduled sessions; Google/Outlook deep links; portal links in mail are **relative** (`/speaker/:id`) — no localhost hardcode | Same; ICS attached on outbound mail when a session has a slot |
| **Canonical program data** | Schedule projection is source for sync `getData`, public feeds, and Command unscheduled KPI | Same |
| **Embeds** | Allowlisted YouTube/Vimeo only (`safeEmbed`); unsafe URLs stripped | Same rules in API + UI fallback copy |
| **Accelevents** | `MockAcceleventsClient` — in-process create/skip/update, **zero network** even on “Push now (mock)” | `HttpAcceleventsClient` only if `ACCELEVENTS_LIVE=true` **and** base URL, event id, token all set — paths are **placeholders** |
| **Auth** | Demo headers only | Not production auth |
| **D1** | Unused by default | SQL migration exists; full `D1Repository` remains an unimplemented seam |

---

## API surface (summary)

Full path list lives in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#api-surface). Highlights:

- **Health / demo:** `GET /health`, `GET /demo`
- **Organizer:** bootstrap, command, settings, forms, submissions, reviews, decisions, speakers, comms, schedule validate/move, resources CRUD
- **Public:** CFP read/submit by slug; gallery/itinerary **HTML** + JSON feeds
- **Speaker:** home, tasks, profile, files, resources
- **Calendar:** `GET /api/communications/:id/calendar.ics`, `GET /api/calendar/:sessionId.ics`
- **Sync:** `POST /sync/preview`, `POST /sync/run`, `GET /sync/runs`, `GET /sync/runs/:id`, `POST /sync/runs/:id/retry`

Demo identity: `x-demo-role: organizer|reviewer|speaker` and `x-demo-speaker: spk-…`.

---

## Testing

```sh
npm test           # Node test runner via tsx — no network, no credentials
npm run typecheck  # API + web
npm run build      # tsc emit + Vite production bundle
```

| Suite | File | Focus |
|---|---|---|
| Lifecycle API | `test/lifecycle.test.ts` | Workshop CFP + routing, accept→tasks/comms, HTML gallery, command KPIs |
| Lifecycle correctness | `test/lifecycle-correctness.test.ts` | Quota, R1/R2 history, upload-gated tasks, readiness, safe embeds, ICS (Oct slots), no-localhost portal links, Command unscheduled from canonical schedule |
| Schedule engine | `test/schedule.test.ts` | Overlaps, hard conflicts, capacity warnings, public projection |
| Canonical flow | `test/canonical-flow.test.ts` | Accept → schedule → publish eligibility → sync preview; 409 hard conflict |
| Providers | `test/providers.test.ts` | Default persistence/mail zero network; Airtable snapshot upsert round-trip; Resend-compatible mail + ICS attachment |
| Sync | `test/sync.test.ts` | Hash stability, dry-run, create/skip/update, sanitized retry, history |

Run `npm test` for the current pass/fail list; do not hardcode a test count in process docs.

---

## Deploy & optional persistence

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for:

- Cloudflare Worker (`wrangler.toml` name `cue-program-ops`)
- Static UI + API split options
- D1 migration (`migrations/0001_initial.sql`) as a **sync history** seam (unimplemented repository)
- **Wired** optional Airtable snapshot persistence + Resend-compatible mail
- Canonical schedule projection for sync/public/Command metrics
- Secret handling
- Security model and known limitations

### Airtable snapshot and email configuration

The demo default requires no secrets and makes **no external calls** (`test/providers.test.ts`). Adapters are selected in `src/dev.ts` / `src/index.ts` via `configuredPersistence` and `configuredMailer`.

**Airtable snapshot** — set both variables to select `AirtableSnapshotPersistence`:

```sh
export AIRTABLE_TOKEN='pat_...'
export AIRTABLE_BASE_ID='app...'
```

- Startup: `restoreSnapshot()` loads the event snapshot if present (lifecycle + schedule + sync audit).
- Mutations: `persist()` best-effort saves; failures are logged and **do not** roll back in-memory success.
- Create Airtable table **`CUE Snapshots`**. Schema constant: `AIRTABLE_SNAPSHOT_SCHEMA` in `src/persistence.ts`:

| Field | Purpose |
| --- | --- |
| `External ID` | Event ID and upsert merge key |
| `Event ID` | Event identifier |
| `Snapshot` | Versioned JSON (`CompetitionSnapshot`) |
| `Updated At` | Save timestamp |

This is a **single JSON blob per event** for hackathon continuity — not normalized multi-writer production storage.

**Mail** — set both variables to select Resend-compatible `HttpMailer`; otherwise `MockMailer` stays active:

```sh
export MAILER_API_KEY='re_...'
export MAILER_FROM='CUE Program Ops <ops@example.org>'
```

Outbound path: `sendTemplate` → `deliver()` → `mailer.send` (optional `invite.ics` attachment). Portal links in bodies are relative (`/speaker/:speakerId`), not localhost. Credentials stay server-side. Request shape is covered by mocked-fetch tests; confirm your Resend (or compatible) sender policy before production use.

---

## Repository layout

```
├── src/
│   ├── app.ts, lifecycle.ts, schedule.ts, repository.ts, projection.ts, …
│   ├── persistence.ts, mailer.ts, accelevents.ts, sync.ts, …
│   ├── index.ts          # Worker
│   ├── dev.ts            # Local Node server
│   └── web/              # React UI
├── test/                 # Node test suites
├── migrations/           # D1 suggested schema (sync tables)
├── docs/
│   ├── WALKTHROUGH.md    # 6-minute judge script
│   ├── REQUIREMENTS-AUDIT.md
│   └── DEPLOYMENT.md
├── CONTRIBUTING.md
├── LICENSE               # MIT
├── package.json          # cue-program-ops
└── wrangler.toml         # cue-program-ops
```

---

## Competition submission checklist

- [ ] `npm install && npm test && npm run typecheck && npm run build` clean on a fresh machine  
- [ ] `npm run dev` → open `/` → complete [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) without credentials  
- [ ] All **nine** rows in [docs/REQUIREMENTS-AUDIT.md](docs/REQUIREMENTS-AUDIT.md) have UI + code + test pointers  
- [ ] README states mock email/files/AI and **non-production** Accelevents placeholders  
- [ ] No secrets committed; `.env.example` only  
- [ ] LICENSE is MIT; package + wrangler named for **CUE / program-ops**, not a bare sync starter  
- [ ] Screenshots or Loom optional; walkthrough script is the source of truth  
- [ ] Known limitations disclosed in DEPLOYMENT: default memory (not durable), filename-only files, demo headers ≠ auth, Airtable snapshot ≠ multi-writer DB, Accelevents contract unconfirmed  

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version: keep schedule conflict rules strong, keep Accelevents honesty intact, prefer tests for lifecycle and sync paths, don’t commit credentials.

## License

[MIT](LICENSE)
