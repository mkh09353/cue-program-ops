# Ruckus — 6-minute competition walkthrough

**Live:** https://ruckus.to
**Local:** `npm run dev`, then use the Vite URL (normally `http://localhost:5173`).

The demo is credential-free and seeded. Start at `/demo` and pick a role. The live site persists every change to Cloudflare D1; a local `npm run dev` uses process memory unless configured otherwise.

## 0:00–0:45 — CFP

1. Open **Forms** (`/app/forms`).
2. Point out the field builder: label/key/type/options, required flags, sections and remove/reorder controls.
3. Show **Conditional visibility** on the workshop prerequisites field and category-to-review-board routing.
4. Show opening and closing dates. Saving persists the complete schema.
5. Click **View CFP**, or open `/e/ai-engineer-summit/cfp` in a private/logged-out tab.
6. Select Workshop and then Talk to show the conditional field appear/disappear.
7. Enter name, email and only a title; click **Save as draft**. Point out the reference and resumable edit-token URL.

**Verify:** event branding/deadline are visible; final submit is server-validated; moving the close date into the past replaces the public form with a closed state and locks edits.

## 0:45–1:35 — Review and decisions

1. Return as organizer. Open **Evaluation Plan** (`/app/evaluation-plan`): show rounds, open/close window, blind mode and mixed scorecard criteria/weights.
2. Open **Assignments**: show specific or auto-distributed work and assignment caps.
3. Open **Review Progress**: completion counts and manual reviewer reminders.
4. Open **Results**: aggregate human results, recommendation counts and **Download CSV**.
5. Switch persona to **Ada Reviewer**, enter `/r`, and open an assigned submission. In blind rounds, identity is withheld; organizer navigation is absent.
6. Submit criteria and a comment, or recuse. Return to organizer and open the submission to see the same human review.
7. Optional: run **AI assist** in Review Studio. Read its heuristic/advisory label; it drafts only and never advances the submission.
8. Accept or reject as organizer.

**Verify:** reviewer queues are assignment-scoped; decisions remain human/organizer-owned.

## 1:35–2:20 — Speaker management and portal

1. Open **Speakers** (`/app/speakers`). Filter/search by readiness, workflow status or tag.
2. Show the progress matrix and **CSV import** / manual add controls.
3. Open a speaker: inspect profile, sessions, actual outstanding tasks, content files and communication history.
4. Create a general/form task or preview a merge-field communication. Show reminder planning/run; call it **manual**, not scheduled automation.
5. Switch to **Sam Rivera · speaker** and open `/p`.
6. Visit **My submissions**, **Tasks**, **Deliverables**, **Resources** and **Profile**. Submit a form task or update the profile; readiness derives from saved state.

**Verify:** a speaker sees only that persona’s records. Header personas are a demo simulation, not secure login.

## 2:20–3:05 — Content

1. Return as organizer and open **Content** (`/app/content`).
2. Show a deliverable task assigned to a speaker/session, due date, allowed MIME types and current readiness.
3. Open a file: inspect retained versions, current-version marker, download and comments.
4. Approve or request changes and add a comment.
5. Edit canonical session or speaker content; inspect edit history and the restore action.
6. Optional: send outstanding-content reminders.
7. Switch briefly to `/p/deliverables` to show speaker-scoped upload/version history.

**Verify:** content changes propagate to canonical schedule/public projection. Demo versions live in snapshot data; there is no production object store or malware scanner.

## 3:05–4:00 — Agenda and AI assist

1. Open **Schedule** (`/app/schedule`). Cycle through **List, Day, Week, Track, Room**; all read the same canonical schedule.
2. Show the accepted/unscheduled pool. Drag or click-place a session into a room/time.
3. Attempt an occupied-room or shared-speaker overlap. The server blocks hard conflicts and the UI shows the exact reason; move to a free slot and the conflict clears.
4. Add **Overflow Room** and **Community** track to prove schedule structure is configurable.
5. In **AI Agenda**, set day hours, slot interval and break duration, then click **Generate draft**.
6. Read the honest provenance—**deterministic demo heuristic**—and one placement’s rationale.
7. Reject one placement and accept another, or use Accept/Reject All. Generation itself does not mutate the live schedule; acceptance re-runs the canonical conflict-checked move.
8. Click **Publish agenda**. The confirmation reports count and opens the public itinerary.

**Verify:** proposals survive reload through the lifecycle snapshot boundary; regenerate retains proposal history.

## 4:00–4:45 — Public widgets

1. Open **Publish** (`/app/publish`) and show the embed manager with copyable iframe snippets and feed links.
2. Open each attendee surface:
   - `/e/ai-engineer-summit/public/sessions`
   - `/e/ai-engineer-summit/public/speakers`
   - `/e/ai-engineer-summit/public/agenda`
   - `/e/ai-engineer-summit/public/itinerary`
   - `/e/ai-engineer-summit/public/gallery`
3. Search/filter sessions, open a session/speaker detail, and switch agenda days.
4. Star sessions. Open **My Schedule** in the itinerary and download ICS.
5. Point out JSON and ICS feeds in Publish (`feed.json`, sessions/speakers/agenda JSON and calendar feed).

**Verify:** these are responsive server-rendered HTML surfaces suitable for iframes, not JSON printed inside an iframe; only canonical published data appears.

## 4:45–5:25 — Speaker CRM

1. Open **Speaker CRM** (`/app/crm`). Search/filter the directory and open a contact.
2. Show notes, tags, stage history, merge and **Add to event**.
3. Open **Pipeline** and move a contact through the configured stages.
4. Open **Segments** to show saved dynamic filters and counts.
5. Open **Import**, validate CSV, then import/merge duplicates if desired.
6. Optional: sync current event speakers into CRM or send a merge-field campaign. Default delivery remains mock and is recorded honestly.

**Verify:** CRM is organizer-only and persists in the lifecycle snapshot.

## 5:25–6:00 — Comms, API and one-way sync

1. Open **Comms**: preview merge fields, send to a selected speaker and inspect recipient/status in the log.
2. If a session is scheduled, show downloadable ICS. Say: “ICS download or attachment is not proof of calendar delivery.”
3. Open **Publish**. In Accelevents, run **Preview push**, then **Push now (mock)**.
4. Inspect run history and per-record create/update/skip/error outcomes and retry visibility.
5. Open [API.md](API.md) or `/health` to show the Hono API and deployment mode.

Say the honest close:

> “The judge demo uses persona headers, process memory, mock mail and mock Accelevents. Airtable snapshot and Resend-compatible mail are optional. AI review and agenda assistance are deterministic and advisory. The Accelevents HTTP contract is still a placeholder until vendor validation.”

## Troubleshooting

| Symptom | Action |
|---|---|
| Unexpected state | Restart the API for the built-in seed. If Airtable is configured, clear/unset its snapshot first. |
| 403 in organizer/reviewer/speaker route | Switch persona or enter through `/app`, `/r` or `/p`. |
| Empty AI proposal | Ensure at least one accepted session remains unscheduled. |
| Public session absent | Schedule it and publish; public widgets filter to canonical published rows. |
| Mock email did not arrive externally | Expected: inspect the in-app communication log. Configure the optional provider only with a verified sender. |
| Accelevents has no remote record | Expected in mock mode. Do not enable placeholder HTTP mode for a production account. |
