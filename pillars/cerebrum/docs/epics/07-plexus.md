# Epic 07: Plexus

> Theme: [Cerebrum](../README.md)

## Scope

Build the plugin system that connects Cerebrum to external data sources and services. Plexus defines a standard adapter interface for bidirectional data flow: ingesting data from external systems (email, calendar, GitHub) into engrams, and emitting outputs to external systems (send a summary via email, create a calendar event). Each adapter handles connection, authentication, filtering (not all data is worth ingesting), and transformation. After this epic, Cerebrum's knowledge base grows automatically from the user's digital life.

## PRDs

| #   | PRD                                                              | Summary                                                                                  | Status |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------ |
| 090 | [Plugin Architecture](../prds/090-plugin-architecture/README.md) | Adapter interface, lifecycle management, plugin registry, configuration, error isolation | Done   |
| 091 | [Core Integration Adapters](../prds/091-core-adapters/README.md) | Email, calendar, and GitHub adapters as reference implementations                        | Done   |

PRD-090 (Architecture) must complete before PRD-091 (Core Adapters) — the adapters implement the interface that the architecture defines.

## Dependencies

- **Requires:** Epic 02 (Ingest — adapters feed into the ingestion pipeline), Epic 03 (Emit — adapters can be output targets)
- **Unlocks:** Automated knowledge ingestion from digital life, bidirectional integrations

## Out of Scope

- Specific adapter implementations beyond the three reference adapters (community or future work)
- Real-time streaming from external sources (adapters poll or use webhooks, not persistent connections)
- OAuth consent flows for third-party users (single-user system — credentials are configured directly)
- Home automation integration (Phase 6 — depends on HomeAssistant evaluation)
