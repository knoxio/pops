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

## Epics

| #   | Epic                                         | Summary                                                                        | Status      |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------ | ----------- |
| 0   | [Engram Storage](epics/00-engram-storage.md) | File format, templates, directory structure, scope model, CRUD operations      | Partial     |
| 1   | [Thalamus](epics/01-thalamus.md)             | File watcher, frontmatter indexing, embedding sync, cross-source retrieval     | Partial     |
| 2   | [Ingest](epics/02-ingest.md)                 | Manual/agent/capture input, classification, entity extraction, scope inference | Not started |
| 3   | [Emit](epics/03-emit.md)                     | Query engine, document generation, proactive nudges                            | Not started |
| 4   | [Glia](epics/04-glia.md)                     | Curation workers (pruner, consolidator, linker, auditor), trust graduation     | Not started |
| 5   | [Ego](epics/05-ego.md)                       | Chat agent — shell panel, MCP tools, Moltbot, CLI. Supersedes PRD-054          | Not started |
| 6   | [Reflex](epics/06-reflex.md)                 | Automation triggers — event, threshold, scheduled. reflexes.toml               | Not started |
| 7   | [Plexus](epics/07-plexus.md)                 | Plugin system — adapter interface, core integrations (email, calendar, GitHub) | Not started |

Epics 0-3 form Phase 1 (MVP): store, index, ingest, retrieve. Epics 4-5 form Phase 2: curation and chat interface. Epics 6-7 form Phase 3: automation and ecosystem. Within each phase, epics are sequential on their dependencies (0 before 1 before 2, etc.) but later phases can begin individual epics as their dependencies are met.

## Key Decisions

| Decision              | Choice                          | Rationale                                                                      |
| --------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| Storage model         | Markdown files + SQLite index   | Human-readable forever, queryable via index, index is regenerable (ADR-019)    |
| Scope model           | Hierarchical dot-notation tags  | Nestable, multi-assignable, prefix-queryable, `.secret.` hard-blocks (ADR-020) |
| Curation autonomy     | Three-phase trust graduation    | Earns trust incrementally, per-action-type, with automatic demotion (ADR-021)  |
| Vector storage        | sqlite-vec                      | Same database, same backup pipeline, sufficient at scale (ADR-018)             |
| Job processing        | BullMQ + Redis                  | Durable, retryable, dashboard-ready (ADR-016)                                  |
| External API contract | OpenAPI via trpc-openapi        | Non-TS consumers get a contract, tRPC stays primary (ADR-017)                  |
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
