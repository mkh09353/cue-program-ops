# Ruckus Design System — "Brand Paper"

Neutral paper surfaces, **violet brand accent**, semantic status colour. The
marketing landing page (`src/web/pages/MarketingLandingPage.tsx`) is the visual
source of truth; the organizer (`/app`), reviewer (`/r`) and speaker (`/p`)
shells follow it.

> Supersedes the previous "Monochrome Paper" system (refero style `0fd67ec5`),
> which forbade any chromatic colour beyond the destructive red. That rule is
> **retired**: violet is now the primary action colour and status badges carry
> semantic hues. Neutral surfaces and hairline borders are unchanged.

## Colors
| Token | Hex | Role |
|---|---|---|
| Canvas | `#f5f5f5` | Page background |
| Paper | `#ffffff` | Card surfaces, popovers, input fills |
| Surface Alt | `#fafafa` | Sidebar background, subtle card variant |
| Ink | `#0a0a0a` | Primary text, headings |
| Ink Soft | `#171717` | Secondary text |
| Mid Gray | `#737373` | Muted body text, placeholders, labels, eyebrows |
| Border | `#e5e5e5` | Hairline borders and resting rings |
| **Brand 600** | `#7C3AED` | **Primary buttons, active nav, focus ring** |
| Brand 700 | `#6D28D9` | Primary hover, accent text on tints |
| Brand 50/100/200/400/500 | `#F5F3FF` … `#8B5CF6` | Tints, hover surfaces, rings, dots |
| Navy | `#1E1B2E` | Wordmark, dark marketing panels |
| Destructive | `#e7000b` | Errors/destructive actions |

`brand-*` is a semantic alias of `ruckus-*` in `tailwind.config.ts`. **Prefer
`brand-*` in app code** so the accent can be retuned in one place; `ruckus-*`
stays for marketing surfaces.

## Typography — Geist body, Baloo 2 display
- Body/base: 14px / 400 / lh 1.43. Nav, buttons, links: 14px / 500.
- **`font-display` (Baloo 2) is reserved for page titles (`PageHeader`), dialog
  titles and the `Brand`/`RuckusWordmark` lockup** — never body text, table
  cells or labels. Display type is `font-extrabold` with `tracking-[-0.03em]`.
- Section eyebrow: `text-[12px] font-medium uppercase tracking-[0.18em] text-mid`.
- Badges/labels: 12px (`text-xs`) / 500. The marketing mock's 10px pills do not
  clear AA at these tints — **do not go below `text-xs` for coloured badges.**

## Geometry
- **Buttons, inputs, single-line controls, nav pills, badges: `rounded-full`.**
- Cards, dialogs, popovers, textareas, multi-line controls: `rounded-3xl` (24px)
  or `rounded-2xl` (16px) for nested/compact surfaces. Sidebar nav items:
  `rounded-xl`.
- Buttons are 36px tall (`h-9`), `px-4`.
- Card: white, 24px radius, 1px `#e5e5e5` border, `shadow-sm` at rest.
  Interactive cards opt into the lift: `hover:-translate-y-0.5
  hover:border-brand-200 hover:shadow-card` (`<Card hover>`).
- Shadows: `shadow-sm` (rest) → `shadow-card` (raised) → `shadow-lift`
  (`0 24px 70px -30px rgba(30,27,46,0.45)`, for dialogs, menus and popovers).

## Components (`src/web/components/ui.tsx`)
- **Primary button**: `bg-brand-600 text-white shadow-sm hover:bg-brand-700`,
  full pill, plus `.ruckus-press` for the tactile 2px push on `:active`.
- **Secondary button**: white with `ring-1 ring-brand-200 hover:ring-brand-400`.
  **Outline**: white with `ring-1 ring-line`. **Ghost**: transparent, muted text,
  `hover:bg-brand-50`. Treatments are **ring-based, not border-based** — rings do
  not shift layout.
- **Input / Select / Textarea**: white fill, `ring-1 ring-line` at rest,
  `focus:ring-2 focus:ring-brand-400`.
- **Badge** (semantic tones, `ring-1`, pill, `text-xs`):
  | Tone | Palette | Meaning |
  |---|---|---|
  | `ok` | emerald 50/700/200 | terminal good — accepted, published, ready |
  | `warn` | amber 50/800/200 | needs action — submitted, pending, draft |
  | `danger` | rose 50/700/200 | rejected, overdue, conflict |
  | `info` | brand 50/700/200 | in flight — in review, waitlisted |
  | `muted` | neutral 100/700/200 | neutral / unknown |
  | `primary` | brand 600 on white | emphasis chip |

  `statusTone()` maps domain statuses onto these; use `StatusBadge` rather than
  hand-rolling colours.
- **Table**: `TableWrap` (rounded, bordered, horizontally scrollable shell) +
  `Table` + `THead` + `Th` + `Td` + `Tr`. Every list table in the app uses these;
  pages supply only columns, cell content and testids. Row hover is
  `hover:bg-brand-50/50`.
- **Empty state**: dashed `border-brand-200`, violet icon badge, brand CTA.
- **Sidebar**: `#fafafa`; active item is `bg-brand-600 text-white rounded-xl`.
- **Shell brand**: `RuckusDuckMark` + Baloo 2 wordmark (the old monochrome "R"
  tile is gone).

## Focus & motion
- Focus ring is violet **app-wide**: `:focus-visible { outline: 2px solid
  var(--brand) }` in `src/web/style.css`. It used to be scoped to
  `.ruckus-brand`, which only the marketing page set, so the shells never got it.
- `.ruckus-press` and `.ruckus-noise` both respect
  `prefers-reduced-motion: reduce`.

## Rules
Do: violet primary actions; ring-based secondary treatments; semantic status
colour; hairline border on every card; pill controls; lift on interactive cards.

Don't: black primary buttons; gradients; coloured shadows; `font-display` in body
copy; coloured badge text below `text-xs`; hard-coded `rounded-[18px]` /
`rounded-[24px]` (use the Tailwind scale).

## Public widgets (server-rendered)
`src/publicSite.ts` ships one hand-written, self-contained CSS string
(`SHARED_CSS`) — **no Tailwind, no external stylesheet**, so widgets stay
iframe-ready anywhere. It mirrors this system with its own tokens:

- `--accent` / `--accent-strong` / `--accent-soft` / `--accent-line` /
  `--accent-contrast` default to the Ruckus violet, plus `--ok*` / `--warn*`
  semantic tokens and `--radius` 24px / `--radius-pill` 999px /
  `--radius-block` 14px.
- **Every brand surface derives from `var(--accent)`** — nav active state,
  buttons, `.pill.track`, avatars, day tabs, agenda blocks, stars, focus rings.
- An organizer's embed accent is injected by `withAccent()` as a single `:root`
  override appended just before `</head>`, so it wins the cascade and repaints
  the whole widget. Tints are derived with hex+alpha (`#rrggbb14` / `#rrggbb59`).
- Body `a` stays ink on purpose: gallery tiles and session cards are wrapped in
  anchors and should not be repainted. `.back`, `.toggle` and nav opt in.
- Generated initials avatars (`initialsAvatarDataUrl`) use the same violet.

## Not yet migrated
- `docs/screenshots/*` predate this restyle and need recapturing.
- `htmlPage()` in `src/app.ts` is retinted but currently unreferenced.
- Two deliberate ink hold-outs remain in app pages: the embed `<pre>` code block
  in `PublishFormsSettings.tsx` (dark-on-light code sample) and modal/menu
  scrims (`bg-ink/40`).
