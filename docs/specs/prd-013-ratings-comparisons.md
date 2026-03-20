# PRD-013: Ratings & Comparisons

**Epic:** [04 — Ratings & Comparisons](../themes/media/epics/04-ratings-comparisons.md)
**Theme:** Media
**Status:** Draft
**ADRs:** [008 — Pairwise ELO Ratings](../architecture/adr-008-pairwise-elo-ratings.md)

## Problem Statement

The media app needs a preference capture mechanism that produces richer data than star ratings while being low-friction enough that users actually do it. The comparison system is the core differentiator — it learns taste preferences through quick 1v1 choices and feeds the recommendation engine.

## Goal

A comparison "arena" where users pick winners between two movies across taste dimensions. ELO scoring builds a multi-dimensional preference profile. Rankings and score visualisations make the data visible and engaging. Movies only in v1.

## Requirements

### R1: Comparison Arena Page (`/media/compare`)

The primary comparison interface — designed to feel like a game, not a form.

**Layout:**
- Two movie cards side by side, each showing: poster, title, year
- Dimension prompt above the cards: "Which has better cinematography?"
- Tap/click either card to select the winner
- On selection: brief animation (winner card pulses/scales), scores update, next pair loads
- Skip button below cards: "Skip this pair"
- Dimension indicator: which dimension is active, tap to change or auto-rotate
- Session counter: "5 comparisons this session" (light gamification)
- "Done" button to exit the arena

**Interaction flow:**
1. Page loads → fetch random pair for a random active dimension
2. User taps a card → `media.comparisons.submit` called → animation → next pair auto-loads
3. User can skip → fetch next pair, no comparison recorded
4. User can change dimension → fetch new pair for selected dimension
5. User clicks "Done" → navigate back to library or previous page

**Mobile optimisation:** Cards stack vertically on mobile (portrait), side-by-side on tablet+. Tap targets are the full card area — large, easy to hit.

### R2: Dimension Selector

**On the arena page:**
- Current dimension shown as a chip/badge above the comparison cards
- Tap to open dimension picker: list of all active dimensions
- "Rotate" mode (default): automatically cycle through dimensions round-robin
- "Focus" mode: lock to a single dimension until manually changed

**Dimension management (admin):**
- Settings section or modal accessible from the arena page
- Add new dimension: name + optional description
- Edit dimension: rename, update description
- Deactivate dimension: hides from comparisons but preserves existing data
- Reorder dimensions: drag or up/down

### R3: ELO Score Updates

Per ADR-008, on each comparison:

1. Get (or create) `media_scores` rows for both movies on this dimension
2. Calculate new ELO scores using the pure `calculateElo` function:
   - K-factor: 32
   - Starting score: 1500
   - Standard ELO formula
3. Update both scores and increment `comparison_count`
4. Insert `comparisons` row
5. All in a single database transaction

**Response to client after submit:**
```typescript
{
  comparison: ComparisonRow,
  scoreA: number,      // new score for movie A
  scoreB: number,      // new score for movie B
  scoreChangeA: number // delta (positive for winner, negative for loser)
  scoreChangeB: number
}
```

The client can show the score change briefly in the animation: "+12" / "-12".

### R4: Random Pair Selection

`media.comparisons.getRandomPair({ dimensionId? })`

**Rules:**
- Only movies the user has watched (exists in `watch_history` with `media_type = 'movie'`)
- Both movies must be different
- Avoid repeating the same pair consecutively (best-effort — track the last served pair in memory, not database)
- If `dimensionId` is provided, use that dimension. Otherwise, pick a random active dimension.
- If fewer than 2 watched movies exist, return an error: "Need at least 2 watched movies to compare"

**Pair diversity:** With a small watched library (<20 movies), pairs will repeat. This is acceptable. Track compared pairs per dimension if needed to avoid immediate repeats, but don't over-engineer for small pools.

### R5: Rankings Page (`/media/rankings`)

Leaderboard view showing movies ranked by ELO score for a selected dimension.

**Layout:**
- Dimension selector at the top (tabs or dropdown)
- "Overall" tab: composite score (average across all dimensions)
- Ranked list: position number, poster thumbnail, title, year, score, comparison count
- Score bar or visual indicator of relative ranking
- Filter: only show movies with N+ comparisons (configurable, default 0)
- Click movie → navigate to movie detail page

**Data source:** `media.comparisons.getRankings({ dimensionId, limit, offset })`

### R6: Score Display on Movie Detail Pages

Activate the comparison scores section on movie detail pages (PRD-010 R5):

**Layout:**
- Section titled "Your Ratings" or "Comparison Scores"
- Radar chart (or bar chart) showing the movie's ELO score across all dimensions
- Each axis/bar labeled with dimension name
- Score value and comparison count per dimension
- "Not enough data" message if <3 comparisons total
- "Compare this movie" CTA linking to the arena with this movie pre-selected (stretch goal)

**Radar chart library:** Use a lightweight chart library compatible with React (e.g., recharts, visx, or custom SVG). Keep the dependency minimal — the radar chart is the only chart in v1.

### R7: Route Additions

Add to `@pops/app-media/routes`:
```typescript
{ path: 'compare', element: <CompareArenaPage /> },
{ path: 'rankings', element: <RankingsPage /> },
```

Add "Compare" and "Rankings" to the media app's secondary navigation.

## Out of Scope

- TV show comparisons (future — see [media ideas](../ideas/media-ideas.md))
- AI-driven comparison prompts (future idea)
- Smart pair selection (future idea)
- Comparison history or undo
- Social comparisons
- Comparing unwatched movies

## Acceptance Criteria

1. Comparison arena loads a random pair of watched movies with a dimension prompt
2. Tapping a card records the comparison and updates ELO scores
3. Score changes animate briefly on the cards
4. Next pair loads automatically after selection
5. Skip button works without recording a comparison
6. Dimension can be changed manually or auto-rotates
7. Fewer than 2 watched movies shows an error instead of the arena
8. Rankings page displays movies sorted by ELO score per dimension
9. "Overall" ranking shows composite score across dimensions
10. Radar chart on movie detail pages visualises dimension scores
11. Dimension CRUD works: add, edit, deactivate, reorder
12. Deactivated dimensions preserve existing data but don't appear in comparisons
13. All pages responsive at 375px, 768px, 1024px
14. `mise db:seed` updated with comparison data: enough comparisons to produce non-default scores and meaningful rankings
15. `pnpm typecheck` and `pnpm test` pass
16. Storybook stories for: comparison cards, rankings list, radar chart, dimension selector

## Edge Cases & Decisions

**Q: What happens when a movie is deleted from the library?**
A: The movie's comparisons and scores become orphaned. The delete procedure (PRD-007 US-3) should clean up `comparisons` and `media_scores` rows for the deleted movie. Rankings auto-update since the movie no longer exists.

**Q: What if the user has watched exactly 2 movies?**
A: The arena works — it just shows the same pair every time (for each dimension). This is fine. The "5+ comparisons" threshold for useful data applies to the *recommendation* engine, not the arena itself.

**Q: Should score changes be visible to the user?**
A: Show the delta briefly in the animation ("+12", "-12") as a satisfying feedback cue. Do NOT show the raw ELO number — it's meaningless to the user. Rankings use position numbers (1st, 2nd, 3rd), not scores.

**Q: What chart library for the radar chart?**
A: Evaluate recharts (most popular, largest bundle), visx (lower-level, smaller bundle), or custom SVG (smallest, most work). Recommend recharts for v1 — it has a `RadarChart` component out of the box. Swap later if bundle size becomes a concern.

## User Stories

> **Standard verification — applies to every US below.**
>
> **Sizing:** Each story is scoped for one agent, ~15-20 minutes.

### Batch A — Core (parallelisable)

#### US-1a: Comparison arena — card layout and selection
**Scope:** Create `CompareArenaPage.tsx`. Two movie cards side-by-side (poster, title, year). Dimension prompt above cards. Tap/click card to select winner → calls `media.comparisons.submit`. Brief animation on selection (winner pulses). Skip button below cards. Responsive: stacked vertical on mobile, side-by-side on tablet+. Add route + "Compare" to secondary nav.
**Files:** `packages/app-media/src/pages/CompareArenaPage.tsx`

#### US-1b: Comparison arena — flow logic
**Scope:** Add auto-load-next-pair after selection. Dimension auto-rotation (cycle through active dimensions). Session counter ("5 comparisons this session"). "Done" button exits arena. Dimension selector to switch/lock dimension. Score delta shown briefly in animation ("+12", "-12"). Data from `media.comparisons.getRandomPair`. Error state when <2 watched movies.
**Files:** `CompareArenaPage.tsx` (enhance)

#### US-2: Dimension management UI
**Scope:** Create a settings section or modal accessible from the arena page. Add new dimension (name + description). Edit existing (rename, update description). Deactivate (hides from comparisons, preserves data). Reorder (drag or up/down). Calls dimension CRUD procedures from PRD-007.
**Files:** New component (DimensionManager or settings section)

#### US-3: Rankings page
**Scope:** Create `RankingsPage.tsx`. Dimension selector (tabs or dropdown) at top. "Overall" tab shows composite score (average across dimensions). Ranked list: position number, poster thumbnail, title, year, score indicator bar. Click movie → detail page. Paginated. Add route + "Rankings" to secondary nav.
**Files:** `packages/app-media/src/pages/RankingsPage.tsx`

#### US-4: Radar chart on movie detail page
**Scope:** Add "Your Ratings" section to `MovieDetailPage`. Radar chart (use recharts `RadarChart`) with one axis per dimension. Score and comparison count per dimension displayed as tooltip or legend. "Not enough data" message when <3 total comparisons. Storybook story with variants: no data, partial data, full data.
**Files:** `MovieDetailPage.tsx`, new chart component, story
