# Ruckus — Requirements audit

Evidence map for the nine competition requirements. Paths are repo-relative. Tests are named, not counted (run `npm test` for current totals).

**Demo constants**

| Key | Value |
|---|---|
| Event id | `evt-ai-summit-2026` |
| Public slug | `ai-engineer-summit` |
| UI router | `src/web/main.tsx` |
| HTTP app | `src/app.ts` |
| Lifecycle store | `src/lifecycle.ts` |
| Schedule engine | `src/schedule.ts` |

---

## 1. CFP + conditional logic + routing

| | |
|---|---|
| **Intent** | Public call-for-proposals with field visibility rules and category → review-board routing. |
| **UI routes** | `/app/forms`, `/app/forms/:id` — builder (copy, `visibleWhen`, routes, logic preview). `/e/ai-engineer-summit/cfp` — public multi-step CFP. |
| **UI code** | `src/web/pages/PublishFormsSettings.tsx` (`FormsPage`); `src/web/pages/PublicReviewerPages.tsx` (`PublicCfpPage`); markdown via `src/web/lib/utils.ts` `renderSimpleMarkdown`. |
| **API** | `GET/PUT /api/events/:eventId/forms/:id`; `GET /api/public/events/:slug/cfp`; `POST /api/public/events/:slug/submissions`. |
| **Domain** | Form schema + `visibleWhen` + `routes` in `src/lifecycle.ts` seed; `validateCfpSubmission`. |
| **Tests** | `test/lifecycle.test.ts` — “public CFP workshop conditional + board routing”; `test/lifecycle-correctness.test.ts` — invalid category + email quota. |
| **Judge proof** | Set Format=Workshop on public CFP → plan/duration appear; category maps to board label on review step; builder can edit condition and Save. |

---

## 2. Speaker portal

| | |
|---|---|
| **Intent** | Accepted speakers complete onboarding (profile, headshot, slides), see talks, resources, readiness. |
| **UI routes** | `/p`, `/p/talks`, `/p/tasks`, `/p/tasks/:id`, `/p/resources`, `/p/resources/:slug`, `/p/profile`. Shell: `PortalShell`. |
| **UI code** | `src/web/pages/PortalPages.tsx`; persona lock in `src/web/components/shells.tsx`. |
| **API** | `GET /api/speaker/events/:eventId/home`; `PATCH .../tasks/:id`; `PUT .../profile`; `POST .../files`; `GET .../resources`, `.../resources/:slug`. Headers: `x-demo-role: speaker`, `x-demo-speaker`. |
| **Domain** | Tasks, files (filename receipts), readiness helpers in `src/lifecycle.ts`. |
| **Tests** | `test/lifecycle.test.ts` — accept creates tasks; `test/lifecycle-correctness.test.ts` — ownership, required-upload integrity, query impersonation rejected. |
| **Judge proof** | As Sam: home shows Not ready + Up next; complete profile/upload; file tasks cannot skip without upload in UI. |
| **Honest limits** | No binary object storage; upload stores filename/metadata only. |

---

## 3. Comms + calendar

| | |
|---|---|
| **Intent** | Templated speaker email with delivery log; calendar invitation language + ICS. |
| **UI routes** | `/app/comms`; portal home latest message + ICS; schedule-related calendar buttons on `/p` when slotted. |
| **UI code** | `src/web/pages/SpeakersCommsPages.tsx` (`CommsPage`); `PortalPages.tsx` calendar helpers; `src/web/lib/utils.ts` `calendarLinks`. |
| **API** | `GET/PUT /api/events/:eventId/comms/templates`; `GET .../comms/log`; `POST .../comms/send`; `POST .../comms/reminders/plan`; `GET /api/communications/:id/calendar.ics`; `GET /api/calendar/:sessionId.ics`. |
| **Domain** | Templates + `sendTemplate` / `icsForSession` in `src/lifecycle.ts`; delivery via `deliver()` + `Mailer` in `src/app.ts` (`src/mailer.ts`). Default `MockMailer` → status `mock_sent`. Configured `HttpMailer` (Resend-compatible) when `MAILER_API_KEY` + `MAILER_FROM` → status `sent`. Portal links are relative `/speaker/:id` (no localhost). ICS attached when a session is scheduled. |
| **Tests** | `test/lifecycle.test.ts` — accept creates comms; `test/lifecycle-correctness.test.ts` — ICS Oct range / absent for drafts; mock acceptance has no localhost link; ICS only when scheduled; `test/providers.test.ts` — MockMailer zero network; HttpMailer Resend shape + ICS attachment. |
| **Judge proof** | Default: Send template → log “Sent (mock)”; download ICS; Google/Outlook links when session has slot. |
| **Honest limits** | Default is mock (zero network). Optional Resend-compatible HTTP is env-gated. No binary mailbox store. |

---

## 4. Multi-round review + advisory AI

| | |
|---|---|
| **Intent** | R1/R2/Final scoring; AI drafts scores/notes but **never** accepts; only organizers decide. |
| **UI routes** | `/app/submissions`, `/app/submissions/:id` (Review Studio); `/r`, `/r/done`, `/r/guidelines`, `/r/:submissionId`. |
| **UI code** | `src/web/pages/SubmissionsPages.tsx`; `src/web/pages/PublicReviewerPages.tsx` (reviewer queue/detail). |
| **API** | `GET .../submissions`, `.../submissions/:id`; `GET .../reviews`; `POST .../reviews/:id`; `POST .../reviews/:id/ai-assist`; `POST .../submissions/:id/decision` (organizer). |
| **Domain** | Reviews with `round`, `source` (`ai_draft` vs human); `reviewForRound` preserves history. |
| **Tests** | `test/lifecycle-correctness.test.ts` — R1 history preserved when R2 created; lifecycle accept path in `lifecycle.test.ts`. |
| **Judge proof** | AI assist fills sliders with advisory copy; Score & save as human; Accept disabled/forbidden as reviewer (403); organizer Accept works. |

---

## 5. Schedule DnD + conflicts

| | |
|---|---|
| **Intent** | Place accepted sessions on rooms; hard room/speaker conflicts blocked; soft capacity warnings acknowledgeable. |
| **UI routes** | `/app/schedule` — views: list (mobile default), day, week, track, room. |
| **UI code** | `src/web/pages/SchedulePage.tsx` — drag/drop, dialog for warnings + alternatives (no `window.confirm`). |
| **API** | `GET /api/events/:eventId/schedule`; `POST .../schedule/validate`; `POST .../schedule/move` (version + acknowledge). |
| **Domain** | `src/schedule.ts` — `validateSlot`, `overlaps`, `scheduleWarnings`; seed `demoSchedule` in `src/repository.ts`. **Canonical program projection** `src/projection.ts` (`canonicalFromSchedule`, `publicSpeakers`) drives sync `getData`, public feeds, and Command unscheduled metrics. |
| **Tests** | `test/schedule.test.ts` — adjacent half-open OK; hard ROOM/SPEAKER; capacity warning; unscheduled warnings; public projection. `test/canonical-flow.test.ts` — accept→schedule→publish eligibility→sync preview; hard conflict **409** without version bump. `test/lifecycle-correctness.test.ts` — command `acceptedUnscheduled` from canonical schedule metrics. |
| **Judge proof** | Drag from pool → room; hard overlap errors; soft warning dialog lists alternatives from validate payload; Command unscheduled KPI matches board. |
| **Note** | Lifecycle owns CFP/review/onboarding; schedule projection is canonical for program placement, public publish, and outbound sync. Accept mirrors into the schedule repository. |

---

## 6. Command / onboarding ops

| | |
|---|---|
| **Intent** | Operational home: KPIs, blockers, onboarding funnel, nudge path — not vanity charts. |
| **UI routes** | `/app` (`CommandPage`). |
| **UI code** | `src/web/pages/CommandPage.tsx` — KPIs, blockers, funnel, blocked speakers with humanized missing labels. |
| **API** | `GET /api/events/:eventId/command`; related `GET .../speakers`; `POST .../comms/send` for nudges. |
| **Domain** | Command snapshot in `src/app.ts` + readiness in `src/lifecycle.ts`; **`acceptedUnscheduled` overwritten from `canonicalScheduleMetrics(repo)`** so KPI matches schedule board. |
| **Tests** | `test/lifecycle.test.ts` — “command snapshot includes kpis”; `test/lifecycle-correctness.test.ts` — command unscheduled from canonical schedule projection; readiness/reminders. |
| **Judge proof** | T-minus, awaiting review, blocked speakers, unscheduled count aligned with schedule; open links; Nudge sends reminders (mock by default). |

---

## 7. Accelevents one-way sync

| | |
|---|---|
| **Intent** | Push local canonical speakers/sessions outward; never ingest remote as canonical; never destructive delete. Mock by default. |
| **UI routes** | `/app/publish` — Preview push, Push now (mock), run history. |
| **UI code** | `src/web/pages/PublishFormsSettings.tsx` (`PublishPage`). |
| **API** | `POST /sync/preview` (dry_run); `POST /sync/run` (live against **configured client**); `GET /sync/runs`, `GET /sync/runs/:id`; `POST /sync/runs/:id/retry`. |
| **Domain** | `src/sync.ts` `SyncService` reads **canonical** `repo.getData` (schedule-derived); `src/mapping.ts` version `accelevents-v1-placeholder`; `src/accelevents.ts` `MockAcceleventsClient` / `HttpAcceleventsClient`; `configuredClient` in `src/app.ts`. |
| **Tests** | `test/sync.test.ts` — hash stability, dry-run no remote mutation, create then skip, update on change, failed create sanitized retry, history. `test/canonical-flow.test.ts` — scheduled session appears in preview items. |
| **Judge proof** | Health `mode: "mock"`; preview/run without network; UI states mock mode. |
| **HARD CAVEAT** | HTTP paths/fields are **placeholders**. Enable `ACCELEVENTS_LIVE=true` only after Accelevents confirms contract. **This repo does not claim production Accelevents compatibility today.** |

---

## 8. Resources HTML embed

| | |
|---|---|
| **Intent** | Speaker handbook/resources with safe iframe embeds (allowlisted hosts), not arbitrary script HTML. |
| **UI routes** | `/p/resources`, `/p/resources/:slug`. |
| **UI code** | `PortalPages.tsx` — `isProfessionalEmbed` / checklist fallback if unsafe. |
| **API** | Speaker `GET .../resources`, `.../resources/:slug` (embed URLs passed through `safeEmbed`); organizer CRUD on `/api/events/:eventId/resources`. |
| **Domain** | `safeEmbed`, `upsertResource` in `src/lifecycle.ts`. |
| **Tests** | `test/lifecycle-correctness.test.ts` — “resource CRUD sanitizer keeps only allowlisted iframe URLs”. |
| **Judge proof** | Handbook page shows body + either allowlisted embed or polished fallback; rickroll/meme IDs do not render as video. |

---

## 9. Embeddable gallery + itinerary

| | |
|---|---|
| **Intent** | Mobile-friendly **HTML** embeds for site builders; JSON feeds secondary. |
| **UI routes** | `/app/publish` previews + snippet copy; public HTML at `/public/events/evt-ai-summit-2026/gallery` and `.../itinerary`; redirects `/embed/:eventId/...`. |
| **UI code** | `PublishPage` iframes; HTML is server-rendered in `src/app.ts`. |
| **API** | `GET /public/events/:eventId/gallery` (HTML); `GET .../itinerary` (HTML); `GET .../itinerary.json`; `GET .../speakers.json`; `GET /api/public/events/:slug/speakers|schedule`. |
| **Domain** | `src/projection.ts` public speakers/sessions; gallery/itinerary HTML templates in `src/app.ts`. |
| **Tests** | `test/lifecycle.test.ts` — “HTML gallery embed returns HTML not JSON”; `test/canonical-flow.test.ts` — published session on itinerary JSON; eligible speakers only on speakers.json; `test/schedule.test.ts` — public speaker eligibility. |
| **Judge proof** | `Content-Type` HTML; responsive layout; iframe snippet from Publish; JSON available but not the primary embed story. |

---

## Cross-cutting evidence

| Concern | Where |
|---|---|
| Persona / demo auth | `src/app.ts` `actor()`; `src/web/lib/api.ts`; shells `ensurePersonaForRole` |
| Product health flag | `GET /health` → `product: "Ruckus"`, `mode: mock|configured` |
| Seed data | `src/lifecycle.ts` + `src/repository.ts` |
| Optional snapshot | `src/persistence.ts` + `configuredPersistence`; restore in `src/dev.ts` / `src/index.ts` |
| Optional mail | `src/mailer.ts` + `deliver()` in `src/app.ts` |
| Providers tests | `test/providers.test.ts` |
| Walkthrough script | [WALKTHROUGH.md](WALKTHROUGH.md) |
| Deploy / security limits | [DEPLOYMENT.md](DEPLOYMENT.md) |

---

## Omission check

| # | Requirement | Omitted? |
|---|---|---|
| 1 | CFP + logic + routing | No |
| 2 | Speaker portal | No |
| 3 | Comms + calendar | No |
| 4 | Multi-round review + AI | No |
| 5 | Schedule DnD + conflicts | No |
| 6 | Command / onboarding | No |
| 7 | Accelevents one-way | No |
| 8 | Resources embed | No |
| 9 | Gallery + itinerary HTML | No |

All nine have UI route(s), API pointer(s), code pointer(s), and test pointer(s).
