# US-02: Frontmatter Sync

> PRD: [PRD-079: Engram Indexing & Sync](README.md)
> Status: Done

## Description

As the Thalamus indexing service, I need to parse YAML frontmatter from changed engram files and synchronise it to the SQLite `engram_index`, `engram_scopes`, `engram_tags`, and `engram_links` tables so that structured queries against the index always reflect the current state of files on disk.

## Acceptance Criteria

- [x] A `FrontmatterSyncService` consumes batched file events from the file watcher and processes each event according to its type (create, modify, delete)
- [x] On create/modify: the file is read from disk, parsed with `gray-matter`, frontmatter is validated against the engram Zod schema (from PRD-077), and an upsert is performed on `engram_index` — inserting a new row or updating the existing one keyed by `id`
- [x] The `title` field is extracted from the first H1 heading (`# ...`) in the Markdown body, falling back to the first non-empty line if no H1 exists
- [x] `word_count` is computed from the Markdown body (excluding frontmatter), counting whitespace-delimited tokens
- [x] `content_hash` is the SHA-256 hex digest of the full file content (frontmatter + body)
- [x] Junction tables are synced atomically with the index upsert: `engram_scopes` rows are diffed and updated (inserts for new scopes, deletes for removed scopes), `engram_tags` likewise, and `engram_links` rows are created for each entry in the `links` array
- [x] On delete: the index entry is marked as `status: orphaned` — no rows are deleted from any table, and a structured warning is logged
- [x] Reconciliation detects orphaned index entries (entries whose `file_path` points to a file that no longer exists on disk) and marks them as `status: orphaned`
- [x] Files with frontmatter parse errors are skipped with a structured error log containing the file path and the specific validation errors — no partial data is written to the index

## Notes

- All index writes (upsert to `engram_index` + junction table diffs) should happen within a single SQLite transaction per file to ensure atomicity.
- The `custom_fields` column in `engram_index` stores any template-specific frontmatter fields as a JSON string. Fields not in the base schema are collected and serialised into this column.
- Link bidirectionality is a file-level concern (PRD-077 CRUD service) — the sync service simply records whatever `links` array the frontmatter contains. If A links to B but B's frontmatter doesn't list A, the sync service does not correct it.
- The Zod schema from PRD-077 (`engramFrontmatterSchema`) should be imported, not redefined here.
