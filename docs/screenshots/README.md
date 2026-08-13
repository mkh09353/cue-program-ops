# Ruckus screenshots

Captured from a **local build of this repository** (the Vite dev server proxying the
local API), not from a deployment — so they always match the code in the tree.
They show the current Ruckus brand UI: violet primary actions, pill controls,
semantic status badges and the duck wordmark (see [DESIGN.md](../DESIGN.md)).

Desktop: 1440×900 at `deviceScaleFactor: 2` (2880×1800 PNGs).
Mobile: 390×844 at `deviceScaleFactor: 2` (780×1688 PNGs).

| Screenshot | Page |
|---|---|
| [Overview contact sheet](00-overview-contact-sheet.jpg) | Ten main desktop experiences |
| [Mobile contact sheet](00-mobile-contact-sheet.jpg) | Greenroom and public itinerary at 390×844 |
| [Command Center](01-command.png) | `/app` |
| [Review Studio](02-review-studio.png) | `/app/submissions/sub-grace` |
| [Schedule Board](03-schedule.png) | `/app/schedule` |
| [Speakers](04-speakers.png) | `/app/speakers` |
| [Publish & Integrations](05-publish.png) | `/app/publish` |
| [Public CFP](06-cfp.png) | `/e/ai-engineer-summit/cfp` |
| [Speaker Greenroom](07-speaker-greenroom.png) | `/p` |
| [Reviewer Queue](08-reviewer-queue.png) | `/r` |
| [Public Speaker Gallery](09-public-gallery.png) | `/public/events/evt-ai-summit-2026/gallery` |
| [Public Schedule Itinerary](10-public-itinerary.png) | `/public/events/evt-ai-summit-2026/itinerary` |
| [Mobile Greenroom](11-mobile-greenroom.png) | `/p`, 390×844 |
| [Mobile Itinerary](12-mobile-itinerary.png) | public itinerary, 390×844 |

## Regenerating

1. Start the stack. `vite.config.ts` reads `API_PORT` (default `8787`), so a second
   checkout can run beside an existing dev server:

   ```bash
   npm run dev                                   # default 8787 + 5173
   # or, on free ports:
   PORT=8788 npx tsx src/dev.ts
   API_PORT=8788 npx vite --port 5199
   ```

2. Capture every route in the table above through the Vite origin (it proxies the
   server-rendered widgets, and `/e/:slug/cfp` is a SPA route that only exists
   there). Organizer, speaker and reviewer routes need a demo session first —
   `GET /api/auth/demo/organizer|speaker|reviewer` sets the `cue_session` cookie.

   Playwright and sharp are **not** repo dependencies, so capture is done with a
   throwaway script rather than a committed one:
   `npx playwright install chromium`, drive the routes at the viewports above,
   wait for `networkidle` + `document.fonts.ready`, and assert the page really
   painted Ruckus violet (`rgb(124, 58, 237)`) before shooting — that check is
   what stops a stale monochrome build being captured by mistake.

3. Composite the two contact sheets from the individual PNGs (labelled grid:
   2 columns, violet label rule, JPEG q82).
