# US-03: Linker Worker

> PRD: [PRD-085: Curation Workers](README.md)
> Status: Done

## Description

As the Cerebrum system, I need a linker worker that scans engrams for implicit cross-references and proposes bidirectional links so that the knowledge graph grows denser and retrieval improves through explicit connections between related engrams.

## Acceptance Criteria

- [x] A `LinkerWorker` class processes BullMQ jobs on the `pops:glia` queue with job name `glia:link`
- [x] The worker scans engrams with fewer than 2 outbound links (configurable threshold in `glia.toml` under `[linker]`) as candidates for link discovery
- [x] For each candidate, the worker queries Thalamus for semantically similar engrams (cosine similarity above 0.7) and checks for shared entities — overlapping tags, shared people/project names in frontmatter, or overlapping topic keywords
- [x] When semantic similarity and entity overlap both indicate a strong relationship, the worker proposes a bidirectional link, producing a `GliaAction` with `action_type: 'link'` and a `payload` containing `{ sourceId, targetId, reason }` where reason describes the detected relationship
- [x] Duplicate link proposals are silently dropped — if a link already exists between two engrams (in either direction), no action is created
- [x] The worker respects scope boundaries — links are only proposed between engrams that share at least one top-level scope prefix (e.g., both under `work.*` or both under `personal.*`)
- [x] The worker checks the current trust phase for `link` actions: in `propose` phase, it writes actions to the `glia_actions` table; in `act_report` or `silent` phase, it calls `linkEngrams()` directly
- [x] The worker skips engrams with `status: archived`, `status: consolidated`, or any scope containing `.secret.`

## Notes

- Link discovery is lower-risk than consolidation or pruning — it adds metadata without modifying or archiving content. This action type may graduate to autonomous faster than others.
- The "shared entities" check should compare the `tags` arrays and any extracted entity fields in `custom_fields` between the candidate and the similar engram.
- The `reason` field in the payload should be specific enough for the user to evaluate the proposal (e.g., "Both engrams discuss 'LangGraph routing' and share tags: agents, coordination").
- The linker should limit proposals to max 5 new links per engram per run to avoid overwhelming the review queue.
