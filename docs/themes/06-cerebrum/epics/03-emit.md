# Epic 03: Emit

> Theme: [Cerebrum](../README.md)

## Scope

Build the output layer that transforms stored knowledge into usable artifacts. Emit covers three output modes: Q&A (natural language questions answered from engrams and POPS data), document generation (reports, summaries, timelines), and proactive nudges (consolidation proposals, staleness alerts, pattern detection). All outputs respect scope boundaries — secret content is never included without explicit opt-in.

## PRDs

| #   | PRD                                                              | Summary                                                                               | Status      |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------- |
| 082 | [Query Engine](../prds/082-query-engine/README.md)               | Natural language Q&A, scope-aware retrieval, source attribution, multi-domain queries | Done        |
| 083 | [Document Generation](../prds/083-document-generation/README.md) | Reports, summaries, timelines — scope-filtered, audience-aware output documents       | Done        |
| 084 | [Proactive Nudges](../prds/084-proactive-nudges/README.md)       | Consolidation proposals, staleness alerts, pattern detection, notification delivery   | Not started |

PRD-082 (Query Engine) is the foundation — PRDs 083 and 084 depend on the retrieval and grounding patterns it establishes. PRD-083 and PRD-084 can parallelise after PRD-082.

## Dependencies

- **Requires:** Epic 01 (Thalamus — retrieval engine), Epic 02 (Ingest — needs content to exist)
- **Unlocks:** Epic 04 (Glia uses nudge patterns from PRD-084), Epic 05 (Ego consumes all three Emit modes)

## Out of Scope

- Chat interface or conversational UX (Epic 05 — Ego)
- Presentation rendering or PDF export (future enhancement)
- Automated report scheduling (Epic 06 — Reflex triggers report generation)
