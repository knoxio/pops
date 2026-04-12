# US-05: Addition Gating

> PRD: [Rotation Engine](README.md)

## Description

As a system, I need to gate movie additions on available disk space so that new movies are only added when the library is within its storage budget.

## Acceptance Criteria

- [ ] After expired movie deletions and new leaving marks, the cycle re-checks free space via Radarr
- [ ] If free space ≥ `rotation_target_free_gb`: proceed to add up to `rotation_daily_additions` movies from the candidate queue
- [ ] If free space < `rotation_target_free_gb`: skip additions entirely, log "additions skipped — below target free space"
- [ ] The addition count (`rotation_daily_additions`, default 2) is configurable via settings
- [ ] Each addition is estimated at `rotation_avg_movie_gb` for space budgeting — if adding N movies would project free space below target, reduce the count
- [ ] Actual add/remove counts and free space are recorded in the `rotation_log` entry

## Notes

This is a gate, not a driver. Removals are driven by disk space deficit (US-02). Additions are a fixed daily count that only runs when there's room. The `rotation_avg_movie_gb` estimate prevents over-adding — if target free space is 200GB, current is 210GB, and avg movie is 15GB, only add 0 movies (210 - 2×15 = 180 < 200).
