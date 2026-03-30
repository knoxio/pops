# US-06: Recommendations frontend row

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a user, I want to see personalised recommendations with match scores and source attribution so I understand why each movie was suggested.

## Acceptance Criteria

- [ ] "Recommended for You" `HorizontalScrollRow`
- [ ] Hidden when `totalComparisons < 5`; shows CTA card linking to `/media/compare` instead
- [ ] Each card shows match percentage badge (colour-coded: green >=85%, emerald >=70%, grey below)
- [ ] Each card shows match reason: top 3 matching genres
- [ ] Subtitle: "Based on {source movie 1}, {source movie 2}, ..."
- [ ] Empty state: "No new recommendations — keep comparing"
- [ ] Loading skeleton while endpoint resolves
- [ ] Tests cover: cold start CTA, attribution, match badge, empty state
