# US-06: Recommendations frontend row

> PRD: [060 — Discover Page](README.md)
> Status: Done

## Description

As a user, I want to see personalised recommendations with match scores and source attribution so I understand why each movie was suggested.

## Acceptance Criteria

- [x] "Recommended for You" `HorizontalScrollRow`
- [x] Hidden when `totalComparisons < 5`; shows CTA card linking to `/media/compare` instead
- [x] Each card shows match percentage badge (colour-coded: green >=85%, emerald >=70%, grey below)
- [x] Each card shows match reason: top 3 matching genres
- [x] Subtitle: "Based on {source movie 1}, {source movie 2}, ..."
- [x] Empty state: "No new recommendations — keep comparing"
- [x] Loading skeleton while endpoint resolves
- [x] Tests cover: cold start CTA, attribution, match badge, empty state
