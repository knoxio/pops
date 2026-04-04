# Epic 04: Ratings & Comparisons

> Theme: [Media](../README.md)

## Scope

Build the pairwise comparison system (per ADR-010). Two movies presented side by side across taste dimensions, user picks a winner, ELO scores update. Rankings page shows the leaderboard. Radar charts on detail pages visualise per-dimension scores.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 037 | [Ratings & Comparisons](../prds/037-ratings-comparisons/README.md) | Compare arena page, dimension management, ELO scoring algorithm, rankings page, radar charts on detail pages, quick-pick flow | Partial |
| 062 | [Comparison Intelligence](../prds/062-comparison-intelligence/README.md) | Probabilistic pair selection, staleness model, dimension exclusion, watch blacklist, skip cooloff, score confidence, freshness indicators | Done |
| 063 | [Post-Watch Debrief](../prds/063-post-watch-debrief/README.md) | Rapid-fire comparison session for newly watched movies — one opponent per dimension, median-score calibration | Done |
| 064 | [Batch Tier List](../prds/064-batch-tier-list/README.md) | Drag-and-drop S/A/B/C/D tier ranking for 8 movies per dimension, implied pairwise comparisons | Done |

## Dependencies

- **Requires:** Epic 03 (only watched movies can be compared)
- **Unlocks:** Epic 05 (recommendations use comparison scores)

## Out of Scope

- TV show comparisons (hard UX problem — see ideas/media-ideas.md)
- AI-driven comparison prompts (future enhancement)
