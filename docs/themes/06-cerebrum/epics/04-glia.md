# Epic 04: Glia

> Theme: [Cerebrum](../README.md)

## Scope

Build the autonomous curation workers that maintain engram quality over time. Glia runs as BullMQ background jobs performing four action types: pruning (staleness detection, orphan cleanup), consolidation (merging related engrams), linking (cross-reference discovery), and auditing (contradiction detection, quality scoring). All actions follow the three-phase trust graduation model (ADR-021) — propose first, graduate to autonomous after earning trust. After this epic, the knowledge base actively fights entropy rather than accumulating cruft.

## PRDs

| #   | PRD                                                        | Summary                                                                                       | Status      |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------- |
| 085 | [Curation Workers](../prds/085-curation-workers/README.md) | Pruner, consolidator, linker, auditor — the four Glia worker types                            | Not started |
| 086 | [Trust Graduation](../prds/086-trust-graduation/README.md) | Three-phase progression (propose → act+report → silent), approval tracking, demotion triggers | Not started |

PRD-085 and PRD-086 develop in parallel — the workers (085) and the trust framework (086) are independent codepaths that integrate at the action dispatch layer. Workers can run in Propose-only mode while the trust system is built.

## Dependencies

- **Requires:** Epic 00 (engram storage), Epic 01 (Thalamus — similarity detection for consolidation), Epic 03 (Emit PRD-084 — nudge delivery for proposals)
- **Unlocks:** Epic 06 (Reflex can trigger Glia actions), self-sustaining knowledge base quality

## Out of Scope

- Content creation or ingestion (Glia curates existing content, doesn't create new content)
- Real-time curation during ingestion (Glia runs asynchronously, not in the ingest pipeline)
- Cross-scope consolidation (Glia never merges engrams across top-level scopes)
