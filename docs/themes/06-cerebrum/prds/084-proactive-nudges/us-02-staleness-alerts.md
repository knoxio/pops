# US-02: Staleness Alerts

> PRD: [PRD-084: Proactive Nudges](README.md)
> Status: Partial

## Description

As a user, I want the system to detect engrams that have not been referenced or modified in a configurable number of days and flag them as potentially stale so that I can review, update, or archive outdated knowledge.

## Acceptance Criteria

- [x] A `StalenessDetector` queries the engram index for engrams where `modified_at` is older than `stalenessDays` (default 90) and no inbound links, query citations, or nudge references exist within that period
- [ ] Staleness is determined by two signals: (1) the engram's `modified_at` timestamp, and (2) whether the engram has been referenced in query results, cited in generated documents, or linked to by other engrams within the threshold period
- [x] Staleness nudges include the engram title, its age (days since last modification), its last reference date (if any), and suggested actions: `review` (mark as reviewed, resetting the staleness clock) or `archive` (set status to archived)
- [x] Engrams with `status: archived` or `status: consolidated` are excluded from staleness detection — they are already out of the active corpus
- [x] Staleness nudges are suppressed until the system has at least 30 days of activity (measured from the oldest engram's creation date) to avoid false positives on a fresh corpus
- [ ] Acting on a staleness nudge with `archive` moves the engram to `.archive/` and sets `status: archived`; acting with `review` updates the `modified_at` timestamp to the current time
- [x] The nudge cooldown prevents the same engram from generating duplicate staleness alerts within `nudgeCooldownHours`

## Notes

- Staleness detection should be a lightweight query against the index — it does not need embedding computations.
- "Referenced in query results" requires tracking which engrams appear in query responses. This could be implemented as a `last_referenced_at` column in the engram index (updated by the query engine and document generation pipelines).
- The 30-day suppression on fresh corpora prevents every engram from being flagged as stale during the initial build-out period.
- Consider different staleness thresholds per engram type — decisions might have a longer acceptable staleness period than captures.
