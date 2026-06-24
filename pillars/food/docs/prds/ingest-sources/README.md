# Ingest Sources & Media Layout

Status: Partial — schema, path helpers, media-serve endpoints, and the `markArchived` service are shipped. The FIFO retention/eviction job that calls `markArchived` is NOT built; see `docs/ideas/ingest-media-retention.md`.

Provenance for every recipe that entered via the multimodal ingestion pipeline (web URL, Instagram reel, screenshot, pasted text). One `ingest_sources` row per ingest run, plus an on-disk media tree keyed by source id. Rows live in the food pillar's SQLite and back up via Litestream; the media bytes are regeneratable and excluded from backup.

This PRD owns the table, the filesystem contract, and the provenance services. The pipeline that fills them (worker acquisition, STT/vision, LLM extraction) lives in the `ingest-api`, `worker-container`, and per-modality PRDs.

## Data Model

`ingest_sources` (schema: `src/db/schema/food-ingest-sources.ts`):

| Column              | Type                                    | Notes                                                                         |
| ------------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| `id`                | INTEGER PK autoinc                      |                                                                               |
| `kind`              | TEXT NOT NULL                           | CHECK in `('url-web','url-instagram','text','screenshot')`                    |
| `url`               | TEXT                                    | source URL for `url-*` kinds; null otherwise                                  |
| `caption`           | TEXT                                    | canonical text input (paste body / IG caption / OCR / readability body)       |
| `transcript_path`   | TEXT                                    | `.vtt` path, relative to `FOOD_INGEST_DIR`                                    |
| `keyframes_dir`     | TEXT                                    | keyframes dir, relative to `FOOD_INGEST_DIR`                                  |
| `video_path`        | TEXT                                    | source video path, relative to `FOOD_INGEST_DIR`                              |
| `extracted_json`    | TEXT                                    | LLM structured output that became the draft                                   |
| `extractor_version` | TEXT NOT NULL                           | pipeline + model snapshot, e.g. `pipeline-v1;whisper-distil;claude-haiku-4-5` |
| `draft_recipe_id`   | INTEGER → `recipes(id)`                 | set when extraction created a draft; null on failure                          |
| `ingested_at`       | TEXT NOT NULL DEFAULT `datetime('now')` |                                                                               |
| `archived_at`       | TEXT                                    | set when media is evicted; row + path columns persist                         |

Indexes: `idx_ingest_sources_kind`, `idx_ingest_sources_recipe` (on `draft_recipe_id`), `idx_ingest_sources_ingested` (on `ingested_at`).

The table also carries `error_code`, `error_message`, `attempts`, and `reviewed_at` columns — owned by the `ingest-api`, `approve-reject-flow`, and `rejected-and-failed-tabs` PRDs respectively, not by this one.

One row per ingest invocation regardless of outcome: failed extractions and rejected drafts keep their row for audit and to power downstream failure detection.

## Filesystem Layout

All ingest media lives under `${FOOD_INGEST_DIR}` (default `./data/food/ingest`), one subdirectory per `ingest_sources.id`:

```
${FOOD_INGEST_DIR}/<source_id>/
  video.<ext>            # Instagram only (mp4/webm/mov/m4v)
  caption.txt            # IG caption or pasted text
  screenshot.<ext>       # screenshot kind only (jpg/jpeg/png/webp)
  transcript.vtt         # only when STT ran
  keyframes/000.jpg …    # ≤10 frames
  extracted.json         # LLM extraction output
  meta.json              # extractor_version, timings, costs, model calls
```

Path columns store paths **relative** to `FOOD_INGEST_DIR` (e.g. `42/video.mp4`). Absolute paths are recomputed at read time from the env root, so deployments can relocate the media root without rewriting rows.

Path helpers (`pillars/food/app/src/storage/ingest-paths.ts`):

- `ingestRootDir()` — resolves `FOOD_INGEST_DIR` (falls back to `DEFAULT_FOOD_INGEST_DIR` when unset or empty), reads env per-call.
- `ingestDirFor(sourceId)` — absolute per-source subdir.
- `relativeToIngestDir(absolutePath)` — POSIX-relative form for storage; throws on `..` traversal or an absolute escape.

The screenshot writer (`src/api/modules/ingest/ingest-storage.ts`) decodes the base64 payload to `<source_id>/screenshot.<ext>` before enqueue, capped at 8 MB, with a pre-decode size guard. It duplicates a minimal `ingestDirFor` to keep the API off the app package graph.

## Media Serving

Plain Express handlers (`src/api/modules/ingest/serve.ts`), mounted ahead of the ts-rest surface (which is all POST, so no collision):

- `GET /ingest/source/:sourceId/screenshot`
- `GET /ingest/source/:sourceId/video`

Both fail closed: 400 on a non-positive-integer id, 404 when the row is missing, `archived_at IS NOT NULL`, or the file is gone. `res.sendFile` handles Range so `<video>` seeking works. Extension lookup is case-insensitive; `Cache-Control: private, max-age=3600`.

## Services & Business Rules

`src/db/services/ingest-sources.ts`:

- `createIngestSource` — inserts a provenance row. **Rejects `url-web`/`url-instagram` with a null url** (`IngestSourceUrlRequired`); the enum is enforced by the DB CHECK, not the service.
- `linkDraftRecipe` — sets `draft_recipe_id`; idempotent, overwrite allowed (worker may re-run the pipeline); raises `IngestSourceNotFound` for a missing source.
- `markArchived` — stamps `archived_at = now` for given ids, **preserving path columns** (they become historical, describing where files used to live). No-op for unknown ids.

Rules:

- `extractor_version` is REQUIRED for every kind, including manual text — the audit trail is always complete.
- `url` required for `kind ∈ {url-web, url-instagram}`, null for `text`/`screenshot` (`url` stays nullable at the DB layer because `text` needs it null; the requirement is service-enforced).
- `draft_recipe_id` survives a later draft rejection and survives recipe soft-archive — the provenance link is never severed.
- Source URLs are stored as-is (tracking params included); no normalisation or cross-ingest dedup.
- Concurrent ingests write to distinct `<source_id>/` subdirs; no locking beyond filesystem semantics.

## Configuration & Backup

- `FOOD_INGEST_DIR` — media root. Hard-coded defaults exist so the API/worker start without it set (`./data/food/ingest` in the path helpers; `/data/food/ingest` in the worker config).
- Litestream excludes `FOOD_INGEST_DIR` and `MEDIA_IMAGES_DIR` (regeneratable media). Documented in `AGENTS.md` (Litestream exclusions); the food pillar's reference stream config is `infra/litestream/food.yml`. The `ingest_sources` table itself IS backed up — the row pointing at evicted media is preserved, the bytes are not.

## Edge Cases

| Case                                                                | Behaviour                                                                   |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `kind='screenshot'` with a transcript too                           | Allowed; schema is permissive, serve endpoints return whatever files exist. |
| `kind='url-web'` with no caption and no `extracted_json`            | Parse failure; row persists for audit.                                      |
| Re-ingest of the same URL                                           | New row; no dedup.                                                          |
| Serve request for an archived/missing source                        | 404 (fail closed) — UI treats 404 as "no media, skip rendering".            |
| `relativeToIngestDir` given a `../` escape or absolute outside root | Throws — guards against persisting a traversal path.                        |

## Acceptance Criteria

### Schema

- [x] `ingest_sources` created with the columns above; CHECK on `kind`, `extractor_version` NOT NULL, FK to `recipes(id)`.
- [x] Three indexes present (verified via `sqlite_master` PRAGMA in `ingest-sources-model.test.ts`).
- [x] Unknown `kind` and null `extractor_version` are rejected at the SQL layer.

### Filesystem helpers

- [x] `ingestDirFor(sourceId)` returns the absolute per-source path.
- [x] `relativeToIngestDir(absolutePath)` returns POSIX-relative form and rejects traversal / absolute escapes (covered by `app/src/storage/__tests__/ingest-paths.test.ts`).
- [x] `ingestRootDir()` defaults to `./data/food/ingest` when `FOOD_INGEST_DIR` is unset or empty.

### Services

- [x] `createIngestSource` rejects `url-web`/`url-instagram` without a url and accepts `text`/`screenshot` without one.
- [x] `linkDraftRecipe` sets the FK, is idempotent, and raises `IngestSourceNotFound` for a missing id.
- [x] `markArchived` stamps `archived_at` without clearing path columns; no-op for unknown ids.
- [x] FK survives recipe soft-archive.

### Media serving

- [x] `GET /ingest/source/:id/{screenshot,video}` 404s for missing/archived sources and streams the on-disk file (Range-capable) otherwise.
- [x] Screenshot payloads are decoded to disk under the size cap before enqueue.

### Backup

- [x] Litestream exclusion of `FOOD_INGEST_DIR`/`MEDIA_IMAGES_DIR` documented in `AGENTS.md`; `infra/litestream/food.yml` ships the reference stream config.

## Not in this PRD

- The FIFO retention/eviction job that prunes the media tree past 100 dirs and calls `markArchived` — `docs/ideas/ingest-media-retention.md`.
- The ingestion pipeline (acquisition, STT/vision, LLM extraction), the review-queue UI, and a storage-backend abstraction (local only) — their own PRDs.
