# US-02: Median-score opponent selection

> PRD: [063 — Post-Watch Debrief](README.md)
> Status: Done

## Description

As the system, I select a debrief opponent near the median score for each dimension so the comparison calibrates whether the movie is above or below average.

## Acceptance Criteria

- [x] `getDebriefOpponent(mediaType, mediaId, dimensionId)` returns a single opponent movie
- [x] Opponent is the scored movie closest to the median score for that dimension
- [x] Excludes: the debrief movie itself, excluded-for-dimension movies, blacklisted movies, movies already compared against in this dimension
- [x] If no eligible opponent exists, returns null (dimension will be skipped)
- [x] Tests: selects median-range opponent, respects exclusions, returns null when exhausted
