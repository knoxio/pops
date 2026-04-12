# US-05: Selection Policy

> PRD: [Source Lists](README.md)

## Description

As a system, I need a weighted random selection policy so that higher-priority sources and higher-rated movies are more likely to be picked from the candidate queue.

## Acceptance Criteria

- [ ] `aggregateCandidates(count)` selects `count` movies from `rotation_candidates` where `status = 'pending'`
- [ ] Selection weight per candidate = `source_priority × (rating / 10)`. If rating is null, use `source_priority × 0.5`
- [ ] If multiple sources contributed the same `tmdb_id`, the effective priority is the maximum across those sources
- [ ] Candidates whose `tmdb_id` exists in the `movies` library table are excluded (already in library)
- [ ] Candidates whose `tmdb_id` exists in `rotation_exclusions` are excluded
- [ ] Selection uses weighted random sampling without replacement (once a movie is picked, it can't be picked again in the same cycle)
- [ ] The function returns the selected candidates with their computed weights for logging

## Notes

Weighted random sampling: compute cumulative weights, generate a random number, binary search for the selected index. Remove the selected item and repeat for the remaining count. Standard reservoir sampling also works.
