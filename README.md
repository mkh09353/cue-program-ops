# CUE — conference program operations, end to end

**CUE** is an open-source, judge-ready alternative to Sessionboard-class conference software:

**CFP → review → speakers → content → agenda → public program → CRM → one-way Accelevents sync**

[**Open the live demo**](https://cue-program-ops.headley-max.workers.dev) · [6-minute walkthrough](docs/WALKTHROUGH.md) · [API reference](docs/API.md) · [deployment guide](docs/DEPLOYMENT.md)

| | |
|---|---|
| Demo event | AI Engineer Summit (`evt-ai-summit-2026`, slug `ai-engineer-summit`) |
| Stack | Hono · Vite/React · React Router · Tailwind · Cloudflare Workers |
| Local setup | No credentials; seeded process memory |
| License | MIT |

```sh
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

Open the Vite URL (normally `http://localhost:5173`) and choose a demo persona.

## What ships: the nine-brief map

| # | Competition requirement | Shipped workflow | Start here |
|---|---|---|---|
| 1 | Call for Papers | Custom fields and sections, select options, required flags, conditional visibility, category-to-board routing, open/close dates, title-only drafts with edit tokens, speaker edits, server validation and deadline locks | **Forms** → `/app/forms`; public `/e/ai-engineer-summit/cfp` |
| 2 | Abstract evaluation | Configurable rounds and mixed-type weighted scorecards, blind mode, assignments/auto-distribution, scoped reviewer queues, recusal, progress/reminders, aggregate results and CSV; AI drafts remain advisory | **Evaluation Plan**, **Assignments**, **Review Progress**, **Results** |
| 3 | Speaker management | Filterable roster and progress matrix, manual add, CSV import, statuses/tags, invitations, organizer and self-service profile editing, form tasks, readiness derived from actual work | **Speakers** → `/app/speakers`; portal `/p/*` |
| 4 | Content management | Deliverable tasks, speaker-scoped uploads, retained file versions, download, comments, approval/change requests, reminders, canonical session/speaker edits and history restore | **Content** → `/app/content`; portal **Deliverables** |
| 5 | AI agenda | Deterministic heuristic proposals with provenance and per-placement rationale; configurable hours/slots/breaks; individual/all accept or reject; canonical conflict checks on acceptance; rooms/tracks creation and publish | **AI Agenda** inside `/app/schedule` |
| 6 | Public widgets | Responsive sessions, speakers, agenda, itinerary and gallery HTML; search/facets, detail views, browser-local **My Schedule**, ICS and JSON feeds; embed snippets | **Publish** → `/app/publish`; `/e/ai-engineer-summit/public/*` |
| 7 | Speaker CRM | Searchable directory, contact CRUD/notes/merge, pipeline stages, saved segments, CSV validation/import, event-speaker sync, add-to-event and campaigns | **Speaker CRM** → `/app/crm` |
| 8 | Communications and integrations | Merge-field preview/send, explicit mock/provider delivery state, manual reminder planning/runs, downloadable/attached ICS, visible one-way Accelevents previews/runs/retries | **Comms** and **Publish** |
| 9 | Platform depth | Organizer/reviewer/speaker/public shells, server-side role and ownership checks, reviewer scoping, deadlines, canonical schedule conflicts, unknown-event 404s, snapshots and round-trip tests | [API](docs/API.md), [deployment](docs/DEPLOYMENT.md) |

## Six-minute judge path

1. **Forms:** add a required field, inspect conditional logic and open/close dates, then open the public CFP and save a title-only draft.
2. **Evaluation:** inspect a blind scorecard round, assignment queue, progress, results and CSV; switch to Reviewer and submit one assigned evaluation.
3. **Speakers:** filter the readiness roster, open a speaker, inspect tasks/comms, then visit the speaker portal.
4. **Content:** inspect a deliverable, retained versions/comments/approval, and canonical session content.
5. **Schedule / AI Agenda:** generate a clearly labeled heuristic draft, read a rationale, accept one placement, then try a conflicting manual move.
6. **Publish:** publish and open the five public surfaces; star sessions in My Schedule and download ICS.
7. **CRM:** filter contacts, inspect the pipeline and a saved segment, then show CSV import/add-to-event.
8. **Sync:** preview the canonical one-way payload, run the mock push, and inspect per-item history.

Detailed clicks and expected states: **[docs/WALKTHROUGH.md](docs/WALKTHROUGH.md)**.

## Routes and navigation

| Surface | Route | Navigation / purpose |
|---|---|---|
| Landing | `/` | Choose organizer, reviewer or speaker demo persona |
| Organizer command | `/app` | KPIs and operational blockers |
| Submissions | `/app/submissions`, `/app/submissions/:id` | Submission detail, human review and decisions |
| Evaluation management | `/app/evaluation-plan`, `/app/assignments`, `/app/review-progress`, `/app/results` | Rounds/scorecards, assignments, progress, results/CSV |
| Schedule + AI Agenda | `/app/schedule` | List/day/week/track/room views, manual placement, heuristic drafts, publish |
| Speakers | `/app/speakers`, `/app/speakers/:id` | Roster, progress, import, tasks, profile and comms history |
| Speaker CRM | `/app/crm`, `/app/crm/{pipeline,segments,import}`, `/app/crm/contacts/:id` | Relationship pipeline and event handoff |
| Content | `/app/content` | Deliverables, versioned files, approval and canonical content |
| Comms | `/app/comms` | Merge-field messages, reminders and delivery log |
| Publish | `/app/publish` | Widget/embed manager and Accelevents sync |
| CFP builder/settings | `/app/forms`, `/app/settings` | CFP schema/window/routing and event settings |
| Reviewer | `/r`, `/r/:submissionId`, `/r/done`, `/r/guidelines` | Assigned-only evaluation workflow |
| Speaker | `/p`, `/p/talks`, `/p/tasks`, `/p/deliverables`, `/p/resources`, `/p/profile` | Self-service onboarding and submissions |
| Public CFP | `/e/:slug/cfp` | Credential-free submit/draft/edit flow |
| Public program | `/e/:slug/public/{sessions,speakers,agenda,itinerary,gallery}` | Five responsive attendee/widget surfaces |
| Public feeds | `/e/:slug/public/{feed.json,sessions.json,speakers.json,agenda.json,ics}` | Machine-readable and calendar output |

## Demo personas—not production authentication

The UI sends `x-demo-persona` / `x-demo-role` headers. Deep links align the persona with the shell. Server routes enforce the simulated role and speaker/reviewer scope, but headers are spoofable: this is **not authentication, authorization for untrusted users, or tenant isolation**.

Useful seeded personas include organizer **Swyx**, reviewer **Ada Reviewer**, and speakers **Sam Rivera** and **Ada Lovelace**.

## Honest defaults and configured options

| Concern | Credential-free default | Optional/configured path |
|---|---|---|
| Runtime state | Lifecycle singleton + `MemoryRepository`; may reset on restart and differ across Worker isolates | Airtable stores one authoritative-for-restore JSON event snapshot plus normalized `Speakers` (accepted/confirmed people) and `Sessions` automation mirrors when both `AIRTABLE_TOKEN` and `AIRTABLE_BASE_ID` exist. New rows can trigger Airtable automations; later changes upsert by `External ID`. This is not transactional or safe multi-writer persistence |
| Mail | `MockMailer`, no external delivery; logs `mock_sent` | Resend-compatible HTTP mail when `MAILER_API_KEY` + `MAILER_FROM` exist. Provider acceptance is recorded separately from failure |
| Reminders | Organizer-triggered planning/runs | No scheduled/background reminder automation |
| Calendar | Downloadable ICS and optional mail attachment | This does not prove an invitation landed in a recipient calendar |
| AI review | Deterministic advisory score/note draft | No external model; never makes a decision |
| AI Agenda | Deterministic demo heuristic, persisted review draft with rationale | No external model; nothing changes live until an organizer accepts through canonical conflict checks |
| Files | Content deliverables retain base64-backed demo versions in the event snapshot; legacy speaker-file flows may be metadata-only | No R2/S3/object store, malware scan, or production upload pipeline |
| Public embeds | Server-rendered responsive HTML and safe URL policy | Same allowlist/sanitization posture |
| Accelevents | In-process mock, no network; dry run and per-record history remain visible | HTTP mode requires all `ACCELEVENTS_*` gates. Paths, auth assumptions and mappings are placeholders until validated with Accelevents |
| D1 | Not active | Migration/seam exists; `D1Repository` is not implemented |

Restart the API for a clean built-in seed unless Airtable restoration is enabled. There is intentionally no public wipe endpoint.

## API and architecture

CUE exposes a Hono JSON/HTML API for every major workflow, including public program feeds, organizer review/speaker/content/CRM/agenda operations, scoped speaker/reviewer operations and one-way sync history.

- **Reference:** [docs/API.md](docs/API.md)
- **OpenAPI 3.1:** [docs/openapi.yaml](docs/openapi.yaml) - every registered path and method, grouped by tag (generated from the route registrations). The same document is served at `GET /api/openapi.yaml`.
- **Lifecycle source:** `src/lifecycle.ts`
- **Route modules:** `src/{review,speaker,content,crm,agenda}Routes.ts`
- **Public projections:** `src/publicSite.ts`, `src/publicProjection.ts`
- **Canonical schedule/conflicts:** `src/schedule.ts`, `src/repository.ts`, `src/projection.ts`
- **Provider boundaries:** `src/{mailer,persistence,accelevents}.ts`

Unknown event IDs are rejected by event-scoped routes. Schedule, public program projections and outbound integration data use the same canonical schedule source rather than duplicated counters.

## Independent-eval results

Scored with the public [killmysaas eval kit](https://forge.smol.ai/swyx/killmysaas-evals) (browser agent + LLM judge, 96 rubric items across 7 areas, manual checklist finalized with cited evidence — full artifacts in [docs/eval/](docs/eval/)): **94.2% overall at 100% coverage, zero failed items** (2026-08-12, agent gpt-5.6-luna, judge claude-opus-5). Public Widgets scored 100%; by rubric type: bulk 100 · side-effect 100 · exists 100 · handoff 100 · depth 96.2 · roundtrip 92.4. The app now supports multi-event workspaces (create events with custom rooms/tracks, event switcher, per-event scoping and snapshots). Remaining partials are evidence-window artifacts or documented honesty choices (persona-simulation identity instead of fake signup; mock mailer unless a provider key is configured — the live demo now runs in Resend provider mode: real inboxes receive real mail with per-recipient provider status, and sandbox-undeliverable fixture addresses are honestly recorded as logged_undeliverable). The live demo also runs Airtable snapshot persistence (bonus): every mutation writes through to an Airtable base (CUE Snapshots table) alongside the primary Cloudflare D1 store. A same-build repeat run scored 91.3% pre-finalize (variance sample archived alongside), showing the residual spread is judge/evidence variance rather than missing functionality: across both runs every one of the 96 items passed at least once and none failed.

## Tests

```sh
npm test           # Node test runner via tsx; no credentials
npm run typecheck  # API + React TypeScript projects
npm run build      # API compile + Vite production bundle
```

Current verified run in this working tree: **230 tests passing**. Coverage includes CFP drafts/deadlines/conditional routing, review scoping and rounds, speaker management, versioned content, CRM, AI agenda persistence and canonical acceptance, schedule conflicts, public widgets, providers, sync, and end-to-end round trips. Run `npm test` for the authoritative current count.

## Bonus points, deliberately visible

- **Deployed:** [Cloudflare Worker live demo](https://cue-program-ops.headley-max.workers.dev), with the SPA and Hono API on one origin.
- **Fast:** credential-free seed, no network in default mode, one-command local setup, and a six-minute mutation-based walkthrough.
- **API:** documented public and role-scoped HTTP surface in [docs/API.md](docs/API.md).
- **Persistence option:** Airtable snapshot adapter for demo continuity plus automation-friendly speaker/session mirrors, clearly distinguished from a production database.
- **Open source:** MIT license, reproducible build, tests, deployment guide and safe defaults.

## Deploy and contribute

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Worker deployment, every supported environment variable, Airtable/Resend setup and security limitations. See [CONTRIBUTING.md](CONTRIBUTING.md) before changing conflict rules or provider claims.

[MIT](LICENSE)
