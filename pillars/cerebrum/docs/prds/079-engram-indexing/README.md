# PRD-079: Engram Indexing & Sync

> Epic: [01 — Thalamus](../../epics/01-thalamus.md)
> Status: Done

## Overview

Build the middleware that watches the engram directory for file changes, syncs frontmatter metadata to the SQLite `engram_index` table, triggers embedding generation for modified content, and indexes existing POPS domain data (transactions, media, inventory) into the same embedding pipeline. After this PRD, every engram change on disk is reflected in the index within seconds, and domain data from other POPS modules is searchable alongside engrams.

## Data Model

No new tables. This PRD writes to the tables defined in PRD-077 (`engram_index`, `engram_scopes`, `engram_tags`, `engram_links`) and PRD-076 (`embeddings`, `embeddings_vec`).

### Cross-Source Mapping

Domain data sources are mapped to the `embeddings` table using `source_type` and `source_id`:

| Domain       | `source_type` | `source_id`    | Embeddable Content                               |
| ------------ | ------------- | -------------- | ------------------------------------------------ |
| Engrams      | `engram`      | Engram ID      | Full Markdown body (chunked)                     |
| Transactions | `transaction` | Transaction ID | Description + notes + category + merchant        |
| Movies       | `movie`       | Movie ID       | Title + synopsis + genres + personal notes       |
| TV Shows     | `tv_show`     | Show ID        | Title + overview + genres + personal notes       |
| Books        | `book`        | Book ID        | Title + author + description + personal notes    |
| Inventory    | `inventory`   | Item ID        | Name + description + category + location + notes |

## API Surface

| Procedure                       | Input                  | Output                                    | Notes                                                    |
| ------------------------------- | ---------------------- | ----------------------------------------- | -------------------------------------------------------- |
| `cerebrum.index.status`         | —                      | `{ watching, lastSync, pending, errors }` | Watcher health and queue depth                           |
| `cerebrum.index.reindex`        | force?: boolean        | `{ enqueued: number }`                    | Full re-index from files; `force` ignores content_hash   |
| `cerebrum.index.reindexSources` | sourceTypes?: string[] | `{ enqueued: number }`                    | Re-index domain data sources into the embedding pipeline |
| `cerebrum.index.reconcile`      | dryRun?: boolean       | `{ orphaned, missing, mismatched }`       | Compare index to filesystem, report drift                |

## Business Rules

- The file watcher monitors `/opt/pops/engrams/` recursively for `.md` file changes, ignoring dotfiles and directories starting with `.` (`.templates/`, `.config/`, `.archive/`, `.index/`)
- File events (create, modify, delete, rename) are debounced with a 500ms window — multiple rapid writes to the same file produce a single sync event
- On file create or modify: parse frontmatter, validate against the engram Zod schema, upsert `engram_index` and junction tables, compute `content_hash` (SHA-256 of full file content), and enqueue an embedding job if the hash differs from the stored value
- On file delete: mark the index entry as `status: orphaned` and log a warning — Thalamus does not delete index entries automatically (the CRUD service handles archival; a raw file deletion is unexpected)
- On startup, Thalamus performs a reconciliation pass: every file on disk is checked against the index, and every index entry is checked against the filesystem
- Frontmatter parse errors skip the file and log a structured error with the file path and parse failure — the file is not indexed until it is fixed
- Embedding jobs are enqueued to the `pops-embeddings` BullMQ queue (PRD-076 infrastructure) with `{ sourceType: 'engram', sourceId, contentHash }`
- Domain data indexing runs as a scheduled BullMQ job (configurable interval, default every 6 hours) that scans domain tables for records with no embedding or a stale `content_hash`
- Domain data records compose embeddable text from multiple columns using source-type-specific formatters — each source type has a `toEmbeddableText()` function
- The `pops cerebrum reindex` CLI command triggers a full reconciliation + re-index of all engrams and domain sources

## Edge Cases

| Case                                          | Behaviour                                                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| File created then immediately deleted         | Debounce collapses to a no-op — no index entry created                                                         |
| File renamed (type change)                    | Detected as delete + create — old path orphaned, new path indexed                                              |
| Frontmatter is valid but body is empty        | File indexed normally — body is optional, embedding skipped for empty bodies                                   |
| Frontmatter missing required fields           | File skipped, structured error logged with missing fields listed                                               |
| Index entry exists but file is gone           | Reconciliation marks as `status: orphaned`, logged for investigation                                           |
| File exists but is not valid Markdown         | Binary or non-UTF-8 files are skipped with a warning                                                           |
| Engram directory does not exist at startup    | Fatal error — Thalamus refuses to start, logs clear message                                                    |
| BullMQ queue is unavailable                   | Embedding enqueue fails gracefully — file is still indexed, embedding retried on next change or reconciliation |
| Domain record deleted after embedding created | Orphaned embeddings cleaned up by PRD-076's periodic cleanup job                                               |
| Thousands of files on first startup           | Reconciliation batches file processing (100 files per tick) to avoid blocking the event loop                   |
| File watcher hits OS limit on watched files   | Logs error and falls back to periodic polling (60s interval)                                                   |

## User Stories

| #   | Story                                                   | Summary                                                                                        | Status | Parallelisable   |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------ | ---------------- |
| 01  | [us-01-file-watcher](us-01-file-watcher.md)             | Chokidar file watcher on engram directory with debounced change detection and batch processing | Done   | No (first)       |
| 02  | [us-02-frontmatter-sync](us-02-frontmatter-sync.md)     | Parse frontmatter from changed files, upsert into index tables, detect orphans                 | Done   | Blocked by us-01 |
| 03  | [us-03-embedding-trigger](us-03-embedding-trigger.md)   | Content hash comparison and BullMQ embedding job enqueue on file change                        | Done   | Blocked by us-02 |
| 04  | [us-04-cross-source-index](us-04-cross-source-index.md) | Index POPS domain data (transactions, media, inventory) into the embedding pipeline            | Done   | Yes              |

US-02 depends on us-01 (needs file events to process). US-03 depends on us-02 (needs the index entry to compare content hashes). US-04 is independent — it indexes domain data, not engram files.

## Verification

- A new `.md` file created in the engram directory appears in `engram_index` within 2 seconds
- Modifying an engram's frontmatter (e.g., changing scopes) updates the index and junction tables
- Modifying an engram's body content triggers an embedding job (verifiable via BullMQ queue inspection)
- Modifying only whitespace or formatting does not trigger re-embedding (content_hash unchanged)
- Deleting an engram file marks the index entry as orphaned
- `cerebrum.index.reconcile` correctly reports files missing from the index and index entries missing from the filesystem
- `pops cerebrum reindex` rebuilds the full index from disk and produces identical query results to the file-watched state
- Domain data from transactions, movies, and inventory items appears in `core.embeddings.search` results
- The file watcher survives engram directory churn (hundreds of files created/modified rapidly) without crashes or missed events
- Startup reconciliation on a cold database with existing engram files indexes all files correctly

## Out of Scope

- Embedding generation logic (PRD-076 — Vector Storage)
- Semantic or hybrid search queries (PRD-080 — Retrieval Engine)
- Scope-based auto-assignment (PRD-078 — Scope Model)
- Content creation or ingestion (PRD-081, Epic 02)
- Curation or consolidation of indexed data (PRD-085 — Glia Curation)
- LLM-based content classification (PRD-081 — Cortex Classification)

## Drift Check

last checked: 2026-04-17
