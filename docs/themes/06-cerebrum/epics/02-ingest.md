# Epic 02: Ingest

> Theme: [Cerebrum](../README.md)

## Scope

Build the ingestion pipeline that accepts content from multiple channels (manual input, agent sessions, quick captures), classifies it, extracts entities, infers scopes, and writes engram files. After this epic, a user can write a journal entry in the pops shell, dump a meeting summary via Claude Code MCP, or fire off a quick thought via Moltbot — and all of it lands as properly classified, scoped, and indexed engrams.

## PRDs

| #   | PRD                                                            | Summary                                                                                                      | Status      |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------- |
| 081 | [Ingestion Pipeline](../prds/081-ingestion-pipeline/README.md) | Input channels, content classification, entity extraction, scope inference, deduplication, template matching | In progress |

Single PRD — the ingestion pipeline is one cohesive flow from raw input to stored engram. Splitting it would create artificial boundaries in a naturally sequential process.

## Dependencies

- **Requires:** Epic 00 (engram storage — needs file format and directory), Epic 01 (Thalamus — uses search for deduplication checks)
- **Unlocks:** Epic 03 (Emit needs content to query), Epic 04 (Glia needs content to curate)

## Out of Scope

- Integration-specific adapters (Epic 07 — Plexus provides email, calendar, GitHub adapters that feed into this pipeline)
- Voice transcription (future — raw audio → text is a pre-processing step before ingestion)
- Bulk import tooling (future — one-time migration scripts for existing notes from other systems)
