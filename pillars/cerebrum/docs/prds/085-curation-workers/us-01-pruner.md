# US-01: Pruner Worker

> PRD: [PRD-085: Curation Workers](README.md)
> Status: Done

## Description

As the Cerebrum system, I need a pruner worker that computes staleness scores for engrams and detects orphans so that stale or abandoned content is identified and proposed for archival rather than cluttering the knowledge base.

## Acceptance Criteria

- [x] A `PrunerWorker` class processes BullMQ jobs on the `pops:glia` queue with job name `glia:prune`
- [x] Staleness score computation combines four weighted factors: days since last modification (0.3), days since last reference in a query or link (0.3), inbound link count (0.2, inverse), and Thalamus query hit count (0.2, inverse) — producing a score between 0.0 (fresh) and 1.0 (stale)
- [x] Engrams with a staleness score above the configurable threshold (default 0.7 from `glia.toml`) are flagged for archival, producing a `GliaAction` with `action_type: 'prune'` and a rationale string explaining the dominant staleness factors
- [x] Orphan detection identifies engrams with zero inbound links AND zero Thalamus query hits in the last 90 days, using a lower staleness threshold of 0.5 (configurable)
- [x] The worker skips engrams with `status: archived`, `status: consolidated`, or any scope containing `.secret.`
- [x] The worker checks the current trust phase for `prune` actions: in `propose` phase, it writes `GliaAction` records to the `glia_actions` table without modifying engrams; in `act_report` or `silent` phase, it calls `archiveEngram()` for approved actions
- [x] Query hit counts are sourced from a `query_hits` counter in the engram index (incremented by Thalamus on each retrieval) — if no counter exists, the factor defaults to maximum staleness contribution
- [x] A `getStalenessScore(engramId)` function returns the computed score with a breakdown of individual factor contributions for debugging and UI display

## Notes

- Staleness thresholds are read from `engrams/.config/glia.toml` under the `[pruner]` section.
- The "days since last reference" factor requires Thalamus to track when an engram was last returned in a search result — this may be a `last_queried_at` column on `engram_index` or a separate tracking mechanism.
- The pruner should process engrams in batches (configurable, default 100 per tick) to avoid blocking the event loop on large corpora.
- Archive proposals should include enough context in the `rationale` field for the user to make an informed approve/reject decision without opening the engram.
