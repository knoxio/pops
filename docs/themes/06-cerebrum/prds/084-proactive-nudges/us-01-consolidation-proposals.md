# US-01: Consolidation Proposals

> PRD: [PRD-084: Proactive Nudges](README.md)
> Status: Partial

## Description

As a user with a growing knowledge base, I want the system to detect clusters of semantically similar engrams and propose consolidating them into a single curated document so that my knowledge base stays lean and I discover duplication before it becomes a problem.

## Acceptance Criteria

- [x] A `ConsolidationDetector` scans the engram corpus using Thalamus embedding similarity to identify clusters of engrams with mutual similarity above the configured threshold (default 0.85)
- [x] Clusters must contain at least `consolidationMinCluster` engrams (default 3) to trigger a nudge
- [x] Consolidation nudges are never proposed for engrams in different top-level scopes (e.g., `personal.*` and `work.*` engrams are never clustered together, even if semantically similar)
- [x] Each consolidation nudge includes: a title summarising the cluster topic, a body listing the engram titles and their similarity scores, and a `consolidate` action that creates a new engram from the cluster
- [ ] Acting on a consolidation nudge (`cerebrum.nudges.act`) creates a new engram synthesised from the cluster sources (using LLM synthesis), archives the source engrams (`status: archived`), and links the new engram to the archived sources
- [x] The nudge cooldown prevents the same cluster from generating a duplicate nudge within `nudgeCooldownHours` (default 24 hours)
- [x] Dismissing a consolidation nudge prevents it from resurfacing unless a new engram joins the cluster (changing its composition)
- [x] The `nudge_log` table stores all created nudges with their type, status, engram references, and timestamps

## Notes

- Consolidation detection is computationally expensive (pairwise similarity across the corpus). It should run as a scheduled background job, not on every ingestion.
- The synthesis step when acting on a nudge uses the same LLM-based generation patterns from PRD-083 (Document Generation) — the consolidated engram is essentially a mini-report.
- Archived source engrams are moved to `.archive/` per PRD-077 conventions — they are never deleted.
- Consider using hierarchical clustering or DBSCAN-style density-based clustering rather than naive pairwise comparison to scale to large corpora.
