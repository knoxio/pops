# US-09: Tiered draws

> PRD: [037 — Ratings & Comparisons](README.md)
> Status: Done

## Description

As a user, I want three draw tier buttons (High, Mid, Low) between the movie cards so I can express that two movies are equally great, equally average, or equally poor at a dimension.

The draw tier feeds directly into the ELO outcome value:

| Tier | Outcome value | Effect                                 |
| ---- | ------------- | -------------------------------------- |
| High | 0.7           | Both gain score (they're equally good) |
| Mid  | 0.5           | Standard draw (neutral)                |
| Low  | 0.3           | Both lose score (they're equally bad)  |

## Acceptance criteria

- [x] `comparisons` table has a `draw_tier` column: TEXT, nullable, values `'high'` | `'mid'` | `'low'` | null
- [x] `record` tRPC procedure accepts optional `drawTier` input (validated as enum)
- [x] ELO update uses outcome 0.7 (high), 0.5 (mid), 0.3 (low) when `winnerId = 0` and `drawTier` is set
- [x] Draws without a tier (null) use 0.5 for backward compatibility
- [x] Delete + replay recalculation respects stored `draw_tier` values
- [x] Compare arena shows three stacked buttons between the two cards: High, Mid, Low
- [x] Each button has a distinct visual treatment (e.g. up-arrow / equals / down-arrow icons, or colour coding)
- [x] Score delta animation works for all three tiers
- [x] Tests cover: high draw both gain, mid draw neutral, low draw both lose, null draw = 0.5
