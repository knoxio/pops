# US-02: Consolidator Worker

> PRD: [PRD-085: Curation Workers](README.md)
> Status: Done

## Description

As the Cerebrum system, I need a consolidator worker that detects clusters of similar engrams and produces merge plans so that redundant or fragmented knowledge is combined into curated documents while preserving the originals in `.archive/`.

## Acceptance Criteria

- [x] A `ConsolidatorWorker` class processes BullMQ jobs on the `pops:glia` queue with job name `glia:consolidate`
- [x] Cluster detection queries Thalamus for groups of 3+ engrams with cosine similarity above 0.85, scoped within the same top-level scope (e.g., `work.*` engrams never cluster with `personal.*` engrams)
- [x] For each detected cluster, the worker produces a merge plan: a curated Markdown document that preserves key content, deduplicates overlapping sections, and credits source engrams by ID in a `## Sources` section
- [x] The merged document receives the union of all tags from source engrams (deduplicated) and the union of all outbound links (re-pointed to the new engram's ID)
- [x] Source engrams are moved to `.archive/` with `status: consolidated` — their `links` arrays are updated to point to the new consolidated engram
- [x] Clusters exceeding 10 engrams are split into sub-clusters of max 10 (grouped by highest mutual similarity) to keep merge plans manageable
- [x] The worker checks the current trust phase for `consolidate` actions: in `propose` phase, it writes the merge plan as a `GliaAction` with the proposed merged content in the `payload` field; in `act_report` or `silent` phase, it creates the merged engram and archives originals
- [x] The worker skips engrams with `status: archived`, `status: consolidated`, or any scope containing `.secret.`

## Notes

- Merge plan generation uses LLM summarisation — the worker sends the cluster's engram bodies to the LLM with instructions to consolidate without losing key details.
- The consolidator is the highest-risk Glia worker because it modifies content. It will likely remain in `propose` phase longer than other action types.
- Cluster detection should use Thalamus's `cerebrum.retrieval.similar` (or equivalent) to find semantically related engrams, then filter by scope constraints.
- The merged engram's `source` field should be `agent` and its `type` should match the dominant type in the cluster.
- Re-pointing links means any engram that linked to a source engram should now link to the consolidated engram. This requires updating those external engrams' `links` arrays.
