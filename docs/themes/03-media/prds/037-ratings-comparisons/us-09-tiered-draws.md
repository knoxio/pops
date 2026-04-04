# US-09: Tiered draws

> PRD: [037 — Ratings & Comparisons](README.md)
> Status: Not started

## Description

Replace the single "Equal" draw button with three always-visible buttons between the two movie cards: **High**, **Mid**, **Low**. Each tier communicates absolute quality alongside the relative equality — two movies can be equally excellent, equally mediocre, or equally poor.

The draw tier feeds directly into the ELO outcome value:

| Tier | Outcome value | Effect |
|------|--------------|--------|
| High | 0.7 | Both gain score (they're equally good) |
| Mid | 0.5 | Standard draw (neutral) |
| Low | 0.3 | Both lose score (they're equally bad) |

## Acceptance criteria

- [ ] `comparisons` table has a `draw_tier` column: TEXT, nullable, values `'high'` | `'mid'` | `'low'` | null
- [ ] Drizzle migration generated and applied for the new column
- [ ] `record` tRPC procedure accepts optional `drawTier` input (validated as enum)
- [ ] ELO update uses outcome 0.7 (high), 0.5 (mid), 0.3 (low) when `winnerId = 0` and `drawTier` is set
- [ ] Legacy draws (no tier) continue to use 0.5
- [ ] Delete + replay recalculation respects stored `draw_tier` values
- [ ] Compare arena shows three stacked buttons between the two cards: High, Mid, Low (replacing the single Equal button)
- [ ] Each button has a distinct visual treatment (e.g. up-arrow / equals / down-arrow icons, or colour coding)
- [ ] Score delta animation works for all three tiers
- [ ] Tests cover: high draw both gain, mid draw neutral, low draw both lose, legacy null draw = 0.5
