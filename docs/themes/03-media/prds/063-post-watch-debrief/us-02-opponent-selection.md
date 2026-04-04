# US-02: Median-score opponent selection

> PRD: [063 — Post-Watch Debrief](README.md)
> Status: Not started

## Description

As the system, I select a debrief opponent near the median score for each dimension so the comparison calibrates whether the movie is above or below average.

## Acceptance Criteria

- [ ] `getDebriefOpponent(mediaType, mediaId, dimensionId)` returns a single opponent movie
- [ ] Opponent is the scored movie closest to the median score for that dimension
- [ ] Excludes: the debrief movie itself, excluded-for-dimension movies, blacklisted movies, movies already compared against in this dimension
- [ ] If no eligible opponent exists, returns null (dimension will be skipped)
- [ ] Tests: selects median-range opponent, respects exclusions, returns null when exhausted
