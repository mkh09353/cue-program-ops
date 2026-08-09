# CUE Design System — "Monochrome Paper" (Vercel/shadcn-style, light)

Source: refero.design style `0fd67ec5` ("Ui" — based on ui.shadcn.com). Simple, elegant, engineered. Monochromatic; a single red reserved for destructive states.

## Colors (the entire palette)
| Token | Hex | Role |
|---|---|---|
| Canvas | `#f5f5f5` | Page background, muted surface fills, secondary/ghost buttons, input resting fill |
| Paper | `#ffffff` | Card surfaces, popovers |
| Surface Alt | `#fafafa` | Sidebar background, subtle card variant |
| Ink | `#0a0a0a` | Primary text, headings, button labels, icon strokes |
| Ink Soft | `#171717` | Filled (primary) button backgrounds, secondary text |
| Mid Gray | `#737373` | Muted body text, placeholders, labels |
| Border | `#e5e5e5` | Hairline borders everywhere |
| Destructive | `#e7000b` | Errors/destructive ONLY — never decoration or branding |

Three-tone surface stack: canvas → soft (`#fafafa`) → paper. Layering comes from tone, not heavy borders.

## Typography — Geist (fallback: system-ui/Inter stack)
- Body/base: 14px / 400 / lh 1.43. Nav, buttons, links: 14px / 500.
- Labels/badges: 12px / 500; uppercase stat labels 12px `#737373`.
- Headings: 24px/600 lh1.33 · 30px/600 lh1.2 · display 48px/600 lh1.1 tracking −0.05em.
- Tracking between −0.05em and +0.05em only. No body text below 14px lighter than `#737373`.

## Geometry
- Radius: **18px (full pill)** on ALL buttons, inputs, badges; **24px** on cards/containers. No other radii, no square corners.
- Buttons ~36px tall, padding 0 12px (compact) / 8px 16px (comfortable).
- Card: white bg, 24px radius, 1px solid `#e5e5e5`, shadow `0 0 0 1px rgba(23,23,23,0.05), 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)`, 20px padding.

## Components
- **Primary button**: bg `#0a0a0a`, text `#fafafa`, no border, no shadow — dark inversion is the only primary treatment.
- **Secondary/ghost button**: bg `#f5f5f5`, text `#0a0a0a`, no border, same dimensions as primary.
- **Input**: bg `#f5f5f5`, no border at rest, 18px radius, padding 8px 10px; focus = 1px `#e5e5e5` ring, no offset.
- **Badge**: pill, bg `#171717`, text `#fafafa`, 12px/500, padding 2px 8px. (Muted variant: `#f5f5f5` bg / `#0a0a0a` text.)
- **Sidebar**: `#fafafa` background.

## Rules
Do: dark-inversion primary buttons; hairline border on every card; solid tones only.
Don't: chromatic colors beyond `#e7000b`; gradients; colored shadows; accent fills; mixed radii; drama.
