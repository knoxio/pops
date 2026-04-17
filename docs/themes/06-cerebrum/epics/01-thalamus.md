# Epic 01: Thalamus

> Theme: [Cerebrum](../README.md)

## Scope

Build the indexing and retrieval middleware that makes engrams queryable. Thalamus watches the engram directory for changes, syncs frontmatter to a SQLite index table, triggers embedding generation for content bodies, and indexes existing POPS domain data (transactions, media, inventory) into the same retrieval layer. After this epic, both semantic queries ("that time I was frustrated about the API redesign") and structured queries ("all decisions on project-x from March") return relevant results from engrams and POPS data.

## PRDs

| #   | PRD                                                             | Summary                                                                                        | Status      |
| --- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------- |
| 079 | [Engram Indexing & Sync](../prds/079-engram-indexing/README.md) | File watcher, frontmatter-to-SQLite sync, embedding trigger, cross-source indexing             | Not started |
| 080 | [Retrieval Engine](../prds/080-retrieval-engine/README.md)      | Semantic search, structured queries, hybrid search, scope-filtered retrieval, context assembly | Not started |

PRD-079 must complete before PRD-080 — the retrieval engine queries indexes that the sync system builds.

## Dependencies

- **Requires:** Epic 00 (engram file format and directory), Infrastructure PRD-076 (sqlite-vec and embedding pipeline)
- **Unlocks:** Epic 02 (Ingest uses Thalamus for deduplication checks), Epic 03 (Emit uses Thalamus for retrieval)

## Out of Scope

- Content creation or ingestion (Epic 02)
- Output production or chat (Epics 03, 05)
- Curation logic (Epic 04 — Glia reads from Thalamus but curation logic is separate)
