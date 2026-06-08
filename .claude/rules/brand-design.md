---
description: Telestar brand palette, UI design guidelines, and visual standards for the CRM
globs: "**/*.tsx, **/*.jsx, **/*.css, **/*.module.css, **/tailwind.config.*,  **/globals.css"
alwaysApply: true
---

# Brand & Design — Telestar SDR CRM

Logo: a fiery star with flame-wing motif on a dark background. The UI should feel
**fast, sharp, and industrial** — think Linear, Attio, HubSpot. Not soft or playful.

## Brand Palette

| Token        | Hex       | Usage                                        |
|--------------|-----------|----------------------------------------------|
| Primary dark | `#0A0A0A` | Sidebar background (range: `#0A0A0A`–`#1A1A1A`) |
| Fire red     | `#D42B1E` | Primary action color — buttons, active states |
| Flame orange | `#E8611A` | Secondary accent — hover states, badges       |
| Gold/amber   | `#F5A623` | Highlights, success states (Won deals)        |
| Hot yellow   | `#FEDD44` | Sparingly — attention-only elements           |

Dark sidebar, light content area (white or very light gray). Logo in sidebar header.

## Layout & Typography

- **Desktop-first** at 1280px+. Collapse sidebar to icons-only below that.
- Body text 13–14px for density. Monospace accents for IDs and timestamps.
- Tight spacing: 12–16px padding in cards, 8px gaps in lists, 36–40px table row height.
- 1px solid muted borders. Subtle elevation only for modals and slide-over panels.
- Icons: **lucide-react** throughout — every channel, stage, and action gets an icon.

## Channel Color Map

| Channel   | Color         |
|-----------|---------------|
| Email     | Blue          |
| Phone     | Green         |
| LinkedIn  | Indigo/navy   |
| WhatsApp  | Emerald/teal  |

## Pipeline Stage Badge Colors

| Stage           | Color                        |
|-----------------|------------------------------|
| New             | Gray                         |
| Sequence Active | Blue                         |
| Replied         | Amber/yellow                 |
| Meeting Booked  | Emerald/green                |
| Won             | Green with checkmark         |
| Lost            | Red with X                   |
