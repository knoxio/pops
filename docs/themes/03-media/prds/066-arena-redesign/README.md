# PRD-066: Arena Redesign

> Epic: [04 — Ratings & Comparisons](../../epics/04-ratings-comparisons.md)
> Status: Done

## Overview

The compare arena is a pairwise comparison page where two movie posters are shown side by side and the user picks a winner, records a draw, or takes a secondary action. This PRD specifies the arena's layout, interaction zones, and control placement.

## Layout

The arena uses a 3-column grid: `1fr auto 1fr`. The left and right columns hold movie cards. The center column holds actions that apply to both movies.

```
┌──────────────────────────────────────────────────┐
│ Arena                    [count] [history] [gear] │
├──────────────────────────────────────────────────┤
│ [▼ Dimension name    ]                            │
├──────────────────────────────────────────────────┤
│                                                   │
│  ┌────────────┐            ┌────────────┐        │
│  │ 🔖         │    ▲       │ 🔖         │        │
│  │            │    ─       │            │        │
│  │   poster   │    ▼       │   poster   │        │
│  │            │   ───      │            │        │
│  │ ▓▓ ⏰ 👁 ▓▓│    ⏭      │ ▓▓ ⏰ 👁 ▓▓│        │
│  └────────────┘    🚫      └────────────┘        │
│    Movie Title              Movie Title           │
│                                                   │
└──────────────────────────────────────────────────┘
```

### Header

- Title: "Arena"
- Session count: badge with number, only visible when > 0
- History: icon button (History icon) linking to `/media/compare/history`, with tooltip "History"
- Dimension manager: existing `<DimensionManager />` component (gear icon)

### Dimension Selector

A ghost-variant `<Select>` dropdown (`size="sm"`, `containerClassName="w-auto"`) showing all active dimensions. The selected value reflects the active dimension (set by backend via `getSmartPair` or overridden by user). Changing it sets `manualDimensionId`, clears any score delta, and invalidates the pair cache. Has `aria-label="Comparison dimension"`.

### Movie Card

Each card is a vertical stack: poster container + title.

**Poster container** — `group relative rounded-lg overflow-hidden`. Contains:

- A `<button>` wrapping an `<img>` with `aspect-[2/3] object-cover`. Clicking picks this movie as winner
- Winner/loser feedback via `ring-2`: green for winner with `scale-[1.02]`, red with `opacity-75` for loser
- No visible border in default state

**Top-left overlay** — Watchlist bookmark button:

- `absolute top-2 left-2`, circular, `backdrop-blur-sm`
- Dark glass style: `bg-black/50 text-white/80`
- When on watchlist: filled icon, accent background, disabled
- Tooltip: "Add to watchlist" / "On watchlist"
- Does not dismiss the pair or record a comparison

**Top-right overlay** — Score delta badge:

- Shows ELO point change after a comparison is recorded (`+N` green, `-N` red)
- `animate-bounce`, `tabular-nums`, visible for 1.5s then clears

**Bottom overlay** — Dismissing actions:

- `absolute bottom-0 inset-x-0`, gradient `bg-gradient-to-t from-black/60 to-transparent`, `backdrop-blur-sm`
- Hidden by default (`opacity-0`), visible on `group-hover` and `group-focus-within`
- Contains two circular icon buttons:
  - **Stale** (Clock icon): marks this movie as stale, advances to next pair. Tooltip: "Stale — reduce score weight". `aria-label="Mark {title} as stale"`
  - **Not Watched** (EyeOff icon): opens confirmation dialog, purges comparisons. Tooltip: "Not watched — remove from {dimension}". `aria-label="Not watched {title}"`. Red hover colour

**Title** — Below the poster container. A `<button>` that also picks the winner when clicked. `font-semibold text-sm text-center truncate`. Hover colour: `text-primary`.

### Center Column

Vertically stacked circular icon buttons (`rounded-full h-10 w-10 variant="outline"`) with tooltips (`side="right"`):

**Draw tier group:**

- ChevronUp — "Equally great" — `hover:border-green-500 hover:text-green-500`
- Minus — "Equally average" — `hover:border-muted-foreground`
- ChevronDown — "Equally poor" — `hover:border-red-500 hover:text-red-500`

**Separator:** `w-5 border-t border-border my-1`

**Pair actions:**

- SkipForward — "Skip pair" — `hover:border-muted-foreground`. `aria-label="Skip this pair"`
- Ban — "N/A for {dimension}" — `hover:border-muted-foreground`. `aria-label="Exclude both from {dimension}"`

All center buttons disabled during pending mutation or score delta animation.

## API Dependencies

All existing — no new endpoints:

| Procedure                                | Usage                                     |
| ---------------------------------------- | ----------------------------------------- |
| `media.comparisons.listDimensions`       | Populate dimension dropdown               |
| `media.comparisons.getSmartPair`         | Fetch two movies for comparison           |
| `media.comparisons.record`               | Record winner or draw with tier           |
| `media.comparisons.recordSkip`           | Skip pair with cooloff                    |
| `media.comparisons.markStale`            | Mark one movie as stale                   |
| `media.comparisons.excludeFromDimension` | Exclude both from current dimension       |
| `media.comparisons.blacklistMovie`       | Mark as not watched, purge comparisons    |
| `media.comparisons.scores`               | Fetch scores for delta animation          |
| `media.watchlist.list`                   | Check watchlist status                    |
| `media.watchlist.add`                    | Add to watchlist                          |
| `media.comparisons.listForMedia`         | Show comparison count in blacklist dialog |

## Business Rules

- Only watched movies are eligible for comparison
- After recording a comparison, `manualDimensionId` resets to null so the backend auto-selects the next dimension
- Score delta animation lasts 1.5s — all buttons disabled during this window
- Blacklist (not watched) requires a confirmation dialog showing the number of comparisons to be purged
- Watchlist actions do not dismiss the pair, record a comparison, or invalidate the pair cache
- Bottom overlay actions (stale, not watched) each dismiss the current pair and load a new one

## Edge Cases

| Case                        | Behaviour                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| Fewer than 2 watched movies | "Not enough watched movies" with CTA to library                                                   |
| All movies watchlisted      | "Not enough movies" with CTA to watchlist                                                         |
| No active dimensions        | "No dimensions configured yet" message                                                            |
| Touch devices (no hover)    | Bottom overlay activates on first tap, action on second tap. `group-focus-within` covers keyboard |
| Score delta active          | All interactive buttons disabled for 1.5s                                                         |
| Poster image fails to load  | `ImageOff` icon in muted placeholder, same aspect ratio                                           |

## User Stories

| #   | Story                                                   | Summary                                                                    | Status |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------- | ------ |
| 01  | [us-01-zone-layout](us-01-zone-layout.md)               | 3-column grid with poster cards, center action column, and bottom overlays | Done   |
| 02  | [us-02-dimension-dropdown](us-02-dimension-dropdown.md) | Ghost-variant Select dropdown for dimension switching                      | Done   |
| 03  | [us-03-tooltips](us-03-tooltips.md)                     | Tooltips on all icon-only buttons                                          | Done   |

## Out of Scope

- Changes to ELO algorithm, pair selection, or any backend logic
- Redesign of Rankings, Tier List, or Debrief pages
- Mobile-specific layout breakpoints
- Animations or transitions between pairs

## Drift Check

last checked: 2026-04-17
