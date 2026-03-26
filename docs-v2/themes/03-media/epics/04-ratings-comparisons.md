# Epic 04: Ratings & Comparisons

> Theme: [Media](../README.md)

## Scope

Build the pairwise comparison system (per ADR-010). Two movies presented side by side across taste dimensions, user picks a winner, ELO scores update. Rankings page shows the leaderboard. Radar charts on detail pages visualise per-dimension scores.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 037 | [Ratings & Comparisons](../prds/037-ratings-comparisons/README.md) | Compare arena page, dimension management, ELO scoring algorithm, rankings page, radar charts on detail pages, quick-pick flow | Done |

## Dependencies

- **Requires:** Epic 03 (only watched movies can be compared)
- **Unlocks:** Epic 05 (recommendations use comparison scores)

## Out of Scope

- TV show comparisons (hard UX problem — see ideas/media-ideas.md)
- Smart pair selection (uncertainty-based — future enhancement)
- AI-driven comparison prompts (future enhancement)
