# Theme: Cerebrum

> Personal cognitive infrastructure — a self-curating knowledge base that compounds over a lifetime.

## Strategic Objective

Build a subsystem within POPS that ingests, stores, indexes, curates, and retrieves personal knowledge across every domain of life. Cerebrum stores content as human-readable Markdown files (engrams), indexes them alongside existing POPS domain data for semantic and structured retrieval, and runs autonomous background workers (Glia) that consolidate, prune, and cross-link content over time. The system enforces a hierarchical scope model so that personal, professional, and secret content coexist safely — the system sees everything internally but outputs respect audience boundaries.

The north star: **Output > Input.** The system must produce more value than the effort of putting data in. Every design decision flows from this principle.

## Architecture

Cerebrum is a subsystem umbrella containing multiple named components:

| Component    | Role                                           | Visibility |
| ------------ | ---------------------------------------------- | ---------- |
| **Engram**   | Storage — Markdown files with YAML frontmatter | Public     |
| **Thalamus** | Indexing/retrieval middleware                  | Hidden     |
| **Cortex**   | Interpreters — classification, extraction      | Hidden     |
| **Glia**     | Background curation workers                    | Hidden     |
| **Ingest**   | Input pipeline                                 | Public     |
| **Emit**     | Output production                              | Public     |
| **Reflex**   | Automation triggers                            | Public     |
| **Plexus**   | Plugin/integration system                      | Public     |

**Ego** (the chat agent) is a top-level sibling of Cerebrum, not a child. Ego consumes Cerebrum's retrieval and emit capabilities but has its own interface concerns.

## Success Criteria

- An engram written today is human-readable in 50 years without any software
- Semantic search returns relevant results within 500ms for a corpus of 100,000+ engrams
- Glia graduates to autonomous curation for at least one action type within 90 days of use
- A natural-language question returns a grounded answer citing specific engrams
- Content in `*.secret.*` scopes never appears in outputs without explicit opt-in
- The system surfaces consolidation opportunities before the user notices duplication
- Cross-domain queries work seamlessly (e.g., "what did I spend on that trip where I had the idea about X?")

## PRD Index

PRDs are grouped by the component they build. Each group's scopes are independent; a PRD relates to its component through this index.

**Engram Storage** — the engram file format, template system, scope model, and CRUD service. Engrams are human-readable Markdown files on disk, mirrored into a regenerable SQLite index; scopes are output filtering (not access control) that hard-block secret content from shared outputs.

| PRD                                                     | Summary                                                                          | Status |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| [Engram File Format & CRUD](prds/engram-file-format.md) | File format, YAML frontmatter, templates, SQLite index, CRUD service, REST       | Done   |
| [Scope Model](prds/scope-model.md)                      | Hierarchical dot-notation scopes, rules engine, filtering, secret-scope blocking | Done   |

**Thalamus** — indexing and retrieval middleware that makes engrams queryable. A file watcher keeps the SQLite index and embeddings in step with the Markdown files, re-embedding peer-pillar rows so semantic search spans engrams and domain data; the unified read surface fuses semantic, structured, and hybrid search with token-budgeted context assembly.

| PRD                                             | Summary                                                                             | Status  |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- | ------- |
| [Indexing & Sync](prds/indexing.md)             | File watcher, frontmatter-to-SQLite sync, embedding trigger, cross-source re-embed  | Partial |
| [Retrieval Engine](prds/retrieval-engine.md)    | Semantic / structured / hybrid search, context assembly, scope-filtered retrieval   | Done    |
| [Embeddings (read surface)](prds/embeddings.md) | Read-only coverage view over the embeddings metadata table for cross-pillar callers | Done    |

**Ingest** — the single path from raw input to a stored engram. Content enters through one capture-first pipeline (normalise → classify → match template → extract entities → infer scopes → dedup → write); manual ingest defaults to a single body input with structure inferred asynchronously.

| PRD                                              | Summary                                                                               | Status  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- | ------- |
| [Ingestion Pipeline](prds/ingestion-pipeline.md) | Input channels, classification, entity extraction, scope inference, dedup, templating | Partial |

**Emit** — the output layer that turns stored knowledge into usable artifacts across three modes: natural-language Q&A, document generation, and proactive nudges. Every output is scope-filtered and audience-aware; secret content is never included without explicit opt-in.

| PRD                                                | Summary                                                                             | Status  |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- | ------- |
| [Query Engine](prds/query-engine.md)               | Natural-language Q&A, scope-aware retrieval, citation attribution, multi-domain     | Partial |
| [Document Generation](prds/document-generation.md) | Reports, summaries, timelines — scope-filtered, audience-aware output documents     | Done    |
| [Proactive Nudges](prds/proactive-nudges.md)       | Consolidation proposals, staleness alerts, pattern detection, notification delivery | Partial |

**Glia** — autonomous curation workers that maintain engram quality over time. Four worker types (pruner, consolidator, linker, auditor) scan the corpus and emit proposed actions; every action type climbs the three-phase trust graduation model (propose → act+report → silent) per [ADR-021](architecture/adr-021-glia-trust-graduation.md), earning autonomy incrementally and demoting automatically on reverts.

| PRD                                          | Summary                                                                        | Status  |
| -------------------------------------------- | ------------------------------------------------------------------------------ | ------- |
| [Curation Workers](prds/curation-workers.md) | Pruner, consolidator, linker, auditor — the four Glia worker types             | Partial |
| [Trust Graduation](prds/trust-graduation.md) | Three-phase progression, approval tracking, immutable log, reversible demotion | Done    |

**Ego** — the conversational "I" of the system: a multi-turn chat engine grounded in engram retrieval, accessible through multiple channels. Each turn negotiates scopes, retrieves engrams via hybrid search, assembles context, calls the LLM, and attributes citations; channels are thin adapters over the core engine.

| PRD                                  | Summary                                                                            | Status  |
| ------------------------------------ | ---------------------------------------------------------------------------------- | ------- |
| [Ego Core](prds/ego-core.md)         | Conversation engine, scope negotiation, context assembly, conversation persistence | Partial |
| [Ego Channels](prds/ego-channels.md) | Shell chat panel, MCP tools for Claude Code, Moltbot, CLI                          | Partial |

**Reflex** — declarative event-action automation. Rules in `reflexes.toml` say _when_ something should happen (event, threshold, or schedule) and _what_ subsystem verb to run; the pillar validates them, holds them in a registry, exposes a management surface, and logs every firing.

| PRD                                    | Summary                                                                               | Status  |
| -------------------------------------- | ------------------------------------------------------------------------------------- | ------- |
| [Reflex System](prds/reflex-system.md) | Reflex definitions, trigger types, action dispatch, management surface, execution log | Partial |

**Plexus** — the extension point that connects Cerebrum to external data sources. Each adapter implements a standard TypeScript interface for ingesting external data into engrams (and optionally emitting outputs back out); the pillar owns the adapter contract, the in-process lifecycle manager, and the ingestion-filter framework. Concrete email/calendar/GitHub adapters are tracked as [core-integration-adapters](ideas/core-integration-adapters.md).

| PRD                                                | Summary                                                                                | Status  |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- | ------- |
| [Plugin Architecture](prds/plugin-architecture.md) | Adapter interface, lifecycle manager, ingestion filters, plugin registry, REST surface | Partial |

**Debrief** — post-watch reflection over media the user has finished. Cerebrum tracks one debrief session per (re-)watch and records per-dimension reflection results; the media tuple, watch-history, dimension, and comparison ids are soft pointers into the media pillar, so cerebrum's SQLite file stands alone.

| PRD                        | Summary                                                                               | Status  |
| -------------------------- | ------------------------------------------------------------------------------------- | ------- |
| [Debrief](prds/debrief.md) | Session/result tables, soft pointers into media, best-effort post-commit REST surface | Partial |

## Key Decisions

| Decision              | Choice                          | Rationale                                                                      |
| --------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| Storage model         | Markdown files + SQLite index   | Human-readable forever, queryable via index, index is regenerable (ADR-019)    |
| Scope model           | Hierarchical dot-notation tags  | Nestable, multi-assignable, prefix-queryable, `.secret.` hard-blocks (ADR-020) |
| Curation autonomy     | Three-phase trust graduation    | Earns trust incrementally, per-action-type, with automatic demotion (ADR-021)  |
| Vector storage        | sqlite-vec                      | Same database, same backup pipeline, sufficient at scale (ADR-018)             |
| Job processing        | BullMQ + Redis                  | Durable, retryable, dashboard-ready (ADR-016)                                  |
| External API contract | ts-rest + zod, OpenAPI emitted  | Typed REST contract; non-TS consumers get an OpenAPI document (ADR-017)        |
| Engram security       | Server-side, encrypted backups  | Never in git, mandatory encrypted backup, localhost-only MCP                   |
| Content typing        | Soft templates with typed hints | Templates suggest structure, types are classification hints not constraints    |

## Risks

- **Data loss during curation** — Glia consolidation could destroy valued content. Mitigation: archive-first (never delete), trust graduation (ADR-021), full audit trail, automatic demotion on reverts
- **Index drift** — SQLite index falls out of sync with Markdown files. Mitigation: file watcher with debounce, periodic full reindex, index is always regenerable from files
- **Scope leakage in outputs** — Secret content appears in a work report. Mitigation: `.secret.` hard-block at the Emit layer, scope-aware retrieval, explicit opt-in required
- **Context bloat** — Ego retrieves too much context, overwhelming the LLM. Mitigation: Thalamus retrieves ranked results with configurable limits, context assembly uses relevance thresholds
- **Embedding cost** — Large corpus generates significant API costs for embedding generation. Mitigation: content-hash deduplication (skip unchanged), Redis cache for repeat queries, batch processing during off-peak
- **Template drift** — New engram types are created ad-hoc without templates, degrading query quality. Mitigation: `type: capture` default for unstructured input, Cortex reclassifies later, Glia proposes template adoption

## Out of Scope

- Multi-user access or sharing (single-user system)
- Real-time collaboration
- Obsidian or any external editor integration (engrams are plain Markdown — use any editor directly)
- Mobile-native engram editor (use Moltbot for quick capture, pops shell for full editing)
- Local embedding model inference (remote API only — revisit if cost becomes a concern)
