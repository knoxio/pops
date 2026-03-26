# US-02: Elo scoring

> PRD: [037 — Ratings & Comparisons](README.md)
> Status: To Review

## Description

As a system, I want to calculate and update Elo scores when a comparison is recorded so that movies accumulate ratings reflecting user preferences per dimension.

## Acceptance Criteria

- [ ] `media.comparisons.record` validates that the winner ID matches either media A or media B
- [ ] Both movies have a score record in `media_scores` for the given dimension — created at 1500.0 if not existing
- [ ] Expected score is calculated as: `1 / (1 + 10^((opponentScore - score) / 400))`
- [ ] Winner's new score: `oldScore + 32 * (1 - expectedScore)`
- [ ] Loser's new score: `oldScore + 32 * (0 - expectedScore)`
- [ ] Both score updates and the comparison record are written in a single database transaction
- [ ] `comparisonCount` on each movie's score record increments by 1
- [ ] `updatedAt` on each score record is set to the current timestamp
- [ ] If the transaction fails, no partial writes occur (neither scores nor comparison saved)
- [ ] Validation error if winner does not match media A or media B
- [ ] Validation error if dimension ID does not reference an active dimension
- [ ] Scores are stored as REAL with no rounding — precision preserved across updates
- [ ] Tests cover: correct Elo calculation for equal-rated movies, lopsided ratings, edge case where one movie has 1500 and opponent has 2000, transaction rollback on failure, validation errors, comparison count increment

## Notes

The K-factor of 32 provides moderate sensitivity — scores shift meaningfully with each comparison but stabilise over many comparisons. The starting score of 1500.0 is the Elo standard. Score precision matters — do not round to integers, as small differences compound over many comparisons. The record procedure should also call `getRandomPair` logic to avoid the pair just compared in subsequent calls.
