# US-03: Embedding Trigger

> PRD: [PRD-079: Engram Indexing & Sync](README.md)
> Status: Done

## Description

As the Thalamus indexing service, I need to detect when an engram's content has meaningfully changed and enqueue an embedding generation job via BullMQ so that the vector index stays in sync with file content without redundant re-embedding of unchanged files.

## Acceptance Criteria

- [x] After the frontmatter sync completes for a create or modify event, the `content_hash` (SHA-256 of full file content) is compared to the previously stored `content_hash` in the `engram_index` row
- [x] If the hash differs (or no previous hash exists), an embedding job is enqueued to the `pops:embeddings` BullMQ queue with payload `{ sourceType: 'engram', sourceId: string, content: string }` — body text is included so the worker does not need to re-read the file
- [x] If the hash matches the stored value, no embedding job is enqueued — the existing embedding is still valid
- [x] Engrams with empty bodies (zero words after frontmatter) do not trigger embedding jobs — there is nothing to embed
- [x] If the BullMQ queue is unavailable (connection error, Redis down), the embedding enqueue fails gracefully — the file is still indexed in SQLite, and a structured error is logged with the engram ID for retry
- [x] A `force` flag on the reindex API bypasses the content_hash check and enqueues embedding jobs for all indexed engrams regardless of hash match
- [x] The embedding trigger emits a metric/log for observability: `{ engramId, action: 'enqueued' | 'skipped' | 'error', reason }`

## Notes

- The embedding queue and job handler are built in PRD-076 (Vector Storage). This story only enqueues jobs — it does not process them.
- The `content_hash` comparison is the deduplication mechanism described in ADR-018. The hash covers the full file content so that both frontmatter changes and body changes are detected, but only body changes produce meaningfully different embeddings. This is acceptable — the embedding pipeline in PRD-076 uses its own `content_hash` column in the `embeddings` table as a second deduplication gate.
- BullMQ job options should include a reasonable `attempts` count (3) and exponential backoff for transient failures.
- The `filePath` in the job payload allows the embedding worker to read the file content directly rather than requiring a separate lookup.
