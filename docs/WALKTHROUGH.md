# CUE — 6-minute judge walkthrough

Credential-free. Start from a fresh `npm run dev` so the in-memory seed is intact.

**Default URLs:** UI `http://localhost:5173` · API `http://localhost:8787` (Vite proxies API paths).

**Demo event:** AI Engineer Summit · id `evt-ai-summit-2026` · slug `ai-engineer-summit`.

---

## Minute 0:00 — Land and choose a role (~30s)

1. Open `/`.
2. Read the one-liner: CFP → review → onboard → schedule → publish → Accelevents.
3. Click **Swyx · organizer**.

**Expect:** `/app` Command with KPIs (submissions, awaiting review, accepted unscheduled, speakers blocked) and a “Needs you” list.

---

## Minute 0:30 — Forms & conditional CFP (~50s)

1. Sidebar → **Forms** (`/app/forms`).
2. Show **Welcome preview** (markdown rendered, not raw `**`).
3. Under a Workshop field, point at **Conditional visibility** (`format = Workshop`).
4. Expand **Category → board routing** (Engineering / Product / Agents / …).
5. Optional: toggle a condition or route, **Save form**, toast confirms.
6. **View CFP** → `/e/ai-engineer-summit/cfp` (public shell: event-focused, not ops chrome).
7. Step through You → Talk; set **Format = Workshop** and show plan/duration fields appear; set category and note board routing on Review step.
8. Submit or abandon — either is fine. Return via browser back or `/app`.

**Requirement covered:** #1 CFP + logic + routing.

---

## Minute 1:20 — Review Studio & accept (~70s)

1. **Submissions** (`/app/submissions`).
2. Open **Compilers for Humans** (Grace) or any in-review row — note draft scores if present.
3. In **Review Studio** (`/app/submissions/:id`):
   - R1 / R2 / Final tabs  
   - Criteria sliders + notes  
   - **AI assist** (advisory only — banner/copy says human must submit)  
   - **Score & save**  
   - **Accept** (organizer-only)
4. On Accept, toast should mention tasks + mock email / ICS path.

**Optional reviewer beat (30s):** persona → **Ada Reviewer** → `/r` → open a queue item → score → **Finish as organizer** to return for Accept.

**Requirement covered:** #4 multi-round review + AI.

---

## Minute 2:30 — Speaker greenroom (~60s)

1. Persona → **Sam Rivera · speaker** (or open `/p` — shell auto-selects a speaker persona).
2. Home: onboarding % , **Not ready**, Up next task.
3. **Tasks** → open profile or slides task.
4. Complete **profile** with bio 20+ chars **or** upload a file receipt for slides/headshot (filename is enough; no binary store).
5. **Resources** → **Speaker handbook**: polished checklist; any meme/unallowlisted embed is suppressed.
6. If a session is scheduled for this speaker, calendar buttons + ICS appear.

**Requirement covered:** #2 portal, #8 resources embed, part of #3 calendar.

---

## Minute 3:30 — Command + Speakers ops (~40s)

1. Persona → **Swyx · organizer**.
2. **Command** (`/app`): blocked speakers and unscheduled counts reflect ops pressure. **Accepted unscheduled** comes from the **canonical schedule projection** (same source as the schedule board).
3. **Speakers** (`/app/speakers`): human “Missing: Upload slides” style copy (not raw `task:…` ids).
4. **Nudge blocked** or per-row **Nudge** → mock reminder send.

**Requirement covered:** #6 Command / onboarding ops.

---

## Minute 4:10 — Schedule board (~50s)

1. **Schedule** (`/app/schedule`).
2. Mobile-width note: defaults to **List** with place-in-room actions; desktop **Day/Room** supports drag from **Unscheduled pool**.
3. Drag (or place) an accepted session onto a room/hour.
4. If soft warnings appear → in-app **dialog** (not `window.confirm`) with **Schedule anyway** and server **alternatives**.
5. Try a hard overlap (e.g. Main Hall at an occupied time) → blocked with error toast; version unchanged.
6. Peek **Week** — three program days; seed concentrates on the primary day; other days are open drop targets, not fake empty theater.

**Requirement covered:** #5 DnD + conflicts.

---

## Minute 5:00 — Comms (~30s)

1. **Comms** (`/app/comms`).
2. Pick **Acceptance** or **Task reminder** template; show variables (portal link is a relative `/speaker/…` path, not localhost).
3. **Send to speaker** → send log gains a **Sent (mock)** row under default `MockMailer`; ICS link on the entry when the session is scheduled.

**Requirement covered:** #3 comms + calendar.

---

## Minute 5:30 — Publish + Accelevents honesty (~30s)

1. **Publish** (`/app/publish`).
2. Speaker **gallery** and schedule **itinerary** iframes are HTML pages; copy snippet.
3. Open HTML in a new tab — mobile-friendly layout, “Powered by CUE”.
4. **Accelevents** panel: badge **Mock mode · no network**.
5. **Preview push** then **Push now (mock)** — run history fills; no external HTTP. Outbound rows come from the **canonical schedule projection** (accepted/published + slotted).
6. Say out loud: *“Live HTTP is gated and placeholder until Accelevents confirms the API. Optional Airtable snapshot and Resend mail are env-gated; this demo uses zero-network defaults.”*

**Requirement covered:** #7 one-way sync, #9 embeds.

---

## Minute 6:00 — Stop

You have touched all nine requirements. If time remains: Settings tracks/rooms readout, or public itinerary JSON feed link.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| UI loads, API fails | Confirm `:8787` (or `PORT`) and Vite proxy |
| Empty / weird KPIs after long poking | Restart `npm run dev` to reset memory seed (if Airtable snapshot env is set, clear that row or unset env for a pristine seed) |
| Persona says wrong role | Use shell deep link (`/r`, `/p`, `/app`) or Demo landing cards |
| Port 5173 busy | Vite picks next port; read terminal, or stop the other app |
| Accept 403 | You are on reviewer persona — Finish as organizer / switch to Swyx |

## What not to demo as “production”

- Demo header auth  
- Filename-only uploads (no binary object store)  
- Default mock email (optional Resend path is env-gated, not automatic)  
- Deterministic in-process AI  
- Accelevents HTTP placeholders (contract unconfirmed)  
- Default in-memory durability; Airtable snapshot is continuity-only, not multi-writer production storage  
