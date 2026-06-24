# Compare Arena

> Status: Done

Pairwise comparison page at `/media/compare`. Two movie posters are shown side by side and the user picks a winner, records a tiered draw, or takes a secondary action (skip, mark stale, exclude from dimension, blacklist as not-watched, toggle watchlist). Each comparison feeds the ELO ranking engine. Controls are grouped into spatial zones so their meaning is discoverable from position alone.

Frontend lives at `pillars/media/app` (`pages/CompareArenaPage.tsx` + `pages/compare-arena/*` + `components/ComparisonMovieCard*`, `components/DrawTierButtons`). All data flows over the media REST contract — there is no arena-specific backend.

## Layout

Centered single column (`max-w-4xl`). Top to bottom: header, dimension picker, prompt line, then the comparison grid.

The comparison grid (`ArenaPair`) is a 3-column grid `1fr auto 1fr`, vertically centered: left card, center action column, right card.

```
┌──────────────────────────────────────────────────┐
│ Arena              [count]   [history]  [gear]    │
│ [▼ Dimension name]                                │
│ Which movie has better <dimension>?               │
│  ┌────────────┐    ▲                ┌────────────┐ │
│  │ 🔖     +N  │    ─                │ 🔖     -N  │ │
│  │   poster   │    ▼                │   poster   │ │
│  │ 🚫 ⏰ 👁    │   ───  ⏭          │ 🚫 ⏰ 👁    │ │
│  └────────────┘                     └────────────┘ │
│    Movie Title                        Movie Title  │
└──────────────────────────────────────────────────┘
```

- [x] Renders at `/media/compare`; grid is `grid-cols-[1fr_auto_1fr]`, items vertically centered
- [x] Left/right columns are movie cards (poster + title); center column is the draw-tier action stack

### Header

- [x] Title "Arena"; session-count `Badge` (`tabular-nums`) shown only when count > 0
- [x] History `Button` (History icon, `aria-label="Comparison history"`, tooltip "History") links to `/media/compare/history`
- [x] `<DimensionManager />` (gear) for editing dimensions

### Dimension picker

- [x] Ghost `Select` (`size="sm"`, `containerClassName="w-auto"`, `aria-label="Comparison dimension"`), one option per active dimension (`dim.active`)
- [x] Value reflects the smart-pair's chosen dimension; changing it sets a one-shot `manualDimensionId`, clears the score delta, and invalidates the smart-pair cache
- [x] Loading: single `Skeleton` (`h-11 w-48`). No active dimensions: "No dimensions configured yet."

### Prompt

- [x] "Which movie has better **{dimension}**?" — dimension name underlined with a `Tooltip` showing the dimension description when one exists

### Movie card (`ComparisonMovieCard`)

Vertical stack: poster shell (`CardWithActionOverlay`) + title button.

- [x] Poster is the primary winner click target (`aria-label="Pick {title}"`); title button below also picks the winner
- [x] Winner ring `ring-2 ring-success shadow-lg scale-[1.02]`; loser ring `ring-2 ring-destructive/50 opacity-75` (only while a delta is active); no border by default
- [x] Top-left overlay: watchlist bookmark (`backdrop-blur-sm`, dark glass; accent fill + `Bookmark fill-current` when on watchlist). Toggles add/remove, never dismisses the pair or records a comparison
- [x] Top-right overlay: ELO score-delta `Badge` (`+N` success / `-N` destructive, `animate-bounce`, `tabular-nums`), shown for 1.5s after a comparison
- [x] Bottom overlay (revealed on `group-hover` / `group-focus-within`): N/A (Ban), Stale (Clock), Not-watched (EyeOff, destructive hover) icon buttons. Each tap calls `stopPropagation` so it never picks a winner
- [x] Poster load failure falls back to a placeholder at the same `aspect-[2/3]` (handled by `CardWithActionOverlay`)

### Center column (`DrawTierButtons`)

Circular outline buttons (`rounded-full h-10 w-10`), tooltips on `side="right"` so they clear the cards:

- [x] Draw tiers: ChevronUp "Equally great" (success hover), Minus "Equally average", ChevronDown "Equally poor" (destructive hover)
- [x] Separator (`w-5 border-t my-1`), then SkipForward "Skip pair" (`aria-label="Skip this pair"`)
- [x] All center buttons disabled while a record mutation is pending or a score-delta animation is active

## REST API surface

All routes are served by the media pillar contract (`src/contract/rest-comparisons*.ts`, `rest-watchlist.ts`) and consumed via the generated client in `app/src/media-api`. No arena-specific endpoint exists.

| Endpoint                       | Method          | Use                                                                                               |
| ------------------------------ | --------------- | ------------------------------------------------------------------------------------------------- |
| `/comparison-dimensions`       | GET             | Populate dimension picker                                                                         |
| `/comparisons/smart-pair`      | GET             | Fetch the pair (optional `dimensionId` override); `reason: insufficient_watched_movies` when null |
| `/comparisons`                 | POST            | Record winner / tiered draw, updates ELO on both                                                  |
| `/comparisons/skip`            | POST            | Skip pair (cooloff for 10 global comparisons)                                                     |
| `/comparisons/blacklist-movie` | POST            | Not-watched: mark watch events, purge comparisons, recalc ELO                                     |
| `/comparisons/for-media`       | GET             | Comparison count shown in the blacklist confirm dialog                                            |
| `/comparison-scores`           | GET             | Fetch winner/loser scores to compute the delta animation                                          |
| `/comparison-scores/exclude`   | POST            | N/A: exclude one movie from the current dimension (purges its comparisons)                        |
| `/comparison-staleness/mark`   | POST            | Stale: `×0.5` weight per call (floor 0.01), advances pair                                         |
| `/watchlist` (list/add/remove) | GET/POST/DELETE | Watchlist status + bookmark toggle                                                                |

Poster `posterUrl` points at the `/media/images` byte route (Express static/proxy over `MEDIA_IMAGES_DIR`), which is **not** part of the ts-rest contract — see the media data-model PRD / pillar README.

## Business rules

- [x] Only watched (`completed`, non-blacklisted) movies are eligible; `smart-pair` prefers non-watchlisted ones and only falls back to including watchlisted movies when fewer than two non-watchlisted remain
- [x] `manualDimensionId` is a one-shot override: it resets to null after any recorded action so `smart-pair` auto-selects the next dimension
- [x] Score-delta animation lasts 1.5s (`DELTA_DISPLAY_MS`); every interactive button is disabled for that window (`isPending = recordPending || scoreDelta !== null`)
- [x] Not-watched requires a `BlacklistConfirmDialog` showing the comparison count to be purged before confirming
- [x] Stale and N/A each dismiss the current pair (invalidate `smart-pair`) and surface a success toast; watchlist toggles do neither
- [x] N/A is a no-op when there is no active dimension

## Edge cases

| Case                            | Behaviour                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| < 2 watched movies              | "Not enough watched movies" + CTA to library (`smart-pair` returns null, `watchlistedCount === 0`)                          |
| Eligible movies all watchlisted | "Not enough movies" + CTA to watchlist (`watchlistedCount > 0`)                                                             |
| No active dimensions            | "No dimensions configured yet." in place of the picker                                                                      |
| Touch / keyboard                | Bottom overlay reveals on `group-focus-within`; overlay buttons `stopPropagation` so the first tap reveals, second tap acts |
| Score delta active              | All buttons disabled for 1.5s                                                                                               |
| Score fetch fails               | Delta animation silently skipped, action still succeeds                                                                     |
| Smart-pair fetch error          | "Something went wrong" + retry button                                                                                       |

## Tests

- [x] `CompareArenaPage.test.tsx` covers pair rendering, winner pick, draw tiers, skip, stale, N/A, not-watched (with confirm), watchlist toggle, loading/fetching skeletons, and both empty states
- [x] `ComparisonMovieCard.test.tsx` covers the card in isolation: pick targets, watchlist toggle, the N/A / stale / not-watched overlay buttons (each `stopPropagation`), and the ELO score-delta badge

## Not built (see ideas)

- Mobile-specific layout breakpoints and inter-pair transition animations are deliberately absent — captured in [ideas/arena-mobile-and-transitions.md](../../ideas/arena-mobile-and-transitions.md).
