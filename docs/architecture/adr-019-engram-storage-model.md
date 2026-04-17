# ADR-019: Engram Storage Model — Markdown Files with SQLite Index

## Status

Accepted

## Context

Cerebrum stores personal knowledge — journal entries, ideas, decisions, research, meeting notes, captures. This content spans decades, must survive technology changes, and must be browsable without any tooling. Pops uses SQLite for all structured domain data (ADR-001), but knowledge content is fundamentally different from transactional records: it's prose-heavy, variably structured, frequently linked, and must remain human-readable as a primary requirement (not just a nice-to-have).

The system must also support fast retrieval — semantic search, structured queries on metadata, and scope-based filtering — which pure file-based storage cannot provide alone.

## Options Considered

| Option                           | Pros                                                                               | Cons                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| SQLite only (pops convention)    | Single storage, single backup, fast queries, existing patterns                     | Not human-readable without tooling, poor for prose, no git-diffable history, not portable |
| Markdown files only              | Human-readable forever, portable, git-diffable, no dependencies                    | No structured queries, no vector search, no relational joins, file listing doesn't scale  |
| Markdown + SQLite index (hybrid) | Human-readable source of truth, fast queries via index, vectors alongside metadata | Two storage systems to sync, index can drift, more complex than either alone              |
| Notion-style blocks in SQLite    | Flexible structure, queryable, rich content types                                  | Proprietary format, not human-readable, lock-in, can't browse at 89 without a running app |

## Decision

Markdown files as source of truth, SQLite as a derived index. Engrams are `.md` files with YAML frontmatter stored in a server-side directory (`/opt/pops/engrams/`). A SQLite index table mirrors frontmatter fields for structured queries. Vector embeddings (ADR-018) index the content body for semantic search. The index is fully regenerable from the files — deleting the index and rebuilding it produces an identical result.

This preserves the "browsable at 89" requirement while giving Thalamus (the indexing layer) the query performance it needs. The Markdown files are the contract; the SQLite index is an optimisation.

Engram files never enter the git repository. They live on the server, are backed up encrypted via the existing rclone+age pipeline, and are accessed only through authenticated API endpoints or localhost MCP connections.

## Consequences

- Engrams are Markdown files with YAML frontmatter — portable, human-readable, future-proof
- A file watcher (Thalamus) detects changes and syncs frontmatter to a SQLite `engram_index` table
- Vector embeddings are generated asynchronously (BullMQ) and stored via sqlite-vec (ADR-018)
- Structured queries (by type, scope, date, frontmatter fields) hit SQLite, not the filesystem
- Semantic queries (natural language) hit the vector index, which joins back to file paths
- File operations (create, rename, delete) are the canonical mutations — the index follows
- If the index is lost or corrupted, `pops cerebrum reindex` rebuilds it from the files
- Pops domain data (transactions, media, inventory) remains in SQLite — Thalamus indexes both sources into the same retrieval layer
- The engram directory is NOT in the pops git repository — it contains personal data that must never be committed
- Backup encryption is mandatory — engrams are the most sensitive data in the system
