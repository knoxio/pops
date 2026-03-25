# Epic: Ratings & Comparisons

**Theme:** Media
**Priority:** 4 (can run in parallel with Epic 3 after Epic 2)
**Status:** Done

## Goal

Build the 1v1 pairwise comparison system that learns taste preferences across configurable dimensions. Instead of "rate this movie 1–5 stars," the user picks a winner between two titles on a specific dimension. Quick, binary, enjoyable — and produces richer preference data than scalar ratings.

## How it works

1. The system presents two movies side by side with a dimension prompt: "Which has better cinematography?"
2. The user taps one. Done. Two taps total (see pair, pick winner).
3. The winner's ELO score for that dimension increases; the loser's decreases.
4. Over time, each movie accumulates scores across all dimensions, building a multi-dimensional taste profile.

ELO-style scoring means that beating a high-ranked title is worth more than beating a low-ranked one. The scores self-calibrate as more comparisons accumulate.

## Scope

### In scope

- **Comparison dimensions:**
  - Configurable list stored in `comparison_dimensions` table
  - Default seed set (specific dimensions TBD in PRD — candidates: cinematography, fun, emotional impact, rewatchability, soundtrack, acting)
  - Admin-level ability to add/remove/rename dimensions
  - Dimensions are data, not code — no deploy needed to change them
- **Comparison flow (movies only in v1):**
  - Present two movies side by side with poster, title, year
  - Display the dimension being compared ("Which is more rewatchable?")
  - User taps the winner — comparison recorded, scores updated
  - Immediate next comparison (optional — user can stop anytime)
  - Random pair selection from the user's watched movies (only compare things you've seen)
- **ELO scoring:**
  - Standard ELO formula (K-factor TBD in PRD, likely K=32 initially)
  - Each media item starts at 1500 per dimension
  - Scores stored in `media_scores` table
  - Score updated synchronously on comparison submit
- **Comparison UI:**
  - Dedicated comparison page (`/media/compare`) — the "arena"
  - Dimension selector (or rotate through dimensions automatically)
  - Side-by-side card layout (poster + title + year)
  - Tap to select winner, brief animation, next pair
  - Skip button (don't want to compare these two)
  - Comparison count / streak indicator (gamification light)
- **Rankings view:**
  - Per-dimension leaderboard (`/media/rankings`) — all movies ranked by score for a selected dimension
  - Overall composite score (average across dimensions, or weighted — TBD)
- **Score display:**
  - Dimension scores shown on movie detail pages
  - Radar chart or bar chart showing the multi-dimensional profile of a single movie

### Out of scope

- **TV show comparisons** — Seasons within a show vary too dramatically to compare at the show level (GoT S1 vs S7 are different products). Season-level comparisons create an unwieldy cross-show space. TV comparisons need their own UX design — deferred to a future enhancement.
- AI-driven comparison prompts (future idea — Haiku generates dimensions/pairings)
- Smart pair selection (future idea — uncertainty-based matching)
- Comparison history / undo (keep it lightweight)
- Social comparisons (comparing your rankings with others)
- Comparisons between unwatched items

## Deliverables

1. Comparison dimensions CRUD via tRPC (create, update, deactivate, reorder)
2. Default dimensions seeded on first run
3. Comparison recording via tRPC (submit winner, update ELO scores atomically)
4. Random pair selection endpoint (returns two watched movies for a given dimension)
5. Comparison page with side-by-side layout, dimension display, tap-to-select
6. Rankings page with per-dimension leaderboards
7. Dimension scores displayed on media detail pages
8. Score visualisation (radar chart or similar) on detail pages
9. Skip functionality for unwanted pairs
10. Unit tests for ELO calculation logic
11. Unit tests for pair selection (only watched movies, no duplicate pairs in sequence)
12. Storybook stories for comparison cards, ranking list, score visualisation
13. `mise db:seed` updated with comparison data — seeded comparisons across dimensions with resulting ELO scores, enough to produce meaningful rankings and non-default radar charts

## Dependencies

- Epic 0 (Data Model) — comparison_dimensions, comparisons, media_scores tables
- Epic 2 (App Package & Core UI) — pages and components to extend
- Epic 3 (Tracking & Watchlist) — comparisons only work on watched items; watch history must exist

## Risks

- **Comparison fatigue** — If comparisons feel like homework, users stop doing them. Mitigation: two taps per comparison, never forced, surfaced contextually. The comparison page should feel like a game, not a form.
- **Small library cold start** — With <20 watched titles, comparisons get repetitive (same pairs cycling). Mitigation: track which pairs have been compared for each dimension and avoid repeats until the pool is exhausted.
- **ELO instability with few comparisons** — ELO scores are noisy with <10 comparisons per item. Mitigation: display comparison count alongside score. The recommendations engine (Epic 5) should weight scores by confidence (comparison_count).
- **Movie-only pool size** — If the watched movie library is small (<20), comparisons get repetitive quickly. Mitigation: track compared pairs per dimension, avoid repeats until the pool is exhausted. TV show comparisons will expand the pool when the UX is designed.
