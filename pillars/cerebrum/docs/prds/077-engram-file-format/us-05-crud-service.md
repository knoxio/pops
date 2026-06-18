# US-05: Engram CRUD Service

> PRD: [PRD-077: Engram File Format & Directory Structure](README.md)
> Status: Done

## Description

As the Cerebrum system, I need a service layer that performs engram CRUD operations by writing files to disk and synchronizing the SQLite index so that the filesystem remains the source of truth while the index enables fast queries.

## Acceptance Criteria

- [x] `createEngram(input)` generates an ID, writes a valid engram `.md` file to `{type}/{id}.md`, then inserts the corresponding rows into `engram_index`, `engram_scopes`, `engram_tags`, and `engram_links` — file write happens before index insert
- [x] `readEngram(id)` looks up the file path from the index, reads the file from disk, parses it with `parseEngramFile`, and returns both the validated frontmatter and the Markdown body
- [x] `updateEngram(id, changes)` reads the existing file, merges changes into frontmatter and/or body, updates the `modified` timestamp, writes the file, then updates all affected index rows (including re-syncing scopes, tags, and links)
- [x] `archiveEngram(id)` moves the file from `{type}/{id}.md` to `.archive/{type}/{id}.md`, sets `status` to `archived` in the index, and updates the `file_path` column
- [x] `linkEngrams(sourceId, targetId)` adds `targetId` to the source file's `links` array and `sourceId` to the target file's `links` array, writes both files, and inserts rows in `engram_links` for both directions
- [x] `unlinkEngrams(sourceId, targetId)` removes the link from both files' `links` arrays, writes both files, and deletes the corresponding `engram_links` rows in both directions
- [x] `reindex()` scans all `.md` files under the engram root (excluding `.archive/` and `.templates/`), parses each file, and rebuilds the entire index — existing index data is replaced, orphaned index entries are removed
- [x] All file write operations compute and store a SHA-256 `content_hash` and `word_count` (body only, excluding frontmatter) in the index

## Notes

- The service should live at `src/modules/cerebrum/engrams/service.ts` and accept its dependencies (db connection, engram root path) via constructor injection.
- File operations should use atomic writes (write to a temp file, then rename) to prevent corruption on crash.
- The `reindex` operation should be wrapped in a transaction — drop all existing data and re-insert within a single transaction.
- Link operations must handle the case where the target engram file does not exist (the index row for `engram_links` is still created, but the target file is not modified).
