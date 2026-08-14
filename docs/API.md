# Ruckus HTTP API

Base URLs: live `https://ruckus.to`; local `http://localhost:8787`.

The API is implemented with Hono in `src/app.ts` and `src/*Routes.ts`. JSON bodies use `Content-Type: application/json` unless noted. Event-scoped APIs support the seeded event `evt-ai-summit-2026`; unknown event IDs return 404 where enforced.

## Authentication and identity

Ruckus has cookie-backed API authentication in addition to its legacy demo persona headers. Sessions use the `cue_session` HttpOnly, SameSite=Lax cookie; session identity takes precedence whenever that cookie is present. A bogus or expired cookie does not fall through to persona headers.

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/signup` | Create a user, organization, owner membership and session from `{name,email,password}` |
| POST | `/api/auth/login` | Verify email/password and create a session |
| POST | `/api/auth/logout` | Revoke the current session and clear its cookie |
| POST | `/api/auth/magic-link` | Issue and mail a short-lived sign-in link; the safe default `MockMailer` also returns an explicitly demo-only URL |
| POST | `/api/auth/magic-link/consume` | Consume a one-time token and create a session |
| GET | `/api/auth/me` | Return the authenticated user, organization memberships and event roles |
| POST | `/api/auth/invitations` | Organization/event admin creates and mails an invitation |
| POST | `/api/auth/invitations/accept` | Accept an invitation, creating a user if necessary, membership and session |
| GET | `/api/auth/demo/:persona` | One-click session for `organizer`, `reviewer` or `speaker`; returns `/app`, `/r` or `/p` target |

Seeded one-click identities are `dana@demo.ruckus.to` (organizer), `rey@demo.ruckus.to` (reviewer) and `maya@demo.ruckus.to` (speaker). They intentionally have no seeded passwords; use the demo endpoints to create their sessions.

`DEMO_PERSONA_HEADERS` controls the legacy `x-demo-persona` / `x-demo-role` escape hatch. It defaults to enabled so credential-free evaluator and existing test workflows continue to work. Headers are considered only when there is no session cookie. Set `DEMO_PERSONA_HEADERS=false` to ignore them; requests without a cookie retain the application's credential-free default-persona behavior.

This is **not production-grade authentication or tenant isolation**. Passwords and opaque capabilities are cryptographically hashed, but auth records live in process memory and whole-event snapshots. Memory may reset or differ across Worker isolates, snapshot storage is not a normalized/concurrency-safe identity database, and organization/event records do not provide complete tenant isolation. The default-enabled demo persona headers are spoofable and must not be treated as an authorization boundary.

## Role labels

Legacy demo identity headers remain available by default:

```http
x-demo-persona: org-swyx
x-demo-role: organizer
```

Known personas resolve server-side. `Organizer`, `Reviewer` and `Speaker` below mean server-enforced demo role/scope. `Public` requires no identity. `Shared/demo` identifies read routes that are intentionally convenient in the demo and should be authorization-reviewed before production. CRM routes are organizer-only. Speaker and reviewer detail routes enforce ownership/assignment scoping.

## Health and bootstrap

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/health` | Public | Health, product and mock/configured Accelevents mode |
| GET | `/api/demo` | Public/demo | Current canonical demo data |
| GET | `/api/events/:eventId/bootstrap` | Shared/demo | Event, actor, personas and lifecycle bootstrap |
| GET | `/api/events/:eventId/command` | Shared/demo | Organizer command projection and canonical schedule KPIs |
| PUT | `/api/events/:eventId/settings` | Organizer | Update event basics; `speakerConfirmation` defaults true, and false auto-completes confirmation during acceptance handoff |
| GET | `/api/events/:eventId/lifecycle` | Organizer | Derived program lifecycle checklist with progress details and organizer links |
| GET | `/api/events/:eventId/dashboard` | Shared/demo | Speaker readiness plus schedule metrics |

## CFP and submissions

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/events/:eventId/forms` | Shared/demo | List event CFP forms |
| GET | `/api/events/:eventId/forms/:id` | Shared/demo | Read form schema |
| PUT | `/api/events/:eventId/forms/:id` | Organizer | Save validated fields, conditions, routing and window |
| GET | `/api/public/events/:slug/cfp` | Public | Public form/event schema and open/closed state |
| POST | `/api/public/events/:slug/submissions` | Public | Create title-only draft or validated final submission; `code` is a stable, sequential event-local reference such as `SESS-01` |
| GET | `/api/public/events/:slug/submissions/:id?token=` | Edit-token holder | Resume/view one submission |
| PUT | `/api/public/events/:slug/submissions/:id` | Edit-token holder | Edit/submit while CFP is open |
| PUT | `/api/speaker/events/:eventId/submissions/:id` | Owning speaker | Edit owned submission while open |
| GET | `/api/events/:eventId/submissions` | Organizer or scoped reviewer/speaker projection | List submissions; supports filters |
| GET | `/api/events/:eventId/submissions/:id` | Organizer; assigned reviewer; owner | Submission detail with scoped review data |
| POST | `/api/events/:eventId/submissions/:id/decision` | Organizer | Record lifecycle decision and accepted-session handoff |

Final submissions enforce configured visible-required fields, category validity, quota and deadline server-side. Draft/edit tokens are opaque capabilities, not user accounts.

## Evaluation and reviewer workflow

`reviewRoutes.ts` is mounted at `/api/events`, so its `/:eventId/...` declarations produce the paths below.

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/events/:eventId/review-rounds` | Shared/demo | List rounds and scorecards |
| POST | `/api/events/:eventId/review-rounds` | Organizer | Create round, criteria, reviewers and blind setting |
| PUT | `/api/events/:eventId/review-rounds/:id` | Organizer | Update round |
| DELETE | `/api/events/:eventId/review-rounds/:id` | Organizer | Delete round and its assignments |
| POST | `/api/events/:eventId/review-assignments` | Organizer | Assign explicitly or auto-distribute with cap |
| GET | `/api/events/:eventId/reviewer-queue` | Reviewer | Assigned, non-recused queue only |
| GET | `/api/events/:eventId/reviewer-queue/:submissionId` | Assigned reviewer | Scoped assignment/submission/scorecard detail |
| POST | `/api/events/:eventId/reviewer-queue/:assignmentId/submit` | Assigned reviewer | Submit responses and complete assignment |
| POST | `/api/events/:eventId/reviewer-queue/:assignmentId/recuse` | Assigned reviewer | Record conflict and remove active assignment |
| GET | `/api/events/:eventId/review-progress` | Organizer | Per-round/reviewer completion metrics |
| POST | `/api/events/:eventId/review-rounds/:roundId/invite-emails` | Organizer | Email reviewer invite links for a round; skips already-sent recipients |
| POST | `/api/events/:eventId/review-reminders` | Organizer | Manually send outstanding-review reminders |
| GET | `/api/events/:eventId/review-results` | Organizer | Human-review aggregates and recommendations |
| GET | `/api/events/:eventId/review-results.csv` | Organizer | Download result summary as CSV |
| GET | `/api/events/:eventId/reviews` | Shared/demo | Legacy review list |
| POST | `/api/events/:eventId/reviews/:id` | Reviewer or organizer | Save legacy round review |
| POST | `/api/events/:eventId/reviews/:id/ai-assist` | Reviewer or organizer | Create deterministic advisory review draft |

Blind projection removes speaker identity for reviewer views when the assignment’s round is blind. AI drafts are excluded from human result aggregation and cannot make decisions.

## Speaker management and communications

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/events/:eventId/speakers` | Organizer | Filterable roster; query `q`, `status`, `readiness`, `tag` |
| GET | `/api/events/:eventId/speakers/progress` | Organizer | Task/readiness progress matrix |
| GET | `/api/events/:eventId/speakers/:speakerId` | Organizer | Profile, sessions, files and comms history |
| POST | `/api/events/:eventId/speakers` | Organizer | Add a speaker manually and optionally invite |
| PATCH | `/api/events/:eventId/speakers/:speakerId` | Organizer | Update profile/workflow metadata |
| POST | `/api/events/:eventId/speakers/:speakerId/status` | Organizer | Transition speaker workflow status |
| POST | `/api/events/:eventId/speakers/:speakerId/invite` | Organizer | Send/log portal invitation |
| POST | `/api/events/:eventId/speakers/import` | Organizer | Import speakers from CSV |
| POST | `/api/events/:eventId/speakers/tasks` | Organizer | Assign general or form tasks |
| POST | `/api/events/:eventId/comms/preview` | Organizer | Render merge fields for a speaker |
| POST | `/api/events/:eventId/comms/send` | Organizer | Send/log custom or template communication |
| GET | `/api/events/:eventId/comms/log` | Organizer | Delivery log with recipient and honest status note |
| POST | `/api/events/:eventId/comms/reminders/plan` | Organizer | Calculate outstanding reminders; no automatic scheduler |
| POST | `/api/events/:eventId/comms/reminders/run` | Organizer | Manually send due/overdue task reminders |
| GET | `/api/events/:eventId/comms/templates` | Shared/demo | List communication templates |
| PUT | `/api/events/:eventId/comms/templates/:id` | Organizer | Update template |
| GET | `/api/communications/:id/calendar.ics` | Public capability URL | Download a logged communication’s ICS |
| GET | `/api/calendar/:sessionId.ics` | Public capability URL | Download scheduled-session ICS |

Default send status is `mock_sent`. A configured HTTP mailer reports provider acceptance as `sent`; neither status guarantees that an invitation entered a recipient’s calendar.

## Speaker self-service

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/speaker/events/:eventId/home` | Speaker | Owned dashboard, tasks, talks and readiness |
| GET | `/api/speaker/events/:eventId/tasks` | Speaker | Owned onboarding tasks |
| PATCH | `/api/speaker/events/:eventId/tasks/:id` | Owning speaker | Update simple task state |
| POST | `/api/speaker/events/:eventId/tasks/:id/form` | Owning speaker | Validate and submit form-task answers |
| PUT | `/api/speaker/events/:eventId/profile` | Speaker | Update own profile and canonical speaker projection |
| POST | `/api/speaker/events/:eventId/profile/headshot` | Speaker | Record own headshot data/metadata |
| POST | `/api/speaker/events/:eventId/files` | Speaker | Legacy speaker-file receipt path |
| GET | `/api/speaker/events/:eventId/resources` | Speaker | Published speaker resources |
| GET | `/api/speaker/events/:eventId/resources/:slug` | Speaker | One published resource with safe embed projection |

## Content management

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/events/:eventId/content` | Organizer | Deliverables, versioned files, sessions and speakers |
| POST | `/api/events/:eventId/content/tasks` | Organizer | Create speaker/session deliverable assignments |
| PATCH | `/api/events/:eventId/content/files/:fileId/approval` | Organizer | Approve or request changes with comment |
| POST | `/api/events/:eventId/content/reminders` | Organizer | Manually send outstanding-deliverable reminders |
| PATCH | `/api/events/:eventId/content/sessions/:sessionId` | Organizer | Edit canonical session content and approval state |
| PATCH | `/api/events/:eventId/content/speakers/:speakerId` | Organizer | Edit canonical speaker content |
| POST | `/api/events/:eventId/content/history/:historyId/restore` | Organizer | Restore recorded session/speaker version |
| POST | `/api/events/:eventId/content/export` | Organizer | Return demo export manifest (not a streamed ZIP) |
| GET | `/api/speaker/events/:eventId/deliverables` | Speaker | List owned deliverables |
| GET | `/api/speaker/events/:eventId/deliverables/:taskId` | Owning speaker | Deliverable and file/version detail |
| POST | `/api/speaker/events/:eventId/deliverables/:taskId/upload` | Owning speaker | Validate MIME/size and add retained version |
| GET | `/api/content/files/:fileId/versions/:versionId` | Organizer or owning speaker | Download an authorized version |
| POST | `/api/content/files/:fileId/comments` | Organizer or owning speaker | Add comment to authorized file |

## Schedule and AI Agenda

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/events/:eventId/schedule` | Shared/demo | Canonical rooms, tracks, sessions, slots, version and warnings |
| POST | `/api/events/:eventId/schedule/validate` | Organizer | Preview room/speaker/track/capacity conflicts and alternatives |
| POST | `/api/events/:eventId/schedule/move` | Organizer | Versioned canonical move; hard conflicts block |
| GET | `/api/events/:eventId/agenda/proposals` | Organizer | List persisted heuristic proposal history |
| POST | `/api/events/:eventId/agenda/proposals/generate` | Organizer | Generate advisory placements from accepted unscheduled sessions |
| POST | `/api/events/:eventId/agenda/proposals/:id/placements/:placementId/:decision` | Organizer | `accept` or `reject` one placement |
| POST | `/api/events/:eventId/agenda/proposals/:id/:decision` | Organizer | `accept` or `reject` all proposed placements |
| POST | `/api/events/:eventId/agenda/rooms` | Organizer | Add canonical room |
| POST | `/api/events/:eventId/agenda/tracks` | Organizer | Add canonical track |
| POST | `/api/events/:eventId/agenda/publish` | Organizer | Publish scheduled sessions and return public URL |

Generation is a deterministic demo heuristic with rationale. It saves a review draft only. Acceptance uses the same versioned `applyScheduleMove` conflict boundary as manual scheduling.

## Speaker CRM

All CRM endpoints are organizer-only and snapshot-backed.

| Method | Path | Description |
|---|---|---|
| GET | `/api/crm/dashboard` | CRM counts/summary |
| GET | `/api/crm/stages` | Pipeline stage definitions |
| GET/POST | `/api/crm/contacts` | Filter contacts / create contact |
| GET/PATCH/DELETE | `/api/crm/contacts/:id` | Read, update or delete contact |
| POST | `/api/crm/contacts/:id/notes` | Add timeline note |
| POST | `/api/crm/contacts/:id/stage` | Transition pipeline stage |
| POST | `/api/crm/contacts/:id/add-to-event` | Create/reuse event speaker from CRM contact |
| POST | `/api/crm/contacts/merge` | Merge duplicate contacts |
| POST | `/api/crm/import/validate` | Parse/validate CSV without committing |
| POST | `/api/crm/import` | Commit CSV import, optionally merge duplicates |
| GET/POST | `/api/crm/segments` | List dynamic saved segments / create segment |
| DELETE | `/api/crm/segments/:id` | Delete saved segment |
| GET | `/api/crm/pipeline` | Contacts grouped by stage |
| POST | `/api/crm/sync-event-speakers` | Upsert current event speakers into CRM |
| POST | `/api/crm/communicate` | Send/log merge-field CRM campaign |
| GET | `/api/crm/campaigns` | Campaign history |

## Organizer resources

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/events/:eventId/resources` | Shared/demo | List organizer resource records |
| POST | `/api/events/:eventId/resources` | Organizer | Create resource |
| PUT | `/api/events/:eventId/resources/:id` | Organizer | Update resource/publish state |
| DELETE | `/api/events/:eventId/resources/:id` | Organizer | Delete resource |

Organizer-provided embed URLs are projected through the server allowlist; arbitrary HTML is not rendered.

## Sessions and saved embeds

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/events/:eventId/sessions` | Organizer | All canonical sessions with source submission code, speakers, placement, `publishStatus`, CFP/manual source and summary counts |
| GET | `/api/events/:eventId/sessions-list` | Organizer | All CFP/manual sessions with publication, cancellation, placement and approved/draft/cancelled metadata |
| POST | `/api/events/:eventId/sessions/:sessionId/cancel` | Organizer | Cancel a session, with optional `{reason}` |
| POST | `/api/events/:eventId/sessions/:sessionId/uncancel` | Organizer | Restore a cancelled session and conflict participation |
| POST | `/api/events/:eventId/sessions/:sessionId/approve` | Organizer | Approve a session for public publication eligibility |
| POST | `/api/events/:eventId/sessions/:sessionId/unapprove` | Organizer | Return a session to draft publication state |
| GET | `/api/events/:eventId/embed-configs` | Shared/demo | List saved embed configurations with backward-compatible preference defaults |
| POST | `/api/events/:eventId/embed-configs` | Organizer | Create a saved embed configuration |
| PATCH | `/api/events/:eventId/embed-configs/:id` | Organizer | Persist `enabled`, `snippetFormat`, and sanitized `customCss` preferences |
| DELETE | `/api/events/:eventId/embed-configs/:id` | Organizer | Delete a saved embed configuration |

Cancelled or unapproved sessions are excluded from every public widget, feed and ICS projection. Cancelling also removes the session's occupied slots from conflict checks; uncancelling restores normal conflict behavior.

Embed `snippetFormat` accepts `iframe`, `script` or `link`. Custom CSS is trimmed, capped at 2,000 characters, and rejects `<script` and `</style` server-side. Saved preferences use the same demo snapshot persistence caveats described elsewhere in this document.

## Public program HTML and feeds

No identity required. `:slug` accepts the event slug; `:eventId` is the canonical event ID.

| Method | Path | Description |
|---|---|---|
| GET | `/e/:slug/public` | Redirect/entry to public program |
| GET | `/e/:slug/public/sessions` | Searchable/faceted sessions HTML |
| GET | `/e/:slug/public/sessions/:id` | Session detail HTML |
| GET | `/e/:slug/public/speakers` | Speaker directory HTML |
| GET | `/e/:slug/public/speakers/:id` | Speaker detail and sessions HTML |
| GET | `/e/:slug/public/agenda` | Day/room/time agenda HTML |
| GET | `/e/:slug/public/itinerary` | Chronological program and browser-local My Schedule |
| GET | `/e/:slug/public/gallery` | Speaker gallery HTML |
| GET | `/e/:slug/public/feed.json` | Combined public program JSON |
| GET | `/e/:slug/public/sessions.json` | Public sessions JSON |
| GET | `/e/:slug/public/speakers.json` | Public speakers JSON |
| GET | `/e/:slug/public/agenda.json` | Public agenda JSON |
| GET | `/e/:slug/public/ics` | Public program calendar feed |
| GET | `/api/public/events/:slug/program` | Public program API projection |
| GET | `/api/public/events/:slug/speakers` | Legacy public speaker JSON |
| GET | `/api/public/events/:slug/schedule` | Legacy public schedule JSON |

Legacy/embed aliases remain available:

- `/public/events/:eventId/{sessions,speakers,agenda,itinerary,gallery}`
- `/public/events/:eventId/{itinerary.json,speakers.json,feed.json,ics}`
- `/embed/:eventId/{sessions,speakers,agenda,itinerary,gallery}` redirects to legacy public HTML.

Only canonical published sessions/speakers are projected.

## One-way Accelevents sync

These endpoints currently have demo-level access rather than a dedicated organizer guard; protect them with real authentication before production exposure.

| Method | Path | Description |
|---|---|---|
| POST | `/sync/preview` | Dry-run canonical event payload; body `{ "eventId": "..." }` |
| POST | `/sync/run` | Execute against selected mock/configured client |
| GET | `/sync/runs?eventId=` | Run history |
| GET | `/sync/runs/:id` | Run and per-item outcomes |
| POST | `/sync/runs/:id/retry` | Retry failed items from a prior run |

Sync is local-to-remote only. The safe default is mock/no-network. Live HTTP paths and mappings are explicitly placeholders; see [DEPLOYMENT.md](DEPLOYMENT.md).
