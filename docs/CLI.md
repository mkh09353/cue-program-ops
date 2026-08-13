# Ruckus CLI — an agentic interface

**Give this file to your agent.** It is a complete operating manual for running a
conference program from the command line. Every command wraps the same HTTP API the
web app uses (186 operations, see [openapi.yaml](openapi.yaml)); there is no hidden
state and no separate CLI backend.

```bash
npx tsx cli/cue.ts overview          # from a checkout
cue overview                         # after npm link / npm i -g
```

## Why this exists

An agent operating a conference needs three things: a way to **read the whole state
in one call**, a way to **make changes that fail loudly with reasons**, and **stable
machine-readable output**. The CLI provides all three:

- `cue overview` dumps event, CFP, submissions, review progress, unscheduled
  sessions, the agenda, speaker readiness and recent comms in one shot.
- Every mutating command exits **non-zero** with the server's own message on
  failure. Schedule conflicts print the machine-readable reason (`ROOM_OVERLAP`,
  `SPEAKER_OVERLAP`, `TRACK_OVERLAP`) so the agent can pick another slot.
- **`--json` works on every command.** JSON output is the raw API payload — field
  names are stable. Human tables rename columns for readability; do not parse them.

## Configuration

| Flag | Env | Default | Meaning |
|---|---|---|---|
| `--url` | `RUCKUS_URL` | `https://ruckus.to` | API base URL |
| `--event` | `RUCKUS_EVENT` | `evt-ai-summit-2026` | event to operate on |
| `--role` | `RUCKUS_ROLE` | `organizer` | demo identity role |
| `--persona` | `RUCKUS_PERSONA` | `org-swyx` | demo persona id |
| `--json` | — | off | machine-readable output |

Identity is **demo persona simulation, not authentication** (`x-demo-role` /
`x-demo-persona` headers). Public commands (`cue cfp …`) send no identity at all.

Exit codes: `0` success, `1` request or usage error (message on stderr).

## Command map

```
cue overview                                    everything, one call
cue events      list | create | switch
cue submissions list | show | decide
cue reviews     rounds | assign | queue | progress | results | export
cue schedule    view | place | move | conflicts | publish
cue speakers    list | show | add | import | status | invite | tasks assign
cue comms       log | send | decisions
cue content     files | approve | zip
cue crm         contacts | add-to-event | communicate
cue publish     embeds | feeds
cue cfp         form | submit                   (public, no identity)
cue portal      tasks | complete                (speaker, via magic link)
cue api         <METHOD> <path> [--data '<json>']   escape hatch
```

Run `cue <command> --help` for full usage and options on any group.

## Full example session: build an agenda from scratch

```bash
export RUCKUS_URL=http://localhost:8787       # or the deployed URL

# 1. See everything. This is always the first move.
cue overview

# 2. Create the event you were asked to run.
cue events create --name "DevFlow Conf 2027" \
  --start 2027-05-12 --end 2027-05-14 \
  --venue "Moscone West" --rooms "Room 2A,Room 2B,Main Stage" \
  --tracks "Platform,Developer Experience"
export RUCKUS_EVENT=evt-devflow-conf-2027

# 3. Check the CFP that ships with it, then take proposals.
cue cfp form
cue cfp submit --title "Taming 40-Minute CI" \
  --abstract "How we cut CI from 40 minutes to 6." \
  --name "Priya Raman" --email priya@example.test \
  --field category="AI Engineering" --field format="Talk (30 min)" \
  --field experience=Intermediate
# prints the submission id, an edit link, and a speaker-portal magic link

# 4. Review: create a round, assign a reviewer, watch progress.
cue reviews rounds --create "Initial Review"
cue reviews assign --round <roundId> --reviewer <personaId> --submissions <subId>
cue reviews progress
cue reviews results
cue reviews export > results.csv

# 5. Decide, with feedback the speaker actually receives.
cue submissions list --filter pending
cue submissions decide <subId> --accept \
  --feedback "Strong practical content; name the tooling in the abstract."
cue submissions decide <otherId> --reject --feedback "Not a fit this year."

# 6. Build the agenda. Look, test, place, repeat.
cue schedule view
# dry run first - no writes, explains any clash:
cue schedule conflicts <sessionId> --day 2027-05-12 --time 09:00 --room "Room 2A"
cue schedule place    <sessionId> --day 2027-05-12 --time 09:00 --room "Room 2A"
# a clash exits 1 and tells you why:
#   hard conflicts block this move
#     - ROOM_OVERLAP: Room 2A is already occupied 09:00-09:45 by Taming 40-Minute CI.
cue schedule place <otherSession> --day 2027-05-12 --time 10:00 --room "Room 2A"
cue schedule view --day 2027-05-12
cue schedule publish

# 7. Speakers: onboard, chase, invite to the portal.
cue speakers list
cue speakers tasks assign --speakers <speakerId> \
  --title "Confirm participation" --due 2027-04-01
cue speakers invite <speakerId>        # prints the portal magic link
cue portal tasks --token <token from that link>
cue portal complete <taskId> --token <token>

# 8. Communicate and publish.
cue comms decisions --cohorts accepted,rejected
cue comms log --limit 10
cue publish feeds                      # public URLs for sessions/agenda/ICS/JSON
```

## Agent recipes

**Schedule everything that is accepted but unplaced:**

```bash
cue schedule view --json \
  | jq -r '.unscheduled[].id' \
  | while read -r session; do
      cue schedule place "$session" --day 2027-05-12 --time 09:00 --room "Room 2A" \
        || echo "clash for $session - pick another slot"
    done
```

**Decide a whole cohort with per-talk feedback:**

```bash
cue submissions list --filter pending --json \
  | jq -r '.[].id' \
  | while read -r id; do
      cue submissions decide "$id" --accept --feedback "See you in May." --json
    done
```

**Anything not covered by a command:**

```bash
cue api GET  /api/events/$RUCKUS_EVENT/review-recusals
cue api POST /api/events/$RUCKUS_EVENT/agenda/rooms --data '{"name":"Room 3C"}'
cue api GET  /e/ai-engineer-summit/public/feed.json --raw
```

## Output contract

- `--json` prints the **raw API payload**. `overview --json` is the one composed
  shape, with keys: `event`, `cfp`, `submissions.byStatus`, `reviewProgress`,
  `unscheduled`, `agenda`, `speakers`, `comms`, `warnings`.
- Errors with `--json` print `{ "ok": false, "error": "...", "status": 404 }` on
  stdout **and** the message on stderr, exit code `1`.
- Times in human output are rendered in the **event timezone**; `--day` and
  `--time` are interpreted in that timezone too (DST-aware).

## Notes and limits

- The CLI uses only Node built-ins; it adds **zero runtime dependencies** to the
  worker bundle. It runs through `tsx`, which is already a dev dependency.
- `cue events switch` prints the export line for `RUCKUS_EVENT`; a CLI process cannot
  mutate its parent shell's environment.
- `cue content zip` writes the archive to disk (`--out`, default `cue-content.zip`).
- Everything the CLI does is available over HTTP: see [API.md](API.md),
  [openapi.yaml](openapi.yaml), and the rendered page at `/docs/api`.
