# Indexing & Sync (Thalamus)

> Status: Partial — file-watcher → index → embedding-trigger pipeline, on-demand reindex/reconcile, and cross-source re-embedding over peer pillars are all built. The scheduled cross-source job, a `book` source type, and a `pops cerebrum reindex` CLI are not — see [ideas/indexing-scheduler-and-books](../../ideas/indexing-scheduler-and-books.md).

Thalamus keeps cerebrum's SQLite engram index in step with the Markdown files on disk and feeds the embedding pipeline. Markdown files are the source of truth; the index is fully regenerable from them. On every engram change the index reflects the new frontmatter within ~1s and a re-embedding job is enqueued only when content actually changed. It also re-embeds structured rows owned by peer pillars (finance, media, inventory) so semantic search spans engrams and domain data.

## Data Model

No tables of its own. Thalamus writes the engram index tables and reads/writes the embeddings table — all in cerebrum's own SQLite DB (engrams, plexus, glia, conversations and embeddings all live here).

`engram_index` (one row per `.md` file): `id` (pk, frontmatter id), `file_path` (unique, root-relative, forward-slash), `type`, `source`, `status`, `template`, `created_at`, `modified_at`, `title`, `content_hash` (SHA-256 of full file), `body_hash` (SHA-256 of body), `word_count`, `custom_fields` (JSON of non-schema frontmatter keys). Junctions: `engram_scopes`, `engram_tags`, `engram_links` (links have no FK on target — a file may reference an engram not yet indexed).

Cross-source rows are projected into `embeddings` keyed by `(source_type, source_id, chunk_index)` with a `content_hash` per chunk. Source rows themselves live in their owning pillar, not here.

### Embeddable text per source

| source_type   | id             | text (labelled sections, null/empty fields omitted)        |
| ------------- | -------------- | ---------------------------------------------------------- |
| `engram`      | engram id      | full Markdown body (chunked)                               |
| `transaction` | transaction id | Description, Merchant (entityName), Category (tags), Notes |
| `movie`       | movie id       | Title, Overview, Genres                                    |
| `tv_show`     | show id        | Title (name), Overview, Genres                             |
| `inventory`   | item id        | Name (itemName), Brand, Type, Location                     |

## REST API surface

Served under the cerebrum pillar contract, docker-net trust boundary, no per-request auth (parity with engrams/ingest).

- `GET /index/status` → `{ watcher: { watching, lastEventAt, watchedPaths }, embeddingsQueue: { name, pendingCount } }`. `pendingCount` is `null` when Redis is unconfigured.
- `POST /index/reindex` body `{ force? }` → `{ indexed, enqueued }`. Rebuilds the index from disk; `force` additionally re-enqueues an embedding job for every indexed engram regardless of hash.
- `POST /index/reindex-sources` body `{ sourceTypes? }` → `{ enqueued, sourceTypes }`. Scans peer pillars for the given source types (all known types if omitted; unknown names dropped) and enqueues embeddings for changed rows.
- `POST /index/reconcile` body `{ dryRun? }` → `{ missing, orphaned, dryRun }`. Diffs disk against the index; applies the sync unless `dryRun`.

## Business rules

- **Watcher (opt-in):** started only when `CEREBRUM_INDEX_WATCH=true`. Watches the engram root (resolved from `CEREBRUM_ENGRAMS_DIR`, default `<cwd>/data/engrams`) recursively with chokidar for `add`/`change`/`unlink` on `.md` files; dotfiles and dot-directories are ignored. Uses `awaitWriteFinish` so editor temp-write-then-rename produces one event.
- **Debounce:** per file path, 500ms. Rapid writes to one file collapse to a single `{ type: 'create' | 'modify' | 'delete', filePath }` batch event. `create` and `delete` win over a pending `modify`.
- **Startup reconciliation:** on chokidar `ready`, files on disk but absent from the index (status `active`) get synthetic `create` events, flushed in batches of 100 via `setImmediate` to avoid blocking the event loop.
- **Missing engram root is non-fatal:** the watcher logs a warning and stays disabled; the pillar boots normally. (The `reindex`/`reconcile` endpoints operate on root+index directly and need no live watcher.)
- **EMFILE fallback:** if the OS open-file limit is hit, the watcher logs and re-opens chokidar in polling mode at a 60s interval.
- **Sync (create/modify):** read file → parse frontmatter with gray-matter → validate against the engram frontmatter schema → upsert `engram_index` and diff `engram_scopes`/`engram_tags`/`engram_links`, all in one SQLite transaction per file. `title` derives from the first H1 (fallback: first non-empty line); `word_count` counts whitespace-delimited tokens in the body; `content_hash` is SHA-256 of the full file, `body_hash` of the body; non-schema frontmatter keys are serialised into `custom_fields`.
- **Sync (delete):** mark the index row `status: orphaned` and log a warning — no rows are deleted. A raw file deletion is unexpected (archival is the CRUD service's job).
- **Parse/validation errors** skip the file with a structured error (path + message); nothing partial is written.
- **Embedding trigger:** after a sync, compare `content_hash` to the stored value. Enqueue `{ sourceType: 'engram', sourceId, content: body }` to the `pops-embeddings` BullMQ queue when the hash changed or `force` is set; skip when the hash matches or the body is empty. Every decision emits `{ engramId, action: 'enqueued' | 'skipped' | 'error', reason }`. Job options: 3 attempts, exponential backoff (5s), keep last 1000 on complete/fail.
- **Queue-unavailable is soft:** with no Redis the accessor returns `null`; the file is still indexed and the trigger reports `action: 'skipped'`, never a 503.
- **Cross-source scan:** for each requested source type, page the owning peer pillar (via the `@pops/pillar-sdk` peer client) 100 rows at a time, compose the labelled text, hash its first chunk, and enqueue `{ sourceType, sourceId, content }` only when that hash differs from the stored `chunk_index = 0` embedding (or no embedding exists). A peer absent from the fleet yields no client → that type is skipped, contributing 0, no crash.

## Edge cases

| Case                                                 | Behaviour                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| File created then deleted within the debounce window | Collapses to a single resolved event; a never-indexed delete is a no-op  |
| File renamed (path change)                           | Delete on old path (orphaned) + create on new path (indexed)             |
| Valid frontmatter, empty body                        | Indexed normally; no embedding job (nothing to embed)                    |
| Frontmatter invalid / unparseable                    | File skipped, structured error logged, no partial write                  |
| Index row whose file is gone                         | `reconcile` marks it `orphaned`; a second pass reports none              |
| Engram root missing at startup                       | Watcher disabled with a warning; pillar boots                            |
| OS watch limit (EMFILE) hit                          | Falls back to 60s polling                                                |
| Redis down / unconfigured                            | Index still written; embedding enqueue soft-skipped; `pendingCount` null |
| Cross-source row text unchanged                      | First-chunk hash matches stored embedding → skipped                      |
| Peer pillar absent from fleet                        | That source type contributes 0, no crash                                 |
| Thousands of files on cold start                     | Reconciliation batches 100/tick                                          |

## Acceptance criteria

- [x] `GET /index/status` reports `watching: false` with a `null` pending count when no watcher and no Redis; surfaces the real queue depth (waiting+active+delayed) when a producer is present.
- [x] `POST /index/reindex` rebuilds the index from disk (`indexed` = file count) and reports `enqueued: 0` without `force` or without Redis; with `force` it enqueues one job per non-empty engram and skips empty bodies.
- [x] `POST /index/reconcile` with `dryRun` reports `missing`/`orphaned` without mutating; without `dryRun` it syncs missing files and marks orphaned rows, and a re-run reports clean.
- [x] `POST /index/reindex-sources` enqueues one job per changed peer row across `transaction`/`movie`/`tv_show`/`inventory`, honours an explicit subset, drops unknown type names, skips rows whose first-chunk hash is unchanged, and skips absent peers (`enqueued: 0`).
- [x] A `.md` change under a running watcher updates the index (and junction tables) and, when the body content changed, enqueues an embedding job; a whitespace-only edit (hash unchanged) does not.
- [x] Deleting a watched `.md` file marks its index row `status: orphaned` without deleting rows.
- [x] The watcher debounces per-file at 500ms, ignores dotfiles, batches startup reconciliation at 100/tick, treats a missing root as non-fatal, and falls back to polling on EMFILE.
- [x] Frontmatter sync upserts index + junctions atomically per file, derives `title` from the first H1, computes `word_count`/`content_hash`/`body_hash`, and serialises non-schema keys into `custom_fields`.

## Out of scope

- Embedding generation itself (Vector Storage — the worker consuming `pops-embeddings`).
- Semantic/hybrid search queries (Retrieval Engine).
- Scope auto-assignment, content ingestion/classification, glia curation.
- Scheduled cross-source job, a `book` source type, and a reindex CLI — see [ideas/indexing-scheduler-and-books](../../ideas/indexing-scheduler-and-books.md).
